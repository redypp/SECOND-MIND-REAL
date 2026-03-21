import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Item, TextBlock, MediaBlock, ContentBlock } from '@/types';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';
import { X, Trash2, Sparkles, List, Zap, AlignLeft, Loader2, RotateCcw, Image, Plus, Calendar } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSmartRewrite, RewriteMode } from '@/hooks/useSmartRewrite';
import { useSourceImport } from '@/hooks/useSourceImport';
import { SourceStatus } from '@/components/SourceStatus';
import { compressImage } from '@/lib/imageCompression';
import { uploadImageToStorage } from '@/lib/imageUpload';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';

interface EditNoteModalProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
}

const REWRITE_MODES: { mode: RewriteMode; label: string; icon: React.ReactNode; description: string }[] = [
  { mode: 'bullets', label: 'Bullets', icon: <List className="w-3.5 h-3.5" />, description: 'Clean bullet list' },
  { mode: 'actions', label: 'Actions', icon: <Zap className="w-3.5 h-3.5" />, description: 'Actionable steps' },
  { mode: 'summary', label: 'Summary', icon: <AlignLeft className="w-3.5 h-3.5" />, description: 'Short summary' },
];

interface PendingImage {
  id: string;
  url: string; // base64 or already-uploaded URL
  isNew: boolean; // true = needs uploading on save
}

