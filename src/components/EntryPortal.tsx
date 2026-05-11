import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

/**
 * EntryPortal — the app's home screen at `/`.
 *
 * Three full-width sections stacked vertically: SELF · LIFE · ARCHIVE.
 * Each slides in from offscreen with a staggered ease. Tapping a section
 * slides the others off and hands off to the target route.
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
        className="fixed inset-0 z-[20000] bg-background flex items-center justify-center overflow-hidden px-5 py-6 safe-area-top-ios"
      >
        {/* Ambient backdrop glow — barely visible but adds depth. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-60"
          style={{
            background:
              'radial-gradient(120% 60% at 50% 0%, hsl(220 20% 14% / 0.6) 0%, transparent 60%), radial-gradient(140% 80% at 50% 100%, hsl(20 30% 10% / 0.5) 0%, transparent 65%)',
          }}
        />
        <div className="relative flex flex-col items-stretch justify-center gap-3.5 w-full max-w-md h-full">
          <PortalSection
            label="SELF"
            sublabel="Your world"
            slot="top"
            theme={THEMES.self}
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <PortalSection
            label="LIFE"
            sublabel="Your day"
            slot="middle"
            theme={THEMES.life}
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <PortalSection
            label="ARCHIVE"
            sublabel="Your mind"
            slot="bottom"
            theme={THEMES.archive}
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

/* ───────────────────────── Theme tokens ───────────────────────── */

// Each section gets its own atmospheric palette. Layered radial gradients +
// a soft accent glow give the cards depth without leaving the muted dark
// vocabulary the rest of the app uses.
interface SectionTheme {
  base: string;       // solid fallback color
  gradient: string;   // layered gradient applied on top
  accent: string;     // tinted glow placed in one corner
  border: string;     // hairline border color
  labelColor: string; // primary label color
  metaColor: string;  // sublabel color
}

const THEMES: Record<PortalTarget, SectionTheme> = {
  self: {
    base: 'hsl(218 14% 11%)',
    gradient:
      'radial-gradient(120% 80% at 18% 12%, hsl(210 30% 24% / 0.9), transparent 60%), radial-gradient(110% 90% at 90% 95%, hsl(220 18% 8% / 0.95), transparent 55%), linear-gradient(165deg, hsl(220 14% 13%) 0%, hsl(220 12% 9%) 100%)',
    accent: 'radial-gradient(60% 80% at 88% 18%, hsl(205 70% 64% / 0.18), transparent 70%)',
    border: 'hsl(210 12% 90% / 0.06)',
    labelColor: 'hsl(0 0% 96%)',
    metaColor: 'hsl(210 20% 78% / 0.55)',
  },
  life: {
    base: 'hsl(28 14% 13%)',
    gradient:
      'radial-gradient(120% 80% at 82% 12%, hsl(28 40% 24% / 0.85), transparent 60%), radial-gradient(110% 90% at 10% 95%, hsl(20 18% 8% / 0.95), transparent 55%), linear-gradient(195deg, hsl(28 14% 15%) 0%, hsl(20 12% 10%) 100%)',
    accent: 'radial-gradient(60% 80% at 12% 18%, hsl(28 80% 60% / 0.18), transparent 70%)',
    border: 'hsl(28 20% 90% / 0.07)',
    labelColor: 'hsl(36 28% 96%)',
    metaColor: 'hsl(28 30% 82% / 0.55)',
  },
  archive: {
    base: 'hsl(15 14% 14%)',
    gradient:
      'radial-gradient(120% 80% at 50% 110%, hsl(15 40% 22% / 0.9), transparent 60%), radial-gradient(110% 90% at 90% 5%, hsl(15 16% 9% / 0.95), transparent 55%), linear-gradient(180deg, hsl(15 14% 16%) 0%, hsl(15 12% 11%) 100%)',
    accent: 'radial-gradient(70% 80% at 50% 100%, hsl(8 75% 58% / 0.16), transparent 75%)',
    border: 'hsl(15 20% 90% / 0.07)',
    labelColor: 'hsl(36 28% 96%)',
    metaColor: 'hsl(15 30% 82% / 0.55)',
  },
};

