import { useState, useEffect, useRef } from 'react';
import { Item, TextBlock, MediaBlock, ContentBlock } from '@/types';
import { useSpaces } from '@/contexts/SpacesContext';
import { useAuth } from '@/contexts/AuthContext';
import { X, Pencil, Trash2, Loader2 } from 'lucide-react';
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
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [imageBlocks, setImageBlocks] = useState<{ id: string; url: string; isNew: boolean }[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (item && isOpen) {
      const textBlock = item.blocks?.find(b => b.type === 'text') as TextBlock | undefined;
      const content = textBlock?.content || item.content || '';
      setEditContent(content);
      setIsEditing(false);
      const existingImages = (item.blocks?.filter(
        b => b.type === 'media' && (b as MediaBlock).mediaType === 'image'
      ) as MediaBlock[]).map(b => ({ id: b.id, url: b.url, isNew: false }));
      setImageBlocks(existingImages);
    }
  }, [item, isOpen]);

  useEffect(() => {
    if (isEditing) {
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          textareaRef.current.setSelectionRange(editContent.length, editContent.length);
        }
      }, 100);
    }
  }, [isEditing]);

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
    setIsEditing(false);
    onClose();
  };

  const handleDelete = () => {
    if (!item) return;
    deleteItem(item.id);
    onClose();
  };

  if (!item) return null;

  const dateStr = item.createdAt
    ? item.createdAt.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
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
            {/* Top bar: close button */}
            <div className="sticky top-0 z-10 bg-background px-4 py-3 flex items-center justify-end">
              <button onClick={onClose} className="p-2 -mr-2 rounded-lg hover:bg-secondary transition-colors touch-manipulation">
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            </div>

            <div className="px-4 pb-6">
              {/* Date */}
              {dateStr && (
                <p className="text-xs text-muted-foreground mb-4">{dateStr}</p>
              )}

              {/* Action buttons: Edit + Delete */}
              <div className="flex items-center gap-2 mb-5">
                {!isEditing && (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground transition-colors touch-manipulation"
                  >
                    <Pencil className="w-4 h-4" />
                    <span className="text-sm font-medium">Edit</span>
                  </button>
                )}
                <button
                  onClick={handleDelete}
                  className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition-colors touch-manipulation"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="text-sm font-medium">Delete</span>
                </button>
              </div>

              {/* Images */}
              {imageBlocks.length > 0 && (
                <div className="flex flex-wrap gap-2 mb-4">
                  {imageBlocks.map((img) => (
                    <img key={img.id} src={img.url} alt="" className="w-full max-w-[280px] rounded-xl border border-border/50" />
                  ))}
                </div>
              )}

              {/* Note content: read-only or editable */}
              {isEditing ? (
                <>
                  <textarea
                    ref={textareaRef}
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }}
                    placeholder="Write your note..."
                    rows={8}
                    className="w-full px-4 py-3 bg-card/60 dark:bg-white/[0.06] border border-border/50 dark:border-white/10 rounded-xl text-foreground text-[15px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all placeholder:text-muted-foreground/50"
                  />
                  <div className="flex items-center justify-end gap-2 mt-3">
                    <button
                      onClick={() => {
                        const textBlock = item.blocks?.find(b => b.type === 'text') as TextBlock | undefined;
                        setEditContent(textBlock?.content || item.content || '');
                        setIsEditing(false);
                      }}
                      className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground rounded-lg transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={isSaving}
                      className="px-6 py-2 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors disabled:opacity-50"
                    >
                      {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
                    </button>
                  </div>
                </>
              ) : (
                <p className="text-[15px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
                  {editContent || <span className="text-muted-foreground italic">Empty note</span>}
                </p>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
