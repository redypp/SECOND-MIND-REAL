import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSpaces } from '@/contexts/SpacesContext';
import { ArrowLeft, Pencil, Trash2, Check, X, FileText, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';
import { RichTextEditor, FormattedText } from '@/components/RichTextEditor';
import { TextBlock, MediaBlock, ContentBlock } from '@/types';

export default function ItemDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { items, updateItem, deleteItem } = useSpaces();

  const item = id ? items.find(i => i.id === id) : undefined;

  // Cache the last valid item so we don't flash "not found" during re-renders
  const lastItemRef = useRef(item);
  if (item) lastItemRef.current = item;
  const displayItem = item ?? lastItemRef.current;

  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState('');

  if (!displayItem) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center safe-area-top-ios">
        <div className="text-center px-6">
          <div className="w-14 h-14 rounded-xl bg-secondary mx-auto mb-4 flex items-center justify-center">
            <FileText className="w-6 h-6 text-muted-foreground" />
          </div>
          <p className="text-foreground font-medium mb-1">Item not found</p>
          <p className="text-muted-foreground text-sm mb-4">This item may have been deleted.</p>
          <button
            onClick={() => navigate(-1)}
            className="text-sm text-primary font-medium hover:underline"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  // Extract text content
  const textBlock = displayItem.blocks?.find(b => b.type === 'text') as TextBlock | undefined;
  const noteText = textBlock?.content || displayItem.content || '';

  // Extract images
  const imageBlocks = (displayItem.blocks?.filter(
    b => b.type === 'media' && (b as MediaBlock).mediaType === 'image'
  ) || []) as MediaBlock[];

  const dateStr = displayItem.createdAt
    ? item.createdAt.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  const handleStartEdit = () => {
    setEditContent(noteText);
    setIsEditing(true);
  };

  const handleSave = () => {
    const otherBlocks = displayItem.blocks.filter(
      b => b.type !== 'text'
    );
    const updatedBlocks: ContentBlock[] = [];
    if (editContent.trim()) {
      updatedBlocks.push(
        textBlock
          ? { ...textBlock, content: editContent.trim() }
          : { id: Date.now().toString(), type: 'text', content: editContent.trim() } as TextBlock
      );
    }
    updatedBlocks.push(...otherBlocks);
    updateItem(displayItem.id, { blocks: updatedBlocks, content: editContent.trim() });
    setIsEditing(false);
  };

  const handleDelete = () => {
    deleteItem(displayItem.id);
    navigate(-1);
  };

  return (
    <div className="min-h-screen bg-background page-transition safe-area-top-ios">
      {/* Back button */}
      <div className="px-4 pt-3 pb-1">
        <button
          onClick={() => navigate(-1)}
          className="p-2 -ml-2 rounded-lg hover:bg-secondary transition-colors touch-manipulation"
        >
          <ArrowLeft className="w-5 h-5 text-muted-foreground" />
        </button>
      </div>

      <div className="px-6 pt-2 pb-12 max-w-2xl mx-auto">
        {/* Images */}
        {imageBlocks.length > 0 && (
          <div className="mb-6 space-y-3">
            {imageBlocks.map((img) => (
              <img
                key={img.id}
                src={img.url}
                alt=""
                className="w-full rounded-2xl border border-border/30"
                loading="lazy"
              />
            ))}
          </div>
        )}

        {/* Note content */}
        {isEditing ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="space-y-4"
          >
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') e.stopPropagation(); }}
              placeholder="Write your note..."
              rows={10}
              autoFocus
              className="w-full px-4 py-3 bg-card/60 dark:bg-white/[0.06] border border-border/50 dark:border-white/10 rounded-xl text-foreground text-[17px] leading-relaxed resize-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-all placeholder:text-muted-foreground/50"
            />
            <div className="flex items-center gap-2">
              <button
                onClick={handleSave}
                className="flex items-center gap-2 px-5 py-2.5 bg-primary text-primary-foreground rounded-xl text-sm font-semibold touch-manipulation"
              >
                <Check className="w-4 h-4" />
                Save
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="flex items-center gap-2 px-4 py-2.5 text-muted-foreground hover:text-foreground rounded-xl text-sm transition-colors touch-manipulation"
              >
                Cancel
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="text-[18px] text-foreground leading-relaxed whitespace-pre-wrap break-words">
              <FormattedText content={noteText} />
            </p>
          </motion.div>
        )}

        {/* Edit, Delete, Date */}
        {!isEditing && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.1 }}
            className="mt-8 flex items-center gap-3"
          >
            <button
              onClick={handleStartEdit}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary/60 hover:bg-secondary text-foreground transition-colors touch-manipulation"
            >
              <Pencil className="w-4 h-4" />
              <span className="text-sm font-medium">Edit</span>
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-destructive hover:bg-destructive/10 transition-colors touch-manipulation"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-sm font-medium">Delete</span>
            </button>
            {dateStr && (
              <span className="ml-auto text-xs text-muted-foreground">{dateStr}</span>
            )}
          </motion.div>
        )}
      </div>
    </div>
  );
}
