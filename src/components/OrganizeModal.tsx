import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Image, Link2, Check, Plus } from 'lucide-react';
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

  // ─── handlers ────────────────────────────────────────────────────────────────

  const handleClose = useCallback(() => {
    setText('');
    setAttachments([]);
    setSubmittedText('');
    setSubmittedAttachments([]);
    setShowOrganizer(false);
    setShowLinkInput(false);
    setLinkInput('');
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
    setShowOrganizer(true);
  }, [text, attachments]);

  const handleDone = useCallback(() => {
    onItemSaved?.();
    handleClose();
  }, [handleClose, onItemSaved]);

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

  // ─── effects ─────────────────────────────────────────────────────────────────

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

  useEffect(() => {
    if (!isOpen) return;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
      document.documentElement.style.overflow = '';
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) setTimeout(() => textareaRef.current?.focus(), 120);
  }, [isOpen]);

  useEffect(() => {
    if (showOrganizer && scrollRef.current) {
      setTimeout(() => {
        scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
      }, 100);
    }
  }, [showOrganizer]);

  if (!isOpen) return null;

  const hasContent = text.trim().length > 0 || attachments.length > 0;
  const imageAttachments = attachments.filter(a => a.type === 'image');
  const linkAttachments = attachments.filter(a => a.type === 'link');

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
          <span className="text-[15px] font-semibold text-foreground truncate block">
            {spaceName ?? 'New entry'}
          </span>
        </div>
        <div className="w-9 shrink-0" />
      </div>

      {/* ── Scrollable editor area ─────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-5"
        style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' } as React.CSSProperties}
      >
        {showOrganizer ? (
          /* ── AI organizer results (after save) ── */
          <div className="py-6">
            {submittedText && (
              <div className="mb-4 px-4 py-3 rounded-2xl bg-muted/20 border border-border/15">
                <p className="text-[15px] leading-relaxed text-foreground/80 whitespace-pre-wrap">{submittedText}</p>
              </div>
            )}
            {submittedAttachments.filter(a => a.type === 'image').length > 0 && (
              <div className="mb-4 grid grid-cols-2 gap-2">
                {submittedAttachments.filter(a => a.type === 'image').map((att, i) => (
                  <div key={i} className="rounded-2xl overflow-hidden bg-secondary border border-border/20">
                    <img src={att.value} alt="" className="w-full aspect-square object-cover" />
                  </div>
                ))}
              </div>
            )}
            {submittedAttachments.filter(a => a.type === 'link').length > 0 && (
              <div className="mb-4 space-y-2">
                {submittedAttachments.filter(a => a.type === 'link').map((att, i) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-muted/15 border border-border/15">
                    <Link2 className="w-4 h-4 text-muted-foreground/50 shrink-0" />
                    <span className="text-[14px] text-muted-foreground truncate">{getDomain(att.value)}</span>
                  </div>
                ))}
              </div>
            )}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ type: 'spring', stiffness: 400, damping: 32 }}
            >
              <NoteOrganizer
                noteText={submittedText}
                attachments={submittedAttachments}
                spaceId={spaceId}
                onDone={handleDone}
              />
            </motion.div>
          </div>
        ) : (
          /* ── Editor layout ── */
          <div className="py-4 space-y-5">
            {/* Large textarea */}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = Math.max(e.target.scrollHeight, 150) + 'px';
              }}
              onPaste={handlePaste}
              placeholder="Write a note..."
              rows={4}
              className="w-full px-1 py-2 bg-transparent text-[17px] leading-[1.65] text-foreground placeholder:text-muted-foreground/35 focus:outline-none resize-none"
              style={{ minHeight: '150px' }}
            />

            {/* Image previews grid */}
            <AnimatePresence>
              {imageAttachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="grid grid-cols-2 gap-2.5"
                >
                  {attachments.map((att, i) => {
                    if (att.type !== 'image') return null;
                    return (
                      <div key={i} className="relative group">
                        <div className="rounded-2xl overflow-hidden bg-secondary border border-border/20">
                          <img src={att.value} alt="" className="w-full aspect-square object-cover" />
                        </div>
                        <button
                          onClick={() => removeAttachment(i)}
                          className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center touch-manipulation"
                          aria-label="Remove"
                        >
                          <X className="w-3.5 h-3.5 text-white" strokeWidth={2.5} />
                        </button>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Link cards */}
            <AnimatePresence>
              {linkAttachments.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 6 }}
                  className="space-y-2"
                >
                  {attachments.map((att, i) => {
                    if (att.type !== 'link') return null;
                    return (
                      <div key={i} className="flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-muted/20 border border-border/20">
                        <Link2 className="w-4.5 h-4.5 text-muted-foreground/50 shrink-0" />
                        <span className="text-[15px] text-foreground/70 truncate flex-1">{getDomain(att.value)}</span>
                        <button
                          onClick={() => removeAttachment(i)}
                          className="w-7 h-7 rounded-full flex items-center justify-center text-muted-foreground/40 hover:text-foreground hover:bg-secondary transition-colors touch-manipulation shrink-0"
                          aria-label="Remove"
                        >
                          <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                        </button>
                      </div>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Inline link input */}
            <AnimatePresence>
              {showLinkInput && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    <input
                      ref={linkInputRef}
                      type="url"
                      inputMode="url"
                      autoComplete="url"
                      value={linkInput}
                      onChange={(e) => setLinkInput(e.target.value)}
                      placeholder="Paste or type a URL..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); handleAddLink(); }
                        if (e.key === 'Escape') { setShowLinkInput(false); setLinkInput(''); }
                      }}
                      className="flex-1 px-4 py-3 bg-muted/15 border border-border/25 focus:border-border/50 focus:outline-none rounded-2xl text-[15px] text-foreground placeholder:text-muted-foreground/40 transition-colors"
                    />
                    <button
                      onClick={handleAddLink}
                      disabled={!linkInput.trim()}
                      className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center shrink-0 disabled:opacity-20 transition-opacity touch-manipulation"
                      aria-label="Add link"
                    >
                      <Check className="w-4 h-4" strokeWidth={2.5} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Action buttons */}
            <div className="flex gap-2.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-2xl bg-muted/15 border border-border/15 text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground/80 transition-all active:scale-[0.98] touch-manipulation"
              >
                <Image className="w-5 h-5" />
                <span className="text-[15px] font-medium">Add Image</span>
              </button>
              <button
                onClick={() => {
                  setShowLinkInput(prev => !prev);
                  if (!showLinkInput) setTimeout(() => linkInputRef.current?.focus(), 80);
                }}
                className={[
                  'flex-1 flex items-center justify-center gap-2.5 py-3.5 rounded-2xl border transition-all active:scale-[0.98] touch-manipulation',
                  showLinkInput
                    ? 'bg-foreground/5 border-foreground/20 text-foreground/80'
                    : 'bg-muted/15 border-border/15 text-muted-foreground/70 hover:bg-muted/30 hover:text-foreground/80',
                ].join(' ')}
              >
                <Link2 className="w-5 h-5" />
                <span className="text-[15px] font-medium">Add Link</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Save button (bottom) ───────────────────────────────── */}
      {!showOrganizer && (
        <div
          className="shrink-0 px-5 pt-3 bg-background"
          style={{ paddingBottom: 'max(var(--app-safe-bottom), 16px)' }}
        >
          <button
            onClick={handleSubmit}
            disabled={!hasContent}
            className="w-full py-4 rounded-2xl bg-foreground text-background font-semibold text-[16px] flex items-center justify-center gap-2 disabled:opacity-20 transition-all active:scale-[0.98] touch-manipulation"
          >
            <Plus className="w-4.5 h-4.5" strokeWidth={2.5} />
            {spaceName ? `Save to ${spaceName}` : 'Save'}
          </button>
        </div>
      )}

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
