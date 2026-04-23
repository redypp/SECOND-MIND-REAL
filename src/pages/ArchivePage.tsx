import { useMemo, useRef, useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Users, ChevronRight, Pin } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { AddSpaceDialog } from '@/components/AddSpaceDialog';
import { BottomNavigation } from '@/components/BottomNavigation';
import type { Space } from '@/types';

/**
 * ArchivePage — magazine-style horizontal swipe through archives.
 *
 * Instead of a grid, each archive is a full-bleed "spread". Pinned archives
 * come first, then the most recently-used, then shared-with-me. A final
 * "New archive" spread lets the user create without leaving the flow.
 * Tapping any spread enters the archive (SpaceDetail). Horizontal scroll-
 * snap drives the pagination — smooth on both mobile (native swipe) and
 * desktop (trackpad / arrow keys).
 */

interface ArchivePageProps {
  embedded?: boolean;
  onNavigateToSpace?: (spaceId: string) => void;
}

type Spread =
  | { kind: 'space'; space: Space; section: 'pinned' | 'recent' | 'shared'; index: number }
  | { kind: 'new' };

const SWIPE_HINT_FLAG = 'smind_archive_swipe_hint_seen_v1';

export default function ArchivePage({ embedded = false, onNavigateToSpace }: ArchivePageProps) {
  const navigate = useNavigate();
  const { spaces, sharedSpaces } = useSpaces();
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const [showSwipeHint, setShowSwipeHint] = useState<boolean>(() => {
    try { return sessionStorage.getItem(SWIPE_HINT_FLAG) !== 'true'; } catch { return true; }
  });

  // Dismiss the hint as soon as the user moves past the first spread.
  useEffect(() => {
    if (activeIndex > 0 && showSwipeHint) {
      setShowSwipeHint(false);
      try { sessionStorage.setItem(SWIPE_HINT_FLAG, 'true'); } catch { /* ignore */ }
    }
  }, [activeIndex, showSwipeHint]);

  const spreads = useMemo<Spread[]>(() => {
    const pinned = spaces
      .filter(s => s.isPinned)
      .sort((a, b) => (b.pinnedAt?.getTime() ?? 0) - (a.pinnedAt?.getTime() ?? 0));
    const recent = spaces
      .filter(s => !s.isPinned)
      .sort((a, b) => (b.lastUsedAt?.getTime() ?? 0) - (a.lastUsedAt?.getTime() ?? 0));

    const arr: Spread[] = [];
    pinned.forEach((space, i) => arr.push({ kind: 'space', space, section: 'pinned', index: i }));
    recent.forEach((space, i) => arr.push({ kind: 'space', space, section: 'recent', index: i }));
    sharedSpaces.forEach((space, i) => arr.push({ kind: 'space', space, section: 'shared', index: i }));
    arr.push({ kind: 'new' });
    return arr;
  }, [spaces, sharedSpaces]);

  // Derive the currently-centered spread from the scroller's scrollLeft.
  // Throttled via rAF so it doesn't thrash during flick scrolls.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const width = el.clientWidth;
        if (width === 0) return;
        const idx = Math.round(el.scrollLeft / width);
        setActiveIndex(prev => (prev === idx ? prev : idx));
      });
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      el.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, []);

  // Desktop: arrow keys paginate between spreads.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const el = scrollerRef.current;
      if (!el) return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight') {
        el.scrollBy({ left: el.clientWidth, behavior: 'smooth' });
      } else if (e.key === 'ArrowLeft') {
        el.scrollBy({ left: -el.clientWidth, behavior: 'smooth' });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const goToSpread = useCallback((idx: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: idx * el.clientWidth, behavior: 'smooth' });
  }, []);

  const enterSpace = useCallback((spaceId: string) => {
    if (onNavigateToSpace) onNavigateToSpace(spaceId);
    else navigate(`/space/${spaceId}`);
  }, [onNavigateToSpace, navigate]);

  const hasAnySpaces = spaces.length > 0 || sharedSpaces.length > 0;

  return (
    <div
      className={`${embedded ? 'relative w-full h-full' : 'fixed inset-0 safe-area-top-ios'} flex flex-col bg-background max-w-full overflow-hidden`}
      style={{ overscrollBehavior: 'contain' }}
    >
      {/* Masthead — magazine-style minimal header */}
      <Masthead
        totalCount={spreads.length - 1 /* minus the "new" spread */}
        activeIndex={activeIndex}
        spreads={spreads}
      />

      {/* Horizontal scroll-snap carousel — one spread per viewport width */}
      <div
        ref={scrollerRef}
        className="flex-1 min-h-0 flex overflow-x-auto overflow-y-hidden scrollbar-hide swipe-container"
        style={{
          scrollSnapType: 'x mandatory',
          WebkitOverflowScrolling: 'touch',
          overscrollBehaviorX: 'contain',
        }}
      >
        {!hasAnySpaces ? (
          <EmptyStateSpread onNavigateToSpace={onNavigateToSpace} />
        ) : (
          spreads.map((spread, i) => (
            <div
              key={spread.kind === 'space' ? spread.space.id : '__new__'}
              className="relative shrink-0 h-full"
              style={{
                width: '100%',
                minWidth: '100%',
                flexBasis: '100%',
                scrollSnapAlign: 'center',
                scrollSnapStop: 'always',
              }}
            >
              {spread.kind === 'space' ? (
                <SpaceSpread
                  space={spread.space}
                  section={spread.section}
                  issueNumber={i + 1}
                  totalCount={spreads.length - 1}
                  isActive={i === activeIndex}
                  onEnter={() => enterSpace(spread.space.id)}
                />
              ) : (
                <NewArchiveSpread
                  issueNumber={i + 1}
                  totalCount={spreads.length - 1}
                  onNavigateToSpace={onNavigateToSpace}
                />
              )}
            </div>
          ))
        )}
      </div>

      {/* Bottom: page dots + floating add — only when there's content */}
      {hasAnySpaces && (
        <PageDots
          total={spreads.length}
          activeIndex={activeIndex}
          onJump={goToSpread}
        />
      )}

      {/* First-visit swipe hint — fades out once the user moves past spread 1.
          There to reassure users that their archives aren't gone, just paginated. */}
      {hasAnySpaces && showSwipeHint && spreads.length > 1 && activeIndex === 0 && (
        <motion.div
          key="swipe-hint"
          initial={{ opacity: 0, x: 0 }}
          animate={{ opacity: 0.9, x: [0, 10, 0] }}
          exit={{ opacity: 0 }}
          transition={{ opacity: { duration: 0.6, delay: 0.4 }, x: { duration: 1.6, repeat: Infinity, ease: 'easeInOut', delay: 0.4 } }}
          className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 z-20 flex items-center gap-2 px-3 py-2 rounded-full bg-[hsl(36_33%_98%_/_0.88)] backdrop-blur border border-foreground/10 shadow-lg"
        >
          <span
            className="text-[0.65rem] uppercase tracking-[0.3em] text-foreground/75"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Swipe
          </span>
          <ChevronRight className="w-3.5 h-3.5 text-foreground/70" />
        </motion.div>
      )}

      {!embedded && <BottomNavigation />}
    </div>
  );
}

