import { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import { X, ArrowUp, Loader2, AlertCircle, Settings, RotateCcw, Check, ChevronDown, Plus, Mic, Square, Play, Pause, Image, Link, Paperclip, Sparkles } from 'lucide-react';
import { compressImage } from '@/lib/imageCompression';
import { uploadImageToStorage } from '@/lib/imageUpload';
import { ChamberLogo } from './ChamberLogo';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAI, DumpItem } from '@/hooks/useAI';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { useVoiceRecorder } from '@/hooks/useVoiceRecorder';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  error?: boolean;
}



type InputMode = 'type' | 'talk';
type Mode = 'ask' | 'organize';

interface ChamberModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialMode?: Mode;
  lockMode?: boolean;
}

export function ChamberModal({ isOpen, onClose, initialMode, lockMode = false }: ChamberModalProps) {
  const navigate = useNavigate();
  const { askQuestion, isLoading, organizeDump } = useAI();
  const { spaces, addItem, addSpaceAsync } = useSpaces();
  const { user } = useAuth();
  const [mode, setMode] = useState<Mode>(initialMode || 'ask');
  const [organizeImages, setOrganizeImages] = useState<string[]>([]);
  const organizeFileRef = useRef<HTMLInputElement>(null);

  // ASK mode state
  const [messages, setMessages] = useState<Message[]>([]);
  const [askInput, setAskInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const askInputRef = useRef<HTMLTextAreaElement>(null);

  // ORGANIZE mode state
  const [organizeInput, setOrganizeInput] = useState('');
  const organizeInputRef = useRef<HTMLTextAreaElement>(null);
  const [isOrganizeLoading, setIsOrganizeLoading] = useState(false);
  const [dumpItems, setDumpItems] = useState<DumpItem[]>([]);
  const [dumpSummary, setDumpSummary] = useState('');
  const [organizeError, setOrganizeError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [savedCount, setSavedCount] = useState<number | null>(null);
  const [inputMode, setInputMode] = useState<InputMode>('type');
  const [voiceTranscriptError, setVoiceTranscriptError] = useState<string | null>(null);
  const [editedTranscript, setEditedTranscript] = useState<string | null>(null);

  const voice = useVoiceRecorder();

  // Track space overrides for items that need clarification
  const [spaceOverrides, setSpaceOverrides] = useState<Record<number, string>>({});
  const [destinationOverrides, setDestinationOverrides] = useState<Record<number, string>>({});

  const modalRef = useRef<HTMLDivElement>(null);
  // Track visual viewport directly on the DOM element to avoid re-render jank
  useEffect(() => {
    if (!isOpen) return;

    const el = modalRef.current;
    const vv = window.visualViewport;

    const apply = () => {
      if (!el) return;
      const h = vv ? vv.height : window.innerHeight;
      const t = vv ? vv.offsetTop : 0;
      el.style.height = `${h}px`;
      el.style.top = `${t}px`;
      // Override bottom:0 from inset-0 to prevent conflict with explicit height
      el.style.bottom = 'auto';
    };

    let raf: number;
    const update = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(apply);
    };

    apply();

    if (vv) {
      vv.addEventListener('resize', update);
      vv.addEventListener('scroll', update);
    }

    return () => {
      cancelAnimationFrame(raf);
      if (vv) {
        vv.removeEventListener('resize', update);
        vv.removeEventListener('scroll', update);
      }
    };
  }, [isOpen]);

  // Lock body scroll and signal Chamber is open (hides page indicators via CSS)
  useEffect(() => {
    if (!isOpen) return;

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.setAttribute('data-chamber-open', '');

    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
      document.documentElement.removeAttribute('data-chamber-open');
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        if (mode === 'ask') askInputRef.current?.focus();
        if (mode === 'organize') organizeInputRef.current?.focus();
      }, 150);
    }
  }, [isOpen, mode]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (!isOpen) {
      setMessages([]);
      setAskInput('');
      setOrganizeInput('');
      setOrganizeImages([]);
      setDumpItems([]);
      setDumpSummary('');
      setOrganizeError(null);
      setSavedCount(null);
      setSpaceOverrides({});
      setDestinationOverrides({});
      setInputMode('type');
      setVoiceTranscriptError(null);
      setEditedTranscript(null);
      voice.reset();
    } else {
      setMode(initialMode || 'ask');
    }
  }, [isOpen]);

  const switchMode = (m: Mode) => {
    setMode(m);
    setTimeout(() => {
      if (m === 'ask') askInputRef.current?.focus();
      if (m === 'organize') organizeInputRef.current?.focus();
    }, 150);
  };

  // ── ASK handlers ──────────────────────────────────────────────
  const handleAskSend = async (text?: string) => {
    const messageText = text || askInput.trim();
    if (!messageText || isLoading) return;

    setMessages(prev => [...prev, { id: Date.now().toString(), role: 'user', content: messageText }]);
    setAskInput('');

    const assistantId = (Date.now() + 1).toString();
    setMessages(prev => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    const response = await askQuestion(messageText, undefined, (chunk) => {
      setMessages(prev => prev.map(m => m.id === assistantId ? { ...m, content: m.content + chunk } : m));
    });

    if (response.error) {
      setMessages(prev => prev.map(m =>
        m.id === assistantId ? { ...m, content: response.error || 'An error occurred', error: true } : m
      ));
    }
  };

  const handleAskKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAskSend();
    }
  };

  const handleAskVoiceSend = async () => {
    const text = (editedTranscript ?? voice.transcript).trim();
    if (!text || isLoading) return;
    setVoiceTranscriptError(null);
    setEditedTranscript(null);
    voice.reset();
    await handleAskSend(text);
  };

  // ── ORGANIZE handlers ─────────────────────────────────────────
  const handleOrganizeImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) return;
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const compressed = await compressImage(dataUrl);
        setOrganizeImages(prev => [...prev, compressed]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const handleOrganizeSend = async () => {
    const messageText = organizeInput.trim();
    if (!messageText && organizeImages.length === 0) return;
    if (isOrganizeLoading) return;

    let inputForAI = messageText;
    const uploadedImageUrls: string[] = [];
    if (organizeImages.length > 0 && user) {
      for (const img of organizeImages) {
        try {
          const url = await uploadImageToStorage(img, user.id);
          uploadedImageUrls.push(url);
        } catch (err) {
          console.warn('Image upload failed:', err);
        }
      }
      inputForAI += `\n\n[User attached ${organizeImages.length} image(s)]`;
    }

    setOrganizeInput('');
    setOrganizeImages([]);
    setIsOrganizeLoading(true);
    setOrganizeError(null);
    setDumpItems([]);
    setSavedCount(null);
    setSpaceOverrides({});
    setDestinationOverrides({});
    const result = await organizeDump(inputForAI);
    setIsOrganizeLoading(false);

    if (result.error) {
      setOrganizeError(result.error);
      return;
    }

    if (result.data) {
      if (uploadedImageUrls.length > 0) {
        const archiveIdx = result.data.items.findIndex(i => i.destination === 'archive');
        const targetIdx = archiveIdx >= 0 ? archiveIdx : 0;
        if (result.data.items[targetIdx]) {
          (result.data.items[targetIdx] as any)._imageUrls = uploadedImageUrls;
        }
      }
      setDumpItems(result.data.items);
      setDumpSummary(result.data.summary);
    }
  };

  const handleOrganizeKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleOrganizeSend();
    }
  };

  // ── VOICE ORGANIZE handler ────────────────────────────────────
  const handleVoiceSend = async () => {
    const text = voice.transcript.trim();
    if (!text || isOrganizeLoading) return;

    setVoiceTranscriptError(null);
    setIsOrganizeLoading(true);
    setOrganizeError(null);
    setDumpItems([]);
    setSavedCount(null);
    setSpaceOverrides({});
    setDestinationOverrides({});

    // Prefix with context so the AI knows this is a voice transcript
    const prefixedInput = `[Voice transcript — may contain speech-to-text artifacts, interpret generously]\n\n${text}`;
    const result = await organizeDump(prefixedInput);
    setIsOrganizeLoading(false);

    if (result.error) {
      // Keep transcript so user can retry without re-recording
      setVoiceTranscriptError(result.error);
      return;
    }

    if (result.data) {
      setDumpItems(result.data.items);
      setDumpSummary(result.data.summary);
      voice.reset();
    }
  };

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, '0');
    const s = (seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const handleSetSpaceOverride = (index: number, spaceName: string) => {
    setSpaceOverrides(prev => ({ ...prev, [index]: spaceName }));
  };

  const handleSaveAll = useCallback(async () => {
    if (dumpItems.length === 0) return;
    setIsSaving(true);

    let saved = 0;
    const todayStr = new Date().toISOString().split('T')[0];

    for (let i = 0; i < dumpItems.length; i++) {
      const item = dumpItems[i];
      const destination = destinationOverrides[i] || item.destination || 'archive';
      try {
        if (destination === 'todo') {
          // Add as a todo item
          addItem({
            subCategory: 'todo',
            title: item.title,
            blocks: [{ 
              id: `checklist-${Date.now()}-${i}`, 
              type: 'checklist', 
              items: [{ id: `check-${Date.now()}-${i}`, text: item.title, checked: false }] 
            }] as any,
            scheduledDate: item.scheduled_date || todayStr,
            scheduledTime: item.scheduled_time,
          });
          saved++;
        } else if (destination === 'habit' && user) {
          // Insert into habits table
          const { error } = await supabase
            .from('habits')
            .insert({
              user_id: user.id,
              name: item.title,
              position: 999, // will be at the end
            });
          if (!error) saved++;
        } else if (destination === 'journal' && user) {
          // Append to journal entry
          const { data: existing } = await supabase
            .from('journal_entries')
            .select('id, content')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

          if (existing) {
            const newContent = existing.content
              ? `${existing.content}\n\n${item.content}`
              : item.content;
            await supabase
              .from('journal_entries')
              .update({ content: newContent, updated_at: new Date().toISOString() })
              .eq('id', existing.id);
          } else {
            await supabase
              .from('journal_entries')
              .insert({ user_id: user.id, content: item.content });
          }
          saved++;
        } else if (destination === 'daily_plan') {
          // Add as a scheduled event on the daily planner
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
          saved++;
        } else if (destination === 'reminder' && user) {
          // Save as a scheduled reminder
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
          await supabase
            .from('scheduled_reminders' as any)
            .insert({
              user_id: user.id,
              message: item.title || item.content,
              remind_at: remindAt.toISOString(),
            } as any);
          saved++;
        } else {
          // Archive — save to a collection/space
          const targetSpaceName = spaceOverrides[i] || item.target_space;
          let spaceId: string | undefined;

          if (targetSpaceName.startsWith('New: ')) {
            const newName = targetSpaceName.slice(5);
            const newId = await addSpaceAsync(newName);
            if (newId) spaceId = newId;
          } else {
            const matched = spaces.find(s => s.name.toLowerCase() === targetSpaceName.toLowerCase());
            spaceId = matched?.id;
          }

          const blocks: any[] = [{ id: Date.now().toString() + i, type: 'text', content: item.content }];
          // Attach uploaded images as media blocks
          const imageUrls = (item as any)._imageUrls as string[] | undefined;
          if (imageUrls) {
            imageUrls.forEach((url, j) => {
              blocks.push({ id: `img-${Date.now()}-${i}-${j}`, type: 'media', url, mediaType: 'image' });
            });
          }

          addItem({
            subCategory: item.sub_category,
            title: item.title,
            content: item.content,
            blocks,
            spaceIds: spaceId ? [spaceId] : [],
            keywords: item.tags,
            scheduledDate: item.scheduled_date,
            scheduledTime: item.scheduled_time,
          });
          saved++;
        }
      } catch (err) {
        console.warn(`Failed to save item ${i}:`, err);
      }
    }

    setSavedCount(saved);
    setIsSaving(false);
    setDumpItems([]);
    setSpaceOverrides({});
    setDestinationOverrides({});
  }, [dumpItems, spaceOverrides, destinationOverrides, spaces, addItem, addSpaceAsync, user]);

  if (!isOpen) return null;

  const askIsEmpty = messages.length === 0;
  const organizeHasResults = dumpItems.length > 0;

  return (
    <>
      {/* Full-screen backdrop to hide everything behind (page indicators, nav, etc.) */}
      <div className="fixed inset-0 z-[99998] bg-background" />
      <div
        ref={modalRef}
        className="fixed inset-0 z-[99999] bg-background flex flex-col"
        style={{ 
          height: `${window.visualViewport?.height ?? window.innerHeight}px`,
          top: `${window.visualViewport?.offsetTop ?? 0}px`,
          overscrollBehavior: 'none',
        }}
      >
        {/* Safe area top spacer — clears Dynamic Island */}
        <div className="shrink-0" style={{ height: 'var(--app-safe-top)' }} />
        {/* Header — mode toggle + close */}
        <div className="flex items-center gap-3 px-5 pt-3 pb-3 shrink-0">
          {lockMode ? (
            <div className="flex-1 flex items-center justify-center py-2.5">
              <span className="text-sm font-black tracking-widest text-foreground uppercase">{mode}</span>
            </div>
          ) : (
            <div className="relative flex flex-1 bg-accent/50 rounded-2xl p-1">
              <motion.div
                className="absolute top-1 bottom-1 w-[calc(50%-4px)] rounded-xl bg-background shadow-sm"
                animate={{ x: mode === 'ask' ? 0 : '100%' }}
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                style={{ left: 4 }}
              />
              <button
                onClick={() => switchMode('ask')}
                className={`relative flex-1 flex items-center justify-center py-2.5 rounded-xl text-sm font-black tracking-widest transition-colors duration-200 z-10 ${
                  mode === 'ask' ? 'text-foreground' : 'text-foreground/40'
                }`}
              >
                ASK
              </button>
              <button
                onClick={() => switchMode('organize')}
                className={`relative flex-1 flex items-center justify-center py-2.5 rounded-xl text-sm font-black tracking-widest transition-colors duration-200 z-10 ${
                  mode === 'organize' ? 'text-foreground' : 'text-foreground/40'
                }`}
              >
                ORGANIZE
              </button>
            </div>
          )}
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-accent transition-colors shrink-0" aria-label="Close">
            <X className="w-5 h-5 text-foreground" strokeWidth={2.5} />
          </button>
        </div>

        {/* ── ASK MODE ── */}
        {mode === 'ask' && (
          <>
            <div className="flex-1 overflow-y-auto overscroll-none min-h-0" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              {askIsEmpty ? (
                /* ── ASK empty state — prompt suggestions ── */
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="h-full flex flex-col items-center justify-center gap-5 px-6 pb-16"
                >
                  <Sparkles className="w-7 h-7 text-primary/60" />
                  <div className="text-center space-y-1">
                    <p className="text-sm font-medium text-foreground">Ask about your notes</p>
                    <p className="text-[13px] text-muted-foreground">Search across everything you've saved</p>
                  </div>
                  <div className="w-full space-y-2">
                    {['What did I save recently?', "Any ideas I haven't acted on?", 'What tasks are coming up?'].map(q => (
                      <button
                        key={q}
                        onClick={() => { setAskInput(q); setTimeout(() => askInputRef.current?.focus(), 50); }}
                        className="w-full text-left text-[14px] px-4 py-3.5 rounded-2xl bg-accent/60 text-foreground/80 hover:bg-accent hover:text-foreground transition-colors active:scale-[0.98] touch-manipulation"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <div className="px-4 pt-2 pb-6 space-y-3">
                  {messages.map((message, idx) => {
                    const isFirst = idx === 0 || messages[idx - 1].role !== message.role;
                    return (
                    <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} ${!isFirst ? '-mt-1' : ''}`}>
                      <div className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                        message.role === 'user'
                          ? 'bg-primary text-primary-foreground rounded-br-md'
                          : message.error
                            ? 'bg-destructive/10 border border-destructive/20'
                            : 'bg-accent/70 rounded-bl-md'
                      }`}>
                        {message.role === 'assistant' && !message.content && isLoading ? (
                          <div className="flex gap-1.5 py-1 px-0.5">
                            {[0, 160, 320].map(delay => (
                              <span key={delay} className="w-2 h-2 bg-primary/60 rounded-full animate-bounce" style={{ animationDelay: `${delay}ms` }} />
                            ))}
                          </div>
                        ) : message.error ? (
                          <div className="space-y-3">
                            <div className="flex items-start gap-2">
                              <AlertCircle className="w-4 h-4 text-destructive mt-0.5 shrink-0" />
                              <p className="text-sm text-destructive leading-relaxed">{message.content}</p>
                            </div>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => { onClose(); navigate('/settings'); }} className="text-xs">
                                <Settings className="w-3 h-3 mr-1" /> Settings
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => handleAskSend(messages[messages.length - 2]?.content)} className="text-xs">
                                Retry
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="text-sm leading-relaxed prose prose-sm prose-invert max-w-none [&>p]:mb-1.5 [&>p:last-child]:mb-0 [&>ul]:mt-1 [&>ul]:pl-4 [&>ol]:mt-1 [&>ol]:pl-4 [&>li]:mb-0.5">
                            <ReactMarkdown>{message.content}</ReactMarkdown>
                          </div>
                        )}
                      </div>
                    </div>
                  )})}
                  <div ref={messagesEndRef} />
                </div>
              )}
            </div>

              <div className="border-t border-border/40 px-4 pt-3 pb-2 bg-background shrink-0" style={{ paddingBottom: 'max(var(--app-safe-bottom), 12px)' }}>
                {/* Type / Talk toggle — 44px touch targets */}
                {voice.isSupported && (
                  <div className="flex items-center gap-1 mb-2">
                    <button
                      onClick={() => { setInputMode('type'); voice.reset(); setVoiceTranscriptError(null); }}
                      className={`text-xs px-4 py-2 rounded-xl transition-colors touch-manipulation ${
                        inputMode === 'type' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Type
                    </button>
                    <button
                      onClick={() => setInputMode('talk')}
                      className={`text-xs px-4 py-2 rounded-xl transition-colors touch-manipulation ${
                        inputMode === 'talk' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Talk
                    </button>
                  </div>
                )}

                {inputMode === 'type' ? (
                  <>
                  <div className="flex items-end gap-2">
                    <textarea
                      ref={askInputRef}
                      value={askInput}
                      onChange={(e) => {
                        setAskInput(e.target.value);
                        e.target.style.height = 'auto';
                        e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px';
                      }}
                      onKeyDown={handleAskKeyDown}
                      placeholder="Ask about your notes…"
                      rows={1}
                      className="flex-1 px-4 py-3 rounded-2xl bg-accent/50 border border-border/50 focus:border-primary/40 focus:outline-none transition-colors resize-none text-base leading-relaxed max-h-36 overflow-y-auto disabled:opacity-60"
                      disabled={isLoading}
                    />
                    <button
                      onClick={() => handleAskSend()}
                      disabled={!askInput.trim() || isLoading}
                      className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-35 transition-all active:scale-90 shrink-0"
                    >
                      {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-5 h-5 stroke-[2.5]" />}
                    </button>
                  </div>
                  <p className="text-[12px] text-muted-foreground/70 text-center mt-2">Enter to send · Shift+Enter for new line</p>
                  </>
                ) : (
                  /* ── TALK mode for ASK ── */
                  <div className="space-y-3">
                    {(voice.error || voiceTranscriptError) && (
                      <div className="flex items-start gap-2 px-1">
                        <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                        <p className="text-xs text-destructive">{voice.error || voiceTranscriptError}</p>
                      </div>
                    )}

                    {(voice.transcript || (voice.audioUrl && !voice.isRecording)) && (
                      <div className="px-4 py-3 rounded-2xl bg-accent/30 border border-border/30 max-h-32 overflow-y-auto">
                        <p className="text-[13px] text-muted-foreground mb-1.5">Transcript</p>
                        <textarea
                          value={editedTranscript ?? voice.transcript}
                          onChange={(e) => setEditedTranscript(e.target.value)}
                          placeholder={voice.transcript ? undefined : "Speech-to-text unavailable — type what you said"}
                          className="w-full bg-transparent text-base text-foreground leading-relaxed resize-none outline-none min-h-[3.5rem]"
                          rows={2}
                        />
                      </div>
                    )}

                    {voice.isRecording && (
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        <span className="text-sm font-mono text-foreground">{formatDuration(voice.duration)}</span>
                      </div>
                    )}
                    {!voice.isRecording && voice.audioUrl && (
                      <div className="flex items-center justify-center">
                        <span className="text-[13px] text-muted-foreground">Recorded {formatDuration(voice.duration)}</span>
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-3">
                      {!voice.isRecording && !voice.audioUrl && (
                        <button
                          onClick={voice.startRecording}
                          className="w-12 h-12 rounded-full bg-destructive/90 text-destructive-foreground flex items-center justify-center transition-transform active:scale-95"
                          aria-label="Start recording"
                        >
                          <Mic className="w-5 h-5" />
                        </button>
                      )}

                      {voice.isRecording && (
                        <button
                          onClick={voice.stopRecording}
                          className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center transition-transform active:scale-95"
                          aria-label="Stop recording"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      )}

                      {!voice.isRecording && voice.audioUrl && (
                        <>
                          <button
                            onClick={voice.isPlaying ? voice.stopAudio : voice.playAudio}
                            className="w-11 h-11 rounded-full bg-accent text-foreground flex items-center justify-center transition-transform active:scale-95"
                            aria-label={voice.isPlaying ? 'Stop playback' : 'Play recording'}
                          >
                            {voice.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                          </button>

                          <button
                            onClick={() => { voice.reset(); setVoiceTranscriptError(null); setEditedTranscript(null); }}
                            className="w-11 h-11 rounded-full bg-accent text-foreground flex items-center justify-center transition-transform active:scale-95"
                            aria-label="Re-record"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          <button
                            onClick={handleAskVoiceSend}
                            disabled={!(editedTranscript ?? voice.transcript).trim() || isLoading}
                            className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-50 transition-transform active:scale-95"
                            aria-label="Send recording"
                          >
                            {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowUp className="w-5 h-5 stroke-[3]" />}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
          </>
        )}

        {/* ── ORGANIZE MODE ── */}
        {mode === 'organize' && (
          <>
            <div className="flex-1 overflow-y-auto overscroll-none min-h-0" style={{ touchAction: 'pan-y', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}>
              {/* Empty state */}
              {!organizeHasResults && !isOrganizeLoading && !organizeError && savedCount === null && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex flex-col items-center justify-center h-full gap-4 px-6 pb-16"
                >
                  <div className="w-12 h-12 rounded-full bg-accent/60 flex items-center justify-center">
                    <Sparkles className="w-6 h-6 text-primary/60" />
                  </div>
                  <div className="text-center space-y-1.5">
                    <p className="text-sm font-medium text-foreground">Brain dump anything</p>
                    <p className="text-[13px] text-muted-foreground leading-relaxed max-w-[240px]">
                      Type messy thoughts, paste a list, or attach an image — AI will sort it out
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {['tasks', 'ideas', 'notes', 'reminders', 'habits'].map(t => (
                      <span key={t} className="text-[12px] px-3 py-1.5 rounded-full bg-accent/70 text-foreground/70 capitalize">{t}</span>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Loading state */}
              {isOrganizeLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-full gap-3 px-6 pb-16"
                >
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm text-muted-foreground">Organizing your thoughts…</p>
                </motion.div>
              )}

              {/* Error state */}
              {organizeError && !isOrganizeLoading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex flex-col items-center justify-center h-full gap-3 px-6 pb-16"
                >
                  <AlertCircle className="w-6 h-6 text-destructive" />
                  <p className="text-sm text-destructive text-center leading-relaxed">{organizeError}</p>
                  <Button size="sm" variant="outline" onClick={() => setOrganizeError(null)}>
                    Try again
                  </Button>
                </motion.div>
              )}

              {/* Success state */}
              {savedCount !== null && !organizeHasResults && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center justify-center h-full gap-3 px-6 pb-16"
                >
                  <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                    <Check className="w-6 h-6 text-primary" />
                  </div>
                   <p className="text-sm text-foreground font-medium">{savedCount} items saved</p>
                  <button
                    onClick={() => setSavedCount(null)}
                    className="text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Organize more
                  </button>
                </motion.div>
              )}

              {/* Results preview */}
              {organizeHasResults && !isOrganizeLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="px-4 pt-3 pb-2 space-y-3"
                >
                  <p className="text-[13px] text-muted-foreground leading-relaxed">{dumpSummary}</p>
                  
                  {dumpItems.map((item, index) => {
                    const resolvedSpace = spaceOverrides[index] || item.target_space;
                    const currentDest = (destinationOverrides[index] || item.destination || 'archive') as string;
                    const needsClarification = currentDest === 'archive' && item.needs_clarification && !spaceOverrides[index];
                    
                    const DESTINATIONS = ['archive', 'todo', 'daily_plan', 'habit', 'journal', 'reminder'] as const;
                    const DEST_LABELS: Record<string, string> = {
                      archive: 'Archive',
                      todo: 'Todos',
                      daily_plan: 'Daily Plan',
                      habit: 'Habits',
                      journal: 'Journal',
                      reminder: 'Reminder',
                    };

                    const cycleDest = () => {
                      const idx = DESTINATIONS.indexOf(currentDest as any);
                      const next = DESTINATIONS[(idx + 1) % DESTINATIONS.length];
                      setDestinationOverrides(prev => ({ ...prev, [index]: next }));
                    };
                    
                    return (
                      <motion.div
                        key={index}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className={`rounded-xl border p-3 space-y-2 ${
                          needsClarification 
                            ? 'border-amber-500/30 bg-amber-500/5' 
                            : 'border-border bg-card/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-[15px] font-medium text-foreground leading-snug">{item.title}</p>
                            <p className="text-[13px] text-muted-foreground mt-1 line-clamp-3 leading-relaxed">{item.content}</p>
                          </div>
                          <button
                            onClick={cycleDest}
                            className="text-[12px] px-3 py-1.5 rounded-full bg-accent hover:bg-accent/80 text-foreground shrink-0 capitalize transition-colors active:scale-95 touch-manipulation whitespace-nowrap font-medium"
                          >
                            {DEST_LABELS[currentDest] || currentDest}
                          </button>
                        </div>

                        {/* Space assignment — only for archive destination */}
                        {currentDest === 'archive' && needsClarification && item.clarification_options ? (
                          <div className="space-y-1.5">
                            <p className="text-[12px] font-medium text-amber-600 dark:text-amber-400">Which collection?</p>
                            <div className="flex flex-wrap gap-1.5">
                              {item.clarification_options.map(option => (
                                <button
                                  key={option}
                                  onClick={() => handleSetSpaceOverride(index, option)}
                                  className="text-[11px] px-2.5 py-1 rounded-lg border border-border bg-background hover:bg-accent transition-colors"
                                >
                                  {option}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : currentDest === 'archive' ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-[12px] text-muted-foreground">→</span>
                            <span className="text-[13px] text-primary font-medium">{resolvedSpace}</span>
                          </div>
                        ) : null}

                        {item.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {item.tags.map(tag => (
                              <span key={tag} className="text-[11px] px-2 py-0.5 rounded bg-accent text-foreground/70">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </motion.div>
                    );
                  })}

                  {/* Save all button */}
                  <div className="flex gap-2 pt-2 pb-4">
                    <button
                      onClick={() => { setDumpItems([]); setSpaceOverrides({}); setDestinationOverrides({}); }}
                      className="flex items-center gap-1.5 px-4 py-2.5 text-xs text-muted-foreground hover:text-foreground border border-border rounded-xl transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      Discard
                    </button>
                    <button
                      onClick={handleSaveAll}
                      disabled={isSaving || dumpItems.some((item, i) => (destinationOverrides[i] || item.destination || 'archive') === 'archive' && item.needs_clarification && !spaceOverrides[i])}
                      className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-primary text-primary-foreground text-xs font-semibold rounded-xl disabled:opacity-40 transition-opacity"
                    >
                      {isSaving ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      Save {dumpItems.length} items
                    </button>
                  </div>
                </motion.div>
              )}
            </div>

            {/* Input area - only show when no results */}
            {!organizeHasResults && savedCount === null && !isOrganizeLoading && (
              <div className="border-t border-border/40 px-4 pt-3 pb-2 bg-background shrink-0" style={{ paddingBottom: 'max(var(--app-safe-bottom), 12px)' }}>
                {/* Type / Talk toggle — 44px touch targets */}
                {voice.isSupported && (
                  <div className="flex items-center gap-1 mb-2">
                    <button
                      onClick={() => { setInputMode('type'); voice.reset(); setVoiceTranscriptError(null); }}
                      className={`text-xs px-4 py-2 rounded-xl transition-colors touch-manipulation ${
                        inputMode === 'type' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Type
                    </button>
                    <button
                      onClick={() => setInputMode('talk')}
                      className={`text-xs px-4 py-2 rounded-xl transition-colors touch-manipulation ${
                        inputMode === 'talk' ? 'bg-accent text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      Talk
                    </button>
                  </div>
                )}

                {inputMode === 'type' ? (
                  <>
                  <div className="space-y-2">
                    {/* Attached images preview */}
                    {organizeImages.length > 0 && (
                      <div className="flex gap-2 flex-wrap px-1">
                        {organizeImages.map((img, i) => (
                          <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden bg-secondary">
                            <img src={img} alt="" className="w-full h-full object-cover" />
                            <button
                              onClick={() => setOrganizeImages(prev => prev.filter((_, j) => j !== i))}
                              className="absolute top-0.5 right-0.5 p-0.5 rounded-full bg-destructive text-destructive-foreground"
                            >
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="flex items-end gap-2">
                      <button
                        onClick={() => organizeFileRef.current?.click()}
                        className="w-11 h-11 rounded-2xl bg-accent/50 text-muted-foreground flex items-center justify-center hover:text-foreground active:scale-95 transition-all shrink-0"
                        aria-label="Attach image"
                      >
                        <Image className="w-5 h-5" />
                      </button>
                      <input
                        ref={organizeFileRef}
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleOrganizeImageUpload}
                        className="hidden"
                      />
                      <textarea
                        ref={organizeInputRef}
                        value={organizeInput}
                        onChange={(e) => {
                          setOrganizeInput(e.target.value);
                          e.target.style.height = 'auto';
                          e.target.style.height = Math.min(e.target.scrollHeight, 144) + 'px';
                        }}
                        onKeyDown={handleOrganizeKeyDown}
                        placeholder="Dump anything — notes, ideas, links, images…"
                        rows={1}
                        className="flex-1 px-4 py-3 rounded-2xl bg-accent/50 border border-border/50 focus:border-primary/40 focus:outline-none transition-colors resize-none text-base leading-relaxed max-h-36 overflow-y-auto disabled:opacity-60"
                        disabled={isOrganizeLoading}
                      />
                      <button
                        onClick={() => handleOrganizeSend()}
                        disabled={(!organizeInput.trim() && organizeImages.length === 0) || isOrganizeLoading}
                        className="w-11 h-11 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-35 transition-all active:scale-90 shrink-0"
                      >
                        <ArrowUp className="w-5 h-5 stroke-[2.5]" />
                      </button>
                    </div>
                  </div>
                  <p className="text-[12px] text-muted-foreground/70 text-center mt-2">Enter to send · Shift+Enter for new line</p>
                  </>
                ) : (
                  /* ── TALK mode ── */
                  <div className="space-y-3">
                    {/* Voice error */}
                    {(voice.error || voiceTranscriptError) && (
                      <div className="flex items-start gap-2 px-1">
                        <AlertCircle className="w-3.5 h-3.5 text-destructive mt-0.5 shrink-0" />
                        <p className="text-xs text-destructive">{voice.error || voiceTranscriptError}</p>
                      </div>
                    )}

                    {/* Live transcript preview */}
                    {voice.transcript && (
                      <div className="px-4 py-3 rounded-2xl bg-accent/30 border border-border/30 max-h-24 overflow-y-auto">
                        <p className="text-[13px] text-muted-foreground mb-1">Transcript</p>
                        <p className="text-[15px] text-foreground leading-relaxed">{voice.transcript}</p>
                      </div>
                    )}

                    {/* Recording timer */}
                    {voice.isRecording && (
                      <div className="flex items-center justify-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-destructive animate-pulse" />
                        <span className="text-sm font-mono text-foreground">{formatDuration(voice.duration)}</span>
                      </div>
                    )}
                    {!voice.isRecording && voice.audioUrl && (
                      <div className="flex items-center justify-center">
                        <span className="text-[13px] text-muted-foreground">Recorded {formatDuration(voice.duration)}</span>
                      </div>
                    )}

                    {/* Control buttons */}
                    <div className="flex items-center justify-center gap-3">
                      {!voice.isRecording && !voice.audioUrl && (
                        <button
                          onClick={voice.startRecording}
                          className="w-12 h-12 rounded-full bg-destructive/90 text-destructive-foreground flex items-center justify-center transition-transform active:scale-95"
                          aria-label="Start recording"
                        >
                          <Mic className="w-5 h-5" />
                        </button>
                      )}

                      {voice.isRecording && (
                        <button
                          onClick={voice.stopRecording}
                          className="w-12 h-12 rounded-full bg-foreground text-background flex items-center justify-center transition-transform active:scale-95"
                          aria-label="Stop recording"
                        >
                          <Square className="w-4 h-4" />
                        </button>
                      )}

                      {!voice.isRecording && voice.audioUrl && (
                        <>
                          <button
                            onClick={voice.isPlaying ? voice.stopAudio : voice.playAudio}
                            className="w-11 h-11 rounded-full bg-accent text-foreground flex items-center justify-center transition-transform active:scale-95"
                            aria-label={voice.isPlaying ? 'Stop playback' : 'Play recording'}
                          >
                            {voice.isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
                          </button>

                          <button
                            onClick={() => { voice.reset(); setVoiceTranscriptError(null); }}
                            className="w-11 h-11 rounded-full bg-accent text-foreground flex items-center justify-center transition-transform active:scale-95"
                            aria-label="Re-record"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>

                          <button
                            onClick={handleVoiceSend}
                            disabled={!voice.transcript.trim() || isOrganizeLoading}
                            className="w-12 h-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center disabled:opacity-40 transition-transform active:scale-95"
                            aria-label="Send recording"
                          >
                            <ArrowUp className="w-5 h-5 stroke-[3]" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
    </div>
    </>
  );
}
