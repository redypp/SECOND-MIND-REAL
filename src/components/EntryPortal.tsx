import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { ArrowUpRight, Menu } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useSpaces } from '@/contexts/SpacesContext';

/**
 * EntryPortal — the app's home screen at `/`.
 *
 * Bubble-card layout: a slim header (brand · avatar · menu) on top of three
 * stacked rounded "data bubbles" for SELF · LIFE · ARCHIVE. Each bubble shows
 * a title, an open-in-arrow, a primary metric, and a thin progress bar with
 * two end-labels.
 */

type PortalTarget = 'life' | 'self' | 'archive';

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
  const initial = (firstName.charAt(0) || 'S').toUpperCase();

  const {
    dayLabel,
    todayCount,
    weekCount,
    dayProgress,
    archiveCount,
    totalItems,
    profileCompletion,
  } = useMemo(() => {
    const now = new Date();
    const day = now.toLocaleDateString(undefined, { weekday: 'long' });

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfWeek = startOfToday - 6 * 86_400_000;
    const elapsedToday = now.getTime() - startOfToday;
    const progress = Math.min(Math.max(elapsedToday / 86_400_000, 0.04), 1);

    const today = items.filter(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      return t >= startOfToday;
    }).length;

    const week = items.filter(i => {
      const t = i.createdAt instanceof Date ? i.createdAt.getTime() : new Date(i.createdAt as any).getTime();
      return t >= startOfWeek;
    }).length;

    const archives = spaces.length + sharedSpaces.length;
    const total = items.length;

    // Profile completion: name, birthday, location → 0..1
    const filled = [profile?.full_name, profile?.birthday, profile?.location].filter(
      v => typeof v === 'string' && v.trim().length > 0
    ).length;
    const completion = Math.min(Math.max(filled / 3, 0.06), 1);

    return {
      dayLabel: day,
      todayCount: today,
      weekCount: week,
      dayProgress: progress,
      archiveCount: archives,
      totalItems: total,
      profileCompletion: completion,
    };
  }, [items, spaces, sharedSpaces, profile]);

  // Archive bubble progress: weekly capture vs lifetime, with a minimum visible slice
  const archiveProgress = Math.min(Math.max(weekCount / Math.max(totalItems, 10), 0.04), 1);

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
          paddingTop: 'calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 0.5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)',
        }}
      >
        {/* Header — brand mark on the left, avatar + menu on the right */}
        <motion.header
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md mx-auto flex items-center justify-between py-2 mb-3"
        >
          <BrandMark />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate('/self')}
              className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center text-[13px] tracking-tight text-foreground/85 focus:outline-none"
              aria-label="Open profile"
            >
              {initial}
            </button>
            <button
              type="button"
              onClick={() => navigate('/settings')}
              className="h-9 w-9 rounded-full bg-card border border-border/60 flex items-center justify-center text-foreground/70 focus:outline-none"
              aria-label="Open settings"
            >
              <Menu className="h-4 w-4" strokeWidth={2.2} />
            </button>
          </div>
        </motion.header>

        {/* Bubble stack */}
        <div className="relative flex-1 min-h-0 flex flex-col items-stretch gap-3 w-full max-w-md mx-auto">
          <BubbleCard
            order={0}
            title="Self"
            primary={firstName || 'Profile'}
            primaryNote={profile?.location || undefined}
            barLabelLeft="Identity"
            barLabelRight="Setup"
            progress={profileCompletion}
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <BubbleCard
            order={1}
            title="Life"
            primary={dayLabel}
            primaryNote={todayCount > 0 ? `+${todayCount}` : undefined}
            barLabelLeft="Morning"
            barLabelRight="Evening"
            progress={dayProgress}
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <BubbleCard
            order={2}
            title="Archive"
            primary={totalItems.toLocaleString()}
            primaryNote={weekCount > 0 ? `+${weekCount}` : undefined}
            barLabelLeft={archiveCount === 1 ? '1 space' : `${archiveCount} spaces`}
            barLabelRight={totalItems === 1 ? '1 item' : `${totalItems.toLocaleString()} items`}
            progress={archiveProgress}
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

/* ───────────────────────── Brand mark ───────────────────────── */

