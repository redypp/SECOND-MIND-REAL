import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSpaces } from '@/contexts/SpacesContext';

/**
 * EntryPortal — the app's home screen at `/`.
 *
 * Minimal three-tile entry stack: SELF · LIFE · ARCHIVE.
 * Each tile is a uniform editorial card that hands off to its route on tap.
 */

type PortalTarget = 'life' | 'self' | 'archive';
type StackSlot = 'top' | 'middle' | 'bottom';

export function EntryPortal() {
  const navigate = useNavigate();
  const { profile } = useAuth();
  const { spaces, sharedSpaces, items } = useSpaces();
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

  const firstName = (profile?.full_name?.trim().split(/\s+/)[0]) || '';

  const { dayLabel, dateLabel, todayCount, archiveCount, totalItems, recentArchive } = useMemo(() => {
    const now = new Date();
    const day = now.toLocaleDateString(undefined, { weekday: 'long' });
    const date = now.toLocaleDateString(undefined, { month: 'long', day: 'numeric' });

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const today = items.filter(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      return t >= startOfToday;
    }).length;

    const archives = spaces.length + sharedSpaces.length;
    const total = items.length;

    const lastUsed = [...spaces]
      .sort((a, b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0))[0];

    return {
      dayLabel: day,
      dateLabel: date,
      todayCount: today,
      archiveCount: archives,
      totalItems: total,
      recentArchive: lastUsed?.name ?? '',
    };
  }, [items, spaces, sharedSpaces]);

  return (
    <AnimatePresence>
      <motion.div
        key="entry-portal"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25 }}
        className="fixed inset-0 z-[20000] bg-background flex flex-col overflow-hidden px-5 safe-area-top-ios"
        style={{
          paddingTop: 'calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 1.5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
        }}
      >
        {/* Header — date on the left, wordmark on the right */}
        <motion.header
          initial={{ y: -6, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md mx-auto flex items-center justify-between mb-6"
        >
          <span className="text-[10px] uppercase tabular-nums font-medium tracking-[0.32em] text-muted-foreground/70">
            {dayLabel} · {dateLabel}
          </span>
          <span className="text-[10px] uppercase font-medium tracking-[0.32em] text-muted-foreground/70">
            Second Mind
          </span>
        </motion.header>

        {/* Tile stack */}
        <div className="relative flex-1 min-h-0 flex flex-col items-stretch gap-3 w-full max-w-md mx-auto">
          <PortalSection
            slot="top"
            label="SELF"
            sublabel="Identity"
            primary={firstName || 'Profile'}
            meta={profile?.location || 'Set up your profile'}
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <PortalSection
            slot="middle"
            label="LIFE"
            sublabel="Today"
            primary={dayLabel}
            meta={todayCount > 0 ? `${todayCount} ${todayCount === 1 ? 'entry' : 'entries'}` : 'A blank canvas'}
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <PortalSection
            slot="bottom"
            label="ARCHIVE"
            sublabel={archiveCount === 1 ? '1 archive' : `${archiveCount} archives`}
            primary={recentArchive || 'Start collecting'}
            meta={totalItems > 0 ? `${totalItems.toLocaleString()} ${totalItems === 1 ? 'item' : 'items'}` : 'Empty'}
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
  primary: string;
  meta: string;
  slot: StackSlot;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

const SLOT_DELAY: Record<StackSlot, number> = { top: 0, middle: 0.06, bottom: 0.12 };
const SLOT_NUMBER: Record<StackSlot, string> = { top: '01', middle: '02', bottom: '03' };

function PortalSection({ label, sublabel, primary, meta, slot, isExiting, isOtherExiting, onClick }: PortalSectionProps) {
  const delay = SLOT_DELAY[slot];
  const isIdle = !isExiting && !isOtherExiting;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isExiting || isOtherExiting}
      initial={{ y: 18, opacity: 0 }}
      animate={
        isExiting ? {
          scale: 1.02,
          opacity: 1,
          y: 0,
          transition: { duration: 0.32, ease: [0.65, 0, 0.35, 1] },
        }
        : isOtherExiting ? {
          opacity: 0,
          y: 8,
          transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] },
        }
        : {
          y: 0,
          opacity: 1,
          transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1], delay },
        }
      }
      whileHover={isIdle ? { y: -2 } : undefined}
      whileTap={isIdle ? { scale: 0.985 } : undefined}
      className="group relative w-full rounded-3xl flex flex-col justify-between p-6 touch-manipulation focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground/20 flex-1 min-h-0 overflow-hidden text-left bg-card border border-border/60 transition-colors hover:border-border"
      aria-label={`Enter ${label}`}
    >
      {/* Top row: slot number · sublabel */}
      <div className="relative z-10 flex items-center justify-between gap-3">
        <span className="font-mono tabular-nums text-[11px] tracking-[0.16em] text-muted-foreground/70">
          {SLOT_NUMBER[slot]}
        </span>
        <span className="text-[10px] uppercase tracking-[0.28em] font-medium text-muted-foreground/80">
          {sublabel}
        </span>
      </div>

      {/* Bottom block: huge label + primary / meta */}
      <div className="relative z-10 flex flex-col gap-3">
        <span
          className="leading-[0.88] block text-foreground"
          style={{
            fontSize: 'clamp(2.6rem, 10vw, 4rem)',
            letterSpacing: '-0.06em',
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
          }}
        >
          {label}
        </span>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[13px] text-foreground/80 font-medium truncate">
            {primary}
          </span>
          <span className="shrink-0 text-[10px] uppercase tracking-[0.18em] font-medium text-muted-foreground/70 tabular-nums">
            {meta}
          </span>
        </div>
      </div>
    </motion.button>
  );
}