export function EditNoteModal({ item, isOpen, onClose }: EditNoteModalProps) {
  const { updateItem, deleteItem } = useSpaces();
  const { user } = useAuth();
  const [editContent, setEditContent] = useState('');
  const [originalContent, setOriginalContent] = useState('');
  const [showRewrite, setShowRewrite] = useState(false);
  const [rewrittenContent, setRewrittenContent] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<RewriteMode | null>(null);
  const [imageBlocks, setImageBlocks] = useState<PendingImage[]>([]);
  const [isSavingImages, setIsSavingImages] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const { rewrite, isRewriting } = useSmartRewrite();
  const { sources } = useSourceImport(item?.id, editContent);

  useEffect(() => {
    if (item && isOpen) {
      const textBlock = item.blocks?.find(b => b.type === 'text') as TextBlock | undefined;
      const content = textBlock?.content || item.content || '';
      setEditContent(content);
      setOriginalContent(content);
      setShowRewrite(false);
      setRewrittenContent(null);
      setActiveMode(null);
      // Load existing image blocks
      const existingImages = (item.blocks?.filter(
        b => b.type === 'media' && (b as MediaBlock).mediaType === 'image'
      ) as MediaBlock[]).map(b => ({ id: b.id, url: b.url, isNew: false }));
      setImageBlocks(existingImages);
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(content.length, content.length);
        }
      }, 100);
    }
  }, [item, isOpen]);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      if (file.size > 10 * 1024 * 1024) {
        showErrorPopup(`${file.name} is too large. Maximum size is 10MB.`);
        continue;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        const dataUrl = ev.target?.result as string;
        const compressed = await compressImage(dataUrl);
        setImageBlocks(prev => [...prev, { id: `new-${Date.now()}-${Math.random()}`, url: compressed, isNew: true }]);
      };
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const removeImage = (id: string) => {
    setImageBlocks(prev => prev.filter(img => img.id !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

  const handleRewrite = async (mode: RewriteMode) => {
    if (!editContent.trim()) return;
    setActiveMode(mode);
    setRewrittenContent(null);
    const result = await rewrite(editContent, mode);
    if (result) {
      setRewrittenContent(result.result);
    }
  };

  const applyRewrite = () => {
    if (rewrittenContent) {
      setEditContent(rewrittenContent);
      setRewrittenContent(null);
      setShowRewrite(false);
      setActiveMode(null);
    }
  };

  const discardRewrite = () => {
    setRewrittenContent(null);
    setActiveMode(null);
  };

  const handleSave = async () => {
    if (!item) return;
    setIsSavingImages(true);

    // Upload any new images to Supabase storage
    const resolvedImages: PendingImage[] = await Promise.all(
      imageBlocks.map(async (img) => {
        if (!img.isNew) return img;
        const uploadedUrl = user
          ? await uploadImageToStorage(img.url, user.id)
          : img.url;
        return { ...img, url: uploadedUrl, isNew: false };
      })
    );

    // Build updated blocks: keep text block, replace image blocks, preserve others
    const otherBlocks = item.blocks.filter(
      b => b.type !== 'text' && !(b.type === 'media' && (b as MediaBlock).mediaType === 'image')
    );

    const updatedBlocks: ContentBlock[] = [];

    if (editContent.trim()) {
      const existingText = item.blocks.find(b => b.type === 'text') as TextBlock | undefined;
      updatedBlocks.push(existingText
        ? { ...existingText, content: editContent.trim() }
        : { id: Date.now().toString(), type: 'text', content: editContent.trim() } as TextBlock
      );
    }

    for (const img of resolvedImages) {
      updatedBlocks.push({ id: img.id, type: 'media', url: img.url, mediaType: 'image' } as MediaBlock);
    }

    updatedBlocks.push(...otherBlocks);

    updateItem(item.id, { blocks: updatedBlocks, content: editContent.trim() });
    setIsSavingImages(false);
    onClose();
  };

  const handleDelete = () => {
    if (!item) return;
    deleteItem(item.id);
    onClose();
  };

  if (!item) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[10000] flex flex-col"
          style={{ height: '100dvh' }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm" onClick={onClose} />

          {/* Content — pinned to bottom so keyboard pushes it up */}
          <motion.div
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="relative mt-auto w-full max-w-[500px] mx-auto bg-background border-t border-border rounded-t-2xl shadow-2xl overflow-y-auto"
            style={{ maxHeight: '85dvh' }}
          >
            {/* Header */}
            <div className="sticky top-0 z-10 bg-background px-4 py-3 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Edit Note</h2>
                {item.createdAt && (
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">
                    {item.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
                {item.scheduledDate && (
                  <div className="mt-1 inline-flex items-center gap-1 px-2 py-0.5 bg-primary/10 text-primary text-[11px] font-medium rounded">
                    <Calendar className="w-3 h-3" />
                    {item.scheduledDate}
                    {item.scheduledTime && ` at ${item.scheduledTime}`}
                  </div>
                )}
              </div>
              <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-secondary transition-colors touch-manipulation">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Image blocks */}
              {imageBlocks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {imageBlocks.map((img) => (
                    <div key={img.id} className="relative">
                      <img
                        src={img.url}
                        alt=""
                        className="w-24 h-24 object-cover rounded-xl border border-border/50"
                      />
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                        aria-label="Remove image"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  <button
                    onClick={() => imageInputRef.current?.click()}
                    className="w-24 h-24 rounded-xl border-2 border-dashed border-border/50 flex flex-col items-center justify-center gap-1 text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Text editor */}
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Write your note..."
                rows={6}
                className="w-full px-4 py-3 bg-card/60 dark:bg-white/[0.06] border border-border/50 dark:border-white/10 rounded-xl text-foreground text-[15px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all placeholder:text-muted-foreground/50"
              />

              {/* Source import status indicators */}
              <SourceStatus sources={sources} />

              {/* Smart Rewrite toggle */}
              {editContent.trim().length > 20 && !showRewrite && !rewrittenContent && (
                <button
                  onClick={() => setShowRewrite(true)}
                  className="flex items-center gap-2 text-xs text-primary/80 hover:text-primary transition-colors"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Smart Rewrite
                </button>
              )}

              {/* Rewrite mode picker */}
              <AnimatePresence>
                {showRewrite && !rewrittenContent && !isRewriting && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary flex-1">Smart Rewrite</span>
                      <button onClick={() => setShowRewrite(false)} className="text-muted-foreground hover:text-foreground">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <div className="p-3 grid grid-cols-3 gap-2">
                      {REWRITE_MODES.map(({ mode, label, icon, description }) => (
                        <button
                          key={mode}
                          onClick={() => handleRewrite(mode)}
                          className="flex flex-col items-center gap-1.5 p-3 rounded-lg bg-background border border-border hover:border-primary/40 hover:bg-primary/5 transition-all"
                        >
                          <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                            {icon}
                          </div>
                          <span className="text-xs font-semibold text-foreground">{label}</span>
                          <span className="text-[10px] text-muted-foreground text-center leading-tight">{description}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Loading state */}
              <AnimatePresence>
                {isRewriting && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-primary/5 border border-primary/15"
                  >
                    <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                    <span className="text-xs text-muted-foreground">
                      {activeMode === 'bullets' ? 'Creating bullet list…' : activeMode === 'actions' ? 'Extracting action steps…' : 'Summarizing…'}
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Rewrite preview */}
              <AnimatePresence>
                {rewrittenContent && !isRewriting && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    className="rounded-xl border border-primary/20 bg-primary/5 overflow-hidden"
                  >
                    <div className="flex items-center gap-2 px-3 py-2 border-b border-primary/10">
                      <Sparkles className="w-3.5 h-3.5 text-primary" />
                      <span className="text-xs font-medium text-primary flex-1 capitalize">{activeMode} version</span>
                    </div>
                    <div className="px-3 py-2.5">
                      <p className="text-sm text-foreground whitespace-pre-line leading-relaxed">{rewrittenContent}</p>
                    </div>
                    <div className="px-3 pb-3 flex gap-2">
                      <button
                        onClick={applyRewrite}
                        className="flex-1 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-lg hover:bg-primary/90 transition-colors"
                      >
                        Apply
                      </button>
                      <button
                        onClick={discardRewrite}
                        className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" />
                        Discard
                      </button>
                      <button
                        onClick={() => { setRewrittenContent(null); setShowRewrite(true); }}
                        className="flex items-center gap-1 px-3 py-2 text-xs text-muted-foreground hover:text-foreground border border-border rounded-lg transition-colors"
                      >
                        Try another
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Action buttons */}
              <div className="flex items-center justify-between pt-1 pb-2">
                <div className="flex items-center gap-1">
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={handleDelete}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span className="text-sm font-medium">Delete</span>
                  </motion.button>

                  {imageBlocks.length === 0 && (
                    <motion.button
                      whileTap={{ scale: 0.95 }}
                      onClick={() => imageInputRef.current?.click()}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-muted-foreground hover:bg-secondary transition-colors"
                      aria-label="Add image"
                    >
                      <Image className="w-4 h-4" />
                    </motion.button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={onClose} className="px-4">
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={isSavingImages} className="px-6 bg-primary hover:bg-primary/90">
                    {isSavingImages ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                  </Button>
                </div>
              </div>

              <input
                ref={imageInputRef}
                type="file"
                accept="image/*"
                multiple
                onChange={handleImageUpload}
                className="hidden"
              />
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
