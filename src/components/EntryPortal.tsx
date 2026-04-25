import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

/**
 * EntryPortal — the app's home screen at `/`.
 *
 * Three full-width rectangular sections stacked vertically, top to bottom:
 *   SELF     → "/self"
 *   LIFE     → "/life"
 *   ARCHIVE  → "/archive"
 *
 * Each rectangle slides in from offscreen with a quick, staggered ease every
 * time the user lands here. Tapping a section slides the others off and
 * hands off to the target route.
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
    }, 320);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="entry-portal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[20000] bg-background flex items-center justify-center overflow-hidden px-5 py-4 safe-area-top-ios"
      >
        <div className="relative flex flex-col items-stretch justify-center gap-3 w-full max-w-md h-full">
          <PortalSection
            label="SELF"
            sublabel="Your world"
            slot="top"
            tint="hsl(220 8% 10%)"
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <PortalSection
            label="LIFE"
            sublabel="Your day"
            slot="middle"
            tint="hsl(220 6% 14%)"
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <PortalSection
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

/* ───────────────────────── Section ───────────────────────── */

interface PortalSectionProps {
  label: string;
  sublabel: string;
  slot: StackSlot;
  tint: string;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

// Each section flexes to fill its share of the vertical space — three equal
// rectangles that together cover almost the whole viewport. Capped so they
// don't get absurdly tall on a desktop window.
const SECTION_MAX_HEIGHT = '18rem';

// Stagger so the three rectangles slide in one after another.
const SLOT_DELAY: Record<StackSlot, number> = {
  top:    0.00,
  middle: 0.08,
  bottom: 0.16,
};

// Slide each rectangle in from a side. Alternating directions reads cleaner
// than three slabs all flying in from the same edge.
const SLOT_ENTRY_X: Record<StackSlot, string> = {
  top:    '110%',
  middle: '-110%',
  bottom: '110%',
};

// Where unselected rectangles slide off to when one is tapped.
const SLOT_EXIT_X: Record<StackSlot, string> = {
  top:    '-110%',
  middle: '110%',
  bottom: '-110%',
};

function PortalSection({ label, sublabel, slot, tint, isExiting, isOtherExiting, onClick }: PortalSectionProps) {
  const delay = SLOT_DELAY[slot];

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isExiting || isOtherExiting}
      initial={{ x: SLOT_ENTRY_X[slot], opacity: 0 }}
      animate={
        isExiting ? {
          scale: 1.08,
          opacity: 1,
          x: 0,
          transition: { duration: 0.45, ease: [0.65, 0, 0.35, 1] },
        }
        : isOtherExiting ? {
          x: SLOT_EXIT_X[slot],
          opacity: 0,
          transition: { duration: 0.35, ease: [0.4, 0, 0.2, 1] },
        }
        : {
          x: 0,
          opacity: 1,
          transition: {
            duration: 0.5,
            ease: [0.16, 1, 0.3, 1],
            delay,
          },
        }
      }
      whileHover={!isExiting && !isOtherExiting ? { scale: 1.015 } : undefined}
      whileTap={!isExiting && !isOtherExiting ? { scale: 0.985 } : undefined}
      className="relative w-full rounded-3xl flex items-center px-7 touch-manipulation focus:outline-none flex-1 min-h-0 overflow-hidden"
      style={{
        maxHeight: SECTION_MAX_HEIGHT,
        background: tint,
        boxShadow:
          '0 30px 60px -20px hsl(220 15% 4% / 0.55), 0 10px 24px -10px hsl(220 15% 4% / 0.35)',
      }}
      aria-label={`Enter ${label}`}
    >
      <div className="relative flex flex-col items-start gap-2 select-none text-left">
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
    </motion.button>
  );
}
