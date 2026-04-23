import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';

/**
 * EntryPortal — immersive landing that greets the user on session entry.
 *
 * Three large cool-black circles stacked vertically, top to bottom:
 *   SELF     → "/self"
 *   LIFE     → "/"
 *   ARCHIVE  → "/archive"
 *
 * Clicking a circle expands it to fill the viewport and hands off to the
 * target route. The portal only shows once per browser session.
 */

const SESSION_FLAG = 'smind_portal_seen_v1';
const SHOW_PORTAL_EVENT = 'smind:show-portal';

type PortalTarget = 'life' | 'self' | 'archive';
type StackSlot = 'top' | 'middle' | 'bottom';

/** Dispatch this to reopen the portal from anywhere in the app. */
export function openPortal() {
  try { sessionStorage.removeItem(SESSION_FLAG); } catch { /* ignore */ }
  window.dispatchEvent(new Event(SHOW_PORTAL_EVENT));
}

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
  const [exiting, setExiting] = useState<PortalTarget | null>(null);
  const navigatedRef = useRef(false);

  useEffect(() => {
    if (
      location.pathname !== '/' &&
      location.pathname !== '/archive' &&
      location.pathname !== '/self'
    ) {
      setVisible(false);
    }
  }, [location.pathname]);

  useEffect(() => {
    const handler = () => {
      navigatedRef.current = false;
      setExiting(null);
      setVisible(true);
    };
    window.addEventListener(SHOW_PORTAL_EVENT, handler);
    return () => window.removeEventListener(SHOW_PORTAL_EVENT, handler);
  }, []);

  const mark = () => {
    try { sessionStorage.setItem(SESSION_FLAG, 'true'); } catch { /* ignore */ }
  };

  const routeFor = (target: PortalTarget): string => {
    if (target === 'life') return '/';
    if (target === 'self') return '/self';
    return '/archive';
  };

  const handleEnter = (target: PortalTarget) => {
    if (exiting) return;
    setExiting(target);
    mark();

    setTimeout(() => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      navigate(routeFor(target), { replace: true });
    }, 380);

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
      >
        {/* Vertical stack — three big discs with breathing space between them.
            Each disc breathes at its own phase so the page feels alive but
            never busy. */}
        <div className="relative flex flex-col items-center justify-center gap-[clamp(1.25rem,4vh,2.25rem)] py-4">
          <PortalCircle
            label="SELF"
            sublabel="Your world"
            slot="top"
            tint="hsl(220 14% 8%)"
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <PortalCircle
            label="LIFE"
            sublabel="Your day"
            slot="middle"
            tint="hsl(220 12% 14%)"
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <PortalCircle
            label="ARCHIVE"
            sublabel="Your mind"
            slot="bottom"
            tint="hsl(220 10% 20%)"
            isExiting={exiting === 'archive'}
            isOtherExiting={exiting !== null && exiting !== 'archive'}
            onClick={() => handleEnter('archive')}
          />
        </div>

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

/* ───────────────────────── Circle ───────────────────────── */

