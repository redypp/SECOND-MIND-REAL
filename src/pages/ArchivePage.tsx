import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Users, Pin } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { AddSpaceDialog } from '@/components/AddSpaceDialog';
import { BottomNavigation } from '@/components/BottomNavigation';
import { PortalReturn } from '@/components/PortalReturn';
import { useDominantColor } from '@/hooks/useDominantColor';
import type { Space } from '@/types';

/**
 * ArchivePage — a coverflow-style carousel of archives.
 *
 * Each archive is a floating card that takes up most of the viewport but
 * leaves room on either side for the previous / next archive to peek in.
 * The page background tints to the dominant color of the active archive's
 * cover image so the whole view feels cohesive. A prominent position bar
 * at the bottom shows where you are in the stack.
 */

interface ArchivePageProps {
  embedded?: boolean;
  onNavigateToSpace?: (spaceId: string) => void;
}

type Spread =
  | { kind: 'space'; space: Space; section: 'pinned' | 'recent' | 'shared' }
  | { kind: 'new' };

export default function ArchivePage({ embedded = false, onNavigateToSpace }: ArchivePageProps) {
  const navigate = useNavigate();
  const { spaces, sharedSpaces } = useSpaces();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const spreads = useMemo<Spread[]>(() => {
    const pinned = spaces
      .filter(s => s.isPinned)
      .sort((a, b) => (b.pinnedAt?.getTime() ?? 0) - (a.pinnedAt?.getTime() ?? 0));
    const recent = spaces
      .filter(s => !s.isPinned)
      .sort((a, b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0));

    const arr: Spread[] = [];
    pinned.forEach(space => arr.push({ kind: 'space', space, section: 'pinned' }));
    recent.forEach(space => arr.push({ kind: 'space', space, section: 'recent' }));
    sharedSpaces.forEach(space => arr.push({ kind: 'space', space, section: 'shared' }));
    arr.push({ kind: 'new' });
    return arr;
  }, [spaces, sharedSpaces]);

  // Derive the currently-centered spread from scrollLeft. Each card is a
  // fixed fraction of the container width (see CARD_FRACTION) so we can
  // compute index = round(scrollLeft / cardStep).
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const step = el.clientWidth * CARD_FRACTION;
        if (step === 0) return;
        const idx = Math.round(el.scrollLeft / step);
        setActiveIndex(prev => (prev === idx ? prev : idx));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Desktop: arrow keys page through the stack.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = scrollerRef.current;
      if (!el) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      const step = el.clientWidth * CARD_FRACTION;
      if (e.key === 'ArrowRight') el.scrollBy({ left: step, behavior: 'smooth' });
      else if (e.key === 'ArrowLeft') el.scrollBy({ left: -step, behavior: 'smooth' });
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const goToSpread = useCallback((idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    const step = el.clientWidth * CARD_FRACTION;
    el.scrollTo({ left: idx * step, behavior: 'smooth' });
  }, []);

  const enterSpace = useCallback((spaceId: string) => {
    if (onNavigateToSpace) onNavigateToSpace(spaceId);
    else navigate(`/space/${spaceId}`);
  }, [onNavigateToSpace, navigate]);

  const hasAnySpaces = spaces.length > 0 || sharedSpaces.length > 0;
  const activeSpread = spreads[activeIndex];
  const activeImage = activeSpread?.kind === 'space' ? activeSpread.space.image : undefined;
  const dominant = useDominantColor(activeImage);

  return (
    <div
      className={`${embedded ? 'relative w-full h-full' : 'fixed inset-0 safe-area-top-ios'} flex flex-col max-w-full overflow-hidden`}
      style={{
        background: activeImage ? dominant : 'hsl(220 12% 10%)',
        transition: 'background 600ms cubic-bezier(0.16, 1, 0.3, 1)',
        overscrollBehavior: 'contain',
      }}
    >
      {/* Minimal masthead */}
      <Masthead />

      {/* Coverflow carousel */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden scrollbar-hide items-center"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
          // Leading/trailing padding so first & last cards can snap to center
          // with visible whitespace on the outside (no awkward flush-to-edge).
          paddingLeft: `calc(50% - ${CARD_FRACTION * 50}%)`,
          paddingRight: `calc(50% - ${CARD_FRACTION * 50}%)`,
        }}
      >
        {!hasAnySpaces ? (
          <EmptyCard onNavigateToSpace={onNavigateToSpace} />
        ) : (
          spreads.map((spread, i) => (
            <CardSlot key={spread.kind === 'space' ? spread.space.id : '__new__'} isActive={i === activeIndex}>
              {spread.kind === 'space' ? (
                <SpaceCard
                  space={spread.space}
                  section={spread.section}
                  isActive={i === activeIndex}
                  onEnter={() => enterSpace(spread.space.id)}
                />
              ) : (
                <NewArchiveCard onNavigateToSpace={onNavigateToSpace} />
              )}
            </CardSlot>
          ))
        )}
      </div>

      {/* Prominent position bar */}
      {hasAnySpaces && (
        <PositionBar
          spreads={spreads}
          activeIndex={activeIndex}
          onJump={goToSpread}
        />
      )}

      {!embedded && <BottomNavigation />}
    </div>
  );
}

