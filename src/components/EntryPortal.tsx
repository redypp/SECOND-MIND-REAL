import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate, useLocation } from 'react-router-dom';
import { PersonStanding } from 'lucide-react';

/**
 * EntryPortal — immersive landing that greets the user on session entry.
 *
 * Shows a blank warm-cream canvas with three large circles:
 *   LIFE    (left)   → navigates to "/"
 *   SELF    (center) → navigates to "/self"  (personal hub)
 *   ARCHIVE (right)  → navigates to "/archive"
 *
 * Clicking a circle plays an expand animation (the chosen circle scales to
 * fill the viewport, the others fall away) before handing off to the target
 * route. The portal only shows once per browser session (sessionStorage).
 */

const SESSION_FLAG = 'smind_portal_seen_v1';
const SHOW_PORTAL_EVENT = 'smind:show-portal';

type PortalTarget = 'life' | 'self' | 'archive';
type PortalPosition = 'left' | 'center' | 'right';

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

  // If the user lands directly on a destination via URL (share link, refresh),
  // honor it — don't hijack with the portal. Exception: an explicit open via
  // the custom event should always surface the portal.
  useEffect(() => {
    if (
      location.pathname !== '/' &&
      location.pathname !== '/archive' &&
      location.pathname !== '/self'
    ) {
      setVisible(false);
    }
  }, [location.pathname]);

  // External callers (nav buttons on each destination page) can reopen the
  // portal by dispatching `smind:show-portal`. Reset exiting state so the
  // animation replays cleanly the next time they pick a destination.
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

    // Navigate partway through the expand so the destination is already
    // mounted when the circle fully covers the viewport.
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
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 25% 30%, hsl(20 14% 8% / 0.035) 50%, transparent 51%), radial-gradient(1px 1px at 75% 70%, hsl(20 14% 8% / 0.03) 50%, transparent 51%)',
          backgroundSize: '140px 140px, 180px 180px',
        }}
      >
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="relative flex items-center justify-center gap-[clamp(1.25rem,5vw,4rem)] flex-col sm:flex-row">
            <PortalCircle
              label="Life"
              sublabel="your day"
              position="left"
              tint="hsl(8 78% 48%)"
              isExiting={exiting === 'life'}
              isOtherExiting={exiting !== null && exiting !== 'life'}
              onClick={() => handleEnter('life')}
            />
            <PortalCircle
              label="Self"
              sublabel="your world"
              position="center"
              tint="hsl(24 55% 42%)"
              icon={<PersonStanding className="w-[38%] h-[38%] text-[hsl(36_33%_98%_/_0.9)]" strokeWidth={1.5} />}
              isExiting={exiting === 'self'}
              isOtherExiting={exiting !== null && exiting !== 'self'}
              onClick={() => handleEnter('self')}
            />
            <PortalCircle
              label="Archive"
              sublabel="your mind"
              position="right"
              tint="hsl(20 14% 10%)"
              isExiting={exiting === 'archive'}
              isOtherExiting={exiting !== null && exiting !== 'archive'}
              onClick={() => handleEnter('archive')}
            />
          </div>
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

interface PortalCircleProps {
  label: string;
  sublabel: string;
  position: PortalPosition;
  tint: string;
  icon?: React.ReactNode;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

function PortalCircle({ label, sublabel, position, tint, icon, isExiting, isOtherExiting, onClick }: PortalCircleProps) {
  // Slightly smaller than before so three circles fit comfortably in one row
  // on desktop without crowding. On narrow screens they stack and grow.
  const baseSize = 'clamp(11rem, 26vw, 18rem)';

  // Off-kilter rotation — different per position for a deliberate hand-laid feel.
  const rotation =
    position === 'left' ? -1.4 :
    position === 'right' ? 1.2 :
    0.5;

  // Exit drift direction: each non-chosen circle falls away in its own way.
  const exitX = position === 'left' ? -120 : position === 'right' ? 120 : 0;
  const exitY = position === 'center' ? 140 : 0;

  const entryDelay =
    position === 'left' ? 0.05 :
    position === 'center' ? 0.12 :
    0.19;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isExiting || isOtherExiting}
      initial={{ scale: 0.85, opacity: 0, y: 16 }}
      animate={
        isExiting ? {
          scale: 30,
          opacity: 0.95,
          transition: { duration: 0.7, ease: [0.65, 0, 0.35, 1] },
        }
        : isOtherExiting ? {
          scale: 0.6,
          opacity: 0,
          x: exitX,
          y: exitY,
          transition: { duration: 0.5, ease: [0.4, 0, 0.2, 1] },
        }
        : { scale: 1, opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay: entryDelay } }
      }
      whileHover={!isExiting && !isOtherExiting ? { scale: 1.04 } : undefined}
      whileTap={!isExiting && !isOtherExiting ? { scale: 0.97 } : undefined}
      className="relative rounded-full flex items-center justify-center touch-manipulation focus:outline-none"
      style={{
        width: baseSize,
        height: baseSize,
        background: tint,
        transform: `rotate(${rotation}deg)`,
        boxShadow:
          '0 40px 80px -20px hsl(20 14% 8% / 0.25), 0 12px 24px -8px hsl(20 14% 8% / 0.15), inset 0 1px 0 hsl(0 0% 100% / 0.1)',
      }}
      aria-label={`Enter ${label}`}
    >
      <span
        className="absolute inset-[6%] rounded-full pointer-events-none"
        style={{ border: '1px solid hsl(0 0% 100% / 0.12)' }}
      />

      {/* Optional center icon, rendered behind the label at low opacity so it
          reads as an emblem rather than competing with the wordmark. */}
      {icon && (
        <span
          aria-hidden
          className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-25"
          style={{ transform: `rotate(${-rotation}deg)` }}
        >
          {icon}
        </span>
      )}

      {/* Label stack — counter-rotate so the text reads upright while the
          disc itself stays tilted. */}
      <div
        className="relative flex flex-col items-center gap-2 select-none"
        style={{ transform: `rotate(${-rotation}deg)` }}
      >
        <span
          className="text-[clamp(2rem,5vw,3.5rem)] leading-none font-black text-[hsl(36_33%_98%)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: '"SOFT" 80, "WONK" 1, "opsz" 144',
            letterSpacing: '-0.04em',
          }}
        >
          {label}
        </span>
        <span
          className="text-[clamp(0.6rem,1.4vw,0.75rem)] uppercase tracking-[0.35em] text-[hsl(36_33%_98%_/_0.6)]"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {sublabel}
        </span>
      </div>

      {!isExiting && !isOtherExiting && (
        <motion.span
          aria-hidden
          className="absolute inset-0 rounded-full pointer-events-none"
          style={{ background: tint }}
          animate={{ scale: [1, 1.03, 1], opacity: [0.0, 0.22, 0.0] }}
          transition={{
            duration: 3.2,
            repeat: Infinity,
            ease: 'easeInOut',
            delay: position === 'left' ? 0 : position === 'center' ? 0.8 : 1.6,
          }}
        />
      )}
    </motion.button>
  );
}
