import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  X, ArrowUp, Loader2, CheckSquare, Calendar, Archive, ChevronRight,
  Mic, MicOff, AlertCircle, RotateCcw,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';
import { useAI, ChatMessage, ActionSuggestion, prewarmAuth } from '@/hooks/useAI';
import { useSpaces } from '@/contexts/SpacesContext';
import { useTutorial } from '@/contexts/TutorialContext';
import { useVoiceInput, VoiceState } from '@/hooks/useVoiceInput';
import { useAISettings } from '@/contexts/AISettingsContext';
import { useChatSessions } from '@/hooks/useChatSessions';

// ─── Types ──────────────────────────────────────────────────────────────────

type Phase = 'connecting' | 'streaming'; // undefined = done

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
  actions?: ActionSuggestion[];
  phase?: Phase;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const ACTION_ICONS: Record<ActionSuggestion['type'], React.ReactNode> = {
  create_task:    <CheckSquare className="w-3 h-3" />,
  schedule_event: <Calendar    className="w-3 h-3" />,
  add_to_archive: <Archive     className="w-3 h-3" />,
  view_related:   <ChevronRight className="w-3 h-3" />,
};

// ─── Voice mic button ─────────────────────────────────────────────────────────

function MicButton({
  voiceState,
  isSupported,
  onPress,
}: {
  voiceState: VoiceState;
  isSupported: boolean;
  onPress: () => void;
}) {
  if (!isSupported) return null;

  const isListening  = voiceState === 'listening';
  const isRequesting = voiceState === 'requesting';
  const isProcessing = voiceState === 'processing';
  const isError      = voiceState === 'error';
  const busy         = isRequesting || isProcessing;

  return (
    <button
      type="button"
      onClick={onPress}
      disabled={busy}
      aria-label={isListening ? 'Stop recording' : 'Start voice input'}
      className={[
        'relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-200 active:scale-90',
        isListening
          ? 'bg-red-500/15 text-red-500'
          : isError
            ? 'bg-muted/30 text-muted-foreground/50'
            : 'bg-muted/20 hover:bg-muted/40 text-muted-foreground/50 hover:text-muted-foreground/80',
        busy ? 'opacity-50 cursor-wait' : '',
      ].join(' ')}
    >
      {/* Pulsing ring while listening */}
      {isListening && (
        <span className="absolute inset-0 rounded-full animate-ping bg-red-500/20 pointer-events-none" />
      )}

      {busy ? (
        <Loader2 className="w-4 h-4 animate-spin" />
      ) : isListening ? (
        <MicOff className="w-4 h-4" strokeWidth={2.5} />
      ) : (
        <Mic className="w-4 h-4" strokeWidth={2} />
      )}
    </button>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AskPage() {
  const navigate = useNavigate();
  const { askQuestion, getActionSuggestions } = useAI();
  const { items, addItemAsync } = useSpaces();
  const { reportTutorialAction } = useTutorial();
  const { settings } = useAISettings();
  const { activeSessionId, activeMessages, saveMessage, isLoading: sessionsLoading } = useChatSessions();

  const [messages, setMessages]           = useState<Message[]>([]);
  const [conversationHistory, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput]                 = useState('');
  const [isLoading, setIsLoading]         = useState(false);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const sessionInitRef = useRef(false);

  const messagesEndRef    = useRef<HTMLDivElement>(null);
  const inputRef          = useRef<HTMLTextAreaElement>(null);
  const modalRef          = useRef<HTMLDivElement>(null);
  // For RAF-throttled stream updates
  const streamRef         = useRef('');
  const rafRef            = useRef<number | null>(null);
  // Prevent duplicate auto-sends from voice
  const autoSendPendingRef = useRef(false);
  // Last user message — used for retry on error
  const lastUserMsgRef    = useRef<string>('');

  // ── Prewarm auth token on mount (removes async wait on first submit) ──────
  useEffect(() => { prewarmAuth().catch(() => {}); }, []);

  // ── Restore persisted messages when session loads ─────────────────────────
  useEffect(() => {
    if (sessionsLoading || sessionInitRef.current || !activeSessionId) return;
    if (activeMessages.length > 0) {
      sessionInitRef.current = true;
      const restored: Message[] = activeMessages.map(m => ({
        id: m.id,
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      setMessages(restored);
      const history: ChatMessage[] = activeMessages.map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content,
      }));
      setHistory(history.slice(-12));
    } else {
      sessionInitRef.current = true;
    }
  }, [sessionsLoading, activeSessionId, activeMessages]);

  // ── Viewport / scroll helpers ─────────────────────────────────────────────
  useEffect(() => {
    const el = modalRef.current;
    const vv = window.visualViewport;
    const apply = () => {
      if (!el) return;
      el.style.height = `${vv?.height ?? window.innerHeight}px`;
      el.style.top    = `${vv?.offsetTop ?? 0}px`;
      el.style.bottom = 'auto';
    };
    let raf: number;
    const update = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };
    apply();
    if (vv) { vv.addEventListener('resize', update); vv.addEventListener('scroll', update); }
    return () => { cancelAnimationFrame(raf); if (vv) { vv.removeEventListener('resize', update); vv.removeEventListener('scroll', update); } };
  }, []);

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; document.documentElement.style.overflow = ''; };
  }, []);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 150); }, []);
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // ── Derived context data for personalization ──────────────────────────────
  const { contextLine, itemCount, dynamicPrompts } = useMemo(() => {
    const today    = new Date().toISOString().slice(0, 10);
    const notes    = items.filter(i => ['notes', 'idea', 'misc'].includes(i.subCategory ?? ''));
    const tasks    = items.filter(i => i.subCategory === 'todo');
    const events   = items.filter(i => i.subCategory === 'scheduling' && i.scheduledDate === today);

    // Context strip
    const parts: string[] = [];
    if (notes.length)  parts.push(`${notes.length} note${notes.length !== 1 ? 's' : ''}`);
    if (tasks.length)  parts.push(`${tasks.length} task${tasks.length !== 1 ? 's' : ''}`);
    if (events.length) parts.push(`${events.length} event${events.length !== 1 ? 's' : ''} today`);

    // Dynamic prompts — derived from actual user data
    const suggestions: string[] = [];
    if (events.length === 1 && events[0].title) {
      suggestions.push(`Help me prepare for ${events[0].title}`);
    } else if (events.length > 1) {
      suggestions.push('What\'s on my schedule today?');
    }
    if (tasks.length >= 3) {
      suggestions.push('What\'s the most important thing I should tackle?');
    } else if (tasks.length === 1 && tasks[0].title) {
      suggestions.push(`Help me make progress on "${tasks[0].title}"`);
    }
    if (notes.filter(i => i.subCategory === 'idea').length >= 3) {
      suggestions.push('What ideas have I been collecting?');
    }
    if (items.length > 0) suggestions.push('What did I save recently?');
    // Fill with evergreen prompts
    for (const p of [
      'Help me plan for this week',
      'What should I focus on today?',
      'What patterns do you notice in my notes?',
    ]) {
      if (!suggestions.includes(p)) suggestions.push(p);
    }

    return {
      contextLine:   parts.join(' · '),
      itemCount:     items.length,
      dynamicPrompts: [...new Set(suggestions)].slice(0, 5),
    };
  }, [items]);

  // ── Send handler ──────────────────────────────────────────────────────────
  const handleSend = useCallback(async (prefill?: string) => {
    const text = (prefill ?? input).trim();
    if (!text || isLoading) return;

    setInput('');
    if (inputRef.current) inputRef.current.style.height = 'auto';
    autoSendPendingRef.current = false;
    lastUserMsgRef.current = text;

    const userMsgId   = crypto.randomUUID();
    const assistantId = crypto.randomUUID();

    setMessages(prev => [
      ...prev,
      { id: userMsgId,   role: 'user',      content: text },
      { id: assistantId, role: 'assistant',  content: '', phase: 'connecting' },
    ]);
    setIsLoading(true);

    // Persist user message in background
    if (activeSessionId) {
      saveMessage(activeSessionId, 'user', text).catch(() => {});
    }

    // RAF-throttled stream buffer — one DOM update per frame instead of per chunk
    streamRef.current = '';
    const scheduleUpdate = () => {
      if (rafRef.current !== null) return;
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = null;
        const content = streamRef.current;
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content, phase: 'streaming' } : m
        ));
      });
    };

    try {
      const result = await askQuestion(text, conversationHistory, (chunk) => {
        streamRef.current += chunk;
        scheduleUpdate();
      });

      // Flush any pending RAF before finalising
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      if (result.error) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: result.error!, error: true, phase: undefined } : m
        ));
        return;
      }

      const finalAnswer = result.content || streamRef.current;

      if (!finalAnswer) {
        setMessages(prev => prev.map(m =>
          m.id === assistantId ? { ...m, content: 'No response received. Please try again.', error: true, phase: undefined } : m
        ));
        return;
      }

      // phase: undefined = "done" — triggers ReactMarkdown render (only once, not mid-stream)
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: finalAnswer, phase: undefined } : m
      ));

      setHistory(prev => [
        ...prev,
        { role: 'user' as const, content: text },
        { role: 'assistant' as const, content: finalAnswer },
      ].slice(-12));

      // Persist assistant message in background
      if (activeSessionId && finalAnswer) {
        saveMessage(activeSessionId, 'assistant', finalAnswer).catch(() => {});
      }

      // Report tutorial action on first successful AI exchange
      reportTutorialAction('ai-message');

      // Background: action suggestions — non-blocking
      getActionSuggestions(text, finalAnswer).then(({ actions }) => {
        if (actions?.length) {
          setMessages(prev => prev.map(m =>
            m.id === assistantId ? { ...m, actions } : m
          ));
        }
      });
    } catch (err) {
      // Guarantee loading never hangs on unexpected errors
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      console.error('[AI Ask] Unexpected error in handleSend:', err);
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: 'Something went wrong. Please try again.', error: true, phase: undefined } : m
      ));
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, conversationHistory, askQuestion, getActionSuggestions, activeSessionId, saveMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
  };

  // ── Action handler ────────────────────────────────────────────────────────
  const handleAction = useCallback(async (action: ActionSuggestion, messageId: string) => {
    const key = `${messageId}-${action.type}`;
    setActionLoadingId(key);
    try {
      if (action.type === 'create_task') {
        await addItemAsync({
          subCategory: 'todo',
          title: action.payload.title || 'New task',
          blocks: action.payload.content
            ? [{ id: crypto.randomUUID(), type: 'text' as const, content: action.payload.content }]
            : [],
        });
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, actions: m.actions?.filter(a => a !== action) } : m
        ));
      } else if (action.type === 'add_to_archive') {
        await addItemAsync({
          subCategory: 'notes',
          title: action.payload.title || 'Note',
          blocks: action.payload.content
            ? [{ id: crypto.randomUUID(), type: 'text' as const, content: action.payload.content }]
            : [],
        });
        setMessages(prev => prev.map(m =>
          m.id === messageId ? { ...m, actions: m.actions?.filter(a => a !== action) } : m
        ));
      } else if (action.type === 'schedule_event') {
        navigate('/daily-plan');
      } else {
        navigate('/collections');
      }
    } finally {
      setActionLoadingId(null);
    }
  }, [addItemAsync, navigate]);

  // ── Voice integration ─────────────────────────────────────────────────────

  const handleFinalTranscript = useCallback((text: string) => {
    // Append to existing draft, or start fresh
    setInput(prev => {
      const trimmed = prev.trimEnd();
      return trimmed ? trimmed + ' ' + text : text;
    });
    // Resize textarea to fit new text
    requestAnimationFrame(() => {
      if (inputRef.current) {
        inputRef.current.style.height = 'auto';
        inputRef.current.style.height =
          Math.min(inputRef.current.scrollHeight, 130) + 'px';
        inputRef.current.focus();
      }
    });
    // Auto-send if enabled — guarded against duplicates
    if (settings.voiceAutoSend && !autoSendPendingRef.current) {
      autoSendPendingRef.current = true;
      // Give React one tick to flush the setInput above, then send
      setTimeout(() => {
        if (autoSendPendingRef.current) handleSend(text);
      }, 0);
    }
  }, [settings.voiceAutoSend, handleSend]);

  const { state: voiceState, interimText, error: voiceError, isSupported: voiceSupported, start: startVoice, stop: stopVoice, cancel: cancelVoice } =
    useVoiceInput({ onFinalTranscript: handleFinalTranscript, silenceMs: 2200 });

  const isListening  = voiceState === 'listening';
  const isProcessing = voiceState === 'processing';

  const handleMicPress = useCallback(() => {
    if (isListening) {
      stopVoice();
    } else if (voiceState === 'idle') {
      startVoice();
    }
    // requesting / processing: no-op (button disabled)
  }, [isListening, voiceState, stopVoice, startVoice]);

  // Cancel voice if user navigates away mid-recording
  useEffect(() => {
    return () => { cancelVoice(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Composed display input (shows interim text as live preview) ───────────
  const displayInput = useMemo(() => {
    if (!isListening || !interimText) return input;
    const trimmed = input.trimEnd();
    return trimmed ? trimmed + ' ' + interimText : interimText;
  }, [input, isListening, interimText]);

  // ── Render ────────────────────────────────────────────────────────────────
  const isEmpty = messages.length === 0;

  return (
    <div
      ref={modalRef}
      className="fixed inset-0 z-[99999] bg-background flex flex-col"
      style={{
        height: `${window.visualViewport?.height ?? window.innerHeight}px`,
        top:    `${window.visualViewport?.offsetTop ?? 0}px`,
        overscrollBehavior: 'none',
      }}
    >
      {/* Safe area top */}
      <div className="shrink-0" style={{ height: 'var(--app-safe-top)' }} />

      {/* ── Header ── */}
      <div className="flex items-center px-4 pt-3 pb-2 shrink-0">
        <div className="flex-1" />
        <p className="text-[10px] font-black tracking-[0.28em] text-foreground/20 uppercase select-none">
          Second Mind
        </p>
        <div className="flex-1 flex justify-end">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-full hover:bg-accent/60 transition-colors active:scale-90"
            aria-label="Close"
          >
            <X className="w-4 h-4 text-foreground/40" strokeWidth={2.5} />
          </button>
        </div>
      </div>

      {/* ── Messages / Empty state ── */}
      <div
        className="flex-1 overflow-y-auto overscroll-none min-h-0"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {isEmpty ? (
          /* ── Empty state: bottom-aligned prompts near input ── */
          <div className="h-full flex flex-col justify-end px-5 pb-3 gap-3">
            {contextLine && (
              <p className="text-[11px] text-center text-muted-foreground/35 tracking-wide pb-0.5">
                {contextLine}
              </p>
            )}
            <div className="space-y-1.5">
              <AnimatePresence>
                {dynamicPrompts.map((q, i) => (
                  <motion.button
                    key={q}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.045, duration: 0.18 }}
                    onClick={() => handleSend(q)}
                    className="w-full text-left text-[13px] px-4 py-3 rounded-2xl bg-muted/25 hover:bg-muted/50 text-foreground/55 hover:text-foreground/80 transition-all active:scale-[0.985] touch-manipulation leading-snug"
                  >
                    {q}
                  </motion.button>
                ))}
              </AnimatePresence>
            </div>
          </div>
        ) : (
          /* ── Conversation ── */
          <div className="px-5 pt-5 pb-6 space-y-7">
            {messages.map(message => (
              <div
                key={message.id}
                className={message.role === 'user' ? 'flex justify-end' : 'flex justify-start'}
              >
                {message.role === 'user' ? (
                  /* User — minimal muted pill */
                  <div className="max-w-[80%] bg-muted/40 rounded-2xl rounded-br-md px-4 py-2.5">
                    <p className="text-[14px] leading-relaxed text-foreground/85">{message.content}</p>
                  </div>
                ) : (
                  /* Assistant — editorial: left accent line, no bubble */
                  <div className="w-full">
                    {message.phase === 'connecting' ? (
                      /* Connecting phase — personal pulsing indicator */
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="flex items-center gap-2.5 py-0.5"
                      >
                        <span className="relative flex h-2.5 w-2.5 shrink-0">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary/40" />
                          <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary/60" />
                        </span>
                        <span className="text-[12px] text-muted-foreground/50">
                          {itemCount > 0 ? `Searching ${itemCount} items…` : 'Thinking…'}
                        </span>
                      </motion.div>

                    ) : message.error ? (
                      <div className="flex flex-col gap-2.5">
                        <div className="flex items-start gap-2">
                          <AlertCircle className="w-4 h-4 text-destructive/60 mt-0.5 shrink-0" />
                          <p className="text-[14px] text-destructive/80 leading-relaxed">{message.content}</p>
                        </div>
                        {lastUserMsgRef.current && (
                          <button
                            onClick={() => handleSend(lastUserMsgRef.current)}
                            disabled={isLoading}
                            className="self-start inline-flex items-center gap-1.5 text-[12px] px-3 py-1.5 rounded-lg border border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-border/70 bg-background/50 hover:bg-background transition-all active:scale-95 disabled:opacity-40"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Retry
                          </button>
                        )}
                      </div>

                    ) : (
                      <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.15 }}
                        className="pl-3 border-l border-primary/20 space-y-3"
                      >
                        {/* Content — plain text during stream, Markdown when done */}
                        <div className="text-[14px] leading-relaxed text-foreground/90">
                          {message.phase === 'streaming' ? (
                            /* Streaming: plain text + blinking cursor (no Markdown parse overhead) */
                            <p className="whitespace-pre-wrap">
                              {message.content}
                              <span className="inline-block w-[1.5px] h-[15px] bg-foreground/40 ml-0.5 align-text-bottom animate-pulse" />
                            </p>
                          ) : (
                            /* Done: full Markdown render (happens once) */
                            <div className="prose prose-sm dark:prose-invert max-w-none [&>p]:mb-2.5 [&>p:last-child]:mb-0 [&>ul]:mt-2 [&>ul]:pl-4 [&>ol]:mt-2 [&>ol]:pl-4 [&>li]:mb-1.5 [&>h3]:text-[14px] [&>h3]:font-semibold [&>h3]:mb-2 [&>h3]:mt-4 [&>strong]:font-semibold">
                              <ReactMarkdown>{message.content}</ReactMarkdown>
                            </div>
                          )}
                        </div>

                        {/* Action chips */}
                        {message.actions?.length ? (
                          <AnimatePresence>
                            <motion.div
                              initial={{ opacity: 0, y: 3 }}
                              animate={{ opacity: 1, y: 0 }}
                              className="flex flex-wrap gap-1.5"
                            >
                              {message.actions.map((action, i) => {
                                const key = `${message.id}-${action.type}`;
                                return (
                                  <button
                                    key={i}
                                    onClick={() => handleAction(action, message.id)}
                                    disabled={actionLoadingId === key}
                                    title={action.description}
                                    className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-lg border border-border/40 text-muted-foreground/70 hover:text-foreground hover:border-border/70 bg-background/50 hover:bg-background transition-all active:scale-95 disabled:opacity-40"
                                  >
                                    {actionLoadingId === key
                                      ? <Loader2 className="w-3 h-3 animate-spin" />
                                      : ACTION_ICONS[action.type]}
                                    {action.label}
                                  </button>
                                );
                              })}
                            </motion.div>
                          </AnimatePresence>
                        ) : null}
                      </motion.div>
                    )}
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* ── Input composer ── */}
      <div
        className="border-t border-border/20 px-4 pt-3 bg-background shrink-0"
        style={{ paddingBottom: 'max(var(--app-safe-bottom), 14px)' }}
      >
        {/* Voice error banner */}
        <AnimatePresence>
          {voiceState === 'error' && voiceError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="flex items-start gap-2 mb-2.5 px-3 py-2.5 rounded-xl bg-destructive/8 border border-destructive/15"
            >
              <AlertCircle className="w-3.5 h-3.5 text-destructive/60 mt-0.5 shrink-0" />
              <p className="text-[12px] text-destructive/70 leading-snug flex-1">
                {voiceError}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Voice listening hint */}
        <AnimatePresence>
          {isListening && (
            <motion.p
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 4 }}
              className="text-[11px] text-center text-muted-foreground/40 mb-2 tracking-wide"
            >
              Listening… tap mic to stop
            </motion.p>
          )}
          {isProcessing && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-[11px] text-center text-muted-foreground/40 mb-2 tracking-wide"
            >
              Processing…
            </motion.p>
          )}
        </AnimatePresence>

        <div className="flex items-end gap-2">
          {/* Mic button */}
          <MicButton
            voiceState={voiceState}
            isSupported={voiceSupported}
            onPress={handleMicPress}
          />

          {/* Text input */}
          <textarea
            ref={inputRef}
            value={displayInput}
            onChange={e => {
              // Only allow edits when not actively listening (interim is display-only)
              if (!isListening) {
                setInput(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 130) + 'px';
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isListening
                ? 'Listening…'
                : isEmpty
                  ? 'Ask anything about your notes, plans, or ideas…'
                  : 'Follow up…'
            }
            rows={1}
            disabled={isLoading}
            readOnly={isListening}
            data-tutorial="ai-input"
            className={[
              'flex-1 px-4 py-3 rounded-2xl bg-muted/20 border focus:outline-none resize-none text-[15px] leading-relaxed max-h-32 overflow-y-auto disabled:opacity-40 placeholder:text-muted-foreground/30 transition-colors',
              isListening
                ? 'border-red-500/30 bg-red-500/5 text-foreground/60 focus:border-red-500/40 cursor-default'
                : 'border-border/30 focus:border-border/60 focus:bg-muted/30',
            ].join(' ')}
          />

          {/* Send button */}
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading || isListening}
            className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center disabled:opacity-15 transition-all active:scale-90 shrink-0"
          >
            {isLoading
              ? <Loader2 className="w-4 h-4 animate-spin" />
              : <ArrowUp className="w-4 h-4 stroke-[2.5]" />}
          </button>
        </div>
      </div>
    </div>
  );
}