/* ───────────────────────── Layout constants ───────────────────────── */

// What fraction of the viewport width each card occupies.
// 0.78 leaves ~11% peek on each side so prev/next are clearly visible but
// the active card still dominates.
const CARD_FRACTION = 0.78;

/* ───────────────────────── Masthead ───────────────────────── */

function Masthead() {
  return (
    <header className="relative z-20 flex items-center justify-between gap-4 px-5 pt-4 pb-3">
      <div className="flex items-center gap-3 min-w-0">
        <PortalReturn />
        <span
          className="uppercase leading-none text-[hsl(36_33%_98%)]"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(1.4rem, 4.5vw, 1.9rem)',
            letterSpacing: '-0.035em',
          }}
        >
          Archive
        </span>
      </div>
    </header>
  );
}

/* ───────────────────────── Card slot (snap target + peek scaling) ───────────────────────── */

function CardSlot({ isActive, children }: { isActive: boolean; children: React.ReactNode }) {
  return (
    <div
      className="shrink-0 h-full flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
      style={{
        width: `${CARD_FRACTION * 100}%`,
        scrollSnapAlign: 'center',
        scrollSnapStop: 'always',
        // Non-active cards shrink slightly + fade — gives depth without
        // crossing into gimmicky. Active card sits fully forward.
        transform: isActive ? 'scale(1)' : 'scale(0.92)',
        opacity: isActive ? 1 : 0.55,
      }}
    >
      {children}
    </div>
  );
}

/* ───────────────────────── Space card ───────────────────────── */

