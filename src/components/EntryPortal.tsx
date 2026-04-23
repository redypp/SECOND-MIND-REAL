import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * EntryPortal — immersive landing that greets the user on session entry.
 *
 * Shows a blank warm-cream canvas with two large circles:
 *   LIVE   (left)  → navigates to "/"
 *   ARCHIVE (right) → navigates to "/archive"
 *
 * Clicking a circle plays an expand animation (the chosen circle scales to
 * fill the viewport, the other falls away) before handing off to the target
 * route. The portal only shows once per browser session (sessionStorage),
 * so subsequent in-app navigations don't re-trigger it.
 */

const SESSION_FLAG = 'smind_portal_seen_v1';

export function EntryPortal() {
  const navigate = useNavigate();
  const location = useLocation();
  const [visible, setVisible] = useState<boolean>(() => {
    try {
      return sessionStorage.getItem(SESSION_FLAG) !== 'true';
    } catch {
      return true;
    }
  });
  const [exiting, setExiting] = useState<null | 'live' | 'archive'>(null);
  const navigatedRef = useRef(false);

  // If the user lands directly on /archive via URL (share link, refresh),
  // we still want to honor their destination — don't show the portal then.
  useEffect(() => {
    if (location.pathname !== '/' && location.pathname !== '/archive') {
      setVisible(false);
    }
  }, [location.pathname]);

  const mark = () => {
    try { sessionStorage.setItem(SESSION_FLAG, 'true'); } catch { /* ignore */ }
  };

  const handleEnter = (target: 'live' | 'archive') => {
    if (exiting) return;
    setExiting(target);
    mark();

    // Navigate partway through the expand so the target page is already
    // mounted when the circle fully covers the viewport — prevents a visible
    // white flash between portal and page.
    setTimeout(() => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      navigate(target === 'live' ? '/' : '/archive', { replace: true });
    }, 380);

    // After the animation has had time to complete, fully unmount the portal.
    setTimeout(() => setVisible(false), 900);
  };

  if (!visible) return null;

  return (
    <AnimatePresence>
      <motion.div
        key="entry-portal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.35 }}
        className="fixed inset-0 z-[20000] bg-background flex items-center justify-center overflow-hidden"
        style={{
          // Subtle warm grain — a touch of 'smart imperfection' on a blank page.
          backgroundImage:
            'radial-gradient(1px 1px at 25% 30%, hsl(20 14% 8% / 0.035) 50%, transparent 51%), radial-gradient(1px 1px at 75% 70%, hsl(20 14% 8% / 0.03) 50%, transparent 51%)',
          backgroundSize: '140px 140px, 180px 180px',
        }}
      >
        {/* Floating wordmark above the circles — intentionally off-kilter */}
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: exiting ? 0 : 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-[10%] left-0 right-0 flex justify-center pointer-events-none"
        >
          <p
            className="text-[clamp(0.75rem,2.5vw,0.95rem)] uppercase tracking-[0.4em] text-foreground/50 tilt-xs"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Second&nbsp;·&nbsp;Mind
          </p>
        </motion.div>

        {/* The two circles live in a centered row. On small screens they stack
            into a vertical pair so nothing clips. */}
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="relative flex items-center justify-center gap-[clamp(1.5rem,8vw,6rem)] flex-col sm:flex-row">
            <PortalCircle
              label="Live"
              sublabel="your day"
              position="left"
              tint="hsl(8 78% 48%)"
              isExiting={exiting === 'live'}
              isOtherExiting={exiting === 'archive'}
              onClick={() => handleEnter('live')}
            />
            <PortalCircle
              label="Archive"
              sublabel="your mind"
              position="right"
              tint="hsl(20 14% 10%)"
              isExiting={exiting === 'archive'}
              isOtherExiting={exiting === 'live'}
              onClick={() => handleEnter('archive')}
            />
          </div>
        </div>

        {/* Skip link — unobtrusive, bottom corner */}
        {!exiting && (
          <button
            onClick={() => { mark(); setVisible(false); }}
            className="absolute bottom-[max(env(safe-area-inset-bottom),1.5rem)] right-6 text-[0.7rem] uppercase tracking-[0.25em] text-foreground/40 hover:text-foreground/70 transition-colors"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            skip →
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

interface PortalCircleProps {
  label: string;
  sublabel: string;
  position: 'left' | 'right';
  tint: string;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

function PortalCircle({ label, sublabel, position, tint, isExiting, isOtherExiting, onClick }: PortalCircleProps) {
  // Base size scales with viewport — big enough to feel immersive, small
  // enough to leave breathing room between the two circles.
  const baseSize = 'clamp(14rem, 32vw, 22rem)';

  const variants = {
    idle: {
      scale: 1,
      opacity: 1,
      x: 0,
      y: 0,
    },
    hover: {
      scale: 1.04,
    },
    exitSelf: {
      // Expand to swallow the viewport. 30x scale on a ~320px circle covers
      // a 4K screen comfortably. Opacity eases to hand off into the next page.
      scale: 30,
      opacity: 0.95,
      transition: { duration: 0.7, ease: [0.65, 0, 0.35, 1] },
    },
    exitOther: {
      // The non-chosen circle falls away softly — directionally opposite.
      scale: 0.6,
      opacity: 0,
      x: position === 'left' ? -120 : 120,
      transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
    },
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isExiting || isOtherExiting}
      variants={variants}
      initial={{ scale: 0.85, opacity: 0, y: 16 }}
      animate={
        isExiting ? 'exitSelf'
        : isOtherExiting ? 'exitOther'
        : { scale: 1, opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: position === 'right' ? 0.12 : 0.05 } }
      }
      whileHover={!isExiting && !isOtherExiting ? { scale: 1.04 } : undefined}
      whileTap={!isExiting && !isOtherExiting ? { scale: 0.97 } : undefined}
      className="relative rounded-full flex items-center justify-center touch-manipulation focus:outline-none"
      style={{
        width: baseSize,
        height: baseSize,
        background: tint,
        // Slightly off-kilter rotation baked in — editorial, intentional.
        transform: position === 'left' ? 'rotate(-1.2deg)' : 'rotate(1deg)',
        boxShadow:
          '0 40px 80px -20px hsl(20 14% 8% / 0.25), 0 12px 24px -8px hsl(20 14% 8% / 0.15), inset 0 1px 0 hsl(0 0% 100% / 0.1)',
      }}
      aria-label={`Enter ${label}`}
    >
      {/* Inner ring — a thin edge that catches the eye */}
      <span
        className="absolute inset-[6%] rounded-full pointer-events-none"
        style={{ border: '1px solid hsl(0 0% 100% / 0.12)' }}
      />

      {/* Label stack — bold Fraunces with subtle counter-rotation so the
          text reads upright while the disc stays tilted. */}
      <div
        className="relative flex flex-col items-center gap-2 select-none"
        style={{ transform: position === 'left' ? 'rotate(1.2deg)' : 'rotate(-1deg)' }}
      >
        <span
          className="text-[clamp(2.5rem,6vw,4.25rem)] leading-none font-black text-[hsl(36_33%_98%)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: '"SOFT" 80, "WONK" 1, "opsz" 144',
            letterSpacing: '-0.04em',
          }}
        >
          {label}
        </span>
        <span
          className="text-[clamp(0.65rem,1.6vw,0.8rem)] uppercase tracking-[0.35em] text-[hsl(36_33%_98%_/_0.6)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {sublabel}
        </span>
      </div>

      {/* Gentle idle breathing pulse so the page doesn't feel dead while the
          user decides. Disabled during exit. */}
      {!isExiting && !isOtherExiting && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: tint }}
          animate={{ scale: [1, 1.03, 1], opacity: [0.0, 0.25, 0.0] }}
          transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut', delay: position === 'right' ? 1.2 : 0 }}
        />
      )}
    </motion.button>
  );
}
