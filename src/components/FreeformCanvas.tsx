import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Item, MediaBlock } from '@/types';
import { ItemCard } from './ItemCard';
import { EditNoteModal } from './EditNoteModal';
import { X } from 'lucide-react';
import { safeOpenUrl } from '@/lib/urlValidation';
import { useCanvasViewportGestures } from '@/hooks/useCanvasViewportGestures';

interface Position {
  x: number;
  y: number;
  z: number;
  scale: number;
  width?: number;
  height?: number;
}

interface FreeformCanvasProps {
  items: Item[];
  onDeleteItem?: (id: string) => void;
  onUpdatePosition?: (itemId: string, position: { x: number; y: number; z?: number; scale?: number }) => void;
  onEditItem?: (item: Item) => void;
  focusItemId?: string | null;
  onFocusComplete?: () => void;
  getViewportCenterRef?: React.MutableRefObject<(() => { x: number; y: number }) | null>;
  goHomeRef?: React.MutableRefObject<(() => void) | null>;
}

const CARD_WIDTH = 260;
const CARD_HEIGHT = 180;
const MIN_CARD_WIDTH = 120;
const MAX_CARD_WIDTH = 500;
const MIN_CARD_HEIGHT = 80;
const MAX_CARD_HEIGHT = 400;
const MIN_SKIN_TIGHT_WIDTH = 180; // Prevent ultra-narrow notes after AI rewrite
const MIN_ITEM_SCALE = 0.3;
const MAX_ITEM_SCALE = 3.0;
// Clamp zoom for iPhone usability + stability
const MIN_ZOOM = 0.15;
const MAX_ZOOM = 5.0;
const ZOOM_SENSITIVITY = 0.003;
const DRAG_THRESHOLD = 8; // Pixels moved before considered a drag
const RESIZE_HANDLE_SIZE = 24;
const MAGNETIC_SNAP_DISTANCE = 12; // Pixels proximity to trigger magnetic snap

