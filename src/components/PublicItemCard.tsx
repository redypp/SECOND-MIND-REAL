import { Item, ContentBlock, TableBlock } from '@/types';
import { ExternalLink, Check, Globe } from 'lucide-react';
import { isValidUrl } from '@/lib/urlValidation';
import { getDomainFromUrl, getFaviconUrl } from '@/hooks/useUrlMetadata';
import { useState } from 'react';
import { FormattedText } from '@/components/RichTextEditor';
import { TableDisplay } from '@/components/TableEditor';

interface PublicItemCardProps {
  item: Item;
}

export function PublicItemCard({ item }: PublicItemCardProps) {
  const [faviconError, setFaviconError] = useState(false);

  const mediaBlock = item.blocks?.find(b => b.type === 'media');
  const hasMedia = mediaBlock && mediaBlock.type === 'media';
  const isLinkBlock = hasMedia && mediaBlock.type === 'media' && mediaBlock.mediaType === 'link';

  const textBlock = item.blocks?.find(b => b.type === 'text');
  const textContent = textBlock?.type === 'text' ? textBlock.content : item.content;

  const listBlock = item.blocks?.find(b => b.type === 'list');
  const checklistBlock = item.blocks?.find(b => b.type === 'checklist');
  const tableBlock = item.blocks?.find(b => b.type === 'table') as TableBlock | undefined;

  const isLink = item.type === 'link' && item.url;

  const renderBlockPreview = (block: ContentBlock) => {
    switch (block.type) {
      case 'list':
        return (
          <div className="space-y-1">
            {block.items.map((listItem, i) => (
              <div key={i} className="flex items-start gap-2 text-[15px] text-white/70 leading-snug">
                <span className="text-red-500 text-[11px] mt-1.5">•</span>
                <span>{listItem}</span>
              </div>
            ))}
          </div>
        );

      case 'checklist': {
        const completed = block.items.filter(i => i.checked).length;
        return (
          <div className="space-y-1">
            {block.items.map((checkItem) => (
              <div key={checkItem.id} className="flex items-center gap-2 text-[15px] leading-snug">
                <div className={`w-4 h-4 rounded border-[1.5px] flex items-center justify-center shrink-0 ${
                  checkItem.checked ? 'bg-red-500 border-red-500' : 'border-white/30'
                }`}>
                  {checkItem.checked && <Check className="w-2.5 h-2.5 text-white" />}
                </div>
                <span className={checkItem.checked ? 'line-through text-white/40' : 'text-white/70'}>
                  {checkItem.text}
                </span>
              </div>
            ))}
            <div className="mt-2 text-[13px] text-white/40">
              {completed}/{block.items.length} done
            </div>
          </div>
        );
      }

      case 'table':
        return (
          <div className="mt-1 overflow-x-auto">
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

  // Link card
  if (isLinkBlock && mediaBlock.type === 'media') {
    const domain = getDomainFromUrl(mediaBlock.url);
    const displayTitle = item.title || domain;
    const faviconUrl = getFaviconUrl(mediaBlock.url);

    return (
      <a
        href={mediaBlock.url}
        target="_blank"
        rel="noopener noreferrer"
        className="group block overflow-hidden rounded-2xl bg-white/[0.05] border border-white/[0.08] hover:bg-white/[0.09] transition-all duration-200"
      >
        <div className="px-4 py-3.5 flex items-center gap-3">
          <div className="w-10 h-10 bg-white/[0.08] rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
            {faviconUrl && !faviconError ? (
              <img src={faviconUrl} alt="" className="w-5 h-5 object-contain" onError={() => setFaviconError(true)} />
            ) : (
              <Globe className="w-4 h-4 text-white/50" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-[16px] font-medium text-white truncate group-hover:text-red-400 transition-colors leading-tight">
              {displayTitle}
            </h3>
            <p className="text-[14px] text-white/40 truncate mt-0.5 flex items-center gap-1.5">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-red-500/40" />
              {domain}
            </p>
          </div>
          <ExternalLink className="w-4 h-4 text-white/40 group-hover:text-red-400 transition-colors shrink-0" />
        </div>
      </a>
    );
  }

  // Table card
  if (tableBlock) {
    return (
      <article className="overflow-hidden rounded-2xl bg-white/[0.05] border border-white/[0.08]">
        <div className="p-3">
          <TableDisplay headers={tableBlock.headers} rows={tableBlock.rows} compact />
        </div>
      </article>
    );
  }

  // Standard card
  const hasImage = hasMedia && mediaBlock.type === 'media' && mediaBlock.mediaType !== 'link';

  return (
    <article className="overflow-hidden rounded-2xl bg-white/[0.05] border border-white/[0.08] break-inside-avoid mb-4">
      {hasImage && mediaBlock.type === 'media' && (
        <div className="w-full overflow-hidden">
          {mediaBlock.mediaType === 'video' ? (
            <video src={mediaBlock.url} className="w-full h-auto" muted playsInline preload="none" />
          ) : (
            <img src={mediaBlock.url} alt={item.title || ''} className="w-full h-auto" loading="lazy" />
          )}
        </div>
      )}

      {!hasMedia && item.thumbnail && (
        <div className="w-full overflow-hidden">
          <img src={item.thumbnail} alt={item.title || ''} className="w-full h-auto object-cover" loading="lazy" />
        </div>
      )}

      {(item.title || textContent?.trim() || listBlock || checklistBlock || isLink) && (
        <div className="px-4 py-3.5">
          {item.title && (
            <h3
              className="text-[17px] font-semibold text-white leading-tight"
              style={{ fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
            >
              {item.title}
            </h3>
          )}

          {textContent?.trim() && textContent.trim().toLowerCase() !== item.title?.trim().toLowerCase() && (
            <p
              className={`whitespace-pre-wrap break-words text-[15px] leading-relaxed text-white/70 ${item.title ? 'mt-1.5' : ''}`}
              style={{ wordBreak: 'break-word', fontFamily: 'Helvetica Neue, Helvetica, Arial, sans-serif' }}
            >
              <FormattedText content={textContent} />
            </p>
          )}

          {(listBlock || checklistBlock) && (
            <div className={`space-y-1 ${item.title ? 'mt-2' : ''}`}>
              {listBlock && renderBlockPreview(listBlock)}
              {checklistBlock && renderBlockPreview(checklistBlock)}
            </div>
          )}

          {isLink && item.url && isValidUrl(item.url) && (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center gap-2 text-sm text-red-400/80 hover:text-red-400"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span className="truncate">{new URL(item.url).hostname}</span>
            </a>
          )}
        </div>
      )}
    </article>
  );
}
