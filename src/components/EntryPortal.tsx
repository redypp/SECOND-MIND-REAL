import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { PersonStanding } from 'lucide-react';

/**
 * EntryPortal — immersive landing that greets the user on session entry.
 *
 * Three circles in a clover (equilateral triangle) configuration, all in
 * cool-black tints so they read as a family rather than three separate
 * colors. Clicking one expands it to fill the viewport and hands off to
 * the target route.
 *
 *   LIFE     (top)          → "/"
 *   SELF     (bottom-left)  → "/self"
 *   ARCHIVE  (bottom-right) → "/archive"
 */

const SESSION_FLAG = 'smind_portal_seen_v1';
const SHOW_PORTAL_EVENT = 'smind:show-portal';

type PortalTarget = 'life' | 'self' | 'archive';
type CloverSlot = 'top' | 'bottom-left' | 'bottom-right';

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
        {/* Clover container — sized so three discs fit in an equilateral
            triangle and just kiss at their edges. Using aspect-square so
            the layout stays balanced across viewport shapes. */}
        <div
          className="relative"
          style={{
            width: 'min(92vw, 82vh, 36rem)',
            height: 'min(92vw, 82vh, 36rem)',
          }}
        >
          <PortalCircle
            label="LIFE"
            sublabel="Your day"
            slot="top"
            tint="hsl(220 12% 14%)"
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <PortalCircle
            label="SELF"
            sublabel="Your world"
            slot="bottom-left"
            tint="hsl(220 14% 8%)"
            icon={<PersonStanding className="w-[42%] h-[42%] text-[hsl(36_33%_98%_/_0.9)]" strokeWidth={1.5} />}
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <PortalCircle
            label="ARCHIVE"
            sublabel="Your mind"
            slot="bottom-right"
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
  slot: CloverSlot;
  tint: string;
  icon?: React.ReactNode;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

// Clover geometry. Container is 100% × 100%. Each circle is 52% of the
// container. Centers sit at 120° intervals around the container center, at
// an offset radius chosen so the discs just overlap — giving a tight, organic
// clover silhouette instead of three isolated dots.
//   top         → center at (50%, 26%)
//   bottom-left → center at (26%, 66%)
//   bottom-right→ center at (74%, 66%)
const CIRCLE_SIZE = '52%';
const SLOT_STYLES: Record<CloverSlot, React.CSSProperties> = {
  'top':          { top: '0%',    left: '50%', transform: 'translate(-50%, 0)' },
  'bottom-left':  { bottom: '0%', left: '0%',  transform: 'translate(0, 0)'    },
  'bottom-right': { bottom: '0%', right: '0%', transform: 'translate(0, 0)'    },
};

const SLOT_EXIT_DRIFT: Record<CloverSlot, { x: number; y: number }> = {
  'top':          { x: 0,    y: -140 },
  'bottom-left':  { x: -140, y: 120  },
  'bottom-right': { x: 140,  y: 120  },
};

function PortalCircle({ label, sublabel, slot, tint, icon, isExiting, isOtherExiting, onClick }: PortalCircleProps) {
  const entryDelay =
    slot === 'top' ? 0.05 :
    slot === 'bottom-left' ? 0.14 :
    0.22;

  const exitDrift = SLOT_EXIT_DRIFT[slot];

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
          transition: { duration: 0.75, ease: [0.65, 0, 0.35, 1] },
        }
        : isOtherExiting ? {
          scale: 0.55,
          opacity: 0,
          x: exitDrift.x,
          y: exitDrift.y,
          transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
        }
        : { scale: 1, opacity: 1, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: entryDelay } }
      }
      whileHover={!isExiting && !isOtherExiting ? { scale: 1.035 } : undefined}
      whileTap={!isExiting && !isOtherExiting ? { scale: 0.97 } : undefined}
      className="absolute rounded-full flex items-center justify-center touch-manipulation focus:outline-none"
      style={{
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        background: tint,
        boxShadow:
          '0 30px 60px -20px hsl(220 15% 4% / 0.55), 0 10px 24px -10px hsl(220 15% 4% / 0.35)',
        ...SLOT_STYLES[slot],
      }}
      aria-label={`Enter ${label}`}
    >
      {icon && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20"
        >
          {icon}
        </span>
      )}

      <div className="relative flex flex-col items-center gap-1.5 select-none">
        <span
          className="leading-none text-[hsl(36_33%_98%)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(1.5rem, 4.2vw, 2.75rem)',
            letterSpacing: '-0.04em',
          }}
        >
          {label}
        </span>
        <span
          className="uppercase tracking-[0.3em] text-[hsl(36_33%_98%_/_0.55)]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: 'clamp(0.55rem, 1.1vw, 0.7rem)',
            fontWeight: 500,
          }}
        >
          {sublabel}
        </span>
      </div>

      {!isExiting && !isOtherExiting && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: tint }}
          animate={{ scale: [1, 1.03, 1], opacity: [0.0, 0.18, 0.0] }}
          transition={{
            duration: 3.4,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: slot === 'top' ? 0 : slot === 'bottom-left' ? 0.9 : 1.8,
          }}
        />
      )}
    </motion.button>
  );
}
