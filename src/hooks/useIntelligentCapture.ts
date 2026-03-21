import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';
import { uploadImageToStorage } from '@/lib/imageUpload';
import { compressImage } from '@/lib/imageCompression';
import { TextBlock, MediaBlock, SubCategory } from '@/types';

export type CaptureSourceType = 'text' | 'voice' | 'image';

export interface CaptureResult {
  title: string;
  summary: string;
  category: string;
  sub_category: SubCategory;
  tags: string[];
  cleaned_content: string;
  scheduled_date?: string;
  scheduled_time?: string;
  suggested_space: string;
  suggested_space_id?: string;
  image_description?: string;
}

/**
 * Map the AI's free-text category classification to a typed SubCategory.
 * The AI uses 14+ semantic categories; we route them to storage sub-categories.
 */
function mapCategoryToSubCategory(category: string, aiSubCategory?: string): SubCategory {
  // If the AI already picked one of the extended types, trust it
  const validSubCategories: SubCategory[] = [
    'scheduling', 'notes', 'todo', 'misc',
    'habit', 'journal', 'reminder', 'idea', 'task',
  ];
  if (aiSubCategory && (validSubCategories as string[]).includes(aiSubCategory)) {
    return aiSubCategory as SubCategory;
  }

  // Map semantic AI categories → storage sub-categories
  const categoryLower = category.toLowerCase();
  if (categoryLower === 'task') return 'task';
  if (categoryLower === 'idea' || categoryLower === 'creative' || categoryLower === 'experiment') return 'idea';
  if (categoryLower === 'journal') return 'journal';
  if (categoryLower === 'habit') return 'habit';
  if (categoryLower === 'reminder') return 'reminder';
  if (
    categoryLower === 'reference' ||
    categoryLower === 'link' ||
    categoryLower === 'recipe' ||
    categoryLower === 'finance'
  ) return 'misc';
  if (
    categoryLower === 'plan' ||
    categoryLower === 'project' ||
    categoryLower === 'travel' ||
    categoryLower === 'learning' ||
    categoryLower === 'health' ||
    categoryLower === 'knowledge'
  ) return 'notes';

  // Default
  return 'notes';
}

export function useIntelligentCapture() {
  const { spaces, items, addItem, addSpaceAsync, updateItem } = useSpaces();
  const { user } = useAuth();
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastResult, setLastResult] = useState<CaptureResult | null>(null);

  const capture = useCallback(async (
    text: string,
    imageDataUrls?: string[],
    sourceType: CaptureSourceType = 'text',
  ): Promise<{ itemId: string; result: CaptureResult } | null> => {
    if (!text.trim() && (!imageDataUrls || imageDataUrls.length === 0)) return null;
    if (!user) return null;

    setIsProcessing(true);
    setLastResult(null);

    // Preserve raw input before any transformation
    const rawInput = text.trim();

    try {
      // Build AI input — include image context if present
      let inputText = rawInput;
      if (imageDataUrls && imageDataUrls.length > 0) {
        inputText += `\n\n[User also attached ${imageDataUrls.length} image(s)]`;
      }

      // Step 1: Save immediately (zero-friction capture)
      const blocks: (TextBlock | MediaBlock)[] = [];

      if (rawInput) {
        blocks.push({
          id: Math.random().toString(36).substr(2, 9),
          type: 'text',
          content: rawInput,
        });
      }

      // Upload images if present (only for image source type or explicit attachments)
      if (imageDataUrls) {
        for (const dataUrl of imageDataUrls) {
          const compressed = await compressImage(dataUrl);
          const imageUrl = await uploadImageToStorage(compressed, user.id);
          blocks.push({
            id: Math.random().toString(36).substr(2, 9),
            type: 'media',
            url: imageUrl,
            mediaType: 'image',
          });
        }
      }

      // Determine initial sub_category from source type
      const initialSubCategory: SubCategory = sourceType === 'image' ? 'misc' : 'notes';

      // Save with default category — AI will refine
      const itemId = addItem({
        subCategory: initialSubCategory,
        content: rawInput,
        blocks,
        spaceIds: [],
      });

      // raw_input/source_type columns not in schema — skip writing them

      // Step 2: AI processing (async enrichment)
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'intelligent_capture',
          input: inputText,
          context: {
            spaces: spaces.map(s => ({ id: s.id, name: s.name, itemCount: s.itemCount })),
            items: items.slice(0, 30).map(i => ({
              id: i.id,
              title: i.title,
              subCategory: i.subCategory,
              content: i.content,
              blocks: i.blocks,
              spaceIds: i.spaceIds || [],
            })),
            currentTime: new Date().toISOString(),
          },
        },
      });

      if (!error && data?.success && data?.data) {
        const result = data.data as CaptureResult;
        setLastResult(result);

        // Resolve the best SubCategory from AI output
        const resolvedSubCategory = mapCategoryToSubCategory(result.category, result.sub_category as string);

        // Step 3: Resolve space assignment
        let spaceIds: string[] = [];
        if (result.suggested_space_id) {
          const exists = spaces.find(s => s.id === result.suggested_space_id);
          if (exists) spaceIds = [result.suggested_space_id];
        }
        if (spaceIds.length === 0 && result.suggested_space) {
          if (result.suggested_space.startsWith('New: ')) {
            const newName = result.suggested_space.replace('New: ', '');
            const newId = await addSpaceAsync(newName);
            if (newId) spaceIds = [newId];
          } else {
            const match = spaces.find(
              s => s.name.toLowerCase() === result.suggested_space.toLowerCase()
            );
            if (match) spaceIds = [match.id];
          }
        }

        // Route all user-visible fields through the sync queue so they are
        // persisted reliably (with retry) and are never dropped on network errors.
        const queueUpdates: Parameters<typeof updateItem>[1] = {
          subCategory: resolvedSubCategory,
        };
        if (result.title) queueUpdates.title = result.title;
        if (result.tags && result.tags.length > 0) queueUpdates.keywords = result.tags;
        if (spaceIds.length > 0) queueUpdates.spaceIds = spaceIds;
        if (result.scheduled_date) queueUpdates.scheduledDate = result.scheduled_date;
        if (result.scheduled_time) queueUpdates.scheduledTime = result.scheduled_time;

        updateItem(itemId, queueUpdates);

        // Step 4: Write AI-only metadata directly (these fields have no CHECK constraints
        // and are informational; losing them on a network blip is acceptable).
        // Do NOT include sub_category, title, space_ids, or scheduled fields here —
        // those are already handled by the queue above to avoid double-writes and
        // to ensure they survive network failures.
        const { error: updateError } = await supabase
          .from('items')
          .update({
            ai_summary: result.summary,
            ai_tags: result.tags,
            ai_processed: true,
            ai_category: result.category,
            suggested_space: result.suggested_space,
          })
          .eq('id', itemId);

        if (updateError) {
          console.warn('[Capture] AI metadata write failed (non-critical):', updateError.message);
        }

        return { itemId, result: { ...result, sub_category: resolvedSubCategory } };
      }

      // AI failed, but item is already saved — return a minimal result
      return {
        itemId,
        result: {
          title: '',
          summary: '',
          category: 'notes',
          sub_category: initialSubCategory,
          tags: [],
          cleaned_content: rawInput,
          suggested_space: '',
        },
      };
    } catch (err) {
      console.warn('[Capture] Intelligent capture error:', err);
      return null;
    } finally {
      setIsProcessing(false);
    }
  }, [user, spaces, items, addItem, addSpaceAsync, updateItem]);

  return { capture, isProcessing, lastResult };
}