export function FreeformCanvas({ items, onDeleteItem, onUpdatePosition, onEditItem, focusItemId, onFocusComplete, getViewportCenterRef, goHomeRef }: FreeformCanvasProps) {
  const [positions, setPositions] = useState<Record<string, Position>>({});
  const [dragging, setDragging] = useState<string | null>(null);
  const [draggedWidth, setDraggedWidth] = useState<number | null>(null); // Store width during drag
  const [hasDragged, setHasDragged] = useState(false); // Track if actual drag motion occurred
  // Locked widths for skin-tight notes - prevents reflow during drag and at canvas edges
  const [lockedWidths, setLockedWidths] = useState<Record<string, number>>({});
  const [selectedItem, setSelectedItem] = useState<string | null>(null); // For showing delete on tap
  const [maxZ, setMaxZ] = useState(1);
  const initializedRef = useRef(false);
  const hasAutoHomedRef = useRef(false);
  const [editingItem, setEditingItem] = useState<Item | null>(null);
  const [newlyAddedItems, setNewlyAddedItems] = useState<Set<string>>(new Set());
  const [resizingItem, setResizingItem] = useState<string | null>(null);
  const [resizeCorner, setResizeCorner] = useState<'br' | 'bl' | 'tr' | 'tl' | null>(null);
  const [pinchingItem, setPinchingItem] = useState<string | null>(null);
  const [longPressItem, setLongPressItem] = useState<string | null>(null);
  const longPressTimerRef = useRef<number | null>(null);
  
  const prefersReducedMotion = useReducedMotion();
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Map<string, HTMLDivElement>>(new Map()); // Track DOM refs for width measurement
  const dragOffset = useRef({ x: 0, y: 0 });
  const dragStartPos = useRef({ x: 0, y: 0 }); // Track initial position for threshold
  const resizeStartRef = useRef<{
    itemId: string;
    startWidth: number;
    startHeight: number;
    startX: number;
    startY: number;
    startPosX: number;
    startPosY: number;
    corner: 'br' | 'bl' | 'tr' | 'tl';
  } | null>(null);
  const itemPinchPointersRef = useRef(new Map<number, { x: number; y: number }>());
  const itemPinchStateRef = useRef<{
    itemId: string;
    startDist: number;
    startScale: number;
  } | null>(null);

  const {
    viewportRef,
    isInteracting: isCanvasInteracting,
    bind: canvasBind,
    setViewport,
    animateToViewport,
    cancelInertia,
  } = useCanvasViewportGestures({
    containerRef,
    contentRef,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    zoomSensitivity: ZOOM_SENSITIVITY,
    dragThresholdPx: DRAG_THRESHOLD,
  });

  const isInteracting = isCanvasInteracting || dragging !== null || resizingItem !== null || pinchingItem !== null;

  // Expose method to get viewport center in canvas coordinates
  const getViewportCenter = useCallback((): { x: number; y: number } => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const vp = viewportRef.current;
    // Convert screen center to canvas coordinates
    const centerX = (rect.width / 2 - vp.x) / vp.zoom;
    const centerY = (rect.height / 2 - vp.y) / vp.zoom;
    // Offset to place item center at viewport center
    return { 
      x: centerX - CARD_WIDTH / 2,
      y: centerY - CARD_HEIGHT / 2
    };
  }, [viewportRef]);

  // Expose the method via ref for parent to call
  useEffect(() => {
    if (getViewportCenterRef) {
      getViewportCenterRef.current = getViewportCenter;
    }
    return () => {
      if (getViewportCenterRef) {
        getViewportCenterRef.current = null;
      }
    };
  }, [getViewportCenter, getViewportCenterRef]);

  // Go home: center viewport on the bounding box center of all items
  const goHome = useCallback(() => {
    if (!containerRef.current) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const containerW = rect.width;
    const containerH = rect.height;
    
    // Compute bounding box of all items
    const itemPositions = Object.entries(positions);
    if (itemPositions.length === 0) {
      animateToViewport({ x: containerW / 2, y: containerH / 2, zoom: 1 }, 300);
      return;
    }
    
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    for (const [itemId, pos] of itemPositions) {
      const item = items.find(i => i.id === itemId);
      if (!item) continue;
      
      const width = (pos as Position).width || CARD_WIDTH;
      const height = (pos as Position).height || CARD_HEIGHT;
      
      minX = Math.min(minX, pos.x);
      minY = Math.min(minY, pos.y);
      maxX = Math.max(maxX, pos.x + width);
      maxY = Math.max(maxY, pos.y + height);
    }
    
    // Add padding around the bounding box
    const padding = 40;
    const boundsW = maxX - minX + padding * 2;
    const boundsH = maxY - minY + padding * 2;
    
    // Calculate zoom to fit all items with some breathing room
    const zoomX = containerW / boundsW;
    const zoomY = containerH / boundsH;
    const zoom = Math.min(Math.max(MIN_ZOOM, Math.min(zoomX, zoomY)), MAX_ZOOM);
    
    // Center on bounding box
    const boundsCenterX = (minX + maxX) / 2;
    const boundsCenterY = (minY + maxY) / 2;
    const targetX = containerW / 2 - boundsCenterX * zoom;
    const targetY = containerH / 2 - boundsCenterY * zoom;
    
    animateToViewport({ x: targetX, y: targetY, zoom }, 300);
  }, [positions, items, animateToViewport, viewportRef]);

  // Expose goHome via ref for parent to call
  useEffect(() => {
    if (goHomeRef) {
      goHomeRef.current = goHome;
    }
    return () => {
      if (goHomeRef) {
        goHomeRef.current = null;
      }
    };
  }, [goHome, goHomeRef]);

  // Find an empty spot on the canvas that doesn't overlap with existing items
  const findEmptySpot = useCallback((existingPositions: Record<string, Position>): { x: number; y: number } => {
    // Use viewport center as preferred spawn point
    return getViewportCenter();
  }, [getViewportCenter]);

  // Initialize positions for new items
  useEffect(() => {
   // Calculate initial maxZ from items on first load
   if (!initializedRef.current && items.length > 0) {
     const existingMaxZ = Math.max(1, ...items.map(i => i.canvasZ ?? 0));
     setMaxZ(existingMaxZ);
     initializedRef.current = true;
   }
   
    setPositions(prev => {
      const newPositions = { ...prev };
      let changed = false;
      const newItemIds: string[] = [];
     let highestZ = initializedRef.current ? Math.max(1, ...Object.values(prev).map(p => p.z)) : 1;
      
      items.forEach((item) => {
        if (!newPositions[item.id]) {
          // Use saved position from database if available
          if (item.canvasX !== undefined && item.canvasY !== undefined) {
            const itemZ = item.canvasZ ?? highestZ + 1;
            if (itemZ > highestZ) highestZ = itemZ;
            newPositions[item.id] = {
              x: item.canvasX,
              y: item.canvasY,
              z: itemZ,
              scale: item.canvasScale ?? 1,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
            };
            changed = true;
          } else {
            // Find empty spot for new items without saved position
            highestZ += 1;
            const emptySpot = findEmptySpot(newPositions);
            newPositions[item.id] = {
              x: emptySpot.x,
              y: emptySpot.y,
              z: highestZ,
              scale: 1,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
            };
            changed = true;
            newItemIds.push(item.id);
          }
        }
      });
      
      if (changed) {
        setMaxZ(highestZ);
        // Mark new items for entrance animation
        if (newItemIds.length > 0) {
          setNewlyAddedItems(prev => {
            const next = new Set(prev);
            newItemIds.forEach(id => next.add(id));
            return next;
          });
          // Clear the "newly added" status after animation completes
          setTimeout(() => {
            setNewlyAddedItems(prev => {
              const next = new Set(prev);
              newItemIds.forEach(id => next.delete(id));
              return next;
            });
          }, 400);
        }
        return newPositions;
      }
      return prev;
    });
  }, [items, findEmptySpot]);

  // Measure and lock widths for skin-tight notes after they render
  // This prevents text squeezing when notes are dragged to canvas edges
  // Build a content fingerprint map so we detect when item text changes
  const contentFingerprints = useMemo(() => {
    const map: Record<string, string> = {};
    items.forEach(item => {
      const textBlock = item.blocks?.find(b => b.type === 'text');
      const text = textBlock?.type === 'text' ? textBlock.content : item.content;
      map[item.id] = `${item.title || ''}|${text || ''}`;
    });
    return map;
  }, [items]);

  // When content changes, clear the locked width so it gets re-measured
  const prevFingerprintsRef = useRef<Record<string, string>>({});
  useEffect(() => {
    const prev = prevFingerprintsRef.current;
    const idsToReset: string[] = [];
    for (const id in contentFingerprints) {
      if (prev[id] && prev[id] !== contentFingerprints[id]) {
        idsToReset.push(id);
      }
    }
    if (idsToReset.length > 0) {
      setLockedWidths(p => {
        const next = { ...p };
        idsToReset.forEach(id => delete next[id]);
        return next;
      });
    }
    prevFingerprintsRef.current = contentFingerprints;
  }, [contentFingerprints]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setLockedWidths(prev => {
        const newWidths = { ...prev };
        let changed = false;
        
        itemRefs.current.forEach((element, itemId) => {
          // Only measure if we don't already have a locked width
          if (!newWidths[itemId]) {
            const computedWidth = element.getBoundingClientRect().width / viewportRef.current.zoom;
            if (computedWidth > 0) {
              newWidths[itemId] = computedWidth;
              changed = true;
            }
          }
        });
        
        return changed ? newWidths : prev;
      });
    }, 50); // Small delay to ensure DOM is rendered
    
    return () => clearTimeout(timer);
  }, [items, viewportRef]);

  // Center viewport on a specific item
  const centerOnItem = useCallback((itemId: string) => {
    if (!containerRef.current) return;
    
    const pos = positions[itemId];
    if (!pos) return;
    
    const rect = containerRef.current.getBoundingClientRect();
    const containerCenterX = rect.width / 2;
    const containerCenterY = rect.height / 2;
    
    // Calculate offset to center the item (accounting for card size)
    const itemCenterX = pos.x + CARD_WIDTH / 2;
    const itemCenterY = pos.y + CARD_HEIGHT / 2;

    const zoom = viewportRef.current.zoom;
    setViewport({
      x: containerCenterX - itemCenterX * zoom,
      y: containerCenterY - itemCenterY * zoom,
      zoom,
    });
  }, [positions, setViewport, viewportRef]);

  // Focus on item when focusItemId changes
  useEffect(() => {
    if (focusItemId && positions[focusItemId]) {
      // Small delay to ensure position is set
      const timer = setTimeout(() => {
        centerOnItem(focusItemId);
        onFocusComplete?.();
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [focusItemId, positions, centerOnItem, onFocusComplete]);

  const handleWheel = useCallback(
    (e: React.WheelEvent) => {
      if (dragging) return;
      canvasBind.onWheel(e);
    },
    [canvasBind, dragging]
  );

  // Handle resize handle pointer down
  const handleResizePointerDown = useCallback((e: React.PointerEvent, itemId: string, corner: 'br' | 'bl' | 'tr' | 'tl') => {
    e.preventDefault();
    e.stopPropagation();
    
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    const pos = positions[itemId] || { x: 0, y: 0, z: 1, scale: 1, width: CARD_WIDTH, height: CARD_HEIGHT };
    
    resizeStartRef.current = {
      itemId,
      startWidth: pos.width || CARD_WIDTH,
      startHeight: pos.height || CARD_HEIGHT,
      startX: e.clientX,
      startY: e.clientY,
      startPosX: pos.x,
      startPosY: pos.y,
      corner,
    };
    
    setResizingItem(itemId);
    setResizeCorner(corner);
    cancelInertia();
  }, [positions, cancelInertia]);

  // Handle resize pointer move
  const handleResizePointerMove = useCallback((e: React.PointerEvent) => {
    if (!resizeStartRef.current || !resizingItem) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const vp = viewportRef.current;
    const ref = resizeStartRef.current;
    
    // Calculate delta in canvas coordinates
    const dx = (e.clientX - ref.startX) / vp.zoom;
    const dy = (e.clientY - ref.startY) / vp.zoom;
    
    let newWidth = ref.startWidth;
    let newHeight = ref.startHeight;
    let newX = ref.startPosX;
    let newY = ref.startPosY;
    
    // Apply delta based on corner
    switch (ref.corner) {
      case 'br':
        newWidth = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, ref.startWidth + dx));
        newHeight = Math.min(MAX_CARD_HEIGHT, Math.max(MIN_CARD_HEIGHT, ref.startHeight + dy));
        break;
      case 'bl':
        newWidth = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, ref.startWidth - dx));
        newHeight = Math.min(MAX_CARD_HEIGHT, Math.max(MIN_CARD_HEIGHT, ref.startHeight + dy));
        newX = ref.startPosX + (ref.startWidth - newWidth);
        break;
      case 'tr':
        newWidth = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, ref.startWidth + dx));
        newHeight = Math.min(MAX_CARD_HEIGHT, Math.max(MIN_CARD_HEIGHT, ref.startHeight - dy));
        newY = ref.startPosY + (ref.startHeight - newHeight);
        break;
      case 'tl':
        newWidth = Math.min(MAX_CARD_WIDTH, Math.max(MIN_CARD_WIDTH, ref.startWidth - dx));
        newHeight = Math.min(MAX_CARD_HEIGHT, Math.max(MIN_CARD_HEIGHT, ref.startHeight - dy));
        newX = ref.startPosX + (ref.startWidth - newWidth);
        newY = ref.startPosY + (ref.startHeight - newHeight);
        break;
    }
    
    setPositions(prev => ({
      ...prev,
      [ref.itemId]: { 
        ...prev[ref.itemId], 
        width: newWidth, 
        height: newHeight,
        x: newX,
        y: newY,
      },
    }));
  }, [resizingItem, viewportRef]);

  // Handle resize pointer up
  const handleResizePointerUp = useCallback((e: React.PointerEvent) => {
    if (!resizeStartRef.current) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    
    // Save the resized dimensions
    const itemId = resizeStartRef.current.itemId;
    const pos = positions[itemId];
    if (pos && onUpdatePosition) {
      // Store scale as width ratio for persistence
      const scaleFromWidth = (pos.width || CARD_WIDTH) / CARD_WIDTH;
      onUpdatePosition(itemId, { x: pos.x, y: pos.y, z: pos.z, scale: scaleFromWidth });
    }
      
    resizeStartRef.current = null;
    setResizingItem(null);
    setResizeCorner(null);
  }, [positions, onUpdatePosition]);

  // Helper to check if item is an image
  const isImageItem = useCallback((item: Item): boolean => {
    const mediaBlock = item.blocks?.find(b => b.type === 'media');
    if (mediaBlock && mediaBlock.type === 'media' && mediaBlock.mediaType === 'image') {
      return true;
    }
    // Legacy support
    if (item.type === 'image' || item.thumbnail) {
      return true;
    }
    return false;
  }, []);

  // Handle pinch-to-resize for all items (notes, images, etc.)
  const handleItemPinchPointerDown = useCallback((e: React.PointerEvent, itemId: string, currentScale: number) => {
    // Only track touch pointers for pinch
    if (e.pointerType !== 'touch') return false;

    itemPinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // If we now have 2 pointers on this item, start pinch
    if (itemPinchPointersRef.current.size === 2) {
      const pts = Array.from(itemPinchPointersRef.current.values());
      const startDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      itemPinchStateRef.current = {
        itemId,
        startDist,
        startScale: currentScale,
      };
      setPinchingItem(itemId);
      cancelInertia();
      return true;
    }

    return false;
  }, [cancelInertia]);

  const handleItemPinchPointerMove = useCallback((e: React.PointerEvent) => {
    if (!itemPinchPointersRef.current.has(e.pointerId)) return false;
    if (!itemPinchStateRef.current) return false;

    itemPinchPointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Only handle if we have 2 pointers
    if (itemPinchPointersRef.current.size === 2) {
      e.preventDefault();
      e.stopPropagation();

      const pts = Array.from(itemPinchPointersRef.current.values());
      const currentDist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      const ratio = currentDist / Math.max(1, itemPinchStateRef.current.startDist);
      const newScale = Math.min(MAX_ITEM_SCALE, Math.max(MIN_ITEM_SCALE, itemPinchStateRef.current.startScale * ratio));

      const itemId = itemPinchStateRef.current.itemId;
      setPositions(prev => ({
        ...prev,
        [itemId]: { ...prev[itemId], scale: newScale },
      }));

      return true;
    }

    return false;
  }, []);

  const handleItemPinchPointerUp = useCallback((e: React.PointerEvent) => {
    if (!itemPinchPointersRef.current.has(e.pointerId)) return false;

    const wasPinching = pinchingItem !== null;
    const itemId = itemPinchStateRef.current?.itemId;

    itemPinchPointersRef.current.delete(e.pointerId);

    // If we were pinching and now have less than 2 pointers, end pinch
    if (itemPinchPointersRef.current.size < 2 && wasPinching && itemId) {
      const pos = positions[itemId];
      if (pos && onUpdatePosition) {
        onUpdatePosition(itemId, { x: pos.x, y: pos.y, z: pos.z, scale: pos.scale });
      }
      setPinchingItem(null);
      itemPinchStateRef.current = null;
      return true;
    }

    if (itemPinchPointersRef.current.size === 0) {
      setPinchingItem(null);
      itemPinchStateRef.current = null;
    }

    return wasPinching;
  }, [pinchingItem, positions, onUpdatePosition]);

  const handleItemPinchPointerCancel = useCallback((e: React.PointerEvent) => {
    if (itemPinchPointersRef.current.has(e.pointerId)) {
      itemPinchPointersRef.current.delete(e.pointerId);
    }
    if (itemPinchPointersRef.current.size === 0) {
      setPinchingItem(null);
      itemPinchStateRef.current = null;
    }
  }, []);

  // Handle pointer down for item dragging
  const handleItemPointerDown = useCallback((e: React.PointerEvent, itemId: string) => {
    // Ignore if clicking delete button
    if ((e.target as HTMLElement).closest('[data-delete-button]')) return;
    
    // Handle pinch gesture for any item
    if (e.pointerType === 'touch') {
      const pos = positions[itemId] || { x: 0, y: 0, z: 1, scale: 1 };
      const started = handleItemPinchPointerDown(e, itemId, pos.scale ?? 1);
      if (started) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }

    // Stop propagation immediately to prevent canvas from picking up this pointer
    e.preventDefault();
    e.stopPropagation();
    
    // Capture the current rendered width of the element to prevent reflow during drag
    // Width is in canvas coordinates (already scaled by zoom at container level)
    const itemElement = (e.currentTarget as HTMLElement);
    const computedStyle = window.getComputedStyle(itemElement);
    const currentWidth = parseFloat(computedStyle.width);
    setDraggedWidth(currentWidth);
   
    // Capture pointer for smooth dragging
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    
    setDragging(itemId);
    setHasDragged(false);
    
    // Start long-press timer for "important" toggle (400ms)
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    longPressTimerRef.current = window.setTimeout(() => {
      // Toggle important state on long press
      const currentItem = items.find(i => i.id === itemId);
      if (currentItem && onEditItem) {
        const isCurrentlyImportant = currentItem.color === 'important';
        onEditItem({ ...currentItem, color: isCurrentlyImportant ? undefined : 'important' });
        setLongPressItem(itemId);
        // Vibrate for feedback if available
        if (navigator.vibrate) {
          navigator.vibrate(50);
        }
      }
    }, 400);
    
    // Stop any canvas momentum so item dragging feels deterministic.
    cancelInertia();
    
    // Store initial position for threshold detection
    dragStartPos.current = { x: e.clientX, y: e.clientY };
    
    const pos = positions[itemId] || { x: 0, y: 0, z: 1, scale: 1 };
    const rect = containerRef.current?.getBoundingClientRect();
    const vp = viewportRef.current;
    
    // Account for zoom when calculating drag offset
    dragOffset.current = {
      x: (e.clientX - (rect?.left || 0) - vp.x) / vp.zoom - pos.x,
      y: (e.clientY - (rect?.top || 0) - vp.y) / vp.zoom - pos.y,
    };
  
    // Bring to front
    setMaxZ(prev => {
      const newZ = prev + 1;
      setPositions(p => ({
        ...p,
        [itemId]: { ...p[itemId], z: newZ },
      }));
      return newZ;
    });
  }, [positions, cancelInertia, viewportRef, items, handleItemPinchPointerDown, onEditItem]);

  // Handle pointer move for item dragging
  const handleItemPointerMove = useCallback((e: React.PointerEvent) => {
    // Check if we're handling an image pinch gesture
    if (handleItemPinchPointerMove(e)) {
      return;
    }

    if (!dragging || !containerRef.current) return;
   
    e.preventDefault();
    e.stopPropagation();
    
    // Check if we've exceeded the drag threshold
    const dx = e.clientX - dragStartPos.current.x;
    const dy = e.clientY - dragStartPos.current.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    
    if (distance > DRAG_THRESHOLD) {
      setHasDragged(true);
      setSelectedItem(null); // Clear selection when dragging
      // Cancel long-press timer if we start dragging
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
    }
    
    const rect = containerRef.current.getBoundingClientRect();
    const vp = viewportRef.current;
    // Account for zoom when calculating new position
    let x = (e.clientX - rect.left - vp.x) / vp.zoom - dragOffset.current.x;
    let y = (e.clientY - rect.top - vp.y) / vp.zoom - dragOffset.current.y;

    // Magnetic snap to nearby items
    const draggedPos = positions[dragging];
    if (draggedPos) {
      const draggedW = (draggedPos as Position).width || CARD_WIDTH;
      const draggedH = (draggedPos as Position).height || CARD_HEIGHT;
      const draggedRight = x + draggedW;
      const draggedBottom = y + draggedH;

      for (const [otherId, otherPos] of Object.entries(positions)) {
        if (otherId === dragging) continue;
        const otherW = (otherPos as Position).width || CARD_WIDTH;
        const otherH = (otherPos as Position).height || CARD_HEIGHT;
        const otherRight = otherPos.x + otherW;
        const otherBottom = otherPos.y + otherH;

        // Snap left edge to other left/right edges
        if (Math.abs(x - otherPos.x) < MAGNETIC_SNAP_DISTANCE) x = otherPos.x;
        else if (Math.abs(x - otherRight) < MAGNETIC_SNAP_DISTANCE) x = otherRight;
        // Snap right edge to other left/right edges
        if (Math.abs(draggedRight - otherPos.x) < MAGNETIC_SNAP_DISTANCE) x = otherPos.x - draggedW;
        else if (Math.abs(draggedRight - otherRight) < MAGNETIC_SNAP_DISTANCE) x = otherRight - draggedW;

        // Snap top edge to other top/bottom edges
        if (Math.abs(y - otherPos.y) < MAGNETIC_SNAP_DISTANCE) y = otherPos.y;
        else if (Math.abs(y - otherBottom) < MAGNETIC_SNAP_DISTANCE) y = otherBottom;
        // Snap bottom edge to other top/bottom edges
        if (Math.abs(draggedBottom - otherPos.y) < MAGNETIC_SNAP_DISTANCE) y = otherPos.y - draggedH;
        else if (Math.abs(draggedBottom - otherBottom) < MAGNETIC_SNAP_DISTANCE) y = otherBottom - draggedH;
      }
    }

    setPositions(prev => ({
      ...prev,
      [dragging]: { ...prev[dragging], x, y },
    }));
  }, [dragging, viewportRef, handleItemPinchPointerMove]);

  // Handle pointer up for item dragging
  const handleItemPointerUp = useCallback((e: React.PointerEvent, itemId: string) => {
    // Clear long-press timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    
    // If long-press just triggered important toggle, don't process as tap
    const wasLongPress = longPressItem === itemId;
    setLongPressItem(null);
    
    // Check if we're ending an image pinch gesture
    if (handleItemPinchPointerUp(e)) {
      setDragging(null);
      setHasDragged(false);
      return;
    }

    e.preventDefault();
    e.stopPropagation();
   
    if (!dragging) return;
    
    // Release pointer capture
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
    
    // If we didn't actually drag and wasn't a long-press, treat as a tap to open edit modal
    if (!hasDragged && !wasLongPress) {
      // Find the item and open edit modal
      const itemToEdit = items.find(i => i.id === itemId);
      if (itemToEdit) {
        // Check if it's a pure note (editable) vs a link/media item
        const hasMedia = itemToEdit.blocks?.some(b => b.type === 'media');
        const legacyLinkUrl = itemToEdit.type === 'link' ? itemToEdit.url : undefined;
        const linkMedia = itemToEdit.blocks?.find(
          (b): b is MediaBlock => b.type === 'media' && b.mediaType === 'link' && !!b.url
        );
        const linkUrl: string | undefined = linkMedia?.url || legacyLinkUrl;
        const isLink = !!linkUrl;
        
        // If it's a link, open it immediately.
        // (The ItemCard is pointer-events-none inside the canvas, so clicks must be handled here.)
        if (isLink && linkUrl) {
          const opened = safeOpenUrl(linkUrl);
          if (!opened) {
            // If blocked/invalid, fall back to selection so user can still delete.
            setSelectedItem(prev => prev === itemId ? null : itemId);
          }
        } else if (!hasMedia && !isLink) {
          // Open edit modal for notes
          setEditingItem(itemToEdit);
        } else {
          // For links/media, just toggle selection for delete button
          setSelectedItem(prev => prev === itemId ? null : itemId);
        }
      }
    } else if (onUpdatePosition && !wasLongPress) {
      const pos = positions[dragging];
      if (pos) {
        onUpdatePosition(dragging, { x: pos.x, y: pos.y, z: pos.z, scale: pos.scale });
      }
    }
    
    setDragging(null);
    setDraggedWidth(null); // Clear the fixed width
    setHasDragged(false);
  }, [dragging, hasDragged, positions, onUpdatePosition, items, handleItemPinchPointerUp, longPressItem]);

  // Auto-center on items when canvas first loads (disabled — user prefers manual control)
  // useEffect(() => { ... goHome() ... }, []);

  if (items.length === 0) return null;

  return (
    <div className="relative w-full h-full">
      <div 
        ref={containerRef}
        className="relative w-full h-full overflow-hidden select-none canvas-background gpu-accelerated overscroll-none"
        style={{ 
          cursor: isCanvasInteracting ? 'grabbing' : 'default',
        touchAction: 'none',
        }}
        onWheel={handleWheel}
        onPointerDown={canvasBind.onPointerDown}
        onPointerMove={canvasBind.onPointerMove}
        onPointerUp={canvasBind.onPointerUp}
        onPointerCancel={canvasBind.onPointerCancel}
      >
        {/* Clean solid background */}
        <div className="absolute inset-0 pointer-events-none bg-background" />

        {/* Canvas content with viewport transform */}
        <div 
          ref={contentRef}
          className="absolute inset-0 origin-top-left gpu-accelerated"
        >
          <AnimatePresence mode="sync">
          {items.map((item) => {
            const pos = positions[item.id] || { x: 0, y: 0, z: 1, scale: 1 };
            const itemWidth = (pos as Position).width || CARD_WIDTH;
            const itemHeight = (pos as Position).height || CARD_HEIGHT;
            const isDraggingThis = dragging === item.id;
            const isResizingThis = resizingItem === item.id;
            const isNewlyAdded = newlyAddedItems.has(item.id);
            const isPinchingThis = pinchingItem === item.id;
            // Apply scale to all items via CSS transform
            const itemScale = pos.scale ?? 1;

            const isSkinTightNote =
              item.subCategory !== 'todo' &&
              item.subCategory !== 'scheduling' &&
              !item.scheduledDate &&
              !item.url &&
              (!!item.title?.trim() ||
                !!(item.blocks ?? []).find((b) => b.type === 'text' && !!b.content?.trim())) &&
              !(item.blocks ?? []).some(
                (b) => b.type === 'media' || b.type === 'list' || b.type === 'checklist'
              );
            
            const isSelected = selectedItem === item.id;
            
            // Disable animations during interactions for smoother performance
            const shouldAnimate = !isInteracting && !prefersReducedMotion;
            
            
            
            // Get locked width for skin-tight notes (prevents squeezing at canvas edges)
            const noteLockedWidth = isSkinTightNote ? lockedWidths[item.id] : undefined;
            // Use locked width if available, otherwise fall back to fit-content temporarily
            const effectiveWidth = isDraggingThis && draggedWidth !== null
              ? draggedWidth
              : isSkinTightNote
                ? (noteLockedWidth || 'fit-content')
                : itemWidth;
            
            return (
              <motion.div
                key={item.id}
                ref={(el) => {
                  // Store ref for width measurement
                  if (el && isSkinTightNote) {
                    itemRefs.current.set(item.id, el);
                  } else if (!el) {
                    itemRefs.current.delete(item.id);
                  }
                }}
                initial={isNewlyAdded && shouldAnimate ? { opacity: 0, scale: 0.8 } : false}
                animate={{ opacity: 1, scale: 1 }}
                exit={shouldAnimate ? { opacity: 0, scale: 0.8 } : undefined}
                transition={shouldAnimate ? { 
                  type: "tween", 
                  duration: 0.2,
                  ease: "easeOut"
                } : { duration: 0 }}
                className="absolute group"
                style={{
                  left: pos.x,
                  top: pos.y,
                  zIndex: pos.z,
                  width: effectiveWidth,
                  maxWidth: isSkinTightNote && !noteLockedWidth && !isDraggingThis ? 320 : undefined,
                  minWidth: isSkinTightNote ? Math.max(MIN_SKIN_TIGHT_WIDTH, noteLockedWidth || 0) : undefined,
                  height: isSkinTightNote ? 'auto' : undefined,
                  maxHeight: isSkinTightNote ? MAX_CARD_HEIGHT : undefined,
                  overflow: isSkinTightNote ? 'hidden' : undefined,
                  cursor: isDraggingThis || isResizingThis || isPinchingThis ? 'grabbing' : 'grab',
                  willChange: isDraggingThis || isResizingThis || isPinchingThis ? 'transform' : 'auto',
                  transformOrigin: 'top left',
                  transform: itemScale !== 1 ? `scale(${itemScale})` : undefined,
                  flexShrink: 0,
                  flexGrow: 0,
                }}
                onPointerDown={(e) => handleItemPointerDown(e, item.id)}
                onPointerMove={handleItemPointerMove}
                onPointerUp={(e) => handleItemPointerUp(e, item.id)}
                onPointerCancel={(e) => handleItemPointerUp(e, item.id)}
              >
                <div
                  className="pointer-events-none relative"
                  style={{
                    display: 'block',
                    width: isSkinTightNote ? (noteLockedWidth || 'fit-content') : '100%',
                    minWidth: isSkinTightNote ? Math.max(MIN_SKIN_TIGHT_WIDTH, noteLockedWidth || 0) : undefined,
                    maxWidth: isSkinTightNote && !noteLockedWidth ? 320 : undefined,
                    maxHeight: isSkinTightNote ? MAX_CARD_HEIGHT : undefined,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    overflowWrap: 'anywhere',
                  }}
                >
                  <ItemCard item={item} archiveMode />

                </div>
              </motion.div>
            );
          })}
          </AnimatePresence>
        </div>
      </div>

      {/* Edit Note Modal */}
      <EditNoteModal
        item={editingItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
      />
    </div>
  );
}