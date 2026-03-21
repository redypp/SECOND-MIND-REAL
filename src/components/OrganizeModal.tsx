import { useState, useRef, useEffect, useCallback } from 'react';
import { X, ArrowUp, Image, Link2, Check } from 'lucide-react';
import { NoteOrganizer } from './NoteOrganizer';
import { AnimatePresence, motion } from 'framer-motion';
import { compressImage } from '@/lib/imageCompression';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';

export interface Attachment {
  type: 'image' | 'link';
  value: string;
  caption?: string;
}

interface OrganizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  spaceId?: string;
  spaceName?: string;
  onItemSaved?: () => void;
}

export function OrganizeModal({ isOpen, onClose, spaceId, spaceName, onItemSaved }: OrganizeModalProps) {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [submittedText, setSubmittedText] = useState('');
  const [submittedAttachments, setSubmittedAttachments] = useState<Attachment[]>([]);
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkInput, setLinkInput] = useState('');

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ─── helpers ────────────────────────────────────────────────────────────────

  const getDomain = (url: string) => {
    try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
  };

  const resetTextareaHeight = () => {
    const ta = textareaRef.current;
    if (ta) { ta.style.height = 'auto'; }
  };

  // ─── handlers ────────────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setText('');
    setAttachments([]);
    setSubmittedText('');
    setSubmittedAttachments([]);
    setShowOrganizer(false);
    setShowLinkInput(false);
    setLinkInput('');
    resetTextareaHeight();
    onClose();
  }, [onClose]);

  const handleAddLink = useCallback(() => {
    const trimmed = linkInput.trim();
    if (!trimmed) return;
    const finalUrl = trimmed.startsWith('http://') || trimmed.startsWith('https://')
      ? trimmed
      : 'https://' + trimmed;
    setAttachments(prev => [...prev, { type: 'link', value: finalUrl }]);
    setLinkInput('');
    setShowLinkInput(false);
    setTimeout(() => textareaRef.current?.focus(), 50);
  }, [linkInput]);

  const handleSubmit = useCallback(() => {
    const hasContent = text.trim().length > 0 || attachments.length > 0;
    if (!hasContent) return;
    setSubmittedText(text.trim());
    setSubmittedAttachments([...attachments]);
    setText('');
    setAttachments([]);
    resetTextareaHeight();
    setShowOrganizer(true);
  }, [text, attachments]);

  const handleDone = useCallback(() => {
    onItemSaved?.();
    handleClose();
  }, [handleClose, onItemSaved]);

  const handleTextKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }, [handleSubmit]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files || []).forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        showErrorPopup(`${file.name} is too large. Maximum size is 10MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const compressed = await compressImage(ev.target?.result as string);
        setAttachments(prev => [...prev, { type: 'image', value: compressed }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    for (const item of Array.from(e.clipboardData.items)) {
      if (item.type.startsWith('image/')) {
        e.preventDefault();
        const file = item.getAsFile();
        if (!file) continue;
        const reader = new FileReader();
        reader.onload = async (ev) => {
          const compressed = await compressImage(ev.target?.result as string);
          setAttachments(prev => [...prev, { type: 'image', value: compressed }]);
        };
        reader.readAsDataURL(file);
        return;
      }
    }
  }, []);

  const removeAttachment = useCallback((index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  }, []);

  const toggleLinkInput = useCallback(() => {
    const next = !showLinkInput;
    setShowLinkInput(next);
    if (next) {
      setTimeout(() => linkInputRef.current?.focus(), 60);
    } else {
      setLinkInput('');
      setTimeout(() => textareaRef.current?.focus(), 60);
    }
  }, [showLinkInput]);

  // ─── effects ─────────────────────────────────────────────────────────────────

  // Visual viewport: keep modal flush with visible area as keyboard opens/closes
  useEffect(() => {
    if (!isOpen) return;
    const el = modalRef.current;
    const vv = window.visualViewport;

    const apply = () => {
      if (!el) return;
      el.style.height = `${vv ? vv.height : window.innerHeight}px`;
      el.style.top = `${vv ? vv.offsetTop : 0}px`;
    };

    let raf: number;
    const update = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(apply); };

    apply();
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      cancelAnimationFrame(raf);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [isOpen]);

  // Lock body scroll while open
  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  // Auto-focus textarea on open
  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 120);
  }, [isOpen]);

  // Scroll to bottom when AI result appears
  useEffect(() => {
    if (showOrganizer && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  }, [showOrganizer]);

  if (!isOpen) return null;

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const hasSubmitted = submittedText.length > 0 || submittedAttachments.length > 0;

  return (
    <div
      ref={modalRef}
      className="fixed left-0 right-0 z-[99999] bg-background flex flex-col"
      style={{
        top: `${window.visualViewport?.offsetTop ?? 0}px`,
        height: `${window.visualViewport?.height ?? window.innerHeight}px`,
        overscrollBehavior: 'none',
      }}
    >
      {/* iOS safe-area top spacer */}
      <div className="shrink-0" style={{ height: 'var(--app-safe-top, env(safe-area-inset-top, 0px))' }} />

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="flex items-center px-4 pt-3 pb-2 shrink-0">
        <button
          onClick={handleClose}
          className="w-9 h-9 rounded-full flex items-center justify-center hover:bg-secondary transition-colors text-muted-foreground shrink-0 touch-manipulation"
          aria-label="Close"
        >
          <X className="w-5 h-5" strokeWidth={2} />
        </button>

        <div className="flex-1 text-center px-2 min-w-0">
          <span className="text-[14px] font-semibold text-foreground truncate block">
            {spaceName ?? 'New entry'}
          </span>
        </div>

        {/* Right spacer — mirrors close button for perfect centering */}
        <div className="w-9 shrink-0" />
      </div>

      {/* ── Scrollable content ──────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-4"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {!hasSubmitted ? (
          /* Empty hint */
          <div className="h-full flex items-center justify-center">
            <p className="text-[13px] text-muted-foreground/40 text-center leading-relaxed max-w-[200px]">
              {spaceName
                ? `Drop anything into ${spaceName}`
                : 'Dump your thoughts — AI will sort them'}
            </p>
          </div>
        ) : (
          /* Chat bubbles */
          <div className="py-4 space-y-3">
            {/* User bubble */}
            <div className="flex justify-end">
              <div className="max-w-[78%] rounded-[20px] rounded-tr-[6px] px-4 py-2.5 bg-primary text-primary-foreground space-y-2">
                {submittedText && (
                  <p className="text-[14px] leading-relaxed whitespace-pre-wrap">{submittedText}</p>
                )}
                {submittedAttachments.map((att, i) => (
                  <div key={i}>
                    {att.type === 'image' && (
                      <img src={att.value} alt="" className="rounded-xl max-h-44 w-full object-cover" />
                    )}
                    {att.type === 'link' && (
                      <div className="flex items-center gap-1.5 py-0.5">
                        <Link2 className="w-3 h-3 opacity-60 shrink-0" />
                        <span className="text-[12px] opacity-75 truncate">{getDomain(att.value)}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* AI response bubble */}
            {showOrganizer && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                className="flex justify-start"
              >
                <div className="max-w-[78%] rounded-[20px] rounded-tl-[6px] px-4 py-3 bg-secondary/70 border border-border/30">
                  <NoteOrganizer
                    noteText={submittedText}
                    attachments={submittedAttachments}
                    spaceId={spaceId}
                    onDone={handleDone}
                  />
                </div>
              </motion.div>
            )}
          </div>
        )}
      </div>

      {/* ── Attachment strip ────────────────────────────────────── */}
      <AnimatePresence>
        {attachments.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16, ease: 'easeInOut' }}
            className="shrink-0 overflow-hidden px-4"
          >
            <div className="flex gap-2 pt-1.5 pb-1 overflow-x-auto scrollbar-hide">
              {attachments.map((att, i) => (
                <div key={i} className="relative shrink-0">
                  {att.type === 'image' ? (
                    <div className="w-11 h-11 rounded-xl overflow-hidden bg-secondary border border-border/40">
                      <img src={att.value} alt="" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="h-9 px-2.5 rounded-xl bg-secondary border border-border/40 flex items-center gap-1.5 max-w-[140px]">
                      <Link2 className="w-3 h-3 text-muted-foreground shrink-0" />
                      <span className="text-[11px] text-muted-foreground truncate">{getDomain(att.value)}</span>
                    </div>
                  )}
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-1 -right-1 w-[18px] h-[18px] rounded-full bg-foreground/70 flex items-center justify-center touch-manipulation"
                    aria-label="Remove"
                  >
                    <X className="w-2.5 h-2.5 text-background" strokeWidth={2.5} />
                  </button>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Input bar ───────────────────────────────────────────── */}
      <div
        className="shrink-0 border-t border-border/25 bg-background px-3 pt-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 10px)' }}
      >
        <div className="flex items-end gap-1.5">

          {/* Icon buttons — always visible */}
          <div className="flex items-center shrink-0 pb-[3px]">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-secondary transition-colors text-muted-foreground touch-manipulation"
              aria-label="Attach image"
            >
              <Image className="w-[18px] h-[18px]" />
            </button>
            <button
              onClick={toggleLinkInput}
              className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors touch-manipulation ${
                showLinkInput
                  ? 'bg-primary/12 text-primary'
                  : 'hover:bg-secondary text-muted-foreground'
              }`}
              aria-label={showLinkInput ? 'Cancel link' : 'Attach link'}
            >
              <Link2 className="w-[18px] h-[18px]" />
            </button>
          </div>

          {/* Input field — text or URL */}
          {showLinkInput ? (
            <input
              ref={linkInputRef}
              type="url"
              inputMode="url"
              autoComplete="url"
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              placeholder="Paste or type a link…"
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); }
                if (e.key === 'Escape') { setShowLinkInput(false); setLinkInput(''); setTimeout(() => textareaRef.current?.focus(), 50); }
              }}
              className="flex-1 px-3.5 bg-secondary/60 border border-border/40 focus:border-primary/30 focus:outline-none rounded-2xl text-[14px] text-foreground placeholder:text-muted-foreground/40 transition-colors"
              style={{ height: '40px' }}
            />
          ) : (
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                if (showOrganizer) setShowOrganizer(false);
                e.target.style.height = 'auto';
                e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
              }}
              onKeyDown={handleTextKeyDown}
              onPaste={handlePaste}
              placeholder={spaceName ? `Add to ${spaceName}…` : 'Type, paste, or attach…'}
              rows={1}
              className="flex-1 px-3.5 py-[10px] bg-secondary/60 border border-border/40 focus:border-primary/30 focus:outline-none rounded-2xl resize-none text-[14px] leading-[1.45] placeholder:text-muted-foreground/40 transition-colors overflow-hidden"
              style={{ minHeight: '40px', maxHeight: '120px' }}
            />
          )}

          {/* Send / confirm — single context-aware button */}
          <button
            onClick={showLinkInput ? handleAddLink : handleSubmit}
            disabled={showLinkInput ? !linkInput.trim() : !hasContent}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 mb-[3px] transition-all duration-150 touch-manipulation disabled:opacity-30"
            style={{
              backgroundColor: (showLinkInput ? linkInput.trim() : hasContent)
                ? 'hsl(var(--primary))'
                : 'hsl(var(--secondary))',
              color: (showLinkInput ? linkInput.trim() : hasContent)
                ? 'hsl(var(--primary-foreground))'
                : 'hsl(var(--muted-foreground))',
            }}
            aria-label={showLinkInput ? 'Add link' : 'Send'}
          >
            {showLinkInput
              ? <Check className="w-4 h-4" strokeWidth={2.5} />
              : <ArrowUp className="w-4 h-4" strokeWidth={3} />
            }
          </button>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleImageUpload}
        className="hidden"
      />
    </div>
  );
}
