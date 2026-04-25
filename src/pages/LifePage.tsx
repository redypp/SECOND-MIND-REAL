import { useMemo, useState, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpaces } from '@/contexts/SpacesContext';
import { useCurrentDate } from '@/hooks/useCurrentDate';
import { useLifeSubheadings } from '@/hooks/useLifeSubheadings';
import ClockPage from '@/pages/ClockPage';
import TodoPage from '@/pages/TodoPage';
import HabitsPage from '@/pages/HabitsPage';
import JournalPage from '@/pages/JournalPage';

/**
 * LifePage — four glassy tiles, each a live miniature of the page it opens.
 *
 * No header — the four cards fill the viewport edge-to-edge. Tap a tile and
 * its mini snapshot zooms up to fill the screen, handing off to the real
 * sub-page beneath.
 */

interface LifePageProps {
  embedded?: boolean;
  onNavigateToSection?: (path: string) => void;
}

type SectionId = 'daily-plan' | 'todos' | 'habits' | 'journal';
type Section = { id: SectionId; path: string; label: string; meta: string };

const noop = () => {};

// Reference viewport for the mini snapshot. We render each real page at this
// size into a hidden container, then CSS-scale the whole thing down to fit
// the card. ~iPhone 14 dimensions so the pages' internal layouts don't
// break.
const MINI_REF_WIDTH = 390;
const MINI_REF_HEIGHT = 844;

