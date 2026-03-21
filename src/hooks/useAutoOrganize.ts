import { useState, useEffect, useCallback, useRef } from 'react';
import { useSpaces } from '@/contexts/SpacesContext';
import { supabase } from '@/integrations/supabase/client';

export interface AutoOrganizeSuggestion {
  title: string;
  suggestedSpaceIds: string[];
  suggestedSpaceName?: string;
  tags: string[];
}

export function useAutoOrganize(text: string, enabled = true) {
  const { spaces, items } = useSpaces();
  const [suggestion, setSuggestion] = useState<AutoOrganizeSuggestion | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();
  const lastTextRef = useRef('');

  const analyze = useCallback(async (input: string) => {
    if (!input.trim() || input.trim().length < 15) {
      setSuggestion(null);
      return;
    }
    if (input === lastTextRef.current) return;
    lastTextRef.current = input;

    setIsAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'auto_organize',
          input,
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

      if (error) throw error;
      if (data?.success && data?.data) {
        setSuggestion(data.data as AutoOrganizeSuggestion);
      }
    } catch (err) {
      // Silently fail — suggestions are non-critical
      console.warn('Auto-organize failed:', err);
    } finally {
      setIsAnalyzing(false);
    }
  }, [spaces, items]);

  useEffect(() => {
    if (!enabled) return;
    clearTimeout(debounceRef.current);
    if (text.trim().length < 15) {
      setSuggestion(null);
      return;
    }
    debounceRef.current = setTimeout(() => analyze(text), 1200);
    return () => clearTimeout(debounceRef.current);
  }, [text, enabled, analyze]);

  const clear = useCallback(() => {
    setSuggestion(null);
    lastTextRef.current = '';
  }, []);

  return { suggestion, isAnalyzing, clear };
}
