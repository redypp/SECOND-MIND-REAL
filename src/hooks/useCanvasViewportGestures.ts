import type React from "react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

type Point = { x: number; y: number };

export type ViewportState = { x: number; y: number; zoom: number };

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}

function dist(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function getClientPoint(e: React.PointerEvent | PointerEvent): Point {
  return { x: (e as PointerEvent).clientX, y: (e as PointerEvent).clientY };
}

function isPrimaryButton(e: React.PointerEvent) {
  // For touch, button is always 0. For mouse, we only want left-click.
  return e.button === 0;
}

type Options = {
  containerRef: React.RefObject<HTMLElement>;
  contentRef: React.RefObject<HTMLElement>;
  minZoom: number;
  maxZoom: number;
  zoomSensitivity: number;
  dragThresholdPx: number;
};

type Bind = {
  onPointerDown: (e: React.PointerEvent) => void;
  onPointerMove: (e: React.PointerEvent) => void;
  onPointerUp: (e: React.PointerEvent) => void;
  onPointerCancel: (e: React.PointerEvent) => void;
  onWheel: (e: React.WheelEvent) => void;
};

export function useCanvasViewportGestures({
  containerRef,
  contentRef,
  minZoom,
  maxZoom,
  zoomSensitivity,
  dragThresholdPx,
}: Options): {
  viewportRef: React.MutableRefObject<ViewportState>;
  isInteracting: boolean;
  bind: Bind;
  setViewport: (next: ViewportState) => void;
  animateToViewport: (next: ViewportState, duration?: number) => void;
  zoomAtClientPoint: (nextZoom: number, clientX: number, clientY: number) => void;
  cancelInertia: () => void;
} {
  const viewportRef = useRef<ViewportState>({ x: 0, y: 0, zoom: 1 });
  const targetRef = useRef<ViewportState>(viewportRef.current);
  const rafRef = useRef<number | null>(null);
  const animationRafRef = useRef<number | null>(null);
  const inertiaRafRef = useRef<number | null>(null);

  const [isInteracting, setIsInteracting] = useState(false);
  const isInteractingRef = useRef(false);

  const pointersRef = useRef(new Map<number, Point>());

  const modeRef = useRef<"none" | "pan" | "pinch">("none");

  const panCandidateRef = useRef<{
    start: Point;
    startViewport: ViewportState;
  } | null>(null);

  const pinchRef = useRef<{
    startDist: number;
    startZoom: number;
    anchorContent: Point; // world point that stays under fingers
  } | null>(null);

  const velocityRef = useRef({ vx: 0, vy: 0, lastX: 0, lastY: 0, lastT: 0 });

  const applyTransform = useCallback(() => {
    rafRef.current = null;
    const el = contentRef.current;
    if (!el) return;
    const v = targetRef.current;

    // Avoid micro-jitter by snapping very small changes.
    const x = Math.abs(v.x) < 0.001 ? 0 : v.x;
    const y = Math.abs(v.y) < 0.001 ? 0 : v.y;
    const z = Number(v.zoom.toFixed(4));

    el.style.transformOrigin = "0 0";
    el.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z})`;
    el.style.willChange = isInteractingRef.current ? "transform" : "auto";
  }, [contentRef]);

  const scheduleApply = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(applyTransform);
  }, [applyTransform]);

  const setViewport = useCallback(
    (next: ViewportState) => {
      viewportRef.current = next;
      targetRef.current = next;
      scheduleApply();
    },
    [scheduleApply]
  );

  const cancelInertia = useCallback(() => {
    if (inertiaRafRef.current !== null) {
      cancelAnimationFrame(inertiaRafRef.current);
      inertiaRafRef.current = null;
    }
    if (animationRafRef.current !== null) {
      cancelAnimationFrame(animationRafRef.current);
      animationRafRef.current = null;
    }
    velocityRef.current.vx = 0;
    velocityRef.current.vy = 0;
  }, []);

  // Smoothly animate viewport to a target position with easing
  const animateToViewport = useCallback(
    (target: ViewportState, duration: number = 300) => {
      cancelInertia();
      
      const start = { ...viewportRef.current };
      const startTime = performance.now();
      
      const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);
      
      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(1, elapsed / duration);
        const eased = easeOutCubic(progress);
        
        const next: ViewportState = {
          x: start.x + (target.x - start.x) * eased,
          y: start.y + (target.y - start.y) * eased,
          zoom: start.zoom + (target.zoom - start.zoom) * eased,
        };
        
        setViewport(next);
        
        if (progress < 1) {
          animationRafRef.current = requestAnimationFrame(animate);
        } else {
          animationRafRef.current = null;
        }
      };
      
      animationRafRef.current = requestAnimationFrame(animate);
    },
    [cancelInertia, setViewport]
  );

  const setInteracting = useCallback((next: boolean) => {
    isInteractingRef.current = next;
    setIsInteracting(next);
    // Update willChange immediately
    scheduleApply();
  }, [scheduleApply]);

  const clientToLocal = useCallback(
    (client: Point): Point | null => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      return { x: client.x - rect.left, y: client.y - rect.top };
    },
    [containerRef]
  );

  const localToWorld = useCallback(
    (local: Point, v: ViewportState): Point => {
      return { x: (local.x - v.x) / v.zoom, y: (local.y - v.y) / v.zoom };
    },
    []
  );

  const zoomAtClientPoint = useCallback(
    (nextZoom: number, clientX: number, clientY: number) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;

      const pointLocal = { x: clientX - rect.left, y: clientY - rect.top };
      const prev = viewportRef.current;
      const z = clamp(nextZoom, minZoom, maxZoom);

      const world = localToWorld(pointLocal, prev);
      const next: ViewportState = {
        zoom: z,
        x: pointLocal.x - world.x * z,
        y: pointLocal.y - world.y * z,
      };
      setViewport(next);
    },
    [containerRef, localToWorld, maxZoom, minZoom, setViewport]
  );

  const startInertia = useCallback(() => {
    const speed = Math.hypot(velocityRef.current.vx, velocityRef.current.vy);
    if (speed < 0.02) return;
    cancelInertia();

    let lastT = performance.now();

    const step = () => {
      const now = performance.now();
      const dt = Math.min(32, now - lastT); // clamp for tab-switch / stutter
      lastT = now;

      const v = viewportRef.current;
      let vx = velocityRef.current.vx;
      let vy = velocityRef.current.vy;

      // Exponential decay tuned for subtle momentum.
      const decay = Math.pow(0.92, dt / 16.67);
      vx *= decay;
      vy *= decay;

      const next: ViewportState = {
        ...v,
        x: v.x + vx * dt,
        y: v.y + vy * dt,
      };

      velocityRef.current.vx = vx;
      velocityRef.current.vy = vy;
      setViewport(next);

      if (Math.hypot(vx, vy) < 0.02) {
        inertiaRafRef.current = null;
        setInteracting(false);
        return;
      }
      inertiaRafRef.current = requestAnimationFrame(step);
    };

    setInteracting(true);
    inertiaRafRef.current = requestAnimationFrame(step);
  }, [cancelInertia, setInteracting, setViewport]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // Only primary button / touch
      if (!isPrimaryButton(e)) return;

      // If the event originates from a fixed header element (e.g. back button),
      // do NOT capture it — let it bubble normally so click events fire.
      const target = e.target as HTMLElement;
      if (target.closest('header')) return;

      cancelInertia();

      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, getClientPoint(e));

      // If we now have 2 pointers, start pinch immediately.
      if (pointersRef.current.size === 2) {
        // Stop any single-finger pan candidate
        panCandidateRef.current = null;

        const pts = Array.from(pointersRef.current.values());
        const a = pts[0];
        const b = pts[1];
        const mid = midpoint(a, b);
        const local = clientToLocal(mid);
        if (!local) return;
        const v = viewportRef.current;
        const anchorContent = localToWorld(local, v);
        pinchRef.current = {
          startDist: dist(a, b),
          startZoom: v.zoom,
          anchorContent,
        };
        modeRef.current = "pinch";
        panCandidateRef.current = null;
        setInteracting(true);
        return;
      }

      // Otherwise begin as a pan candidate (won't actually pan until threshold).
      const p = getClientPoint(e);
      panCandidateRef.current = {
        start: p,
        startViewport: viewportRef.current,
      };
      modeRef.current = "none";
      setInteracting(false);
    },
    [cancelInertia, clientToLocal, localToWorld, setInteracting]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;

      // When we handle gestures, prevent scroll/back-swipe/selection.
      e.preventDefault();

      pointersRef.current.set(e.pointerId, getClientPoint(e));

      // Pinch mode if 2 pointers.
      if (pointersRef.current.size === 2) {
        const pts = Array.from(pointersRef.current.values());
        const a = pts[0];
        const b = pts[1];
        const mid = midpoint(a, b);
        const local = clientToLocal(mid);
        if (!local) return;

        if (!pinchRef.current) {
          // Initialize pinch if second finger was added mid-gesture.
          const v = viewportRef.current;
          pinchRef.current = {
            startDist: dist(a, b),
            startZoom: v.zoom,
            anchorContent: localToWorld(local, v),
          };
        }

        modeRef.current = "pinch";
        setInteracting(true);

        const pr = pinchRef.current;
        const ratio = dist(a, b) / Math.max(1, pr.startDist);
        const nextZoom = clamp(pr.startZoom * ratio, minZoom, maxZoom);

        const next: ViewportState = {
          zoom: nextZoom,
          x: local.x - pr.anchorContent.x * nextZoom,
          y: local.y - pr.anchorContent.y * nextZoom,
        };

        viewportRef.current = next;
        targetRef.current = next;
        scheduleApply();
        return;
      }

      // Single-pointer pan.
      const v = viewportRef.current;
      const candidate = panCandidateRef.current;
      if (!candidate) return;

      const p = getClientPoint(e);
      const dx = p.x - candidate.start.x;
      const dy = p.y - candidate.start.y;
      const d = Math.hypot(dx, dy);

      if (modeRef.current !== "pan") {
        if (d < dragThresholdPx) return;
        modeRef.current = "pan";
        setInteracting(true);
        velocityRef.current.lastT = performance.now();
        velocityRef.current.lastX = p.x;
        velocityRef.current.lastY = p.y;
        velocityRef.current.vx = 0;
        velocityRef.current.vy = 0;
      }

      const next: ViewportState = {
        ...v,
        x: candidate.startViewport.x + dx,
        y: candidate.startViewport.y + dy,
      };

      // Velocity for inertia.
      const now = performance.now();
      const dt = Math.max(1, now - velocityRef.current.lastT);
      const instVx = (p.x - velocityRef.current.lastX) / dt;
      const instVy = (p.y - velocityRef.current.lastY) / dt;
      velocityRef.current.vx = velocityRef.current.vx * 0.8 + instVx * 0.2;
      velocityRef.current.vy = velocityRef.current.vy * 0.8 + instVy * 0.2;
      velocityRef.current.lastT = now;
      velocityRef.current.lastX = p.x;
      velocityRef.current.lastY = p.y;

      viewportRef.current = next;
      targetRef.current = next;
      scheduleApply();
    },
    [
      clientToLocal,
      dragThresholdPx,
      localToWorld,
      maxZoom,
      minZoom,
      scheduleApply,
      setInteracting,
    ]
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;

      pointersRef.current.delete(e.pointerId);

      // If we were pinching and now only 1 finger remains, reset to pan-candidate to avoid jumps.
      if (pointersRef.current.size === 1) {
        pinchRef.current = null;
        modeRef.current = "none";
        const remaining = Array.from(pointersRef.current.values())[0];
        panCandidateRef.current = {
          start: remaining,
          startViewport: viewportRef.current,
        };
        setInteracting(false);
        return;
      }

      if (pointersRef.current.size === 0) {
        (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);

        const wasPanning = modeRef.current === "pan";
        modeRef.current = "none";
        pinchRef.current = null;
        panCandidateRef.current = null;

        if (wasPanning) {
          startInertia();
        } else {
          setInteracting(false);
        }
      }
    },
    [setInteracting, startInertia]
  );

  const onPointerCancel = useCallback(
    (e: React.PointerEvent) => {
      if (!pointersRef.current.has(e.pointerId)) return;
      pointersRef.current.delete(e.pointerId);
      pinchRef.current = null;
      panCandidateRef.current = null;
      modeRef.current = "none";
      setInteracting(false);
    },
    [setInteracting]
  );

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      e.preventDefault();
      cancelInertia();

      const v = viewportRef.current;
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * zoomSensitivity;
        const nextZoom = v.zoom * (1 + delta);
        zoomAtClientPoint(nextZoom, e.clientX, e.clientY);
      } else {
        setViewport({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY });
      }
    },
    [cancelInertia, setViewport, zoomAtClientPoint, zoomSensitivity]
  );

  // Initial paint + keep style in sync when mount refs resolve.
  useLayoutEffect(() => {
    scheduleApply();
  }, [scheduleApply]);

  // Cleanup RAFs
  useEffect(() => {
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      if (inertiaRafRef.current !== null) cancelAnimationFrame(inertiaRafRef.current);
    };
  }, []);

  return {
    viewportRef,
    isInteracting,
    bind: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onWheel,
    },
    setViewport,
    animateToViewport,
    zoomAtClientPoint,
    cancelInertia,
  };
}