function BrandMark() {
  return (
    <div className="flex items-center" aria-label="Second Mind">
      <svg
        viewBox="0 0 40 40"
        className="h-7 w-7 text-foreground"
        fill="none"
        stroke="currentColor"
        strokeWidth={3.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M30 12 A12 12 0 1 0 32 22" />
        <path d="M32 8 L32 16 L24 16" />
      </svg>
    </div>
  );
}

/* ───────────────────────── Bubble card ───────────────────────── */

interface BubbleCardProps {
  title: string;
  primary: string;
  primaryNote?: string;
  barLabelLeft: string;
  barLabelRight: string;
  progress: number; // 0..1
  order: number;
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

function BubbleCard({
  title,
  primary,
  primaryNote,
  barLabelLeft,
  barLabelRight,
  progress,
  order,
  isExiting,
  isOtherExiting,
  onClick,
}: BubbleCardProps) {
  const isIdle = !isExiting && !isOtherExiting;
  const delay = order * 0.06;
  const pct = Math.round(Math.min(Math.max(progress, 0), 1) * 100);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={isExiting || isOtherExiting}
      initial={{ y: 18, opacity: 0 }}
      animate={
        isExiting
          ? { scale: 1.02, opacity: 1, y: 0, transition: { duration: 0.32, ease: [0.65, 0, 0.35, 1] } }
          : isOtherExiting
          ? { opacity: 0, y: 8, transition: { duration: 0.24, ease: [0.4, 0, 0.2, 1] } }
          : { y: 0, opacity: 1, transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1], delay } }
      }
      whileHover={isIdle ? { y: -2 } : undefined}
      whileTap={isIdle ? { scale: 0.985 } : undefined}
      className="group relative w-full rounded-[28px] flex flex-col justify-between p-5 sm:p-6 touch-manipulation focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground/20 flex-1 min-h-0 overflow-hidden text-left bg-card border border-border/50 transition-colors hover:border-border"
      aria-label={`Open ${title}`}
    >
      {/* Top row: title + arrow button */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        <span className="text-[15px] sm:text-base text-foreground/85 tracking-tight">
          {title}
        </span>
        <span className="h-9 w-9 rounded-full bg-background/60 border border-border/50 flex items-center justify-center text-foreground/70 transition-colors group-hover:text-foreground">
          <ArrowUpRight className="h-4 w-4" strokeWidth={2.2} />
        </span>
      </div>

      {/* Primary metric — huge, with optional small superscript note */}
      <div className="relative z-10 flex items-baseline gap-2 mt-2">
        <span
          className="leading-[0.86] text-foreground block truncate"
          style={{
            fontSize: 'clamp(2.6rem, 10vw, 4rem)',
            letterSpacing: '-0.045em',
            fontFamily: 'var(--font-display)',
            fontWeight: 800,
            textTransform: 'none',
          }}
        >
          {primary}
        </span>
        {primaryNote && (
          <span className="self-start text-[12px] sm:text-[13px] text-foreground/55 tracking-tight">
            {primaryNote}
          </span>
        )}
      </div>

      {/* Progress section: two labels + thin bar */}
      <div className="relative z-10 flex flex-col gap-2 mt-3">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11px] sm:text-[12px] text-foreground/65 tracking-tight">
            {barLabelLeft}
          </span>
          <span className="text-[11px] sm:text-[12px] text-foreground/45 tracking-tight">
            {barLabelRight}
          </span>
        </div>
        <ProgressBar value={pct} />
      </div>
    </motion.button>
  );
}

/* ───────────────────────── Progress bar ───────────────────────── */

function ProgressBar({ value }: { value: number }) {
  // Right side is a dotted "rule" track; left side fills with a solid pill.
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="relative w-full h-3 flex items-center" aria-hidden="true">
      {/* Dotted track */}
      <div
        className="absolute inset-y-0 left-0 right-0 flex items-center"
        style={{
          backgroundImage:
            'repeating-linear-gradient(to right, hsl(var(--foreground) / 0.32) 0 1.5px, transparent 1.5px 5px)',
          maskImage: 'linear-gradient(to bottom, transparent 30%, black 30%, black 70%, transparent 70%)',
          WebkitMaskImage:
            'linear-gradient(to bottom, transparent 30%, black 30%, black 70%, transparent 70%)',
        }}
      />
      {/* Solid filled portion */}
      <div
        className="relative h-2.5 rounded-full bg-background border border-border/60 shadow-[inset_0_1px_2px_rgba(0,0,0,0.04)]"
        style={{ width: `${pct}%`, minWidth: '28px' }}
      >
        {/* Indicator dot */}
        <span
          className="absolute top-1/2 -translate-y-1/2 h-1.5 w-1.5 rounded-full bg-foreground/80"
          style={{ left: '10px' }}
        />
      </div>
    </div>
  );
}
