import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

/**
 * EntryPortal — the app's home screen at `/`.
 *
 * Three large circles stacked vertically, top to bottom:
 *   SELF     → "/self"
 *   LIFE     → "/life"
 *   ARCHIVE  → "/archive"
 *
 * Tapping a circle expands it to fill the viewport and hands off to the
 * target route. This is the only home screen — no intermediate hub.
 */

type PortalTarget = 'life' | 'self' | 'archive';
type StackSlot = 'top' | 'middle' | 'bottom';

export function EntryPortal() {
  const navigate = useNavigate();
  const [exiting, setExiting] = useState<PortalTarget | null>(null);
  const navigatedRef = useRef(false);

  const routeFor = (target: PortalTarget): string => {
    if (target === 'life') return '/life';
    if (target === 'self') return '/self';
    return '/archive';
  };

  const handleEnter = (target: PortalTarget) => {
    if (exiting) return;
    setExiting(target);
    setTimeout(() => {
      if (navigatedRef.current) return;
      navigatedRef.current = true;
      navigate(routeFor(target), { replace: true });
    }, 380);
  };

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
        <div className="relative flex flex-col items-center justify-center gap-[clamp(1.25rem,4vh,2.25rem)] py-4">
          <PortalCircle
            label="SELF"
            sublabel="Your world"
            slot="top"
            tint="hsl(220 8% 10%)"
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <PortalCircle
            label="LIFE"
            sublabel="Your day"
            slot="middle"
            tint="hsl(220 6% 14%)"
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <PortalCircle
            label="ARCHIVE"
            sublabel="Your mind"
            slot="bottom"
            tint="hsl(220 5% 20%)"
            isExiting={exiting === 'archive'}
            isOtherExiting={exiting !== null && exiting !== 'archive'}
            onClick={() => handleEnter('archive')}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default EntryPortal;

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
  top:    { x: 0,   y: -140 },
  middle: { x: 120, y: 0    },
  bottom: { x: 0,   y: 140  },
};

// Per-slot idle animation — each disc has a distinct rhythm AND
// motion axis so the three breaths read as three different characters.
const SLOT_IDLE: Record<StackSlot, {
  yRange: [number, number, number];
  xRange: [number, number, number];
  scaleRange: [number, number, number];
  rotateRange: [number, number, number];
  duration: number;
  delay: number;
}> = {
  top:    { yRange: [0, -10, 0], xRange: [0, 0, 0], scaleRange: [1, 1.025, 1], rotateRange: [0, 0.9, 0],  duration: 7.0, delay: 0   },
  middle: { yRange: [0, 0, 0],   xRange: [0, 6, 0], scaleRange: [1, 1.01,  1], rotateRange: [0, -0.4, 0], duration: 4.2, delay: 0.6 },
  bottom: { yRange: [0, 10, 0],  xRange: [0, 0, 0], scaleRange: [1, 1.02,  1], rotateRange: [0, 0.6, 0],  duration: 5.6, delay: 1.3 },
};

function PortalCircle({ label, sublabel, slot, tint, isExiting, isOtherExiting, onClick }: PortalCircleProps) {
  const entryDelay =
    slot === 'top'    ? 0.05 :
    slot === 'middle' ? 0.14 :
                        0.22;

  const exitDrift = SLOT_EXIT_DRIFT[slot];
  const idle = SLOT_IDLE[slot];

  const idleAnimation = {
    scale: idle.scaleRange,
    y: idle.yRange,
    x: idle.xRange,
    rotate: idle.rotateRange,
    opacity: 1,
    transition: {
      scale:   { duration: idle.duration,        repeat: Infinity, ease: 'easeInOut', delay: idle.delay },
      y:       { duration: idle.duration * 1.1,  repeat: Infinity, ease: 'easeInOut', delay: idle.delay },
      x:       { duration: idle.duration * 0.95, repeat: Infinity, ease: 'easeInOut', delay: idle.delay },
      rotate:  { duration: idle.duration * 1.3,  repeat: Infinity, ease: 'easeInOut', delay: idle.delay },
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
          className="leading-none uppercase"
          style={{
            fontSize: 'var(--text-hero)',
            letterSpacing: '-0.045em',
            color: 'hsl(var(--background))',
          }}
        >
          {label}
        </span>
        <span
          className="uppercase tracking-[0.32em]"
          style={{
            fontSize: 'var(--text-label)',
            color: 'hsl(var(--background) / 0.6)',
          }}
        >
          {sublabel}
        </span>
      </div>

      {!isExiting && !isOtherExiting && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{
            background: `radial-gradient(circle at center, hsl(var(--background) / 0.08) 0%, transparent 65%)`,
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