/* ───────────────────────── Section ───────────────────────── */

interface PortalSectionProps {
  label: string;
  sublabel: string;
  slot: StackSlot;
  theme: SectionTheme;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

const SECTION_MAX_HEIGHT = '18rem';

const SLOT_DELAY: Record<StackSlot, number> = {
  top:    0.00,
  middle: 0.08,
  bottom: 0.16,
};

const SLOT_ENTRY_X: Record<StackSlot, string> = {
  top:    '110%',
  middle: '-110%',
  bottom: '110%',
};

const SLOT_EXIT_X: Record<StackSlot, string> = {
  top:    '-110%',
  middle: '110%',
  bottom: '-110%',
};

function PortalSection({ label, sublabel, slot, theme, isExiting, isOtherExiting, onClick }: PortalSectionProps) {
  const delay = SLOT_DELAY[slot];
  const isIdle = !isExiting && !isOtherExiting;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isExiting || isOtherExiting}
      initial={{ x: SLOT_ENTRY_X[slot], opacity: 0 }}
      animate={
        isExiting ? {
          scale: 1.06,
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
            duration: 0.55,
            ease: [0.16, 1, 0.3, 1],
            delay,
          },
        }
      }
      whileHover={isIdle ? { scale: 1.015, y: -2 } : undefined}
      whileTap={isIdle ? { scale: 0.985 } : undefined}
      className="group relative w-full rounded-[28px] flex items-center pl-7 pr-6 touch-manipulation focus:outline-none flex-1 min-h-0 overflow-hidden"
      style={{
        maxHeight: SECTION_MAX_HEIGHT,
        background: theme.base,
        boxShadow:
          '0 30px 60px -22px hsl(220 30% 2% / 0.65), 0 14px 28px -14px hsl(220 30% 2% / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
      }}
      aria-label={`Enter ${label}`}
    >
      {/* Layered atmospheric background */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: theme.gradient }}
      />
      {/* Tinted accent glow */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: theme.accent }}
      />
      {/* Soft inner hairline border */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-[28px]"
        style={{ boxShadow: `inset 0 0 0 1px ${theme.border}` }}
      />
      {/* Subtle film-grain via radial dots — barely visible, adds tactility */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.06] mix-blend-overlay"
        style={{
          backgroundImage:
            'radial-gradient(hsl(0 0% 100%) 0.5px, transparent 0.5px)',
          backgroundSize: '3px 3px',
        }}
      />

      {/* Label block — anchored bottom-left for a more poster-like composition */}
      <div className="relative flex flex-col items-start gap-2.5 select-none text-left z-10 self-end pb-7">
        <span
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
          style={{
            background: 'hsl(0 0% 100% / 0.06)',
            border: `1px solid ${theme.border}`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: theme.labelColor, opacity: 0.55 }}
          />
          <span
            className="uppercase tabular-nums"
            style={{
              fontSize: '10px',
              letterSpacing: '0.28em',
              color: theme.metaColor,
              fontWeight: 600,
            }}
          >
            {sublabel}
          </span>
        </span>
        <span
          className="leading-[0.9] uppercase block"
          style={{
            fontSize: 'clamp(3.2rem, 11vw, 5rem)',
            letterSpacing: '-0.055em',
            color: theme.labelColor,
            fontWeight: 700,
            fontFamily: 'var(--font-display)',
            textShadow: '0 2px 30px hsl(220 30% 2% / 0.45)',
          }}
        >
          {label}
        </span>
      </div>

      {/* Top-right corner marker — slot number stylized as section identity */}
      <div
        aria-hidden
        className="absolute top-5 right-6 flex items-center gap-2 z-10"
      >
        <span
          className="font-mono tabular-nums"
          style={{
            fontSize: '11px',
            letterSpacing: '0.1em',
            color: theme.metaColor,
            opacity: 0.7,
          }}
        >
          0{slot === 'top' ? 1 : slot === 'middle' ? 2 : 3}
        </span>
        <span
          className="w-8 h-px transition-all duration-300 group-hover:w-12"
          style={{ background: theme.metaColor, opacity: 0.4 }}
        />
      </div>
    </motion.button>
  );
}