/* ─────────────────────── Masthead (top strip) ─────────────────────── */

function Masthead({
  totalCount,
  activeIndex,
  spreads,
}: {
  totalCount: number;
  activeIndex: number;
  spreads: Spread[];
}) {
  const current = spreads[activeIndex];
  const positionLabel = current?.kind === 'new'
    ? 'New'
    : totalCount > 0
      ? `${Math.min(activeIndex + 1, totalCount)} of ${totalCount}`
      : '';

  return (
    <header className="relative z-20 flex items-end justify-between px-5 pt-4 pb-3 border-b border-foreground/10">
      <span
        className="leading-none tilt-xs"
        style={{
          fontFamily: 'var(--font-display)',
          fontVariationSettings: '"SOFT" 70, "WONK" 1, "opsz" 144',
          fontWeight: 900,
          fontSize: 'clamp(1.6rem, 5.5vw, 2.4rem)',
          letterSpacing: '-0.03em',
        }}
      >
        Archive
      </span>

      {positionLabel && (
        <span
          className="text-[0.7rem] uppercase tracking-[0.25em] text-foreground/60 tabular-nums shrink-0"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          {positionLabel}
        </span>
      )}
    </header>
  );
}

/* ─────────────────────── Single archive "spread" ─────────────────────── */

function SpaceSpread({
  space,
  section,
  issueNumber,
  totalCount,
  isActive,
  onEnter,
}: {
  space: Space;
  section: 'pinned' | 'recent' | 'shared';
  issueNumber: number;
  totalCount: number;
  isActive: boolean;
  onEnter: () => void;
}) {
  // Subtle parallax: title nudges slightly when this spread becomes active.
  const titleRotate = useMemo(() => {
    // Deterministic tiny rotation per space, keeps the editorial off-grid feel.
    const seed = [...space.id].reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const amount = ((seed % 11) - 5) * 0.18; // ~ -0.9° to +0.9°
    return amount;
  }, [space.id]);

  const sectionLabel =
    section === 'pinned' ? 'Pinned' :
    section === 'shared' ? 'Shared' : 'Recent';

  return (
    <button
      type="button"
      onClick={onEnter}
      className="group relative w-full h-full block text-left overflow-hidden"
      aria-label={`Open ${space.name}`}
    >
      {/* Full-bleed background: cover image if present, else warm gradient */}
      <div className="absolute inset-0" style={{ transform: 'translateZ(0)' }}>
        {space.image ? (
          <>
            <img
              src={space.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 w-full h-full object-cover"
            />
            {/* Warm tint + bottom ink gradient for legibility */}
            <div className="absolute inset-0" style={{
              background:
                'linear-gradient(180deg, hsl(20 14% 8% / 0.0) 0%, hsl(20 14% 8% / 0.25) 45%, hsl(20 14% 8% / 0.85) 100%)',
            }} />
          </>
        ) : (
          <div
            className="absolute inset-0"
            style={{
              background: space.color
                ? `linear-gradient(155deg, ${space.color} 0%, ${space.color}dd 60%, hsl(20 14% 12%) 100%)`
                : 'linear-gradient(155deg, hsl(8 78% 48%) 0%, hsl(10 55% 32%) 55%, hsl(20 14% 12%) 100%)',
            }}
          />
        )}
        {/* Fine warm grain so flat color blocks don't feel sterile */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-40 mix-blend-overlay"
          style={{
            backgroundImage:
              'radial-gradient(1px 1px at 20% 30%, hsl(40 33% 98% / 0.18) 50%, transparent 51%), radial-gradient(1px 1px at 80% 70%, hsl(40 33% 98% / 0.14) 50%, transparent 51%)',
            backgroundSize: '160px 160px, 200px 200px',
          }}
        />
      </div>

      {/* Content layer */}
      <div className="relative z-10 w-full h-full flex flex-col justify-between px-6 pt-6 pb-24 text-[hsl(36_33%_98%)]">
        {/* Top meta row — section, pin indicator, last-used date */}
        <div className="flex items-start justify-between gap-4">
          <div className="flex flex-col gap-1.5">
            {space.isPinned ? (
              <span className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.35em] opacity-85">
                <Pin className="w-3 h-3" />
                Pinned
              </span>
            ) : section === 'shared' ? (
              <span className="inline-flex items-center gap-1.5 text-[0.65rem] uppercase tracking-[0.35em] opacity-85">
                <Users className="w-3 h-3" />
                Shared with you
              </span>
            ) : (
              <span
                className="text-[0.65rem] uppercase tracking-[0.35em] opacity-80"
                style={{ fontFamily: 'var(--font-sans)' }}
              >
                {sectionLabel}
              </span>
            )}
          </div>

          <span
            className="text-[0.625rem] uppercase tracking-[0.3em] opacity-60 text-right"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            {formatShortDate(space.lastUsedAt ?? space.pinnedAt)}
          </span>
        </div>

        {/* Big title block — magazine cover energy */}
        <motion.div
          className="self-start max-w-full"
          initial={false}
          animate={isActive ? { y: 0, opacity: 1 } : { y: 10, opacity: 0.75 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          style={{ transform: `rotate(${titleRotate}deg)`, transformOrigin: 'left bottom' }}
        >
          <span
            className="block uppercase leading-[0.86]"
            style={{
              fontFamily: 'var(--font-display)',
              fontVariationSettings: '"SOFT" 60, "WONK" 1, "opsz" 144',
              fontWeight: 900,
              fontSize: 'clamp(3rem, 15vw, 7.5rem)',
              letterSpacing: '-0.045em',
              textShadow: '0 2px 24px rgba(0,0,0,0.35)',
              wordBreak: 'break-word',
            }}
          >
            {space.name}
          </span>

          {space.itemCount != null && (
            <span
              className="mt-3 inline-block text-[0.7rem] uppercase tracking-[0.35em] opacity-75"
              style={{ fontFamily: 'var(--font-sans)' }}
            >
              {space.itemCount} {space.itemCount === 1 ? 'entry' : 'entries'}
            </span>
          )}
        </motion.div>

        {/* Bottom CTA — "enter the archive" affordance */}
        <div className="flex items-center justify-between gap-4">
          <span
            className="text-[0.65rem] uppercase tracking-[0.35em] opacity-60"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Swipe for more
          </span>
          <span
            className="inline-flex items-center gap-2 text-[0.7rem] uppercase tracking-[0.3em] font-semibold opacity-90 group-active:translate-x-1 transition-transform"
            style={{ fontFamily: 'var(--font-sans)' }}
          >
            Open
            <ChevronRight className="w-4 h-4" />
          </span>
        </div>
      </div>
    </button>
  );
}

/* ─────────────────────── "Create new archive" final spread ─────────────────────── */

function NewArchiveSpread({
  issueNumber,
  totalCount,
  onNavigateToSpace,
}: {
  issueNumber: number;
  totalCount: number;
  onNavigateToSpace?: (spaceId: string) => void;
}) {
  return (
    <div className="relative w-full h-full flex flex-col justify-between px-6 pt-6 pb-24 bg-[hsl(36_28%_96%)] overflow-hidden">
      {/* Paper-ish grain */}
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none opacity-60"
        style={{
          backgroundImage:
            'radial-gradient(1px 1px at 25% 40%, hsl(20 14% 8% / 0.05) 50%, transparent 51%), radial-gradient(1px 1px at 70% 80%, hsl(20 14% 8% / 0.04) 50%, transparent 51%)',
          backgroundSize: '140px 140px, 180px 180px',
        }}
      />

      <div className="relative flex items-start justify-between">
        <span
          className="text-[0.65rem] uppercase tracking-[0.35em] text-foreground/60"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          New archive
        </span>
      </div>

      <div className="relative flex flex-col items-start gap-6">
        <span
          className="uppercase leading-[0.9] tilt-l"
          style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: '"SOFT" 80, "WONK" 1, "opsz" 144',
            fontWeight: 900,
            fontSize: 'clamp(2.4rem, 11vw, 5rem)',
            letterSpacing: '-0.04em',
            color: 'hsl(20 14% 8%)',
          }}
        >
          Start a new<br />archive
          <span className="text-primary">.</span>
        </span>
        <p
          className="max-w-md text-foreground/70"
          style={{ fontFamily: 'var(--font-sans)', fontSize: '0.95rem', lineHeight: 1.5 }}
        >
          Give it a name — a corner of your mind worth keeping. You can come back and fill it with anything: notes, photos, links, tables.
        </p>

        <AddSpaceDialog
          variant="button"
          navigateAfterCreate={!onNavigateToSpace}
          onAfterCreate={onNavigateToSpace}
        />
      </div>

      <div className="relative flex items-center justify-between">
        <span
          className="text-[0.65rem] uppercase tracking-[0.35em] text-foreground/50"
          style={{ fontFamily: 'var(--font-sans)' }}
        >
          Swipe back to your archives
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────── Empty state (first-time user) ─────────────────────── */

function EmptyStateSpread({ onNavigateToSpace }: { onNavigateToSpace?: (spaceId: string) => void }) {
  return (
    <div
      className="relative shrink-0 w-full h-full flex flex-col items-center justify-center gap-6 px-8 bg-[hsl(36_28%_96%)]"
      style={{ scrollSnapAlign: 'center' }}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 0.05, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="inline-flex items-center justify-center w-20 h-20 border-2 border-dashed border-foreground/30 rounded-full"
      >
        <Plus className="w-8 h-8 text-foreground/60" />
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15, duration: 0.5 }}
        className="text-center max-w-md"
      >
        <span
          className="block uppercase leading-[0.9] tilt-xs"
          style={{
            fontFamily: 'var(--font-display)',
            fontVariationSettings: '"SOFT" 70, "WONK" 1, "opsz" 144',
            fontWeight: 900,
            fontSize: 'clamp(2rem, 8vw, 3.25rem)',
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
          Archives are your collections — ideas, hobbies, trips, people. Make your first one and it'll become the cover.
        </p>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25, duration: 0.5 }}
      >
        <AddSpaceDialog
          variant="button"
          navigateAfterCreate={!onNavigateToSpace}
          onAfterCreate={onNavigateToSpace}
        />
      </motion.div>
    </div>
  );
}

/* ─────────────────────── Page dots (position indicator) ─────────────────────── */

function PageDots({
  total,
  activeIndex,
  onJump,
}: {
  total: number;
  activeIndex: number;
  onJump: (idx: number) => void;
}) {
  // Cap visible dots so we don't overflow on long archives. For >12 spreads,
  // collapse the middle into a single "•••" hint and keep endpoints clear.
  const showAll = total <= 12;

  return (
    <div
      className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-20"
      style={{ bottom: 'calc(var(--app-safe-bottom, 0px) + 68px)' }}
    >
      <div className="pointer-events-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-foreground/10 backdrop-blur-md border border-foreground/10">
        {showAll ? (
          Array.from({ length: total }).map((_, i) => (
            <button
              key={i}
              onClick={() => onJump(i)}
              className="group flex items-center justify-center"
              aria-label={`Go to spread ${i + 1}`}
            >
              <span
                className={`block rounded-full transition-all duration-300 ${
                  i === activeIndex ? 'w-5 h-1.5 bg-foreground' : 'w-1.5 h-1.5 bg-foreground/40 group-hover:bg-foreground/60'
                }`}
              />
            </button>
          ))
        ) : (
          <>
            <DotButton active={activeIndex === 0} onClick={() => onJump(0)} />
            <span className="text-[0.6rem] text-foreground/50 px-1 tabular-nums" style={{ fontFamily: 'var(--font-sans)' }}>
              {String(activeIndex + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
            </span>
            <DotButton active={activeIndex === total - 1} onClick={() => onJump(total - 1)} />
          </>
        )}
      </div>
    </div>
  );
}

function DotButton({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} aria-label="Jump">
      <span className={`block rounded-full transition-all ${active ? 'w-5 h-1.5 bg-foreground' : 'w-1.5 h-1.5 bg-foreground/40'}`} />
    </button>
  );
}

/* ─────────────────────── Small utilities ─────────────────────── */

function formatShortDate(d?: Date | null): string {
  if (!d) return '';
  try {
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).toUpperCase();
  } catch {
    return '';
  }
}
