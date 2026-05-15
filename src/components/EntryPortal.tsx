import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

/**
 * EntryPortal — the app's home screen at `/`.
 *
 * Three centered bubble cards: Self · Life · Archive. Dark page, lighter
 * bubbles. No header, no metrics — just the three blocks.
 */

type PortalTarget = 'life' | 'self' | 'archive';

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
    }, 280);
  };

  return (
    <AnimatePresence>
      <motion.div
        key="entry-portal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[20000] flex items-center justify-center overflow-hidden px-5 safe-area-top-ios"
        style={{
          backgroundColor: '#0E0E10',
          paddingTop: 'calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 0.5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        }}
      >
        <div className="w-full max-w-md flex flex-col items-stretch gap-4">
          <Bubble
            order={0}
            label="Self"
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <Bubble
            order={1}
            label="Life"
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <Bubble
            order={2}
            label="Archive"
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

/* ───────────────────────── Bubble ───────────────────────── */

interface BubbleProps {
  label: string;
  order: number;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

function Bubble({ label, order, isExiting, isOtherExiting, onClick }: BubbleProps) {
  const isIdle = !isExiting && !isOtherExiting;
  const delay = order * 0.06;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isExiting || isOtherExiting}
      initial={{ y: 14, opacity: 0 }}
      animate={
        isExiting
          ? { scale: 1.02, opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.65, 0, 0.35, 1] } }
          : isOtherExiting
          ? { opacity: 0, y: 8, transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] } }
          : { y: 0, opacity: 1, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1], delay } }
      }
      whileHover={isIdle ? { y: -2 } : undefined}
      whileTap={isIdle ? { scale: 0.985 } : undefined}
      className="w-full rounded-[28px] flex items-center justify-center touch-manipulation focus:outline-none"
      style={{
        backgroundColor: '#1C1C1F',
        height: 'clamp(112px, 18vh, 168px)',
      }}
      aria-label={`Open ${label}`}
    >
      <span
        className="text-foreground"
        style={{
          color: '#F1EFE8',
          fontFamily: 'var(--font-display)',
          fontSize: 'clamp(2.4rem, 9vw, 3.4rem)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1,
        }}
      >
        {label}
      </span>
    </motion.button>
  );
}
