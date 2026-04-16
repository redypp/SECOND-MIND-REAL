import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Item, TextBlock, MediaBlock, ContentBlock } from '@/types';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';
import { X, Trash2, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { compressImage } from '@/lib/imageCompression';
import { uploadImageToStorage } from '@/lib/imageUpload';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';

interface EditNoteModalProps {
  item: Item | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EditNoteModal({ item, isOpen, onClose }: EditNoteModalProps) {
  const { updateItem, deleteItem } = useSpaces();
  const { user } = useAuth();
  const [editContent, setEditContent] = useState('');
  const [imageBlocks, setImageBlocks] = useState<{ id: string; url: string; isNew: boolean }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (item && isOpen) {
      const textBlock = item.blocks?.find(b => b.type === 'text') as TextBlock | undefined;
      const content = textBlock?.content || item.content || '';
      setEditContent(content);
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

  const handleSave = async () => {
    if (!item) return;
    setIsSaving(true);

    const resolvedImages = await Promise.all(
      imageBlocks.map(async (img) => {
        if (!img.isNew) return img;
        const uploadedUrl = user
          ? await uploadImageToStorage(img.url, user.id)
          : img.url;
        return { ...img, url: uploadedUrl, isNew: false };
      })
    );

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
    setIsSaving(false);
    onClose();
  };

  const handleDelete = () => {
    if (!item) return;
    deleteItem(item.id);
    onClose();
  };

  if (!item) return null;

  const dateStr = item.createdAt
    ? item.createdAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : '';

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

          {/* Content */}
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
                {dateStr && (
                  <p className="text-[11px] text-muted-foreground/60 mt-0.5">{dateStr}</p>
                )}
              </div>
              <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-secondary transition-colors touch-manipulation">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {/* Images */}
              {imageBlocks.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {imageBlocks.map((img) => (
                    <div key={img.id} className="relative">
                      <img src={img.url} alt="" className="w-24 h-24 object-cover rounded-xl border border-border/50" />
                      <button
                        onClick={() => removeImage(img.id)}
                        className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Text editor */}
              <textarea
                ref={textareaRef}
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }}
                placeholder="Write your note..."
                rows={6}
                className="w-full px-4 py-3 bg-card/60 dark:bg-white/[0.06] border border-border/50 dark:border-white/10 rounded-xl text-foreground text-[15px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all placeholder:text-muted-foreground/50"
              />

              {/* Actions: Delete + Save */}
              <div className="flex items-center justify-between pt-1 pb-2">
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Delete</span>
                </motion.button>

                <div className="flex items-center gap-2">
                  <Button type="button" variant="ghost" onClick={onClose} className="px-4">
                    Cancel
                  </Button>
                  <Button type="button" onClick={handleSave} disabled={isSaving} className="px-6 bg-primary hover:bg-primary/90">
                    {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
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