interface PortalCircleProps {
  label: string;
  sublabel: string;
  slot: StackSlot;
  tint: string;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

// Each disc fills most of the horizontal space on phones and stays generous
// on desktops. Capped at ~30vh so three still fit stacked on short viewports
// with breathing room between them.
const CIRCLE_SIZE = 'min(86vw, 30vh, 26rem)';

// Different exit drift per slot — feels more alive than a uniform fade.
const SLOT_EXIT_DRIFT: Record<StackSlot, { x: number; y: number }> = {
  top:    { x: 0,  y: -140 },
  middle: { x: 120, y: 0   },
  bottom: { x: 0,  y: 140  },
};

// Per-slot idle animation — each disc has a CLEARLY distinct rhythm AND
// motion axis, so they never converge into each other and the three breaths
// read as three different characters:
//   SELF   (top)    — slow deep breath, pulls UP      (away from middle)
//   LIFE   (middle) — fast shallow breath, sways      (horizontal, no vertical)
//   ARCHIVE(bottom) — slow rolling breath, pushes DOWN (away from middle)
// Different directions = no convergence = no overlap.
const SLOT_IDLE: Record<StackSlot, {
  yRange: [number, number, number];
  xRange: [number, number, number];
  scaleRange: [number, number, number];
  rotateRange: [number, number, number];
  duration: number;
  delay: number;
}> = {
  top:    { yRange: [0, -10, 0], xRange: [0, 0, 0],   scaleRange: [1, 1.025, 1], rotateRange: [0, 0.9, 0],  duration: 7.0, delay: 0   },
  middle: { yRange: [0, 0, 0],   xRange: [0, 6, 0],   scaleRange: [1, 1.01, 1],  rotateRange: [0, -0.4, 0], duration: 4.2, delay: 0.6 },
  bottom: { yRange: [0, 10, 0],  xRange: [0, 0, 0],   scaleRange: [1, 1.02, 1],  rotateRange: [0, 0.6, 0],  duration: 5.6, delay: 1.3 },
};

function PortalCircle({ label, sublabel, slot, tint, isExiting, isOtherExiting, onClick }: PortalCircleProps) {
  const entryDelay =
    slot === 'top' ? 0.05 :
    slot === 'middle' ? 0.14 :
    0.22;

  const exitDrift = SLOT_EXIT_DRIFT[slot];
  const idle = SLOT_IDLE[slot];

  // Build the idle animation — each axis runs at its own tempo so the loops
  // never align into a mechanical sync. Framer runs these indefinitely while
  // the portal is at rest.
  const idleAnimation = {
    scale: idle.scaleRange,
    y: idle.yRange,
    x: idle.xRange,
    rotate: idle.rotateRange,
    opacity: 1,
    transition: {
      scale:   { duration: idle.duration,       repeat: Infinity, ease: 'easeInOut', delay: idle.delay },
      y:       { duration: idle.duration * 1.1, repeat: Infinity, ease: 'easeInOut', delay: idle.delay },
      x:       { duration: idle.duration * 0.95,repeat: Infinity, ease: 'easeInOut', delay: idle.delay },
      rotate:  { duration: idle.duration * 1.3, repeat: Infinity, ease: 'easeInOut', delay: idle.delay },
      opacity: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: entryDelay },
    },
  };

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isExiting || isOtherExiting}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={
        isExiting ? {
          scale: 14,
          opacity: 1,
          y: 0,
          rotate: 0,
          transition: { duration: 0.75, ease: [0.65, 0, 0.35, 1] },
        }
        : isOtherExiting ? {
          scale: 0.55,
          opacity: 0,
          x: exitDrift.x,
          y: exitDrift.y,
          rotate: 0,
          transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
        }
        : idleAnimation
      }
      whileHover={!isExiting && !isOtherExiting ? { scale: 1.05 } : undefined}
      whileTap={!isExiting && !isOtherExiting ? { scale: 0.96 } : undefined}
      className="relative rounded-full flex items-center justify-center touch-manipulation focus:outline-none shrink-0"
      style={{
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        background: tint,
        boxShadow:
          '0 30px 60px -20px hsl(220 15% 4% / 0.55), 0 10px 24px -10px hsl(220 15% 4% / 0.35)',
      }}
      aria-label={`Enter ${label}`}
    >
      <div className="relative flex flex-col items-center gap-2 select-none">
        <span
          className="leading-none text-[hsl(36_33%_98%)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(2.5rem, 9vw, 4.5rem)',
            letterSpacing: '-0.045em',
          }}
        >
          {label}
        </span>
        <span
          className="uppercase tracking-[0.32em] text-[hsl(36_33%_98%_/_0.6)]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'clamp(0.7rem, 1.8vw, 0.95rem)',
            fontWeight: 500,
          }}
        >
          {sublabel}
        </span>
      </div>

      {/* Inner glow that blooms with each disc's inhale — constrained to the
          disc itself (no bleed past the edge) so it can't visually overlap
          the neighboring bubbles. */}
      {!isExiting && !isOtherExiting && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, hsl(36 33% 98% / 0.08) 0%, transparent 65%)`,
          }}
          animate={{ opacity: [0.0, 1, 0.0] }}
          transition={{
            duration: idle.duration * 1.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: idle.delay + 0.4,
          }}
        />
      )}
    </motion.button>
  );
}
