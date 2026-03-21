import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useSpaces } from '@/contexts/SpacesContext';

export interface SemanticResult {
  itemId: string;
  itemTitle: string;
  relevanceScore: number;
  snippet: string;
  matchReason: string;
}

export interface SemanticSearchResponse {
  answer: string;
  results: SemanticResult[];
}

export function useSemanticSearch() {
  const { spaces, items } = useSpaces();
  const [isSearching, setIsSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const search = useCallback(async (query: string): Promise<SemanticSearchResponse | null> => {
    if (!query.trim()) return null;
    setIsSearching(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'semantic_search',
          input: query,
          context: {
            spaces: spaces.map(s => ({ id: s.id, name: s.name, itemCount: s.itemCount })),
            items: items.slice(0, 50).map(i => ({
              id: i.id,
              title: i.title,
              subCategory: i.subCategory,
              content: i.content,
              blocks: i.blocks,
              spaceIds: i.spaceIds || [],
              createdAt: i.createdAt?.toISOString(),
            })),
            currentTime: new Date().toISOString(),
          },
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.success && data?.data) {
        return data.data as SemanticSearchResponse;
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Search failed';
      setError(msg);
      return null;
    } finally {
      setIsSearching(false);
    }
  }, [spaces, items]);

  return { search, isSearching, error };
}
