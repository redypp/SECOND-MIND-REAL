import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

/**
 * BackToHome — global back affordances.
 *
 * 1. Small fixed top-left arrow that returns to "/". Hidden on routes that
 *    already render their own top-left back button so we don't stack two
 *    arrows in the same corner.
 *
 * 2. Edge-swipe gesture: drag from the left edge of the screen rightward to
 *    exit the current page (history-back, with "/" as fallback when there's
 *    nothing in history). Hidden on "/" itself and on /space/:id which has
 *    its own swipe-back gesture targeting /archive.
 */

const ARROW_SKIP_PREFIXES = ['/space/', '/item/'];
const ARROW_SKIP_EXACT = new Set(['/', '/settings', '/notifications', '/people']);

const SWIPE_SKIP_PREFIXES = ['/space/'];
const SWIPE_SKIP_EXACT = new Set(['/']);

const EDGE_ZONE_PX = 28;
const SWIPE_THRESHOLD_PX = 80;
const VERTICAL_TOLERANCE_PX = 24;

export function BackToHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  const showArrow =
    !ARROW_SKIP_EXACT.has(path) && !ARROW_SKIP_PREFIXES.some(p => path.startsWith(p));
  const enableSwipe =
    !SWIPE_SKIP_EXACT.has(path) && !SWIPE_SKIP_PREFIXES.some(p => path.startsWith(p));

  const [swipeProgress, setSwipeProgress] = useState(0);
  const startRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!enableSwipe) return;

    const exit = () => {
      // history.length > 1 means there's somewhere to go back to. Otherwise
      // fall through to home so the gesture isn't a no-op.
      if (window.history.length > 1) navigate(-1);
      else navigate('/', { replace: true });
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      if (t.clientX > EDGE_ZONE_PX) return;
      startRef.current = { x: t.clientX, y: t.clientY };
      setSwipeProgress(0);
    };

    const onTouchMove = (e: TouchEvent) => {
      const start = startRef.current;
      if (!start) return;
      const t = e.touches[0];
      if (!t) return;
      const dx = t.clientX - start.x;
      const dy = Math.abs(t.clientY - start.y);
      if (dy > VERTICAL_TOLERANCE_PX && dy > dx) {
        startRef.current = null;
        setSwipeProgress(0);
        return;
      }
      if (dx > 0) setSwipeProgress(Math.min(1, dx / SWIPE_THRESHOLD_PX));
    };

    const onTouchEnd = (e: TouchEvent) => {
      const start = startRef.current;
      if (!start) return;
      const t = e.changedTouches[0];
      const dx = t ? t.clientX - start.x : 0;
      startRef.current = null;
      setSwipeProgress(0);
      if (dx >= SWIPE_THRESHOLD_PX) exit();
    };

    const onTouchCancel = () => {
      startRef.current = null;
      setSwipeProgress(0);
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', onTouchEnd);
    document.addEventListener('touchcancel', onTouchCancel);
    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [enableSwipe, navigate]);

  return (
    <>
      {/* Visual feedback while the user drags from the edge */}
      {swipeProgress > 0 && (
        <div
          className="fixed left-0 top-0 bottom-0 z-[99998] pointer-events-none flex items-center"
          style={{
            width: `${swipeProgress * 60}px`,
            background: 'linear-gradient(to right, hsl(var(--foreground)/0.08), transparent)',
          }}
        >
          <div
            className="ml-2 w-8 h-8 rounded-full bg-background/90 border border-border flex items-center justify-center shadow-md"
            style={{ opacity: swipeProgress, transform: `scale(${0.7 + swipeProgress * 0.3})` }}
          >
            <ArrowLeft className="w-4 h-4 text-foreground" />
          </div>
        </div>
      )}

      {showArrow && (
        <motion.button
          type="button"
          onClick={() => navigate('/', { replace: true })}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.92 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          aria-label="Back to home"
          className="fixed left-3 z-[99999] w-9 h-9 rounded-full bg-background/70 backdrop-blur-md border border-border/50 shadow-sm flex items-center justify-center text-foreground/80 hover:text-foreground hover:bg-background/90 active:bg-background touch-manipulation"
          style={{
            // Sit ~1rem below the iOS clock / Dynamic Island. --app-safe-top
            // is the project-wide variable that handles notch + Capacitor
            // status-bar height consistently.
            top: 'calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 1rem)',
          }}
        >
          <ArrowLeft className="w-4 h-4" />
        </motion.button>
      )}
    </>
  );
}

export default BackToHome;
