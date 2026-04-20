import { useCallback, useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Item } from '@/types';
import { ItemCard } from './ItemCard';
import { EditNoteModal } from './EditNoteModal';
import { Trash2, ArrowRightLeft, X, Pencil, Plus, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { safeOpenUrl } from '@/lib/urlValidation';

const NOTES_FALLBACK_LABEL = 'Notes';

export interface ArchiveGroupData {
  label: string;
  item_ids: string[];
}

interface GroupedArchiveViewProps {
  items: Item[];
  groups: ArchiveGroupData[];
  onDeleteItem?: (id: string) => void;
  onGroupsChange?: (groups: ArchiveGroupData[]) => void;
  fromSpaceId?: string;
}

export function GroupedArchiveView({ items, groups, onDeleteItem, onGroupsChange, fromSpaceId }: GroupedArchiveViewProps) {
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [longPressItemId, setLongPressItemId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string>('');
  // item being moved: { itemId, fromGroup }
  const [movingItem, setMovingItem] = useState<{ itemId: string; fromGroup: string } | null>(null);
  // Header edit mode + which header is being renamed inline
  const [headerEditMode, setHeaderEditMode] = useState(false);
  const [renamingLabel, setRenamingLabel] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());
  const navItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());

  const itemMap = new Map(items.map(i => [i.id, i]));

  // Build ordered groups, then collect any ungrouped items into a fallback bucket
  const groupedItems: { label: string; items: Item[] }[] = [];
  const assignedIds = new Set<string>();

  for (const group of groups) {
    const groupItems: Item[] = [];
    for (const id of group.item_ids) {
      const item = itemMap.get(id);
      if (item && !assignedIds.has(id)) {
        groupItems.push(item);
        assignedIds.add(id);
      }
    }
    if (groupItems.length > 0) {
      groupedItems.push({ label: group.label, items: groupItems });
    }
  }

  // Any items not covered by groups go into a catch-all bucket.
  // Always show empty user-defined groups in edit mode so they can be renamed/deleted.
  const ungrouped = items.filter(i => !assignedIds.has(i.id));
  if (ungrouped.length > 0) {
    groupedItems.push({ label: NOTES_FALLBACK_LABEL, items: ungrouped });
  }
  if (headerEditMode) {
    for (const group of groups) {
      if (!group.item_ids.length && !groupedItems.some(g => g.label === group.label)) {
        groupedItems.push({ label: group.label, items: [] });
      }
    }
  }

  const showNav = groupedItems.length > 1;

  // Initialize active section to first group on mount / group change
  useEffect(() => {
    if (groupedItems.length > 0) {
      setActiveSection(groupedItems[0].label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedItems.length]);

  // Track active section on scroll
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container || groupedItems.length < 2) return;

    const handleScroll = () => {
      const navHeight = navRef.current?.offsetHeight ?? 48;
      const containerRect = container.getBoundingClientRect();
      const triggerY = containerRect.top + navHeight + 20;

      // The active section is the last one whose top is at or above the trigger line
      let activeLabel = groupedItems[0].label;
      for (const group of groupedItems) {
        const el = sectionRefs.current.get(group.label);
        if (!el) continue;
        const rect = el.getBoundingClientRect();
        if (rect.top <= triggerY) {
          activeLabel = group.label;
        }
      }
      setActiveSection(activeLabel);
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    // Run once on mount to set initial state correctly
    handleScroll();
    return () => container.removeEventListener('scroll', handleScroll);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupedItems.length]);

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

  const handleLongPress = useCallback((id: string) => {
    setLongPressItemId(prev => (prev === id ? null : id));
  }, []);

  const moveItemToGroup = useCallback((itemId: string, fromLabel: string, toLabel: string) => {
    const updatedGroups = groups.map(g => {
      if (g.label === fromLabel) return { ...g, item_ids: g.item_ids.filter(id => id !== itemId) };
      if (g.label === toLabel) return { ...g, item_ids: [...g.item_ids, itemId] };
      return g;
    });
    onGroupsChange?.(updatedGroups);
    setMovingItem(null);
    setLongPressItemId(null);
  }, [groups, onGroupsChange]);

  // ── Header edit handlers ───────────────────────────────────────────────
  const startRename = useCallback((label: string) => {
    setRenamingLabel(label);
    setRenameValue(label);
  }, []);

  const commitRename = useCallback(() => {
    if (!renamingLabel || !onGroupsChange) {
      setRenamingLabel(null);
      return;
    }
    const next = renameValue.trim();
    if (!next || next === renamingLabel) {
      setRenamingLabel(null);
      return;
    }
    // Skip if label collides with an existing header (case-insensitive).
    if (groups.some(g => g.label.toLowerCase() === next.toLowerCase() && g.label !== renamingLabel)) {
      setRenamingLabel(null);
      return;
    }
    const updatedGroups = groups.map(g =>
      g.label === renamingLabel ? { ...g, label: next } : g
    );
    onGroupsChange(updatedGroups);
    setRenamingLabel(null);
  }, [renamingLabel, renameValue, groups, onGroupsChange]);

  const deleteGroup = useCallback((label: string) => {
    if (!onGroupsChange) return;
    // Remove the group; its items fall through to the "Notes" catch-all bucket.
    const updatedGroups = groups.filter(g => g.label !== label);
    onGroupsChange(updatedGroups);
  }, [groups, onGroupsChange]);

  const moveGroup = useCallback((label: string, direction: -1 | 1) => {
    if (!onGroupsChange) return;
    const idx = groups.findIndex(g => g.label === label);
    if (idx < 0) return;
    const target = idx + direction;
    if (target < 0 || target >= groups.length) return;
    const updatedGroups = [...groups];
    const [moved] = updatedGroups.splice(idx, 1);
    updatedGroups.splice(target, 0, moved);
    onGroupsChange(updatedGroups);
  }, [groups, onGroupsChange]);

  const addGroup = useCallback(() => {
    if (!onGroupsChange) return;
    // Generate a unique default label: "New section", "New section 2", etc.
    let base = 'New section';
    let label = base;
    let n = 2;
    const existing = new Set(groups.map(g => g.label.toLowerCase()));
    while (existing.has(label.toLowerCase())) {
      label = `${base} ${n++}`;
    }
    onGroupsChange([...groups, { label, item_ids: [] }]);
    setRenamingLabel(label);
    setRenameValue(label);
  }, [groups, onGroupsChange]);

  const canEditGroups = !!onGroupsChange;

  return (
    <div ref={scrollContainerRef} className="h-full overflow-y-auto overscroll-contain">
      {/* Edit-mode toggle */}
      {canEditGroups && (
        <div className="px-4 pt-3 flex items-center justify-end">
          <button
            onClick={() => {
              setHeaderEditMode(v => !v);
              setRenamingLabel(null);
              setLongPressItemId(null);
            }}
            className={`
              inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium
              transition-colors touch-manipulation
              ${headerEditMode
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary/60 text-muted-foreground hover:text-foreground hover:bg-secondary'}
            `}
            aria-pressed={headerEditMode}
          >
            {headerEditMode ? (
              <>
                <Check className="w-3.5 h-3.5" />
                Done
              </>
            ) : (
              <>
                <Pencil className="w-3.5 h-3.5" />
                Edit sections
              </>
            )}
          </button>
        </div>
      )}

      {/* Sticky horizontal section navigation — shown only when there are 2+ groups */}
      {showNav && (
        <div
          ref={navRef}
          className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm border-b border-border/20"
        >
          <div className="flex items-center gap-1.5 px-4 py-2.5 overflow-x-auto scrollbar-hide">
            {groupedItems.map((group) => {
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
                  <span className="capitalize">{group.label}</span>
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
        <AnimatePresence initial={false}>
          {groupedItems.map((group, gi) => (
            <motion.section
              key={group.label}
              ref={el => {
                if (el) sectionRefs.current.set(group.label, el as HTMLElement);
                else sectionRefs.current.delete(group.label);
              }}
              data-section={group.label}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: gi * 0.04, type: 'spring', stiffness: 380, damping: 32 }}
            >
              {/* Section header */}
              {(() => {
                const isNotesFallback = group.label === NOTES_FALLBACK_LABEL && !groups.some(g => g.label === NOTES_FALLBACK_LABEL);
                const isRenaming = renamingLabel === group.label;
                const showEditControls = headerEditMode && canEditGroups && !isNotesFallback;

                return (
                  <div className="flex items-center gap-2.5 mb-3">
                    {isRenaming ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setRenamingLabel(null);
                          }
                        }}
                        className="bg-secondary/60 border border-primary/40 rounded-md px-2 py-1 text-[14px] font-semibold uppercase tracking-wider text-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 min-w-0 flex-1"
                        maxLength={40}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={showEditControls ? () => startRename(group.label) : undefined}
                        className={`text-[14px] font-semibold uppercase tracking-wider text-muted-foreground/85 text-left ${
                          showEditControls ? 'hover:text-foreground cursor-text' : 'cursor-default'
                        }`}
                      >
                        {group.label}
                      </button>
                    )}
                    {!isRenaming && (
                      <span className="text-[13px] text-muted-foreground/60 font-medium tabular-nums">
                        {group.items.length}
                      </span>
                    )}
                    {showEditControls && !isRenaming && (
                      <div className="flex items-center gap-1 ml-1">
                        <button
                          onClick={() => moveGroup(group.label, -1)}
                          disabled={gi === 0 || isNotesFallback}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move section up"
                        >
                          <ChevronUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => moveGroup(group.label, 1)}
                          disabled={gi === groups.length - 1 || isNotesFallback}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:bg-secondary disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          aria-label="Move section down"
                        >
                          <ChevronDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => startRename(group.label)}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                          aria-label="Rename section"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => deleteGroup(group.label)}
                          className="w-6 h-6 rounded-md flex items-center justify-center text-destructive hover:bg-destructive/10 transition-colors"
                          aria-label="Delete section"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                    <div className="flex-1 h-px bg-border/50" />
                  </div>
                );
              })()}

              {/* Items */}
              <div className="space-y-2.5">
                {group.items.map((item, ii) => (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -6 }}
                    transition={{ delay: gi * 0.04 + ii * 0.02, type: 'spring', stiffness: 400, damping: 30 }}
                    className="relative"
                  >
                    <div
                      className="cursor-pointer active:opacity-80 transition-opacity touch-manipulation select-none"
                      onClick={() => {
                        if (longPressItemId === item.id) {
                          setLongPressItemId(null);
                        } else {
                          handleItemTap(item);
                        }
                      }}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        handleLongPress(item.id);
                      }}
                    >
                      <ItemCard item={item} archiveMode fromSpaceId={fromSpaceId} />
                    </div>

                    {/* Action buttons on long-press */}
                    <AnimatePresence>
                      {longPressItemId === item.id && (
                        <motion.div
                          initial={{ opacity: 0, scale: 0.8 }}
                          animate={{ opacity: 1, scale: 1 }}
                          exit={{ opacity: 0, scale: 0.8 }}
                          transition={{ type: 'spring', stiffness: 500, damping: 28 }}
                          className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1.5"
                        >
                          {groupedItems.length > 1 && onGroupsChange && (
                            <button
                              className="w-7 h-7 rounded-full bg-primary flex items-center justify-center shadow-md"
                              onClick={(e) => {
                                e.stopPropagation();
                                setMovingItem({ itemId: item.id, fromGroup: group.label });
                                setLongPressItemId(null);
                              }}
                              aria-label="Move to section"
                            >
                              <ArrowRightLeft className="w-3.5 h-3.5 text-primary-foreground" />
                            </button>
                          )}
                          {onDeleteItem && (
                            <button
                              className="w-7 h-7 rounded-full bg-destructive flex items-center justify-center shadow-md"
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
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                ))}
              </div>
            </motion.section>
          ))}
        </AnimatePresence>

        {headerEditMode && canEditGroups && (
          <button
            onClick={addGroup}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border/70 text-muted-foreground hover:text-foreground hover:border-primary/40 hover:bg-secondary/40 transition-colors touch-manipulation"
          >
            <Plus className="w-4 h-4" />
            <span className="text-sm font-medium">Add section</span>
          </button>
        )}
      </div>

      {/* Section picker sheet */}
      <AnimatePresence>
        {movingItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[10000] flex flex-col justify-end"
          >
            <div className="absolute inset-0 bg-background/60 backdrop-blur-sm" onClick={() => setMovingItem(null)} />
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 60, opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="relative bg-background border-t border-border rounded-t-2xl shadow-2xl p-4 pb-[max(1.5rem,var(--app-safe-bottom))]"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-semibold text-foreground">Move to section</span>
                <button onClick={() => setMovingItem(null)} className="p-1 rounded-lg hover:bg-secondary transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="flex flex-col gap-1.5">
                {groupedItems
                  .filter(g => g.label !== movingItem.fromGroup)
                  .map(g => (
                    <button
                      key={g.label}
                      onClick={() => moveItemToGroup(movingItem.itemId, movingItem.fromGroup, g.label)}
                      className="flex items-center justify-between px-4 py-3 rounded-xl bg-secondary/50 hover:bg-secondary active:bg-secondary/80 transition-colors text-left touch-manipulation"
                    >
                      <span className="text-sm font-medium text-foreground capitalize">{g.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{g.items.length}</span>
                    </button>
                  ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <EditNoteModal
        item={editingItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
      />
    </div>
  );
}