import { useState, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useSpaces } from '@/contexts/SpacesContext';

/**
 * EntryPortal — the app's home screen at `/`.
 *
 * Three full-width sections stacked vertically: SELF · LIFE · ARCHIVE.
 * Each slides in from offscreen with a staggered ease, shows live data
 * about that part of the app, and hands off to its target route on tap.
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
    }, 320);
  };

  const firstName = (profile?.full_name?.trim().split(/\s+/)[0]) || '';

  // ── Derived stats so each tile feels alive instead of static ──
  const { greeting, dayLabel, dateLabel, todayCount, archiveCount, totalItems, recentArchive } = useMemo(() => {
    const now = new Date();
    const hour = now.getHours();
    const g = hour < 5 ? 'Good night' : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : hour < 21 ? 'Good evening' : 'Good night';
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
      greeting: g,
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
        {/* Atmospheric backdrop — dual radial gradients give the whole page depth */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(120% 60% at 50% -10%, hsl(220 25% 16% / 0.7) 0%, transparent 55%), radial-gradient(140% 80% at 50% 110%, hsl(15 30% 10% / 0.65) 0%, transparent 60%)',
          }}
        />

        {/* Header band */}
        <motion.header
          initial={{ y: -8, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-md mx-auto flex items-end justify-between mb-4"
        >
          <div className="flex flex-col">
            <span
              className="text-[11px] uppercase tabular-nums font-semibold tracking-[0.32em] text-muted-foreground/60"
            >
              {dayLabel} · {dateLabel}
            </span>
            <span
              className="text-foreground"
              style={{
                fontSize: 'clamp(1.5rem, 5.5vw, 2rem)',
                fontFamily: 'var(--font-display)',
                fontWeight: 700,
                letterSpacing: '-0.035em',
                lineHeight: 1.05,
                marginTop: '4px',
              }}
            >
              {greeting}{firstName ? `, ${firstName}` : ''}.
            </span>
          </div>
          {/* Tiny pulse indicator — gives the page a "live" feel */}
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.25em] font-semibold text-muted-foreground/55">
            <motion.span
              className="w-1.5 h-1.5 rounded-full bg-primary/80"
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
            />
            Live
          </div>
        </motion.header>

        {/* Tile stack */}
        <div className="relative flex-1 min-h-0 flex flex-col items-stretch justify-center gap-3.5 w-full max-w-md mx-auto">
          <PortalSection
            slot="top"
            label="SELF"
            sublabel="Identity"
            description={firstName ? `Welcome back, ${firstName}` : 'Your profile'}
            meta={profile?.location ? profile.location : 'Set up your profile'}
            theme={THEMES.self}
            decorative="rings"
            isExiting={exiting === 'self'}
            isOtherExiting={exiting !== null && exiting !== 'self'}
            onClick={() => handleEnter('self')}
          />
          <PortalSection
            slot="middle"
            label="LIFE"
            sublabel="Today"
            description={dayLabel}
            meta={todayCount > 0 ? `${todayCount} ${todayCount === 1 ? 'entry' : 'entries'} today` : 'A blank canvas'}
            theme={THEMES.life}
            decorative="arc"
            isExiting={exiting === 'life'}
            isOtherExiting={exiting !== null && exiting !== 'life'}
            onClick={() => handleEnter('life')}
          />
          <PortalSection
            slot="bottom"
            label="ARCHIVE"
            sublabel={archiveCount === 1 ? '1 archive' : `${archiveCount} archives`}
            description={recentArchive ? `Recent · ${recentArchive}` : 'Start collecting'}
            meta={totalItems > 0 ? `${totalItems.toLocaleString()} ${totalItems === 1 ? 'item' : 'items'}` : 'Empty'}
            theme={THEMES.archive}
            decorative="stack"
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

interface SectionTheme {
  base: string;
  gradient: string;
  accent: string;
  border: string;
  labelColor: string;
  metaColor: string;
  glyphColor: string;
}

const THEMES: Record<PortalTarget, SectionTheme> = {
  self: {
    base: 'hsl(218 14% 11%)',
    gradient:
      'radial-gradient(120% 80% at 18% 12%, hsl(210 35% 26% / 0.95), transparent 60%), radial-gradient(110% 90% at 90% 95%, hsl(220 18% 6% / 0.95), transparent 55%), linear-gradient(165deg, hsl(220 14% 13%) 0%, hsl(220 12% 8%) 100%)',
    accent: 'radial-gradient(50% 70% at 85% 20%, hsl(205 80% 64% / 0.22), transparent 70%)',
    border: 'hsl(210 20% 92% / 0.07)',
    labelColor: 'hsl(0 0% 96%)',
    metaColor: 'hsl(210 25% 80% / 0.6)',
    glyphColor: 'hsl(205 70% 70%)',
  },
  life: {
    base: 'hsl(28 14% 13%)',
    gradient:
      'radial-gradient(120% 80% at 82% 12%, hsl(28 50% 26% / 0.9), transparent 60%), radial-gradient(110% 90% at 10% 95%, hsl(20 18% 6% / 0.95), transparent 55%), linear-gradient(195deg, hsl(28 14% 15%) 0%, hsl(20 12% 9%) 100%)',
    accent: 'radial-gradient(55% 70% at 15% 20%, hsl(32 90% 62% / 0.22), transparent 70%)',
    border: 'hsl(28 25% 92% / 0.08)',
    labelColor: 'hsl(36 28% 96%)',
    metaColor: 'hsl(32 35% 82% / 0.6)',
    glyphColor: 'hsl(32 85% 68%)',
  },
  archive: {
    base: 'hsl(15 14% 14%)',
    gradient:
      'radial-gradient(120% 80% at 50% 110%, hsl(15 45% 24% / 0.92), transparent 60%), radial-gradient(110% 90% at 90% 5%, hsl(15 16% 8% / 0.95), transparent 55%), linear-gradient(180deg, hsl(15 14% 16%) 0%, hsl(15 12% 10%) 100%)',
    accent: 'radial-gradient(65% 70% at 50% 100%, hsl(8 80% 60% / 0.2), transparent 75%)',
    border: 'hsl(15 25% 92% / 0.08)',
    labelColor: 'hsl(36 28% 96%)',
    metaColor: 'hsl(15 35% 82% / 0.6)',
    glyphColor: 'hsl(8 75% 66%)',
  },
};

/* ───────────────────────── Section ───────────────────────── */

interface PortalSectionProps {
  label: string;
  sublabel: string;
  description: string;
  meta: string;
  slot: StackSlot;
  theme: SectionTheme;
  decorative: 'rings' | 'arc' | 'stack';
  isExiting: boolean;
  isOtherExiting: boolean;
  onClick: () => void;
}

const SLOT_DELAY: Record<StackSlot, number> = { top: 0, middle: 0.08, bottom: 0.16 };
const SLOT_ENTRY_X: Record<StackSlot, string> = { top: '110%', middle: '-110%', bottom: '110%' };
const SLOT_EXIT_X: Record<StackSlot, string> = { top: '-110%', middle: '110%', bottom: '-110%' };
const SLOT_NUMBER: Record<StackSlot, string> = { top: '01', middle: '02', bottom: '03' };

function PortalSection({ label, sublabel, description, meta, slot, theme, decorative, isExiting, isOtherExiting, onClick }: PortalSectionProps) {
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
          transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1], delay },
        }
      }
      whileHover={isIdle ? { scale: 1.012, y: -2 } : undefined}
      whileTap={isIdle ? { scale: 0.985 } : undefined}
      className="group relative w-full rounded-[28px] flex flex-col justify-between p-6 touch-manipulation focus:outline-none flex-1 min-h-0 overflow-hidden text-left"
      style={{
        background: theme.base,
        boxShadow:
          '0 30px 60px -22px hsl(220 30% 2% / 0.7), 0 14px 28px -14px hsl(220 30% 2% / 0.5), inset 0 1px 0 hsl(0 0% 100% / 0.04)',
      }}
      aria-label={`Enter ${label}`}
    >
      {/* Atmospheric base gradient */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: theme.gradient }} />
      {/* Tinted accent glow */}
      <div aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: theme.accent }} />
      {/* Hairline inner border */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none rounded-[28px]"
        style={{ boxShadow: `inset 0 0 0 1px ${theme.border}` }}
      />
      {/* Film grain — very faint dotted texture */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-[0.05] mix-blend-overlay"
        style={{
          backgroundImage: 'radial-gradient(hsl(0 0% 100%) 0.5px, transparent 0.5px)',
          backgroundSize: '3px 3px',
        }}
      />
      {/* Decorative glyph — large, abstract, drifts subtly */}
      <DecorativeMark variant={decorative} color={theme.glyphColor} />

      {/* Top row: sublabel chip + slot number with rule */}
      <div className="relative z-10 flex items-start justify-between gap-3">
        <span
          className="inline-flex items-center gap-2 rounded-full px-2.5 py-1"
          style={{
            background: 'hsl(0 0% 100% / 0.06)',
            border: `1px solid ${theme.border}`,
          }}
        >
          <span
            className="w-1.5 h-1.5 rounded-full"
            style={{ background: theme.glyphColor, opacity: 0.85 }}
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
        <div className="flex items-center gap-2">
          <span
            className="w-6 h-px transition-all duration-300 group-hover:w-10"
            style={{ background: theme.metaColor, opacity: 0.45 }}
          />
          <span
            className="font-mono tabular-nums"
            style={{
              fontSize: '11px',
              letterSpacing: '0.1em',
              color: theme.metaColor,
              opacity: 0.75,
            }}
          >
            {SLOT_NUMBER[slot]}
          </span>
        </div>
      </div>

      {/* Bottom block: huge label + description + meta */}
      <div className="relative z-10 flex flex-col gap-2">
        <span
          className="leading-[0.88] uppercase block"
          style={{
            fontSize: 'clamp(2.8rem, 10vw, 4.5rem)',
            letterSpacing: '-0.055em',
            color: theme.labelColor,
            fontWeight: 700,
            fontFamily: 'var(--font-display)',
            textShadow: '0 2px 30px hsl(220 30% 2% / 0.45)',
          }}
        >
          {label}
        </span>
        <div className="flex items-baseline justify-between gap-3 mt-0.5">
          <span
            className="truncate"
            style={{
              fontSize: '13px',
              fontWeight: 500,
              color: theme.labelColor,
              opacity: 0.82,
              letterSpacing: '-0.005em',
            }}
          >
            {description}
          </span>
          <span
            className="shrink-0 uppercase tabular-nums"
            style={{
              fontSize: '10px',
              fontWeight: 600,
              letterSpacing: '0.18em',
              color: theme.metaColor,
            }}
          >
            {meta}
          </span>
        </div>
      </div>
    </motion.button>
  );
}