function SpaceCard({
  space,
  section,
  isActive,
  onEnter,
}: {
  space: Space;
  section: 'pinned' | 'recent' | 'shared';
  isActive: boolean;
  onEnter: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onEnter}
      className="group relative w-full block text-left"
      style={{
        // Card height leaves breathing room at top/bottom so it feels propped
        // up rather than full-bleed.
        height: 'min(80%, 38rem)',
      }}
      aria-label={`Open ${space.name}`}
    >
      <div
        className="relative w-full h-full rounded-[28px] overflow-hidden"
        style={{
          boxShadow:
            '0 40px 80px -20px hsl(220 15% 4% / 0.55), 0 18px 32px -12px hsl(220 15% 4% / 0.35)',
        }}
      >
        {/* Cover image fills the card. object-cover keeps it clean and fit
            — no letterboxing, no awkward crops. */}
        {space.image ? (
          <img
            src={space.image}
            alt=""
            loading="lazy"
            decoding="async"
            crossOrigin="anonymous"
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: space.color
                ? `linear-gradient(155deg, ${space.color} 0%, ${space.color}dd 60%, hsl(220 14% 10%) 100%)`
                : 'linear-gradient(155deg, hsl(8 78% 48%) 0%, hsl(10 55% 32%) 55%, hsl(220 14% 10%) 100%)',
            }}
          />
        )}

        {/* Bottom ink wash — just enough to keep the title legible without
            drowning the image. */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'linear-gradient(180deg, hsl(220 15% 4% / 0) 45%, hsl(220 15% 4% / 0.65) 100%)',
          }}
        />

        {/* Corner indicators — tiny, quiet, no text chrome */}
        <div className="absolute top-4 left-4 right-4 flex items-start justify-between pointer-events-none">
          {space.isPinned ? (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(36_33%_98%_/_0.18)] backdrop-blur-md">
              <Pin className="w-3.5 h-3.5 text-[hsl(36_33%_98%)]" />
            </span>
          ) : section === 'shared' ? (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-[hsl(36_33%_98%_/_0.18)] backdrop-blur-md">
              <Users className="w-3.5 h-3.5 text-[hsl(36_33%_98%)]" />
            </span>
          ) : <span />}
        </div>

        {/* Title + count */}
        <motion.div
          className="absolute left-5 right-5 bottom-5 text-[hsl(36_33%_98%)]"
          initial={false}
          animate={isActive ? { y: 0, opacity: 1 } : { y: 8, opacity: 0.9 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        >
          <span
            className="block uppercase leading-[0.9]"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(2rem, 7vw, 3.25rem)',
              letterSpacing: '-0.04em',
              textShadow: '0 2px 18px hsl(220 15% 4% / 0.55)',
              wordBreak: 'break-word',
            }}
          >
            {space.name}
          </span>
          {typeof space.itemCount === 'number' && space.itemCount > 0 && (
            <span
              className="mt-2 inline-block uppercase tracking-[0.28em] opacity-80"
              style={{
                fontFamily: 'var(--font-sans)',
                fontSize: '0.7rem',
                fontWeight: 500,
              }}
            >
              {space.itemCount} {space.itemCount === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </motion.div>
      </div>
    </button>
  );
}

/* ───────────────────────── "New archive" card ───────────────────────── */

function NewArchiveCard({ onNavigateToSpace }: { onNavigateToSpace?: (spaceId: string) => void }) {
  return (
    <div
      className="relative w-full rounded-[28px] overflow-hidden bg-[hsl(36_28%_96%)] flex flex-col items-start justify-between p-7"
      style={{
        height: 'min(80%, 38rem)',
        boxShadow:
          '0 40px 80px -20px hsl(220 15% 4% / 0.45), 0 18px 32px -12px hsl(220 15% 4% / 0.3)',
      }}
    >
      <span
        className="text-[0.65rem] uppercase tracking-[0.35em] text-foreground/60"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        New archive
      </span>

      <div className="flex flex-col items-start gap-5 max-w-md">
        <span
          className="uppercase leading-[0.9]"
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 900,
            fontSize: 'clamp(2rem, 8vw, 3.5rem)',
            letterSpacing: '-0.04em',
            color: 'hsl(20 14% 8%)',
          }}
        >
          Start a new<br />archive<span className="text-primary">.</span>
        </span>
        <p
          className="text-foreground/70"
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', lineHeight: 1.5 }}
        >
          A corner of your mind worth keeping — fill it with anything: notes, photos, links, tables.
        </p>

        <AddSpaceDialog
          variant="button"
          navigateAfterCreate={!onNavigateToSpace}
          onAfterCreate={onNavigateToSpace}
        />
      </div>

      <span />
    </div>
  );
}

/* ───────────────────────── Empty state (no archives yet) ───────────────────────── */