export default function LifePage({ embedded = false, onNavigateToSection }: LifePageProps) {
  const navigate = useNavigate();
  const { items } = useSpaces();
  const { todayString } = useCurrentDate();
  const [zooming, setZooming] = useState<{ id: SectionId; rect: DOMRect; path: string } | null>(null);

  // Local fallbacks: computed from real data, shown instantly while AI loads (or if it fails)
  const fallbacks = useMemo(() => {
    const now = new Date();
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;

    const todayEvents = items.filter(i => i.subCategory === 'scheduling' && i.scheduledDate === todayString);
    const upcomingToday = todayEvents.filter(e => !e.scheduledTime || e.scheduledTime >= nowTime);
    const nextEvent = upcomingToday.sort((a, b) => (a.scheduledTime || '').localeCompare(b.scheduledTime || ''))[0];

    const taskCount = items.filter(i => i.subCategory === 'todo' || i.subCategory === 'task').length;

    let daily_plan: string;
    if (nextEvent) {
      daily_plan = nextEvent.scheduledTime
        ? `next at ${nextEvent.scheduledTime.slice(0, 5)}`
        : `${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} today`;
    } else if (todayEvents.length > 0) {
      daily_plan = `${todayEvents.length} event${todayEvents.length !== 1 ? 's' : ''} today`;
    } else {
      daily_plan = 'no events scheduled today';
    }

    let todo: string;
    if (taskCount === 0) {
      todo = 'no tasks yet';
    } else {
      todo = `${taskCount} task${taskCount !== 1 ? 's' : ''} on your list`;
    }

    return {
      daily_plan,
      todo,
      habits: 'track today\'s habits',
      journal: 'write today\'s entry',
    };
  }, [items, todayString]);

  const subheadings = useLifeSubheadings(fallbacks);

  // Mount the four real pages once and reuse the elements as minis. Memo
  // keeps them from re-rendering on every zoom-state flip.
  const minis = useMemo<Record<SectionId, React.ReactNode>>(() => ({
    'daily-plan': <ClockPage embedded onBack={noop} />,
    'todos':      <TodoPage embedded onBack={noop} />,
    'habits':     <HabitsPage embedded onBack={noop} />,
    'journal':    <JournalPage embedded onBack={noop} />,
  }), []);

  // Four core sections — rendered as a 2×2 grid that fills the viewport.
  const sections: Section[] = [
    { id: 'daily-plan', path: '/daily-plan', label: 'Daily Plan', meta: subheadings.daily_plan },
    { id: 'todos',      path: '/todos',      label: 'To-Do',      meta: subheadings.todo },
    { id: 'habits',     path: '/habits',     label: 'Habits',     meta: subheadings.habits },
    { id: 'journal',    path: '/journal',    label: 'Journal',    meta: subheadings.journal },
  ];

  // Tap → zoom the card up to fill the viewport, then navigate. The overlay
  // holds at full-screen while MainLayout's sub-page slides in underneath,
  // then fades — so the whole transition reads as a pure zoom, not a slide.
  const handleTap = (e: React.MouseEvent<HTMLButtonElement>, section: Section) => {
    if (zooming) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setZooming({ id: section.id, rect, path: section.path });
    window.setTimeout(() => {
      if (onNavigateToSection) onNavigateToSection(section.path);
      else navigate(section.path);
    }, 320);
    window.setTimeout(() => setZooming(null), 950);
  };

  const zoomingSection = zooming ? sections.find(s => s.id === zooming.id) ?? null : null;

  return (
    <div
      className={`${embedded ? 'relative w-full h-full' : 'fixed inset-0 safe-area-top-ios'} flex flex-col bg-background overflow-hidden`}
      style={{ overscrollBehavior: 'none' }}
    >
      {/* Header removed — four tiles fill the viewport. */}

      {/* 2×2 section grid — four glassy rectangles filling the viewport */}
      <main
        className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-3 p-3"
        style={{ paddingBottom: 'calc(var(--app-safe-bottom, 0px) + 12px)' }}
      >
        {sections.map((section, i) => {
          const isZooming = zooming?.id === section.id;
          return (
            <motion.button
              key={section.id}
              className="w-full h-full relative overflow-hidden rounded-[20px] life-section-card text-left"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: isZooming ? 0 : 1, y: 0 }}
              transition={{ duration: 0.45, delay: isZooming ? 0 : i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.975 }}
              onClick={(e) => handleTap(e, section)}
              aria-label={`Open ${section.label}`}
              style={{ visibility: isZooming ? 'hidden' : 'visible' }}
            >
              <CardContent section={section} mini={minis[section.id]} />
            </motion.button>
          );
        })}
      </main>

      {/* Zoom overlay — portalled to <body> so it renders above MainLayout's
          sub-page slide and uses the viewport as its containing block
          (otherwise a transformed ancestor steals the position: fixed). */}
      {typeof document !== 'undefined' && createPortal(
        <AnimatePresence>
          {zooming && zoomingSection && (
            <motion.div
              key="life-zoom-overlay"
              className="fixed life-section-card overflow-hidden pointer-events-none"
              style={{ zIndex: 100 }}
              initial={{
                top: zooming.rect.top,
                left: zooming.rect.left,
                width: zooming.rect.width,
                height: zooming.rect.height,
                opacity: 1,
                borderRadius: 20,
              }}
              animate={{
                top: 0,
                left: 0,
                width: window.innerWidth,
                height: window.innerHeight,
                opacity: 0,
                borderRadius: 0,
              }}
              transition={{
                top:          { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                left:         { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                width:        { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                height:       { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                borderRadius: { duration: 0.32, ease: [0.16, 1, 0.3, 1] },
                // Hold at full-screen while the sub-page settles, then fade.
                opacity:      { duration: 0.22, delay: 0.62, ease: 'easeOut' },
              }}
            >
              <CardContent section={zoomingSection} mini={minis[zooming.id]} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

/* ───────────────────────── Card content ───────────────────────── */

function CardContent({
  section,
  mini,
}: {
  section: { label: string; meta: string };
  mini: React.ReactNode;
}) {
  return (
    <div className="absolute inset-0">
      {/* Real page rendered at iPhone reference size, scaled to fit the card */}
      <MiniSnapshot>{mini}</MiniSnapshot>

      {/* Glass label strip at the bottom — readable over any snapshot */}
      <div
        className="absolute left-0 right-0 bottom-0 px-4 py-3 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, hsl(var(--background) / 0) 0%, hsl(var(--background) / 0.85) 55%, hsl(var(--background) / 0.96) 100%)',
        }}
      >
        <p
          className="font-display tracking-[-0.04em] leading-[0.9] uppercase life-section-label"
          style={{ fontSize: 'clamp(1.4rem, 6vw, 2.4rem)', fontWeight: 800 }}
        >
          {section.label}
        </p>
        <p className="text-[9px] uppercase tracking-[0.18em] font-medium life-section-meta opacity-70 mt-1.5">
          {section.meta}
        </p>
      </div>
    </div>
  );
}

/* ───────────────────────── Mini snapshot ───────────────────────── */

/**
 * MiniSnapshot — renders its child at MINI_REF_WIDTH × MINI_REF_HEIGHT and
 * CSS-scales the whole subtree to fit the card. ResizeObserver keeps the
 * scale right when the grid reflows. pointer-events disabled so the mini
 * doesn't intercept the parent button's tap.
 */
function MiniSnapshot({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [scale, setScale] = useState(0.4);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) return;
      const sx = r.width / MINI_REF_WIDTH;
      const sy = r.height / MINI_REF_HEIGHT;
      // Use the LARGER scale so the snapshot covers the card edge-to-edge —
      // some content gets clipped on one axis but the visible portion looks
      // like a real screen, not a postage stamp on whitespace.
      setScale(Math.max(sx, sy));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 overflow-hidden pointer-events-none select-none"
      aria-hidden
    >
      <div
        className="absolute top-0 left-0"
        style={{
          width: MINI_REF_WIDTH,
          height: MINI_REF_HEIGHT,
          transform: `scale(${scale})`,
          transformOrigin: 'top left',
        }}
      >
        {children}
      </div>
    </div>
  );
}