/* ───────────────────────── Decorative marks ───────────────────────── */

// Each section has its own abstract glyph. Pure SVG so they stay crisp,
// positioned absolutely, with a slow continuous drift loop to feel alive
// without distracting from the label.

function DecorativeMark({ variant, color }: { variant: 'rings' | 'arc' | 'stack'; color: string }) {
  return (
    <motion.div
      aria-hidden
      className="absolute pointer-events-none"
      style={{
        right: variant === 'arc' ? '-2rem' : '-1rem',
        top: variant === 'rings' ? '-1rem' : variant === 'stack' ? '0.5rem' : '-2rem',
        bottom: variant === 'stack' ? '-1rem' : 'auto',
        width: '13rem',
        height: '13rem',
        opacity: 0.7,
      }}
      animate={{ y: [0, -6, 0], rotate: variant === 'rings' ? [0, 4, 0] : 0 }}
      transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
    >
      {variant === 'rings' && (
        <svg viewBox="0 0 200 200" className="w-full h-full">
          <circle cx="100" cy="100" r="86" fill="none" stroke={color} strokeOpacity="0.18" strokeWidth="1" />
          <circle cx="100" cy="100" r="64" fill="none" stroke={color} strokeOpacity="0.32" strokeWidth="1" />
          <circle cx="100" cy="100" r="42" fill="none" stroke={color} strokeOpacity="0.5" strokeWidth="1" />
          <circle cx="100" cy="100" r="22" fill="none" stroke={color} strokeOpacity="0.7" strokeWidth="1.25" />
          <circle cx="100" cy="100" r="6" fill={color} fillOpacity="0.85" />
          {/* Orbiting dot */}
          <circle cx="186" cy="100" r="3" fill={color} fillOpacity="0.9" />
        </svg>
      )}
      {variant === 'arc' && (
        <svg viewBox="0 0 220 220" className="w-full h-full">
          {/* Sun-arc: a partial ring with rays */}
          <path
            d="M 30 150 A 80 80 0 0 1 190 150"
            fill="none"
            stroke={color}
            strokeOpacity="0.55"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <path
            d="M 50 150 A 60 60 0 0 1 170 150"
            fill="none"
            stroke={color}
            strokeOpacity="0.35"
            strokeWidth="1"
            strokeLinecap="round"
          />
          {/* Rays */}
          {[0, 1, 2, 3, 4, 5, 6].map((i) => {
            const angle = (180 + (i * 30) / 6 * 6) * (Math.PI / 180);
            const x1 = 110 + Math.cos(angle) * 92;
            const y1 = 150 + Math.sin(angle) * 92;
            const x2 = 110 + Math.cos(angle) * 104;
            const y2 = 150 + Math.sin(angle) * 104;
            return (
              <line
                key={i}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={color}
                strokeOpacity="0.55"
                strokeWidth="1.25"
                strokeLinecap="round"
              />
            );
          })}
          {/* Horizon line */}
          <line x1="20" y1="150" x2="200" y2="150" stroke={color} strokeOpacity="0.25" strokeWidth="1" />
        </svg>
      )}
      {variant === 'stack' && (
        <svg viewBox="0 0 220 220" className="w-full h-full">
          {/* Stacked layers — like a folder/file stack viewed obliquely */}
          {[0, 1, 2, 3, 4].map((i) => {
            const y = 60 + i * 22;
            const offset = (4 - i) * 8;
            return (
              <rect
                key={i}
                x={30 + offset}
                y={y}
                width={160 - offset * 2}
                height={18}
                rx={4}
                fill="none"
                stroke={color}
                strokeOpacity={0.18 + i * 0.12}
                strokeWidth={1}
              />
            );
          })}
        </svg>
      )}
    </motion.div>
  );
}
