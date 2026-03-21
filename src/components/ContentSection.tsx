import { useState } from 'react';
import { Item } from '@/types';
import { ItemCard } from './ItemCard';
import { EditNoteModal } from './EditNoteModal';
import { AnimatePresence, motion } from 'framer-motion';

interface ContentSectionProps {
  items: Item[];
  onDeleteItem?: (id: string) => void;
}

export function ContentSection({ items, onDeleteItem }: ContentSectionProps) {
  const [editingItem, setEditingItem] = useState<Item | null>(null);

  if (items.length === 0) return null;

  const handleItemClick = (item: Item) => {
    // Check if it's an editable note (no media/links)
    const hasMedia = item.blocks?.some(b => b.type === 'media');
    const isLink = item.type === 'link' && item.url;
    
    if (!hasMedia && !isLink) {
      setEditingItem(item);
    }
  };

  return (
    <>
      <div 
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'flex-start',
          gap: '12px',
          width: '100%',
        }}
      >
        <AnimatePresence mode="popLayout">
          {items.map((item, index) => {
            const isSkinTightNote =
              item.subCategory !== 'todo' &&
              item.subCategory !== 'scheduling' &&
              !item.scheduledDate &&
              !item.url &&
              !!(item.blocks ?? []).find((b) => b.type === 'text' && !!b.content?.trim()) &&
              !(item.blocks ?? []).some(
                (b) => b.type === 'media' || b.type === 'list' || b.type === 'checklist'
              );

            return (
              <motion.div
                key={item.id}
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: index * 0.03, duration: 0.25 }}
                className="relative group cursor-pointer"
                style={isSkinTightNote ? {
                  display: 'inline-block',
                  width: 'fit-content',
                  maxWidth: '90vw',
                } : {
                  width: '100%',
                  maxWidth: '500px',
                }}
                onClick={() => handleItemClick(item)}
              >
                <div className="pointer-events-none">
                  <ItemCard item={item} />
                </div>

              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Edit Note Modal */}
      <EditNoteModal
        item={editingItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
      />
    </>
  );
}
