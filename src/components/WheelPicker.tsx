import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { motion, useMotionValue, animate } from 'framer-motion';

// ─────────────────────────────────────────────
// InfiniteWheelPicker – circular, no end stops
// ─────────────────────────────────────────────
interface WheelPickerProps {
  items: { value: string | number; label: string }[];
  value: string | number;
  onChange: (value: string | number) => void;
  itemHeight?: number;
  visibleItems?: number;
  className?: string;
  /** Values that have slight magnetic attraction when scrolling stops nearby */
  magneticValues?: (string | number)[];
  /** Items within this range of a magnetic value will snap to it (default 3) */
  magneticRange?: number;
}

// We tile the list N times so the user never sees an edge
const TILE_COUNT = 21; // odd number keeps a centre copy

export function WheelPicker({
  items,
  value,
  onChange,
  itemHeight = 40,
  visibleItems = 5,
  className = '',
  magneticValues,
  magneticRange = 3,
}: WheelPickerProps) {
  const n = items.length;

  // Infinitely tiled items
  const tiledItems = useMemo(() => {
    const result: { value: string | number; label: string; tileIndex: number }[] = [];
    for (let t = 0; t < TILE_COUNT; t++) {
      for (let i = 0; i < n; i++) {
        result.push({ ...items[i], tileIndex: t * n + i });
      }
    }
    return result;
  }, [items, n]);

  const totalItems = tiledItems.length;
  const centerTile = Math.floor(TILE_COUNT / 2); // middle tile index

  // Find which index in a tile corresponds to the current value
  const valueIndexInTile = useMemo(() => {
    const idx = items.findIndex((it) => it.value === value);
    return idx >= 0 ? idx : 0;
  }, [items, value]);

  // The "canonical" centre position – middle tile + value offset
  const canonicalIndex = centerTile * n + valueIndexInTile;

  const halfVisible = Math.floor(visibleItems / 2);
  const centerOffset = halfVisible * itemHeight;

  const y = useMotionValue(centerOffset - canonicalIndex * itemHeight);
  const currentIndexRef = useRef(canonicalIndex);

  const isDragging = useRef(false);
  const dragStartY = useRef(0);
  const dragStartMotionY = useRef(0);
  const velocityPoints = useRef<{ t: number; y: number }[]>([]);
  const animControls = useRef<ReturnType<typeof animate> | null>(null);

  // Convert a y position → nearest tiled index (accounting for center offset)
  const yToIndex = useCallback(
    (yVal: number) => Math.round((centerOffset - yVal) / itemHeight),
    [itemHeight, centerOffset]
  );

  // Snap to a tiled index, firing onChange when the real value changes
  const snapTo = useCallback(
    (tiledIdx: number, velocityPx = 0) => {
      const clamped = Math.max(0, Math.min(totalItems - 1, tiledIdx));
      const targetY = centerOffset - clamped * itemHeight;

      if (animControls.current) animControls.current.stop();
      animControls.current = animate(y, targetY, {
        type: 'spring',
        stiffness: 500,
        damping: 42,
        mass: 0.28,
        velocity: velocityPx,
      });

      currentIndexRef.current = clamped;
      const realIndex = clamped % n;
      if (items[realIndex]?.value !== value) {
        onChange(items[realIndex].value);
      }
    },
    [items, itemHeight, n, onChange, totalItems, value, y]
  );

  // External value change → jump smoothly to nearest equivalent position
  useEffect(() => {
    if (isDragging.current) return;
    const cur = currentIndexRef.current;
    // Find the closest tile copy of valueIndexInTile to current position
    const base = valueIndexInTile;
    let best = base;
    let bestDist = Infinity;
    for (let t = 0; t < TILE_COUNT; t++) {
      const idx = t * n + base;
      const dist = Math.abs(idx - cur);
      if (dist < bestDist) {
        bestDist = dist;
        best = idx;
      }
    }
    const targetY = centerOffset - best * itemHeight;
    if (Math.abs(y.get() - targetY) > 0.5) {
      if (animControls.current) animControls.current.stop();
      animControls.current = animate(y, targetY, {
        type: 'spring',
        stiffness: 400,
        damping: 35,
        mass: 0.5,
      });
      currentIndexRef.current = best;
    }
  }, [value, valueIndexInTile, itemHeight, n, y]);

  // ── Pointer handlers ──────────────────────────────────────
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    if (animControls.current) animControls.current.stop();
    isDragging.current = true;
    dragStartY.current = e.clientY;
    dragStartMotionY.current = y.get();
    velocityPoints.current = [{ t: performance.now(), y: e.clientY }];
  }, [y]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    const delta = e.clientY - dragStartY.current;
    y.set(dragStartMotionY.current + delta);

    const now = performance.now();
    velocityPoints.current.push({ t: now, y: e.clientY });
    if (velocityPoints.current.length > 6) velocityPoints.current.shift();
  }, [y]);

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    if (!isDragging.current) return;
    e.currentTarget.releasePointerCapture(e.pointerId);
    isDragging.current = false;

    // Compute velocity (px/s)
    const pts = velocityPoints.current;
    let velocity = 0;
    if (pts.length >= 2) {
      const dt = (pts[pts.length - 1].t - pts[0].t) / 1000;
      if (dt > 0) velocity = (pts[pts.length - 1].y - pts[0].y) / dt;
    }

    // Momentum project
    const momentumY = y.get() + velocity * 0.12;
    let targetIdx = yToIndex(momentumY);

    // Magnetic snapping: attract to special values when scrolling slowly
    if (magneticValues && magneticValues.length > 0 && Math.abs(velocity) < 600) {
      const realIdx = ((targetIdx % n) + n) % n;
      let closestDist = Infinity;
      let closestOffset = 0;
      for (const mv of magneticValues) {
        const mvIdx = items.findIndex((it) => it.value === mv);
        if (mvIdx < 0) continue;
        // Shortest-path distance on the circular list
        let dist = mvIdx - realIdx;
        if (dist > n / 2) dist -= n;
        if (dist < -n / 2) dist += n;
        if (Math.abs(dist) < closestDist) {
          closestDist = Math.abs(dist);
          closestOffset = dist;
        }
      }
      if (closestDist <= magneticRange) {
        targetIdx += closestOffset;
      }
    }

    snapTo(targetIdx, velocity * 0.4);
  }, [snapTo, y, yToIndex, magneticValues, magneticRange, items, n]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const cur = yToIndex(y.get());
    snapTo(cur + (e.deltaY > 0 ? -1 : 1));
  }, [snapTo, y, yToIndex]);

  // ── Render ────────────────────────────────────────────────
  // We only render a window of items around the current position
  // for performance, re-computing on y changes
  const [renderRange, setRenderRange] = useState({ start: 0, end: Math.min(totalItems - 1, canonicalIndex + 30) });
  const [visualCenter, setVisualCenter] = useState(canonicalIndex);

  useEffect(() => {
    const unsubscribe = y.on('change', (yVal: number) => {
      const center = yToIndex(yVal);
      const buffer = 20;
      setVisualCenter(center);
      setRenderRange({
        start: Math.max(0, center - buffer),
        end: Math.min(totalItems - 1, center + buffer),
      });
    });
    return unsubscribe;
  }, [y, yToIndex, totalItems]);

  return (
    <div
      className={`relative overflow-hidden select-none touch-none cursor-grab active:cursor-grabbing ${className}`}
      style={{ height: visibleItems * itemHeight }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      {/* Top fade */}
      <div
        className="absolute inset-x-0 top-0 z-10 pointer-events-none"
        style={{
          height: centerOffset,
          background: 'linear-gradient(to bottom, hsl(var(--card)) 10%, transparent 100%)',
        }}
      />
      {/* Bottom fade */}
      <div
        className="absolute inset-x-0 bottom-0 z-10 pointer-events-none"
        style={{
          height: centerOffset,
          background: 'linear-gradient(to top, hsl(var(--card)) 10%, transparent 100%)',
        }}
      />
      {/* Selection band */}
      <div
        className="absolute inset-x-2 z-10 pointer-events-none rounded-lg border border-border/60 bg-secondary/40"
        style={{ top: centerOffset, height: itemHeight }}
      />

      {/* Infinite scroll container */}
      <motion.div style={{ y }} className="will-change-transform absolute w-full top-0">
        {tiledItems.map((item, i) => {
          if (i < renderRange.start || i > renderRange.end) {
            return <div key={i} style={{ height: itemHeight }} />;
          }
          const isCentered = i === visualCenter;
          return (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{ height: itemHeight }}
            >
              <span
                className="tabular-nums transition-all duration-75"
                style={{
                  fontSize: isCentered ? '22px' : '18px',
                  fontWeight: isCentered ? 600 : 400,
                  color: isCentered
                    ? 'hsl(var(--foreground))'
                    : 'hsl(var(--muted-foreground) / 0.5)',
                  transform: isCentered ? 'scale(1.05)' : 'scale(1)',
                }}
              >
                {item.label}
              </span>
            </div>
          );
        })}
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────
// TimeWheelPicker – hours, minutes, AM/PM
// ─────────────────────────────────────────────
interface TimeWheelPickerProps {
  hour: number;
  minute: number;
  period: 'AM' | 'PM';
  onHourChange: (hour: number) => void;
  onMinuteChange: (minute: number) => void;
  onPeriodChange: (period: 'AM' | 'PM') => void;
  minuteStep?: number;
}

export function TimeWheelPicker({
  hour,
  minute,
  period,
  onHourChange,
  onMinuteChange,
  onPeriodChange,
  minuteStep = 1,
}: TimeWheelPickerProps) {
  const hours = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((h) => ({
    value: h,
    label: h.toString(),
  }));

  const minutes = Array.from({ length: 60 / minuteStep }, (_, i) => {
    const m = i * minuteStep;
    return { value: m, label: m.toString().padStart(2, '0') };
  });

  return (
    <div className="flex items-center justify-center gap-1 py-2 px-4 rounded-2xl bg-card">
      <WheelPicker
        items={hours}
        value={hour}
        onChange={(v) => onHourChange(v as number)}
        className="w-14"
        itemHeight={42}
        visibleItems={5}
      />
      <div className="text-xl font-bold text-foreground pb-0.5">:</div>
      <WheelPicker
        items={minutes}
        value={minute}
        onChange={(v) => onMinuteChange(v as number)}
        className="w-14"
        itemHeight={42}
        visibleItems={5}
        magneticValues={[0, 15, 30, 45]}
        magneticRange={3}
      />
      <div className="flex flex-col gap-1 ml-2">
        {(['AM', 'PM'] as const).map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => onPeriodChange(p)}
            className="px-3 py-1.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: period === p ? 'hsl(var(--foreground))' : 'transparent',
              color: period === p ? 'hsl(var(--background))' : 'hsl(var(--muted-foreground))',
            }}
          >
            {p}
          </button>
        ))}
      </div>
    </div>
  );
}
