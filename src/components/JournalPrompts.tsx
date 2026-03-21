import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lightbulb, RefreshCw, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/app-client';
import { useSpaces } from '@/contexts/SpacesContext';

interface JournalPrompt {
  text: string;
  seed: string;
}

interface JournalPromptsProps {
  onSelectPrompt: (text: string) => void;
}

export function JournalPrompts({ onSelectPrompt }: JournalPromptsProps) {
  const { spaces, items } = useSpaces();
  const [prompts, setPrompts] = useState<JournalPrompt[]>([]);
  const [loading, setLoading] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);

  const fetchPrompts = useCallback(async () => {
    setLoading(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const authToken = sessionData?.session?.access_token;
      if (!authToken) return;

      const context = {
        spaces: spaces.map(s => ({ id: s.id, name: s.name, itemCount: s.itemCount })),
        items: items.slice(0, 50).map(item => ({
          id: item.id,
          title: item.title,
          subCategory: item.subCategory,
          content: item.content,
          spaceIds: item.spaceIds || [],
          scheduledDate: item.scheduledDate,
          scheduledTime: item.scheduledTime,
        })),
        currentTime: new Date().toISOString(),
      };

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-assistant`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            type: 'journal_prompts',
            input: 'Generate personalized journal prompts based on my second mind',
            context,
          }),
        }
      );

      if (!response.ok) return;

      const data = await response.json();
      if (data?.success && data?.data?.prompts) {
        setPrompts(data.data.prompts);
        setHasLoaded(true);
      }
    } catch (err) {
      console.error('Journal prompts error:', err);
    } finally {
      setLoading(false);
    }
  }, [spaces, items]);

  if (!hasLoaded && !loading) {
    return (
      <button
        onClick={fetchPrompts}
        className="flex items-center gap-2 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-3"
      >
        <Lightbulb className="w-3.5 h-3.5" />
        <span>Suggest what to write about</span>
      </button>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-xs text-muted-foreground/50">
        <Loader2 className="w-3.5 h-3.5 animate-spin" />
        <span>Thinking of prompts…</span>
      </div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2 pb-4"
      >
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted-foreground/50 uppercase tracking-wider font-medium">
            Prompts for you
          </span>
          <button
            onClick={fetchPrompts}
            className="p-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            aria-label="Refresh prompts"
          >
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
        {prompts.map((prompt, i) => (
          <motion.button
            key={`${prompt.seed}-${i}`}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.08 }}
            onClick={() => onSelectPrompt(prompt.text)}
            className="w-full text-left px-3 py-2.5 rounded-xl bg-secondary/40 hover:bg-secondary/70 transition-colors group"
          >
            <p className="text-sm text-foreground/80 leading-relaxed group-hover:text-foreground transition-colors">
              {prompt.text}
            </p>
            <span className="text-[10px] text-muted-foreground/40 mt-1 block">
              {prompt.seed}
            </span>
          </motion.button>
        ))}
      </motion.div>
    </AnimatePresence>
  );
}
