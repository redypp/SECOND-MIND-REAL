import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * HoldToGoHome — global long-press gesture that returns the user to the
 * EntryPortal at `/`. Replaces dedicated "back to home" buttons.
 *
 * Behavior:
 *  - Press and hold for 2s anywhere on the screen → navigate to "/"
 *  - Cancels if the finger moves more than ~12px (so scrolling never fires)
 *  - Ignores presses that start on buttons/links/inputs/textareas
 *  - Disabled when already on "/"
 *  - Shows a growing ring at the press location so the user knows it's
 *    working (and can release to abort)
 *
 * Mount once at the app shell — it listens on `document`, no per-page
 * wiring needed.
 */

const HOLD_DURATION_MS = 2000;
const MOVE_TOLERANCE_PX = 12;

export function HoldToGoHome() {
  const navigate = useNavigate();
  const location = useLocation();
  const [press, setPress] = useState<{ x: number; y: number } | null>(null);
  const timerRef = useRef<number | null>(null);
  const startPosRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    // Already home — nothing to do, no listeners needed.
    if (location.pathname === '/') return;

    /** Walk up to ~8 ancestors looking for anything interactive. We don't
     *  want a long press on a button to also fire navigation. */
    const isInteractive = (target: EventTarget | null): boolean => {
      let el = target as HTMLElement | null;
      let depth = 0;
      while (el && depth < 8) {
        const tag = el.tagName;
        if (
          tag === 'BUTTON' || tag === 'A' || tag === 'INPUT' ||
          tag === 'TEXTAREA' || tag === 'SELECT' || tag === 'LABEL'
        ) return true;
        if (el.getAttribute('role') === 'button') return true;
        if (el.getAttribute('contenteditable') === 'true') return true;
        if ((el.dataset && el.dataset.holdGoHomeIgnore !== undefined)) return true;
        el = el.parentElement;
        depth++;
      }
      return false;
    };

    const cancel = () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startPosRef.current = null;
      setPress(null);
    };

    const begin = (x: number, y: number, target: EventTarget | null) => {
      if (isInteractive(target)) return;
      startPosRef.current = { x, y };
      setPress({ x, y });
      timerRef.current = window.setTimeout(() => {
        cancel();
        navigate('/', { replace: true });
      }, HOLD_DURATION_MS);
    };

    const move = (x: number, y: number) => {
      const start = startPosRef.current;
      if (!start) return;
      const dx = x - start.x;
      const dy = y - start.y;
      if (Math.hypot(dx, dy) > MOVE_TOLERANCE_PX) cancel();
    };

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      begin(t.clientX, t.clientY, e.target);
    };
    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      move(t.clientX, t.clientY);
    };
    const onMouseDown = (e: MouseEvent) => {
      // Left button only — right-click context menus shouldn't trigger this.
      if (e.button !== 0) return;
      begin(e.clientX, e.clientY, e.target);
    };
    const onMouseMove = (e: MouseEvent) => move(e.clientX, e.clientY);

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: true });
    document.addEventListener('touchend', cancel);
    document.addEventListener('touchcancel', cancel);
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', cancel);
    document.addEventListener('mouseleave', cancel);
    document.addEventListener('contextmenu', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('scroll', cancel, true); // capture so nested scrollers count

    return () => {
      cancel();
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', cancel);
      document.removeEventListener('touchcancel', cancel);
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', cancel);
      document.removeEventListener('mouseleave', cancel);
      document.removeEventListener('contextmenu', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('scroll', cancel, true);
    };
  }, [navigate, location.pathname]);

  return (
    <AnimatePresence>
      {press && (
        <motion.div
          key="hold-go-home-indicator"
          className="fixed pointer-events-none"
          style={{
            left: press.x,
            top: press.y,
            transform: 'translate(-50%, -50%)',
            zIndex: 100000,
          }}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.85 }}
          transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
        >
          <svg width="84" height="84" viewBox="0 0 84 84" aria-hidden>
            <circle
              cx="42"
              cy="42"
              r="36"
              fill="none"
              stroke="hsl(var(--foreground) / 0.15)"
              strokeWidth="3"
            />
            <motion.circle
              cx="42"
              cy="42"
              r="36"
              fill="none"
              stroke="hsl(var(--foreground))"
              strokeWidth="3"
              strokeLinecap="round"
              transform="rotate(-90 42 42)"
              pathLength={1}
              initial={{ strokeDasharray: '0 1' }}
              animate={{ strokeDasharray: '1 1' }}
              transition={{ duration: HOLD_DURATION_MS / 1000, ease: 'linear' }}
            />
          </svg>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default HoldToGoHome;
