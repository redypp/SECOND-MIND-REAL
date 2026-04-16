import { useNavigate } from 'react-router-dom';

import { Item, ContentBlock, TableBlock } from '@/types';
import { ExternalLink, Check, List, CheckSquare, Globe, Table, User } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { isValidUrl, safeOpenUrl } from '@/lib/urlValidation';
import { useUrlMetadata, getDomainFromUrl, getFaviconUrl } from '@/hooks/useUrlMetadata';
import { useState, memo } from 'react';
import { FormattedText } from '@/components/RichTextEditor';
import { TableDisplay } from '@/components/TableEditor';
import { getSmartTitle } from '@/lib/smartTitle';
import { usePeople } from '@/contexts/PeopleContext';

interface ItemCardProps {
  item: Item;
  compact?: boolean;
  archiveMode?: boolean;
}

// Memoized to prevent re-renders when parent state changes
export const ItemCard = memo(function ItemCard({ item, compact = false, archiveMode = false }: ItemCardProps) {
  const isImageItem = !!(item.blocks?.find(b => b.type === 'media' && b.mediaType !== 'link'));
  const isImportant = item.color === 'important' && !isImageItem;
  const navigate = useNavigate();
  const { toggleChecklistItem } = useSpaces();
  const { getPeopleForItem } = usePeople();
  const [faviconError, setFaviconError] = useState(false);
  const itemPeople = getPeopleForItem(item);

  // Get first media block for thumbnail
  const mediaBlock = item.blocks?.find(b => b.type === 'media');
  const hasMedia = mediaBlock && mediaBlock.type === 'media';
  const isLinkBlock = hasMedia && mediaBlock.type === 'media' && mediaBlock.mediaType === 'link';

  // Get URL metadata for link blocks
  const linkUrl = isLinkBlock && mediaBlock.type === 'media' ? mediaBlock.url : undefined;
  const { title: fetchedTitle, favicon, isLoading } = useUrlMetadata(linkUrl);

  // Get first text block for preview
  const textBlock = item.blocks?.find(b => b.type === 'text');
  const textContent = textBlock?.type === 'text' ? textBlock.content : item.content;
  const hasNoteText = !!(item.title?.trim() || textContent?.trim());

  // Get list/checklist/table for preview
  const listBlock = item.blocks?.find(b => b.type === 'list');
  const checklistBlock = item.blocks?.find(b => b.type === 'checklist');
  const tableBlock = item.blocks?.find(b => b.type === 'table') as TableBlock | undefined;

  // Check if it's a link type (legacy support)
  const isLink = item.type === 'link' && item.url;

  // "Skin-tight" note mode: text-only cards (no media/list/checklist/table/link/schedule)
  const isPureNote =
    item.subCategory !== 'todo' &&
    item.subCategory !== 'scheduling' &&
    hasNoteText &&
    !hasMedia &&
    !listBlock &&
    !checklistBlock &&
    !tableBlock &&
    !isLink &&
    !isLinkBlock &&
    !item.scheduledDate;

  // Smart title for archive mode: only show for non-text items (images, links, tables).
  // Pure text notes intentionally show no title on the card — content speaks for itself.
  const archiveTitleText = archiveMode
    ? (!isPureNote ? (item.title?.trim() || getSmartTitle(item)) : '')
    : '';

  const handleClick = (e: React.MouseEvent) => {
    // If it's a link block, open in new tab
    if (isLinkBlock && mediaBlock.type === 'media') {
      e.preventDefault();
      e.stopPropagation();
      safeOpenUrl(mediaBlock.url);
      return;
    }

    if (isLink && item.url) {
      safeOpenUrl(item.url);
    } else {
      navigate(`/item/${item.id}`);
    }
  };

  const renderBlockPreview = (block: ContentBlock) => {
    switch (block.type) {
      case 'list':
        return (
          <div className="space-y-0.5">
            {block.items.slice(0, 3).map((listItem, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[15px] text-muted-foreground leading-snug">
                <span className="text-primary text-xs">•</span>
                <span className="truncate">{listItem}</span>
              </div>
            ))}
            {block.items.length > 3 && (
              <span className="text-xs text-muted-foreground">+{block.items.length - 3} more</span>
            )}
          </div>
        );

      case 'checklist':
        const completed = block.items.filter(i => i.checked).length;
        return (
          <div className="space-y-0.5">
            {block.items.slice(0, 3).map((checkItem) => (
              <div
                key={checkItem.id}
                className="flex items-center gap-1.5 text-[15px] leading-snug"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleChecklistItem(item.id, block.id, checkItem.id);
                }}
              >
                <div
                  className={`w-3.5 h-3.5 rounded border-[1.5px] flex items-center justify-center cursor-pointer transition-colors shrink-0 ${
                    checkItem.checked
                      ? 'bg-primary border-primary'
                      : 'border-muted-foreground/30 hover:border-primary/50'
                  }`}
                >
                  {checkItem.checked && <Check className="w-2 h-2 text-primary-foreground" />}
                </div>
                <span className={`truncate ${checkItem.checked ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                  {checkItem.text}
                </span>
              </div>
            ))}
            {block.items.length > 3 && (
              <span className="text-xs text-muted-foreground">+{block.items.length - 3} more</span>
            )}
            <div className="mt-1.5 text-xs text-muted-foreground">
              {completed}/{block.items.length} done
            </div>
          </div>
        );

      case 'table':
        return (
          <div className="mt-1">
            <TableDisplay
              headers={(block as TableBlock).headers}
              rows={(block as TableBlock).rows}
              compact
            />
          </div>
        );

      default:
        return null;
    }
  };

  // Render rich link card with favicon and title
  if (isLinkBlock && mediaBlock.type === 'media') {
    const domain = getDomainFromUrl(mediaBlock.url);
    const displayTitle = item.title || fetchedTitle || domain;
    const faviconUrl = favicon || getFaviconUrl(mediaBlock.url);

    return (
      <article
        onClick={handleClick}
        className="group overflow-hidden cursor-pointer rounded-2xl bg-secondary/50 dark:bg-white/[0.07] border border-border/40 dark:border-white/[0.08] shadow-card hover:bg-secondary/70 dark:hover:bg-white/[0.11] transition-colors duration-200 active:scale-[0.98]"
      >
        <div className="px-3.5 py-3 flex items-center gap-3">
          <div className="w-10 h-10 bg-secondary/30 dark:bg-white/[0.08] rounded-lg flex items-center justify-center shrink-0 group-hover:bg-secondary/50 dark:group-hover:bg-white/[0.12] transition-colors overflow-hidden">
            {isLoading ? (
              <div className="w-4 h-4 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
            ) : faviconUrl && !faviconError ? (
              <img
                src={faviconUrl}
                alt=""
                className="w-5 h-5 object-contain"
                onError={() => setFaviconError(true)}
              />
            ) : (
              <Globe className="w-4 h-4 text-muted-foreground" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-[15px] font-medium text-foreground truncate group-hover:text-primary transition-colors leading-tight">
              {displayTitle}
            </h3>

            <p className="text-sm text-muted-foreground truncate mt-0.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary/40" />
              {domain}
            </p>
          </div>

          <ExternalLink className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </div>
      </article>
    );
  }

  // Render table card
  if (tableBlock) {
    return (
      <article
        onClick={handleClick}
        className="group overflow-hidden cursor-pointer rounded-2xl bg-secondary/50 dark:bg-white/[0.07] border border-border/40 dark:border-white/[0.08] shadow-card hover:bg-secondary/70 dark:hover:bg-white/[0.11] transition-colors duration-200 active:scale-[0.98]"
      >
        <div className="p-2">
          <TableDisplay headers={tableBlock.headers} rows={tableBlock.rows} compact />
        </div>
      </article>
    );
  }

  return (
    <article
      onClick={handleClick}
      className={`group overflow-hidden cursor-pointer transition-colors duration-200 active:scale-[0.98] ${
        isPureNote && !archiveMode
          ? 'inline-block w-fit rounded-2xl bg-secondary/55 dark:bg-white/[0.07] border border-border/40 dark:border-white/[0.08] shadow-card hover:bg-secondary/75 dark:hover:bg-white/[0.11]'
          : archiveMode && isPureNote
          ? 'w-full rounded-none bg-secondary/30 dark:bg-white/[0.05] border-l-2 border-l-primary/30 border-y-0 border-r-0 shadow-none hover:bg-secondary/50 dark:hover:bg-white/[0.09] hover:border-l-primary/50'
          : 'w-full rounded-2xl bg-secondary/50 dark:bg-white/[0.07] border border-border/40 dark:border-white/[0.08] shadow-card hover:bg-secondary/70 dark:hover:bg-white/[0.11]'
      }`}
      style={{
        flexShrink: 0,
        flexGrow: 0,
        maxWidth: 'none',
        ...(isImportant
          ? {
              boxShadow: 'var(--important-shadow)',
              background: 'hsl(var(--important-bg))',
            }
          : {}),
      }}
    >
      {hasMedia && mediaBlock.type === 'media' && mediaBlock.mediaType !== 'link' && (
        <div className="w-full overflow-hidden">
          {mediaBlock.mediaType === 'video' ? (
            <video
              src={mediaBlock.url}
              className="w-full h-auto group-hover:scale-[1.01] transition-transform duration-300"
              muted
              playsInline
              preload="none"
            />
          ) : (
            <img
              src={mediaBlock.url}
              alt={item.title || ''}
              className="w-full h-auto group-hover:scale-[1.01] transition-transform duration-300"
              loading="lazy"
            />
          )}
        </div>
      )}

      {!hasMedia && item.thumbnail && (
        <div className="w-full aspect-[4/3] overflow-hidden">
          <img
            src={item.thumbnail}
            alt={item.title || ''}
            className="w-full h-full object-cover group-hover:scale-[1.01] transition-transform duration-300"
            loading="lazy"
          />
        </div>
      )}

      {(item.title || textContent?.trim() || listBlock || checklistBlock || tableBlock || isLink || (item.blocks && item.blocks.length > 1)) && (
        <div className={isPureNote && !archiveMode ? 'px-3 py-1' : 'px-3.5 py-3'}>
          {archiveMode ? (
            archiveTitleText && (
              <h3
                className="text-[15px] font-semibold text-foreground truncate leading-tight"
              >
                {archiveTitleText}
              </h3>
            )
          ) : (
            item.title && (
              <h3
                className={`${isPureNote ? 'text-[15px] leading-snug' : 'text-[15px] line-clamp-2 leading-tight'} ${
                  isImportant
                    ? 'font-bold text-white dark:text-gray-900'
                    : 'font-semibold text-foreground'
                }`}
              >
                {item.title}
              </h3>
            )
          )}

          {!listBlock && !checklistBlock && !!textContent?.trim() && textContent.trim().toLowerCase() !== item.title?.trim().toLowerCase() && (
            <p
              className={`whitespace-pre-wrap break-words ${
                isPureNote && !archiveMode
                  ? 'text-[15px] leading-relaxed'
                  : archiveMode && isPureNote
                  ? 'text-[15px] line-clamp-4 leading-relaxed'
                  : 'text-[15px] line-clamp-3 leading-relaxed'
              } ${(archiveMode ? archiveTitleText : (!archiveMode && item.title)) ? 'mt-0.5' : ''} ${
                isImportant
                  ? 'font-bold text-white dark:text-gray-900'
                  : archiveMode && archiveTitleText
                  ? 'font-normal text-muted-foreground/80'
                  : archiveMode && isPureNote
                  ? 'font-normal text-foreground/90'
                  : archiveMode
                  ? 'font-normal text-foreground'
                  : 'font-semibold text-foreground'
              }`}
              style={{ wordBreak: 'break-word' }}
            >
              <FormattedText content={textContent} />
            </p>
          )}

          {(listBlock || checklistBlock || tableBlock) ? (
            <div className={`space-y-1 ${item.title ? 'mt-1.5' : ''}`}>
              {listBlock && renderBlockPreview(listBlock)}
              {checklistBlock && renderBlockPreview(checklistBlock)}
              {tableBlock && renderBlockPreview(tableBlock)}
            </div>
          ) : null}

          {isLink && item.url && isValidUrl(item.url) && (
            <div className="mt-1.5 flex items-center gap-2 text-sm text-primary/80 group-hover:text-primary">
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="truncate">{new URL(item.url).hostname}</span>
            </div>
          )}

          {item.blocks && item.blocks.length > 1 && (
            <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
              {item.blocks.some(b => b.type === 'list') && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                  <List className="w-3 h-3" />
                  List
                </div>
              )}
              {item.blocks.some(b => b.type === 'checklist') && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                  <CheckSquare className="w-3 h-3" />
                  Tasks
                </div>
              )}
              {item.blocks.some(b => b.type === 'table') && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                  <Table className="w-3 h-3" />
                  Table
                </div>
              )}
              {item.blocks.filter(b => b.type === 'media').length > 1 && (
                <div className="flex items-center gap-1 text-xs text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
                  +{item.blocks.filter(b => b.type === 'media').length - 1} media
                </div>
              )}
            </div>
          )}

          {itemPeople.length > 0 && (
            <div className="mt-1.5 flex items-center gap-1 flex-wrap">
              {itemPeople.slice(0, 3).map(person => (
                <div key={person.id} className="flex items-center gap-1 text-xs text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded-full">
                  <User className="w-2.5 h-2.5" />
                  {person.name}
                </div>
              ))}
              {itemPeople.length > 3 && (
                <span className="text-xs text-muted-foreground">+{itemPeople.length - 3}</span>
              )}
            </div>
          )}

        </div>
      )}
    </article>
  );
});