import { ScrapbookEntry } from '@/types/scrapbook';
import { useScrapbook } from '@/contexts/ScrapbookContext';
import { Trash2, ExternalLink, Check } from 'lucide-react';
import { motion } from 'framer-motion';
import { useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { isValidUrl } from '@/lib/urlValidation';

interface ScrapbookCardProps {
  entry: ScrapbookEntry;
}

export function ScrapbookCard({ entry }: ScrapbookCardProps) {
  const { deleteEntry, toggleChecklistItem } = useScrapbook();
  const [showDelete, setShowDelete] = useState(false);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    deleteEntry(entry.id);
  };

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10, scale: 0.95 }}
      transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="relative bg-card rounded-2xl shadow-card hover:shadow-elevated transition-shadow duration-300 overflow-hidden"
      onMouseEnter={() => setShowDelete(true)}
      onMouseLeave={() => setShowDelete(false)}
    >
      {/* Delete button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: showDelete ? 1 : 0, scale: showDelete ? 1 : 0.8 }}
        onClick={handleDelete}
        className="absolute top-3 right-3 p-2 rounded-full bg-background/80 backdrop-blur-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors z-10"
      >
        <Trash2 className="w-4 h-4" />
      </motion.button>

      {/* Content blocks */}
      <div className="p-5 space-y-4">
        {entry.blocks.map((block) => {
          switch (block.type) {
            case 'text':
              return (
                <p key={block.id} className="text-foreground leading-relaxed whitespace-pre-wrap">
                  {block.content}
                </p>
              );

            case 'image':
              return (
                <div key={block.id} className="rounded-xl overflow-hidden -mx-1">
                  <img
                    src={block.content}
                    alt=""
                    className="w-full h-auto object-cover"
                    loading="lazy"
                  />
                </div>
              );

            case 'list':
              return (
                <ul key={block.id} className="space-y-1.5 pl-1">
                  {block.items?.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5 text-foreground">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary/60 mt-2 shrink-0" />
                      <span>{item.text}</span>
                    </li>
                  ))}
                </ul>
              );

            case 'checklist':
              return (
                <ul key={block.id} className="space-y-2 pl-1">
                  {block.items?.map((item) => (
                    <li key={item.id} className="flex items-start gap-2.5">
                      <button
                        onClick={() => toggleChecklistItem(entry.id, block.id, item.id)}
                        className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-colors ${
                          item.checked
                            ? 'bg-primary border-primary text-primary-foreground'
                            : 'border-muted-foreground/30 hover:border-primary/50'
                        }`}
                      >
                        {item.checked && <Check className="w-3 h-3" />}
                      </button>
                      <span className={`${item.checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {item.text}
                      </span>
                    </li>
                  ))}
                </ul>
              );

            default:
              return null;
          }
        })}

        {/* Link preview */}
        {entry.linkPreview && isValidUrl(entry.linkPreview.url) && (
          <a
            href={entry.linkPreview.url}
            target="_blank"
            rel="noopener noreferrer"
            className="block p-3 -mx-1 rounded-xl bg-secondary/50 hover:bg-secondary/80 transition-colors group"
          >
            <div className="flex items-center gap-2 text-sm text-primary">
              <ExternalLink className="w-4 h-4" />
              <span className="truncate group-hover:underline">{entry.linkPreview.url}</span>
            </div>
            {entry.linkPreview.title && (
              <p className="mt-1 font-medium text-foreground line-clamp-1">{entry.linkPreview.title}</p>
            )}
            {entry.linkPreview.description && (
              <p className="mt-0.5 text-sm text-muted-foreground line-clamp-2">{entry.linkPreview.description}</p>
            )}
          </a>
        )}
      </div>

      {/* Timestamp */}
      <div className="px-5 pb-4">
        <time className="text-xs text-muted-foreground/60">
          {formatDistanceToNow(entry.createdAt, { addSuffix: true })}
        </time>
      </div>
    </motion.article>
  );
}
