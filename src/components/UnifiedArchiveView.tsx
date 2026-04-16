import { useCallback, useEffect, useRef, useState } from 'react';
import { Item } from '@/types';
import { ItemCard } from './ItemCard';
import { EditNoteModal } from './EditNoteModal';
import { Trash2 } from 'lucide-react';
import { safeOpenUrl } from '@/lib/urlValidation';
import { groupBySmartCategory } from '@/lib/smartTitle';

interface UnifiedArchiveViewProps {
  items: Item[];
  onDeleteItem?: (id: string) => void;
}

export function UnifiedArchiveView({ items, onDeleteItem }: UnifiedArchiveViewProps) {
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [longPressItemId, setLongPressItemId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('');

  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const navItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  // Group by smart content category (never by date)
  const groups = groupBySmartCategory(items);
  const showNav = groups.length > 1;

  // Set initial active section
  useEffect(() => {
    if (groups.length > 0) {
      setActiveSection(groups[0].label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  // Track active section on scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || groups.length < 2) return;

    const handleScroll = () => {
      const navHeight = navRef.current?.offsetHeight ?? 48;
      const containerRect = container.getBoundingClientRect();
      const triggerY = containerRect.top + navHeight + 20;

      let activeLabel = groups[0].label;
      for (const group of groups) {
        const el = sectionRefs.current.get(group.label);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= triggerY) activeLabel = group.label;
      }
      setActiveSection(activeLabel);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.length]);

  // Scroll nav pill into view when active section changes
  useEffect(() => {
    if (!activeSection || !navRef.current) return;
    const navItem = navItemRefs.current.get(activeSection);
    if (navItem) {
      navItem.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
    }
  }, [activeSection]);

  const scrollToSection = useCallback((label: string) => {
    const el = sectionRefs.current.get(label);
    const container = scrollContainerRef.current;
    if (!el || !container) return;

    const navHeight = navRef.current?.offsetHeight ?? 48;
    const containerScrollTop = container.scrollTop;
    const containerTop = container.getBoundingClientRect().top;
    const elTop = el.getBoundingClientRect().top;
    const scrollTarget = containerScrollTop + (elTop - containerTop) - navHeight - 12;

    container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
    setActiveSection(label);
  }, []);

  const handleItemTap = useCallback((item: Item) => {
    const mediaBlock = item.blocks?.find(b => b.type === 'media');
    const isLinkBlock = mediaBlock?.type === 'media' && mediaBlock.mediaType === 'link';
    const isLegacyLink = item.type === 'link' && item.url;

    if (isLinkBlock && mediaBlock?.type === 'media') {
      safeOpenUrl(mediaBlock.url);
    } else if (isLegacyLink && item.url) {
      safeOpenUrl(item.url);
    } else {
      setEditingItem(item);
    }
  }, []);

  const handleTouchStart = useCallback((id: string) => {
    longPressTimer.current = setTimeout(() => {
      setLongPressItemId(prev => (prev === id ? null : id));
    }, 500);
  }, []);

  const handleTouchEnd = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }, []);

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto scrollbar-hide" style={{ WebkitOverflowScrolling: 'touch', overscrollBehavior: 'contain', willChange: 'scroll-position' }}>
      {/* Sticky horizontal section navigation — shown only when there are 2+ categories */}
      {showNav && (
        <div
          ref={navRef}
          className="sticky top-0 z-10 bg-background border-b border-border/20"
        >
          <div className="flex items-center gap-1.5 px-4 py-2.5 overflow-x-auto scrollbar-hide">
            {groups.map((group) => {
              const isActive = activeSection === group.label;
              return (
                <button
                  key={group.label}
                  ref={el => {
                    if (el) navItemRefs.current.set(group.label, el);
                    else navItemRefs.current.delete(group.label);
                  }}
                  onClick={() => scrollToSection(group.label)}
                  className={`
                    inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full
                    text-[12px] font-medium whitespace-nowrap shrink-0
                    transition-all duration-200 touch-manipulation
                    ${
                      isActive
                        ? 'bg-foreground text-background'
                        : 'bg-secondary/50 text-muted-foreground hover:bg-secondary hover:text-foreground'
                    }
                  `}
                >
                  <span>{group.label}</span>
                  <span className={`text-[11px] tabular-nums ${isActive ? 'opacity-70' : 'opacity-60'}`}>
                    {group.items.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Section list */}
      <div className="px-4 pt-5 pb-24 space-y-8">
          {groups.map((group) => (
            <section
              key={group.label}
              ref={el => {
                if (el) sectionRefs.current.set(group.label, el);
                else sectionRefs.current.delete(group.label);
              }}
              data-section={group.label}
            >
              {/* Section header */}
              <div className="flex items-center gap-2.5 mb-3">
                <span className="text-[14px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {group.label}
                </span>
                <span className="text-[13px] text-muted-foreground/80 font-medium tabular-nums">
                  {group.items.length}
                </span>
                <div className="flex-1 h-px bg-border/60" />
              </div>

              {/* Items */}
              <div className="space-y-2.5">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="relative"
                  >
                    <div
                      className="cursor-pointer active:opacity-75 transition-opacity touch-manipulation select-none"
                      onClick={() => {
                        if (longPressItemId === item.id) {
                          setLongPressItemId(null);
                        } else {
                          handleItemTap(item);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        setLongPressItemId(prev => (prev === item.id ? null : item.id));
                      }}
                      onTouchStart={() => handleTouchStart(item.id)}
                      onTouchEnd={handleTouchEnd}
                      onTouchMove={handleTouchEnd}
                    >
                      <ItemCard item={item} archiveMode />
                    </div>

                    {longPressItemId === item.id && onDeleteItem && (
                      <button
                        className="absolute top-1.5 right-1.5 z-10 w-7 h-7 rounded-full bg-destructive flex items-center justify-center shadow-md"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteItem(item.id);
                          setLongPressItemId(null);
                        }}
                        aria-label="Delete item"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-destructive-foreground" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </section>
          ))}
      </div>

      <EditNoteModal
        item={editingItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
      />
    </div>
  );
}
