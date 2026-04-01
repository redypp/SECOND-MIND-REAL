import { useState, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2, AlertCircle } from 'lucide-react';
import { useAI, DumpItem } from '@/hooks/useAI';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/app-client';
import { uploadImageToStorage } from '@/lib/imageUpload';
import type { Attachment } from './OrganizeModal';

interface NoteOrganizerProps {
  noteText: string;
  attachments?: Attachment[];
  spaceId?: string;
  onDone: () => void;
}

export function NoteOrganizer({ noteText, attachments = [], spaceId, onDone }: NoteOrganizerProps) {
  const { organizeDump } = useAI();
  const { spaces, addItem, addSpaceAsync } = useSpaces();
  const { user } = useAuth();

  const [isOrganizing, setIsOrganizing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const saveItems = useCallback(async (items: DumpItem[]) => {
    if (items.length === 0 && attachments.length === 0) return;
    setIsSaving(true);
    const results: { title: string; destination: string }[] = [];
    const todayStr = new Date().toISOString().split('T')[0];

    // Save AI-organized text items
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const destination = item.destination || 'archive';
      try {
        // If a spaceId is provided, force items to that space
        const effectiveSpaceId = spaceId;

        if (destination === 'todo' && !spaceId) {
          addItem({
            subCategory: 'todo',
            title: item.title,
            blocks: [{ id: `checklist-${Date.now()}-${i}`, type: 'checklist', items: [{ id: `check-${Date.now()}-${i}`, text: item.title, checked: false }] }] as any,
            scheduledDate: item.scheduled_date || todayStr,
            scheduledTime: item.scheduled_time,
          });
          results.push({ title: item.title, destination: destinationLabel('todo') });
        } else if (destination === 'habit' && user && !spaceId) {
          const { error } = await supabase.from('habits').insert({ user_id: user.id, name: item.title, position: 999 });
          if (!error) results.push({ title: item.title, destination: destinationLabel('habit') });
        } else if (destination === 'journal' && user && !spaceId) {
          const { data: existing } = await supabase
            .from('journal_entries')
            .select('id, content')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();
          if (existing) {
            await supabase.from('journal_entries').update({ content: existing.content ? `${existing.content}\n\n${item.content}` : item.content, updated_at: new Date().toISOString() }).eq('id', existing.id);
          } else {
            await supabase.from('journal_entries').insert({ user_id: user.id, content: item.content });
          }
          results.push({ title: item.title || 'Entry', destination: destinationLabel('journal') });
        } else if (destination === 'daily_plan' && !spaceId) {
          const endTime = item.scheduled_end_time || (() => {
            if (item.scheduled_time) {
              const [h, m] = item.scheduled_time.split(':').map(Number);
              return `${String(h + 1).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
            }
            return undefined;
          })();
          addItem({
            subCategory: 'scheduling',
            title: item.title,
            blocks: endTime ? [{ id: `text-${Date.now()}-${i}`, type: 'text', content: `End: ${endTime}` }] as any : [],
            scheduledDate: item.scheduled_date || todayStr,
            scheduledTime: item.scheduled_time,
          });
          results.push({ title: item.title, destination: destinationLabel('daily_plan') });
        } else if (destination === 'reminder' && user && !spaceId) {
          const remindAt = new Date();
          if (item.scheduled_date) {
            const [y, mo, d] = item.scheduled_date.split('-').map(Number);
            remindAt.setFullYear(y, mo - 1, d);
          }
          if (item.scheduled_time) {
            const [h, m] = item.scheduled_time.split(':').map(Number);
            remindAt.setHours(h, m, 0, 0);
          } else {
            remindAt.setHours(remindAt.getHours() + 1);
          }
          await supabase.from('scheduled_reminders' as any).insert({ user_id: user.id, message: item.title || item.content, remind_at: remindAt.toISOString() } as any);
          results.push({ title: item.title, destination: destinationLabel('reminder') });
        } else {
          // Save to archive — use provided spaceId or resolve from AI suggestion
          let resolvedSpaceId = effectiveSpaceId;
          let resolvedSpaceName = '';

          if (!resolvedSpaceId) {
            const targetSpaceName = item.target_space;
            if (targetSpaceName.startsWith('New: ')) {
              resolvedSpaceName = targetSpaceName.slice(5);
              const newId = await addSpaceAsync(resolvedSpaceName);
              if (newId) resolvedSpaceId = newId;
            } else {
              const matched = spaces.find(s => s.name.toLowerCase() === targetSpaceName.toLowerCase());
              resolvedSpaceId = matched?.id;
              if (matched) resolvedSpaceName = matched.name;
            }
          } else {
            const matched = spaces.find(s => s.id === resolvedSpaceId);
            resolvedSpaceName = matched?.name || '';
          }

          // Map sub_category to a value that satisfies the DB CHECK constraint:
          // only ('scheduling', 'notes', 'todo', 'misc') are valid.
          // When inside an archive (spaceId provided), also disallow 'todo' and 'scheduling'.
          const VALID_DB_SUBCATEGORIES = ['scheduling', 'notes', 'todo', 'misc'];
          const archiveSafeSubCategory: string = (() => {
            const raw = item.sub_category;
            if (spaceId && (raw === 'todo' || raw === 'scheduling')) return 'notes';
            if (!VALID_DB_SUBCATEGORIES.includes(raw)) return 'notes';
            return raw;
          })();

          addItem({
            subCategory: archiveSafeSubCategory as any,
            title: item.title,
            content: item.content,
            blocks: [{ id: Date.now().toString() + i, type: 'text', content: item.content }] as any,
            spaceIds: resolvedSpaceId ? [resolvedSpaceId] : [],
            keywords: item.tags,
            // Only carry scheduled dates for non-archive contexts
            scheduledDate: spaceId ? undefined : item.scheduled_date,
            scheduledTime: spaceId ? undefined : item.scheduled_time,
          });
          results.push({ title: item.title, destination: destinationLabel('archive', resolvedSpaceName) });
        }
      } catch (err) {
        console.warn(`Failed to save item ${i}:`, err);
      }
    }

    // Save image attachments directly to the target space
    for (let i = 0; i < attachments.length; i++) {
      const att = attachments[i];
      if (att.type === 'image') {
        try {
          const imageUrl = user
            ? await uploadImageToStorage(att.value, user.id)
            : att.value;
          addItem({
            subCategory: 'misc',
            blocks: [{ id: `media-${Date.now()}-${i}`, type: 'media', url: imageUrl, mediaType: 'image' }] as any,
            spaceIds: spaceId ? [spaceId] : [],
          });
          const spaceName = spaceId ? spaces.find(s => s.id === spaceId)?.name : undefined;
          results.push({ title: 'Image', destination: destinationLabel('archive', spaceName) });
        } catch (err) {
          console.warn(`Failed to save image ${i}:`, err);
        }
      } else if (att.type === 'link') {
        try {
          // Use the user's typed text as the title for the link
          const linkTitle = noteText.trim() || att.value;
          addItem({
            subCategory: 'misc',
            title: linkTitle,
            blocks: [{ id: `media-${Date.now()}-${i}`, type: 'media', url: att.value, mediaType: 'link' }] as any,
            spaceIds: spaceId ? [spaceId] : [],
          });
          const spaceName = spaceId ? spaces.find(s => s.id === spaceId)?.name : undefined;
          results.push({ title: linkTitle, destination: destinationLabel('archive', spaceName) });
        } catch (err) {
          console.warn(`Failed to save link ${i}:`, err);
        }
      }
    }

    setIsSaving(false);
    onDone();
  }, [spaces, addItem, addSpaceAsync, user, spaceId, attachments, onDone, noteText]);

  const handleOrganize = useCallback(async () => {
    if (isOrganizing) return;
    
    // If only attachments and no text, skip AI and just save directly
    if (!noteText.trim() && attachments.length > 0) {
      await saveItems([]);
      return;
    }

    if (!noteText.trim()) return;

    // If text + only link attachments (no images), skip AI — save links with text as title
    const hasImages = attachments.some(a => a.type === 'image');
    const hasLinks = attachments.some(a => a.type === 'link');
    if (hasLinks && !hasImages) {
      await saveItems([]);
      return;
    }
    
    setIsOrganizing(true);
    setError(null);

    // Build enriched input with link context
    let enrichedInput = noteText;
    const linkAttachments = attachments.filter(a => a.type === 'link');
    if (linkAttachments.length > 0) {
      enrichedInput += '\n\nAttached links:\n' + linkAttachments.map(a => a.value).join('\n');
    }

    const result = await organizeDump(enrichedInput);
    setIsOrganizing(false);

    if (result.error) {
      // Still save any image/link attachments even if AI organization failed
      if (attachments.length > 0) {
        await saveItems([]);
      } else {
        setError(result.error);
      }
      return;
    }
    if (result.data) {
      await saveItems(result.data.items);
    }
  }, [noteText, isOrganizing, organizeDump, saveItems, attachments]);

  // Auto-start
  const didAutoStart = useRef(false);
  useEffect(() => {
    if (!didAutoStart.current && (noteText.trim().length >= 2 || attachments.length > 0)) {
      didAutoStart.current = true;
      handleOrganize();
    }
  }, []);

  // Loading
  if (isOrganizing || isSaving) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center justify-center py-4">
        <Loader2 className="w-5 h-5 animate-spin text-primary" />
      </motion.div>
    );
  }

  // Error
  if (error) {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2 py-2">
        <AlertCircle className="w-3.5 h-3.5 text-destructive" />
        <span className="text-xs text-destructive">{error}</span>
        <button onClick={() => { setError(null); handleOrganize(); }} className="text-xs text-muted-foreground hover:text-foreground ml-1">Retry</button>
      </motion.div>
    );
  }

  return null;
}
