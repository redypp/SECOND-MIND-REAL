import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSpaces } from '@/contexts/SpacesContext';
import { Folder, Plus, ArrowLeft, Pencil, Trash2, ImagePlus, Pin, Check, X, Settings, Crosshair, Sparkles, Loader2, LayoutList, LayoutGrid } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'framer-motion';
import { AddMemoryPanel } from '@/components/AddMemoryPanel';
import { OrganizeModal } from '@/components/OrganizeModal';
import { FreeformCanvas } from '@/components/FreeformCanvas';
import { GroupedArchiveView } from '@/components/GroupedArchiveView';
import { UnifiedArchiveView } from '@/components/UnifiedArchiveView';
import { EditNoteModal } from '@/components/EditNoteModal';
import { showErrorPopup } from '@/contexts/ErrorPopupContext';
import { useTutorial } from '@/contexts/TutorialContext';
import { Item, GroupAssignments } from '@/types';
import { supabase } from '@/integrations/supabase/app-client';
import { getSmartCategory } from '@/lib/smartTitle';

export default function SpaceDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { reportTutorialAction } = useTutorial();
  const { spaces, getItemsBySpaceId, deleteItem, addItemAsync, updateItem, updateItemPosition, markSpaceUsed, deleteSpace, updateSpaceName, updateSpaceImage, updateSpaceGif, pinSpace, unpinSpace, saveGroupAssignments } = useSpaces();

  const [showAddMemoryPanel, setShowAddMemoryPanel] = useState(false);
  const [showOrganizeModal, setShowOrganizeModal] = useState(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [swipeProgress, setSwipeProgress] = useState(0);
  const [slidingOut, setSlidingOut] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [isOrganizing, setIsOrganizing] = useState(false);
  // organizedGroups is only populated by an explicit user-initiated Re-organize action.
  // It is never auto-computed — the default view is always a flat chronological feed.
  const [organizedGroups, setOrganizedGroups] = useState<{ label: string; item_ids: string[] }[] | null>(null);
  // 'list' = smart-categorised feed (default & fallback), 'grouped' = AI-organised sections, 'canvas' = freeform
  const [viewMode, setViewMode] = useState<'list' | 'grouped' | 'canvas'>('list');
  const coverInputRef = useRef<HTMLInputElement>(null);
  const goHomeRef = useRef<(() => void) | null>(null);
  const autoOrganizeAttempted = useRef(false);

  // Edge swipe-right to go back
  const swipeTouchRef = useRef<{ startX: number; startY: number } | null>(null);
  const EDGE_ZONE = 40;
  const SWIPE_THRESHOLD = 90;

  const handleSwipeTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    if (touch.clientX <= EDGE_ZONE) {
      swipeTouchRef.current = { startX: touch.clientX, startY: touch.clientY };
    }
  }, []);

  const handleSwipeTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swipeTouchRef.current) return;
    const touch = e.touches[0];
    const dx = touch.clientX - swipeTouchRef.current.startX;
    const dy = Math.abs(touch.clientY - swipeTouchRef.current.startY);
    if (dy > 10 && dy > dx) { swipeTouchRef.current = null; setSwipeProgress(0); return; }
    if (dx > 0) setSwipeProgress(Math.min(1, dx / SWIPE_THRESHOLD));
  }, []);

  const animateOut = useCallback(() => {
    if (slidingOut) return;
    setSlidingOut(true);
    setTimeout(() => {
      navigate('/archive', { replace: true });
    }, 280);
  }, [navigate, slidingOut]);

  const handleSwipeTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swipeTouchRef.current) return;
    const touch = e.changedTouches[0];
    const dx = touch.clientX - swipeTouchRef.current.startX;
    swipeTouchRef.current = null;
    setSwipeProgress(0);
    if (dx >= SWIPE_THRESHOLD) {
      animateOut();
    }
  }, [animateOut]);

  const space = id ? spaces.find(s => s.id === id) : undefined;

  useEffect(() => {
    if (id) markSpaceUsed(id);
  }, [id, markSpaceUsed]);

  // Restore persisted AI groups if the space was previously organized
  useEffect(() => {
    if (space?.groupAssignments?.groups?.length) {
      setOrganizedGroups(space.groupAssignments.groups);
      setViewMode('grouped');
    }
  }, [space?.groupAssignments]);

  const items = id ? getItemsBySpaceId(id) : [];

  // Auto-organize silently on first visit when no AI groups exist yet
  const hasExistingGroups = !!(space?.groupAssignments?.groups?.length);
  useEffect(() => {
    if (autoOrganizeAttempted.current) return;
    if (items.length === 0) return;
    if (hasExistingGroups) return;
    autoOrganizeAttempted.current = true;
    handleOrganizeArchive(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length, hasExistingGroups]);

  // Simple chronological sort — no group reordering
  // Deduplicate by content fingerprint: if multiple items share the same normalized
  // title+content, keep only the most complete one (longest combined text).
  const sortedItems = useMemo(() => {
    const sorted = [...items].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const seen = new Map<string, Item>();
    for (const item of sorted) {
      const textBlock = item.blocks?.find(b => b.type === 'text');
      const textContent = textBlock?.type === 'text' ? textBlock.content : item.content ?? '';
      const fingerprint = `${(item.title ?? '').trim().toLowerCase()}|${textContent.trim().toLowerCase()}`;
      if (!fingerprint || fingerprint === '|') {
        seen.set(item.id, item);
        continue;
      }
      const existing = seen.get(fingerprint);
      if (!existing) {
        seen.set(fingerprint, item);
      } else {
        // Keep the more complete item (longer combined text)
        const existingLen = (existing.title ?? '').length + (existing.content ?? '').length;
        const currentLen = (item.title ?? '').length + (item.content ?? '').length;
        if (currentLen > existingLen) {
          seen.delete(fingerprint);
          seen.set(fingerprint, item);
        }
      }
    }
    return Array.from(seen.values()).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [items]);

  // Manual Re-organize via AI (user-initiated from settings only)
  const handleOrganizeArchive = useCallback(async (silent = false) => {
    if (isOrganizing || items.length === 0) return;
    setIsOrganizing(true);
    try {
      const { data, error } = await supabase.functions.invoke('ai-assistant', {
        body: {
          type: 'organize_archive',
          input: `Organize the ${items.length} items in the "${space?.name}" archive`,
          context: {
            spaces: spaces.map(s => ({ id: s.id, name: s.name, itemCount: s.itemCount })),
            items: items.map(i => ({
              id: i.id,
              title: i.title,
              subCategory: i.subCategory,
              content: i.content,
              blocks: i.blocks,
              spaceIds: i.spaceIds || [],
              createdAt: i.createdAt?.toISOString(),
            })),
            currentTime: new Date().toISOString(),
          },
        },
      });
      if (error) throw error;
      if (data?.success && data?.data?.groups) {
        const groups: { label: string; item_ids: string[] }[] = data.data.groups;
        setOrganizedGroups(groups);

        // Persist to Supabase so groups survive page refreshes
        if (id) {
          const assignments: GroupAssignments = {
            groups,
            organized_at: new Date().toISOString(),
            item_count_at_organize: items.length,
          };
          saveGroupAssignments(id, assignments);
        }

        // After organizing, show the grouped view so the result is immediately visible
        setViewMode('grouped');
      }
    } catch (err) {
      console.warn('Organize archive failed:', err);
      if (!silent) {
        showErrorPopup('Could not organize this archive. Please try again.');
      }
    } finally {
      setIsOrganizing(false);
    }
  }, [isOrganizing, items, space, spaces, id, saveGroupAssignments]);

  const handleAddItem = useCallback(async (item: Parameters<typeof addItemAsync>[0]) => {
    const newItemId = await addItemAsync(item);
    if (!newItemId) {
      showErrorPopup('Failed to add item. Please try again.');
      return;
    }

    // Auto-route the new item into the best existing group when in grouped mode
    if (organizedGroups && organizedGroups.length > 0 && id) {
      // Build a synthetic Item object from the input so we can classify it
      const syntheticItem: Item = {
        id: newItemId,
        subCategory: item.subCategory,
        blocks: item.blocks ?? [],
        title: item.title,
        content: item.content,
        type: item.type,
        url: item.url,
        createdAt: new Date(),
      };
      const smartCat = getSmartCategory(syntheticItem);

      // Find a group whose label best matches the smart category (case-insensitive)
      const match = organizedGroups.find(
        g => g.label.toLowerCase() === smartCat.toLowerCase()
      );
      // Target: matched group, or first group as fallback
      const targetLabel = match ? match.label : organizedGroups[0].label;

      const updatedGroups = organizedGroups.map(g =>
        g.label === targetLabel
          ? { ...g, item_ids: [newItemId, ...g.item_ids] }
          : g
      );
      setOrganizedGroups(updatedGroups);

      const assignments: GroupAssignments = {
        groups: updatedGroups,
        organized_at: new Date().toISOString(),
        item_count_at_organize: sortedItems.length + 1,
      };
      saveGroupAssignments(id, assignments);
    }
  }, [addItemAsync, organizedGroups, id, sortedItems.length, saveGroupAssignments]);

  if (!space) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center pb-20">
        <div className="text-center px-6">
          <div className="w-16 h-16 bg-secondary mx-auto mb-5 flex items-center justify-center">
            <Folder className="w-7 h-7 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-1.5">Archive not found</h2>
          <p className="text-muted-foreground text-[15px] mb-5">
            This archive may have been deleted.
          </p>
          <button
            onClick={() => navigate('/archive', { replace: true })}
            className="inline-flex items-center gap-1.5 text-[14px] text-primary font-medium hover:underline"
          >
            Back to archives
          </button>
        </div>
      </div>
    );
  }

  const hasGroups = organizedGroups !== null && organizedGroups.length > 0;

  return (
    <div
      className="fixed inset-0 bg-background safe-area-top-ios flex flex-col overflow-hidden"
      style={{
        transform: slidingOut
          ? `translateX(100%)`
          : swipeProgress > 0
            ? `translateX(${swipeProgress * SWIPE_THRESHOLD}px)`
            : undefined,
        transition: (swipeProgress === 0 || slidingOut) ? 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)' : 'none',
      }}
      onTouchStart={handleSwipeTouchStart}
      onTouchMove={handleSwipeTouchMove}
      onTouchEnd={handleSwipeTouchEnd}
    >
      {/* Swipe-back indicator */}
      {swipeProgress > 0 && (
        <div
          className="fixed left-0 top-0 bottom-0 z-[99998] pointer-events-none flex items-center"
          style={{ width: `${swipeProgress * 60}px`, background: 'linear-gradient(to right, hsl(var(--foreground)/0.08), transparent)' }}
        >
          <div
            className="ml-2 w-8 h-8 rounded-full bg-background/90 border border-border flex items-center justify-center shadow-md"
            style={{ opacity: swipeProgress, transform: `scale(${0.7 + swipeProgress * 0.3})` }}
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </div>
        </div>
      )}

      {/* Cinematic GIF background banner */}
      {space.gifBackground && (
        <div className="relative w-full h-40 flex-shrink-0 overflow-hidden">
          <img
            src={space.gifBackground}
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 w-full h-full object-cover"
            style={{ willChange: 'auto' }}
          />
          {/* Dark gradient overlay so text above stays readable */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/20 to-black/60" />
          {/* Archive name overlay */}
          <div className="absolute bottom-0 left-0 right-0 p-4 pb-3">
            <h2
              className="text-white font-bold text-2xl leading-tight drop-shadow-lg"
              style={{ textShadow: '0 2px 16px rgba(0,0,0,0.7)' }}
            >
              {space.name}
            </h2>
            <p className="text-white/80 text-[13px] mt-0.5">
              {items.length} {items.length === 1 ? 'item' : 'items'}
            </p>
          </div>
        </div>
      )}

      {/* Fixed header */}
      <header
        className="z-[9999] bg-background/95 backdrop-blur-sm border-b border-border flex-shrink-0"
        style={{ touchAction: 'manipulation' }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            type="button"
            onTouchEnd={(e) => { e.stopPropagation(); e.preventDefault(); animateOut(); }}
            onClick={(e) => { e.stopPropagation(); animateOut(); }}
            className="p-3 -ml-2 rounded-lg hover:bg-secondary active:bg-secondary/80 transition-colors touch-manipulation shrink-0"
            style={{ touchAction: 'manipulation', minWidth: 44, minHeight: 44, position: 'relative', zIndex: 100000 }}
            aria-label="Back to archives"
          >
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>

          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden shrink-0"
              style={{ backgroundColor: space.color ? `${space.color}20` : 'hsl(var(--secondary))' }}
            >
              {space.image ? (
                <img src={space.image} alt={space.name} className="w-full h-full object-cover" />
              ) : (
                <span className="text-base font-semibold" style={{ color: space.color || 'hsl(var(--muted-foreground))' }}>
                  {space.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-semibold text-foreground truncate">{space.name}</h1>
              <p className="text-muted-foreground text-[13px]">
                {items.length} {items.length === 1 ? 'item' : 'items'}
                {isOrganizing && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-muted-foreground/70">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    organizing…
                  </span>
                )}
              </p>
            </div>
          </div>

          <motion.button
            data-tutorial="add-archive-item"
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowOrganizeModal(true)}
            className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all touch-manipulation"
            aria-label="Add to archive"
          >
            <Plus className="w-5 h-5 text-primary-foreground" />
          </motion.button>

          {/* Canvas toggle — only shown when AI groups exist */}
          {hasGroups && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setViewMode(v => v === 'canvas' ? 'grouped' : 'canvas')}
              className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-all touch-manipulation"
              aria-label={viewMode === 'canvas' ? 'Switch to list view' : 'Switch to canvas'}
            >
              {viewMode === 'canvas'
                ? <LayoutList className="w-5 h-5 text-foreground/70" />
                : <LayoutGrid className="w-5 h-5 text-foreground/70" />
              }
            </motion.button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <motion.button
                data-tutorial="archive-settings"
                whileTap={{ scale: 0.95 }}
                className="w-10 h-10 rounded-full bg-secondary/60 flex items-center justify-center hover:bg-secondary transition-all touch-manipulation"
                aria-label="Archive settings"
              >
                <Settings className="w-5 h-5 text-foreground/70" />
              </motion.button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" sideOffset={8} collisionPadding={{ right: 0 }} className="w-52 rounded-xl p-1.5 shadow-lg border border-border/50 bg-popover z-[9999]" style={{ marginRight: '-16px' }}>
              <DropdownMenuItem onClick={() => { setEditedName(space.name); setIsEditingName(true); }} className="rounded-lg px-3 py-2.5 gap-3">
                <Pencil className="w-4 h-4" /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => coverInputRef.current?.click()} className="rounded-lg px-3 py-2.5 gap-3">
                <ImagePlus className="w-4 h-4" /> Change cover
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { if (id) { space.isPinned ? unpinSpace(id) : pinSpace(id); } }} className="rounded-lg px-3 py-2.5 gap-3">
                <Pin className={`w-4 h-4 ${space.isPinned ? 'fill-primary text-primary' : ''}`} />
                {space.isPinned ? 'Unpin' : 'Pin'}
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => handleOrganizeArchive(false)}
                disabled={isOrganizing || items.length === 0}
                className="rounded-lg px-3 py-2.5 gap-3"
              >
                {isOrganizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                {isOrganizing ? 'Organizing...' : 'Organize'}
              </DropdownMenuItem>
              {viewMode === 'canvas' && sortedItems.length > 0 && (
                <DropdownMenuItem
                  onClick={() => goHomeRef.current?.()}
                  className="rounded-lg px-3 py-2.5 gap-3"
                >
                  <Crosshair className="w-4 h-4" /> Center view
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                onClick={() => { if (id) { deleteSpace(id); navigate('/archive', { replace: true }); } }}
                className="rounded-lg px-3 py-2.5 gap-3 text-destructive focus:text-destructive"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <input ref={coverInputRef} type="file" accept="image/*" onChange={(e) => {
            const file = e.target.files?.[0];
            if (file && id) {
              const reader = new FileReader();
              reader.onloadend = () => updateSpaceImage(id, reader.result as string);
              reader.readAsDataURL(file);
            }
          }} className="hidden" />
        </div>

        {/* Inline rename bar */}
        {isEditingName && (
          <div className="flex items-center gap-1 px-3 py-2 border-t border-border/30">
            <input
              type="text"
              value={editedName}
              onChange={(e) => setEditedName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && editedName.trim() && id) { updateSpaceName(id, editedName.trim()); setIsEditingName(false); }
                if (e.key === 'Escape') setIsEditingName(false);
              }}
              className="flex-1 bg-secondary px-3 py-1.5 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button onClick={() => { if (editedName.trim() && id) updateSpaceName(id, editedName.trim()); setIsEditingName(false); }} className="p-2 rounded-lg hover:bg-secondary">
              <Check className="w-4 h-4 text-primary" />
            </button>
            <button onClick={() => setIsEditingName(false)} className="p-2 rounded-lg hover:bg-secondary">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}
      </header>

      <main className="flex-1 min-h-0 overflow-hidden">
        {sortedItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center py-20 px-6"
          >
            <p className="text-muted-foreground/70 text-[14px] mb-4">Nothing here yet</p>
            <p className="text-muted-foreground/55 text-[13px] mb-6">
              Tap + to add notes, images, or links
            </p>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setShowOrganizeModal(true)}
              className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium shadow-lg shadow-primary/30 hover:bg-primary/90 transition-all touch-manipulation"
            >
              <Plus className="w-5 h-5" />
              Add something
            </motion.button>
          </motion.div>
        ) : viewMode === 'canvas' ? (
          <FreeformCanvas
            items={sortedItems}
            onDeleteItem={deleteItem}
            onUpdatePosition={(itemId, pos) => updateItemPosition(itemId, pos)}
            onEditItem={(item) => updateItem(item.id, { color: item.color })}
            goHomeRef={goHomeRef}
          />
        ) : viewMode === 'grouped' && hasGroups ? (
          <GroupedArchiveView
            items={sortedItems}
            groups={organizedGroups!}
            onDeleteItem={deleteItem}
            onGroupsChange={(newGroups) => {
              setOrganizedGroups(newGroups);
              if (id) {
                const assignments: GroupAssignments = {
                  groups: newGroups,
                  organized_at: new Date().toISOString(),
                  item_count_at_organize: sortedItems.length,
                };
                saveGroupAssignments(id, assignments);
              }
            }}
          />
        ) : (
          <UnifiedArchiveView
            items={sortedItems}
            onDeleteItem={deleteItem}
          />
        )}
      </main>

      {/* Edit note modal */}
      <EditNoteModal
        item={editingItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
      />

      <OrganizeModal
        isOpen={showOrganizeModal}
        onClose={() => setShowOrganizeModal(false)}
        spaceId={id}
        spaceName={space.name}
        onItemSaved={() => reportTutorialAction('add-archive-item')}
      />

      <AddMemoryPanel
        spaceId={id!}
        isOpen={showAddMemoryPanel}
        onClose={() => setShowAddMemoryPanel(false)}
        onAddItem={handleAddItem}
      />
    </div>
  );
}