import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Image, Sparkles, Check, ArrowRight } from 'lucide-react';
import { useIntelligentCapture, CaptureResult } from '@/hooks/useIntelligentCapture';
import { compressImage } from '@/lib/imageCompression';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';

interface QuickCaptureProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickCapture({ isOpen, onClose }: QuickCaptureProps) {
  const [text, setText] = useState('');
  const [images, setImages] = useState<string[]>([]);
  // 'idle' | 'saved' | 'enriching' | 'done'
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'enriching' | 'done'>('idle');
  const [savedResult, setSavedResult] = useState<CaptureResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { capture, isProcessing } = useIntelligentCapture();

  // Focus textarea when opened
  useEffect(() => {
    if (isOpen) {
      setSaveState('idle');
      setSavedResult(null);
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [isOpen]);

  const handleImageUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) {
        showErrorPopup(`${file.name} is too large. Maximum size is 10MB.`);
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const dataUrl = event.target?.result as string;
        const compressed = await compressImage(dataUrl);
        setImages(prev => [...prev, compressed]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }, []);

  const removeImage = useCallback((index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  const handleSave = useCallback(async () => {
    if (!text.trim() && images.length === 0) return;
    if (saveState !== 'idle') return;

    // Phase 1: Show "Saved" immediately — zero-friction, no blocking
    setSaveState('saved');

    // Phase 2: Start AI enrichment in background, then show result briefly
    setSaveState('enriching');
    const result = await capture(text, images.length > 0 ? images : undefined, 'text');

    if (result?.result) {
      setSavedResult(result.result);
      setSaveState('done');
      // Auto-close after showing the AI result
      setTimeout(() => {
        setText('');
        setImages([]);
        setSavedResult(null);
        setSaveState('idle');
        onClose();
      }, 2000);
    } else {
      // AI failed — close immediately, item was still saved
      setText('');
      setImages([]);
      setSaveState('idle');
      onClose();
    }
  }, [text, images, capture, onClose, saveState]);

  // Cmd/Ctrl+Enter to save
  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSave();
    }
  }, [handleSave]);

  const handleClose = useCallback(() => {
    setText('');
    setImages([]);
    setSavedResult(null);
    setSaveState('idle');
    onClose();
  }, [onClose]);

  if (!isOpen) return null;

  const isBusy = saveState !== 'idle';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[10000] bg-background"
      >
        {/* Header */}
        <header className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border safe-area-top-ios">
          <div className="flex items-center justify-between px-4 py-3">
            <button
              onClick={handleClose}
              className="p-2 hover:bg-secondary rounded-lg transition-colors touch-manipulation"
            >
              <X className="w-5 h-5" />
            </button>
            <h1 className="text-base font-medium text-foreground">Capture</h1>
            <button
              onClick={handleSave}
              disabled={isBusy || (!text.trim() && images.length === 0)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-40 transition-opacity touch-manipulation"
            >
              {saveState === 'enriching' ? (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 1, ease: 'linear' }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                </motion.div>
              ) : saveState === 'done' ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <ArrowRight className="w-3.5 h-3.5" />
              )}
              {saveState === 'enriching' ? 'Organizing...' : saveState === 'done' ? 'Done' : 'Save'}
            </button>
          </div>
        </header>

        {/* AI result card — shown after enrichment */}
        <AnimatePresence>
          {saveState === 'done' && savedResult && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="px-5 py-6"
            >
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <Check className="w-4 h-4 text-primary" />
                </div>
                <span className="text-sm font-medium text-foreground">Captured and organized</span>
              </div>

              <div className="bg-secondary/50 rounded-xl p-4 border border-border/50 space-y-3">
                {savedResult.title && (
                  <h3 className="text-sm font-medium text-foreground">{savedResult.title}</h3>
                )}
                {savedResult.summary && (
                  <p className="text-xs text-muted-foreground">{savedResult.summary}</p>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-primary/10 text-primary font-medium capitalize">
                    {savedResult.category}
                  </span>
                  {savedResult.tags.slice(0, 4).map((tag, i) => (
                    <span key={i} className="text-[10px] px-1.5 py-0.5 rounded-md bg-secondary text-muted-foreground">
                      {tag}
                    </span>
                  ))}
                </div>

                {savedResult.suggested_space && (
                  <p className="text-[11px] text-muted-foreground/60">
                    → {savedResult.suggested_space}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Input area — hidden once enrichment result is showing */}
        {saveState !== 'done' && (
          <div className="flex-1 px-5 py-4 space-y-4">
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                e.target.style.height = 'auto';
                e.target.style.height = e.target.scrollHeight + 'px';
              }}
              onKeyDown={handleKeyDown}
              placeholder="Dump anything here — thoughts, ideas, plans, reminders..."
              autoFocus
              rows={4}
              disabled={isBusy}
              className="w-full px-4 py-3 rounded-xl bg-card border-2 border-border text-foreground placeholder:text-muted-foreground/40 text-[15px] focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none overflow-hidden leading-relaxed disabled:opacity-60"
            />

            {/* Attached images */}
            {images.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {images.map((img, i) => (
                  <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden bg-secondary">
                    <img src={img} alt="" className="w-full h-full object-cover" />
                    <button
                      onClick={() => removeImage(i)}
                      className="absolute top-1 right-1 p-0.5 rounded-full bg-destructive text-destructive-foreground"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Action bar */}
            {!isBusy && (
              <div className="flex items-center gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm text-muted-foreground transition-colors touch-manipulation"
                >
                  <Image className="w-4 h-4" />
                  Add image
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  onChange={handleImageUpload}
                  className="hidden"
                />
              </div>
            )}

            {/* Keyboard hint / processing status */}
            <p className="text-xs text-muted-foreground/40 text-center pt-4">
              {saveState === 'enriching'
                ? 'Saved · AI organizing in background…'
                : 'Save first, AI organizes automatically · ⌘↵'}
            </p>
          </div>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
