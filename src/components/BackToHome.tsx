import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft } from 'lucide-react';

/**
 * BackToHome — global back affordances.
 *
 * 1. Small fixed top-left chevron. Life sub-pages return to /life; everywhere
 *    else returns to "/". Hidden on routes that already render their own
 *    top-left back button so we don't stack two arrows in the same corner.
 *
 * 2. Edge-swipe gesture: drag from the left edge of the screen rightward to
 *    exit the current page (history-back, with the correct fallback when
 *    there's nothing in history).
 */

const ARROW_SKIP_PREFIXES = ['/space/', '/item/'];
// Life sub-pages render their own in-page back arrow via the embedded
// ClockPage / TodoPage / HabitsPage / JournalPage components — skipping
// them here avoids two stacked arrows in the same corner.
const ARROW_SKIP_EXACT = new Set([
  '/', '/settings', '/notifications', '/people',
  '/daily-plan', '/todos', '/habits', '/journal',
]);

const SWIPE_SKIP_PREFIXES = ['/space/'];
// Life sub-pages already have MainLayout's internal swipe gesture wired up
// (it animates the embedded sub-page off-screen and routes to /life). The
// global edge-swipe was a second handler racing the same gesture and
// sometimes resolving to navigate(-1) instead of /life — i.e., back to the
// app home instead of the Life dashboard. Skipping the global handler
// here lets MainLayout own the gesture entirely.
const SWIPE_SKIP_EXACT = new Set([
  '/',
  '/daily-plan', '/todos', '/habits', '/journal',
]);

const LIFE_SUB_ROUTES = new Set(['/daily-plan', '/todos', '/habits', '/journal']);

const EDGE_ZONE_PX = 28;
const SWIPE_THRESHOLD_PX = 80;
const VERTICAL_TOLERANCE_PX = 24;

export function BackToHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const path = location.pathname;

  // Life sub-pages go up to /life; everything else goes to the app home.
  const backTarget = LIFE_SUB_ROUTES.has(path) ? '/life' : '/';

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
      // fall through to the right home so the gesture isn't a no-op.
      if (window.history.length > 1) navigate(-1);
      else navigate(backTarget, { replace: true });
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
  }, [enableSwipe, navigate, backTarget]);

  return (
    <>
      {/* Visual feedback while the user drags from the edge.
          Soft tint fading in with progress + a translucent chevron pill that
          rubber-bands rightward. No hard borders or drop shadows — the
          previous look read as a Material chip; this one disappears into
          the page chrome the way an iOS edge gesture should. */}
      {swipeProgress > 0 && (
        <div
          className="fixed left-0 top-0 bottom-0 z-[99998] pointer-events-none flex items-center"
          style={{
            width: `${swipeProgress * 64}px`,
            background: `linear-gradient(to right, hsl(var(--foreground) / ${swipeProgress * 0.07}), transparent)`,
          }}
        >
          <div
            className="ml-3 w-9 h-9 rounded-full flex items-center justify-center bg-foreground/10 backdrop-blur-md"
            style={{
              opacity: Math.min(1, swipeProgress * 1.4),
              transform: `translateX(${swipeProgress * 6}px) scale(${0.88 + swipeProgress * 0.12})`,
            }}
          >
            <ChevronLeft className="w-5 h-5 text-foreground" strokeWidth={2.25} />
          </div>
        </div>
      )}

      {showArrow && (
        <motion.button
          type="button"
          onClick={() => navigate(backTarget, { replace: true })}
          initial={{ opacity: 0, x: -4 }}
          animate={{ opacity: 1, x: 0 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
          aria-label={backTarget === '/life' ? 'Back to Life' : 'Back to home'}
          className="fixed left-1 z-[99999] w-11 h-11 rounded-full flex items-center justify-center text-foreground/70 hover:text-foreground active:bg-foreground/10 transition-colors touch-manipulation"
          style={{
            // Sit just below the iOS clock / Dynamic Island. Lighter than the
            // old chip — no background, just a chevron — so it disappears
            // into the page chrome instead of fighting the content.
            top: 'calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 0.25rem)',
          }}
        >
          <ChevronLeft className="w-6 h-6" strokeWidth={2.25} />
        </motion.button>
      )}
    </>
  );
}

export default BackToHome;
