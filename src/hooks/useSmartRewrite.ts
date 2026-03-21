import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/app-client';
import { useSpaces } from '@/contexts/SpacesContext';

export type RewriteMode = 'bullets' | 'actions' | 'summary';

interface SmartRewriteResult {
  result: string;
  mode: RewriteMode;
}

export function useSmartRewrite() {
  const { spaces, items } = useSpaces();
  const [isRewriting, setIsRewriting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rewrite = useCallback(async (
    noteContent: string,
    mode: RewriteMode
  ): Promise<SmartRewriteResult | null> => {
    setIsRewriting(true);
    setError(null);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'smart_rewrite',
          input: `${mode}|||${noteContent}`,
          context: {
            spaces: spaces.map(s => ({ id: s.id, name: s.name, itemCount: s.itemCount })),
            items: [],
            currentTime: new Date().toISOString(),
          },
        },
      });

      if (fnError) throw new Error(fnError.message);
      if (data?.success && data?.data) {
        return data.data as SmartRewriteResult;
      }
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Rewrite failed';
      setError(msg);
      return null;
    } finally {
      setIsRewriting(false);
    }
  }, [spaces]);

  return { rewrite, isRewriting, error };
}