function EmptyCard({ onNavigateToSpace }: { onNavigateToSpace?: (spaceId: string) => void }) {
  return (
    <div
      className="shrink-0 h-full flex items-center justify-center"
      style={{ width: `${CARD_FRACTION * 100}%`, scrollSnapAlign: 'center' }}
    >
      <div
        className="relative w-full rounded-[28px] overflow-hidden bg-[hsl(36_28%_96%)] flex flex-col items-center justify-center gap-6 p-8 text-center"
        style={{
          height: 'min(80%, 38rem)',
          boxShadow: '0 40px 80px -20px hsl(220 15% 4% / 0.45)',
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          className="inline-flex items-center justify-center w-20 h-20 border-2 border-dashed border-foreground/30 rounded-full"
        >
          <Plus className="w-8 h-8 text-foreground/60" />
        </motion.div>
        <div className="max-w-xs">
          <span
            className="block uppercase leading-[0.9]"
            style={{
              fontFamily: 'var(--font-display)',
              fontWeight: 900,
              fontSize: 'clamp(1.8rem, 7vw, 2.75rem)',
              letterSpacing: '-0.035em',
              color: 'hsl(20 14% 8%)',
            }}
          >
            A blank<br />issue.
          </span>
          <p
            className="mt-4 text-foreground/70"
            style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', lineHeight: 1.55 }}
          >
            Archives are your collections — ideas, hobbies, trips, people. Make your first one and it becomes the cover.
          </p>
        </div>
        <AddSpaceDialog
          variant="button"
          navigateAfterCreate={!onNavigateToSpace}
          onAfterCreate={onNavigateToSpace}
        />
      </div>
    </div>
  );
}

/* ───────────────────────── Prominent position bar ───────────────────────── */

function PositionBar({
  spreads,
  activeIndex,
  onJump,
}: {
  spreads: Spread[];
  activeIndex: number;
  onJump: (idx: number) => void;
}) {
  const total = spreads.length;
  const current = spreads[activeIndex];
  const currentLabel =
    current?.kind === 'space' ? current.space.name
    : current?.kind === 'new' ? 'New archive'
    : '';

  // For long lists, switch to a compact "3 / 24" counter with bars so we
  // don't overflow a skinny viewport.
  const useCompact = total > 16;

  return (
    <div
      className="pointer-events-none absolute left-0 right-0 z-20 px-5"
      style={{ bottom: 'calc(var(--app-safe-bottom, 0px) + 66px)' }}
    >
      <div className="pointer-events-auto mx-auto max-w-2xl flex flex-col items-center gap-2">
        {/* Current-archive name above the bar — always visible, so you
            never wonder which one you're on. */}
        <span
          className="uppercase tracking-[0.3em] text-[hsl(36_33%_98%)] drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]"
          style={{
            fontFamily: 'var(--font-sans)',
            fontSize: '0.7rem',
            fontWeight: 600,
            maxWidth: '90vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {currentLabel}
        </span>

        {useCompact ? (
          <CompactBar total={total} activeIndex={activeIndex} onJump={onJump} />
        ) : (
          <DotBar total={total} activeIndex={activeIndex} onJump={onJump} />
        )}
      </div>
    </div>
  );
}

function DotBar({
  total,
  activeIndex,
  onJump,
}: {
  total: number;
  activeIndex: number;
  onJump: (idx: number) => void;
}) {
  return (
    <div className="flex items-center gap-2 px-3.5 py-2 rounded-full bg-[hsl(220_15%_4%_/_0.45)] backdrop-blur-md border border-[hsl(36_33%_98%_/_0.12)]">
      {Array.from({ length: total }).map((_, i) => {
        const isActive = i === activeIndex;
        return (
          <button
            key={i}
            onClick={() => onJump(i)}
            className="group flex items-center justify-center"
            aria-label={`Go to archive ${i + 1}`}
          >
            <span
              className={`block rounded-full transition-all duration-300 ${
                isActive
                  ? 'w-6 h-2 bg-[hsl(36_33%_98%)]'
                  : 'w-2 h-2 bg-[hsl(36_33%_98%_/_0.4)] group-hover:bg-[hsl(36_33%_98%_/_0.7)]'
              }`}
            />
          </button>
        );
      })}
    </div>
  );
}

function CompactBar({
  total,
  activeIndex,
  onJump,
}: {
  total: number;
  activeIndex: number;
  onJump: (idx: number) => void;
}) {
  const pct = total <= 1 ? 0 : (activeIndex / (total - 1)) * 100;
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-full bg-[hsl(220_15%_4%_/_0.45)] backdrop-blur-md border border-[hsl(36_33%_98%_/_0.12)] min-w-[14rem]">
      <button
        onClick={() => onJump(0)}
        className="text-[0.65rem] uppercase tracking-[0.25em] text-[hsl(36_33%_98%_/_0.6)] hover:text-[hsl(36_33%_98%)] transition-colors tabular-nums"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {String(activeIndex + 1).padStart(2, '0')}
      </button>
      <div className="relative flex-1 h-1 rounded-full bg-[hsl(36_33%_98%_/_0.15)] overflow-hidden">
        <div
          className="absolute top-0 left-0 h-full rounded-full bg-[hsl(36_33%_98%)] transition-[width] duration-300 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>
      <button
        onClick={() => onJump(total - 1)}
        className="text-[0.65rem] uppercase tracking-[0.25em] text-[hsl(36_33%_98%_/_0.6)] hover:text-[hsl(36_33%_98%)] transition-colors tabular-nums"
        style={{ fontFamily: 'var(--font-sans)' }}
      >
        {String(total).padStart(2, '0')}
      </button>
    </div>
  );
}
