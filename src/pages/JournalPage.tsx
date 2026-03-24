import { useState, useEffect, useCallback, useRef } from 'react';
import { CornerDownLeft, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useTutorial } from '@/contexts/TutorialContext';
import { JournalPrompts } from '@/components/JournalPrompts';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';

interface JournalPageProps {
  embedded?: boolean;
  onBack?: () => void;
}

export default function JournalPage({ embedded = false, onBack }: JournalPageProps) {
  const { user } = useAuth();
  const { reportTutorialAction } = useTutorial();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [focused, setFocused] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const entryIdRef = useRef<string | null>(null);
  const contentRef = useRef('');

  // Load the single journal document
  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('journal_entries')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (data) {
        entryIdRef.current = data.id;
        contentRef.current = data.content || '';
      }
      setLoading(false);
    })();
  }, [user]);

  // Set initial content after loading — no auto-focus
  useEffect(() => {
    if (!loading && textareaRef.current) {
      textareaRef.current.value = contentRef.current;
      // Resize without collapsing
      const el = textareaRef.current;
      el.style.height = '0px';
      el.style.height = Math.max(el.scrollHeight, 100) + 'px';
    }
  }, [loading]);

  // Auto-save (debounced) with retry
  const save = useCallback(async (text: string) => {
    if (!user) return;
    setSaving(true);
    if (text.trim().length > 0) reportTutorialAction('journal-write');

    const MAX_RETRIES = 3;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (entryIdRef.current) {
          const { error } = await supabase
            .from('journal_entries')
            .update({ content: text })
            .eq('id', entryIdRef.current);
          if (error) throw new Error(error.message);
        } else {
          const { data, error } = await supabase
            .from('journal_entries')
            .insert({ user_id: user.id, content: text })
            .select()
            .single();
          if (error) throw new Error(error.message);
          if (data) entryIdRef.current = data.id;
        }
        break; // success
      } catch (err) {
        if (attempt === MAX_RETRIES) {
          console.error('[Journal] Failed to save after retries:', err);
          showErrorPopup('Journal could not be saved. Please check your connection.');
        } else {
          await new Promise(r => setTimeout(r, 500 * attempt));
        }
      }
    }

    setSaving(false);
  }, [user]);

  // Handle input natively — no React state re-render on every keystroke
  const handleInput = useCallback(() => {
    const el = textareaRef.current;
    const container = scrollContainerRef.current;
    if (!el) return;

    const scrollTop = container?.scrollTop ?? 0;
    contentRef.current = el.value;

    // Resize textarea if needed
    const needed = el.scrollHeight;
    const current = el.offsetHeight;
    if (needed !== current) {
      el.style.height = Math.max(needed, 100) + 'px';
    }

    // Restore scroll
    if (container) container.scrollTop = scrollTop;
    requestAnimationFrame(() => {
      if (container) container.scrollTop = scrollTop;
    });

    // Debounced save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(contentRef.current), 1200);
  }, [save]);

  // Enter key = dismiss keyboard (mobile "Done"), Shift+Enter = newline (desktop)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || loading) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        // Insert a newline at cursor position before dismissing
        const start = el.selectionStart;
        const end = el.selectionEnd;
        const val = el.value;
        el.value = val.substring(0, start) + '\n' + val.substring(end);
        el.selectionStart = el.selectionEnd = start + 1;
        contentRef.current = el.value;
        // Resize
        el.style.height = '0px';
        el.style.height = Math.max(el.scrollHeight, 100) + 'px';
        // Save
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
        saveTimerRef.current = setTimeout(() => save(contentRef.current), 1200);
        // Dismiss keyboard
        el.blur();
      }
    };

    el.addEventListener('keydown', handleKeyDown);
    return () => el.removeEventListener('keydown', handleKeyDown);
  }, [loading]);

  // Scroll-lock on tap-to-edit + dismiss keyboard on user scroll
  useEffect(() => {
    const el = textareaRef.current;
    const container = scrollContainerRef.current;
    if (!el || !container || loading) return;

    let lockedScrollTop: number | null = null;
    let lockTimer: ReturnType<typeof setTimeout> | null = null;
    let isLocked = false;

    const handlePointerDown = () => {
      lockedScrollTop = container.scrollTop;
      isLocked = true;
      if (lockTimer) clearTimeout(lockTimer);

      const restore = () => {
        if (lockedScrollTop !== null && isLocked && container) {
          container.scrollTop = lockedScrollTop;
        }
      };

      // Use preventScroll focus when the browser triggers it
      // We intercept focus below to also call preventScroll

      requestAnimationFrame(restore);
      requestAnimationFrame(() => requestAnimationFrame(restore));
      setTimeout(restore, 50);
      setTimeout(restore, 150);
      setTimeout(restore, 300);
      setTimeout(restore, 500);

      lockTimer = setTimeout(() => {
        isLocked = false;
        lockedScrollTop = null;
      }, 700);
    };

    const handleFocus = () => {
      setFocused(true);
      if (lockedScrollTop !== null && isLocked) {
        container.scrollTop = lockedScrollTop;
      }
      try {
        el.focus({ preventScroll: true });
      } catch (_) { /* not supported */ }
    };

    const handleBlur = () => {
      setFocused(false);
    };

    // Dismiss keyboard when user scrolls (after lock period)
    let scrollDismissTimer: ReturnType<typeof setTimeout> | null = null;
    const handleScroll = () => {
      if (isLocked) return;
      if (document.activeElement === el) {
        if (scrollDismissTimer) clearTimeout(scrollDismissTimer);
        scrollDismissTimer = setTimeout(() => {
          if (document.activeElement === el) {
            el.blur();
          }
        }, 80);
      }
    };

    el.addEventListener('touchstart', handlePointerDown, { passive: true });
    el.addEventListener('mousedown', handlePointerDown, { passive: true });
    el.addEventListener('focus', handleFocus, { passive: true });
    el.addEventListener('blur', handleBlur, { passive: true });
    container.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handlePointerDown);
      el.removeEventListener('mousedown', handlePointerDown);
      el.removeEventListener('focus', handleFocus);
      el.removeEventListener('blur', handleBlur);
      container.removeEventListener('scroll', handleScroll);
      if (lockTimer) clearTimeout(lockTimer);
      if (scrollDismissTimer) clearTimeout(scrollDismissTimer);
    };
  }, [loading]);

  // Attach native input listener
  useEffect(() => {
    const el = textareaRef.current;
    if (!el || loading) return;

    el.addEventListener('input', handleInput, { passive: true });
    return () => el.removeEventListener('input', handleInput);
  }, [loading, handleInput]);

  const insertNewline = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const val = el.value;
    el.value = val.substring(0, start) + '\n' + val.substring(end);
    el.selectionStart = el.selectionEnd = start + 1;
    contentRef.current = el.value;

    el.style.height = '0px';
    el.style.height = Math.max(el.scrollHeight, 100) + 'px';

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(contentRef.current), 1200);

    el.focus({ preventScroll: true });
  }, [save]);

  const handlePromptSelect = useCallback((promptText: string) => {
    const el = textareaRef.current;
    if (!el) return;
    const prefix = el.value.length > 0 ? '\n\n' : '';
    const insertion = `${prefix}${promptText}\n`;
    el.value += insertion;
    contentRef.current = el.value;
    el.style.height = '0px';
    el.style.height = Math.max(el.scrollHeight, 100) + 'px';
    // Place cursor after the prompt
    el.selectionStart = el.selectionEnd = el.value.length;
    el.focus({ preventScroll: true });
    // Save
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => save(contentRef.current), 1200);
  }, [save]);

  return (
    <div
      className={`flex flex-col bg-background ${embedded ? 'h-full' : 'h-[100dvh]'}`}
    >
      <header className="pt-4 pb-3 px-4 flex items-center justify-between relative z-30 flex-shrink-0">
        <div className="flex items-center gap-3">
          {onBack && (
            <button
              onClick={onBack}
              className="p-3 -ml-2 rounded-lg hover:bg-secondary active:bg-secondary/80 transition-colors touch-manipulation shrink-0"
              style={{ minWidth: 44, minHeight: 44 }}
              aria-label="Back to Life"
            >
              <ArrowLeft className="w-5 h-5 text-foreground" />
            </button>
          )}
          <h1 className="text-2xl font-black tracking-tight text-foreground">Journal</h1>
        </div>
        <AnimatePresence>
          {saving && (
            <motion.span
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              className="text-xs text-muted-foreground"
            >
              Saving…
            </motion.span>
          )}
        </AnimatePresence>
      </header>

      <div
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{
          WebkitOverflowScrolling: 'touch',
          overscrollBehavior: 'contain',
        }}
      >
        <div className="max-w-2xl mx-auto px-5">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
            </div>
          ) : (
            <>
              <JournalPrompts onSelectPrompt={handlePromptSelect} />
              <textarea
                data-tutorial="journal-input"
                ref={textareaRef}
                defaultValue={contentRef.current}
                placeholder="Write something…"
                className="w-full bg-transparent text-foreground text-[17px] leading-[1.7] resize-none focus:outline-none min-h-[60vh] placeholder:text-muted-foreground/55 caret-primary"
                style={{
                  fontFamily: 'inherit',
                  overflow: 'hidden',
                }}
                enterKeyHint="done"
              />
            </>
          )}
          <div className="h-48" />
        </div>
      </div>

      <AnimatePresence>
        {focused && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.15 }}
            onPointerDown={(e) => {
              e.preventDefault();
              insertNewline();
            }}
            className="fixed bottom-[max(var(--app-safe-bottom),12px)] right-4 mb-2 z-50 w-11 h-11 rounded-full bg-primary text-primary-foreground flex items-center justify-center shadow-lg active:scale-95 transition-transform"
            aria-label="New line"
          >
            <CornerDownLeft className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>
    </div>
  );
}
