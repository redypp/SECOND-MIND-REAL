import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpaces } from '@/contexts/SpacesContext';
import { useCurrentDate } from '@/hooks/useCurrentDate';
import { useLifeSubheadings } from '@/hooks/useLifeSubheadings';
import { MarqueeHeader } from '@/components/MarqueeHeader';
import { PortalReturn } from '@/components/PortalReturn';

interface LifePageProps {
  embedded?: boolean;
  onNavigateToSection?: (path: string) => void;
}

type SectionId = 'daily-plan' | 'todos' | 'habits' | 'journal';
type Section = { id: SectionId; path: string; label: string; meta: string };

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

  const taskCount = useMemo(
    () => items.filter(i => i.subCategory === 'todo' || i.subCategory === 'task').length,
    [items]
  );

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
    // Navigate just before the zoom completes so the sub-page is ready underneath.
    window.setTimeout(() => {
      if (onNavigateToSection) onNavigateToSection(section.path);
      else navigate(section.path);
    }, 320);
    // Unmount the overlay after its fade completes.
    window.setTimeout(() => setZooming(null), 950);
  };

  const renderMini = (id: SectionId) => {
    switch (id) {
      case 'daily-plan': return <MiniClock />;
      case 'todos':      return <MiniTodos count={taskCount} />;
      case 'habits':     return <MiniHabits />;
      case 'journal':    return <MiniJournal />;
    }
  };

  const zoomingSection = zooming ? sections.find(s => s.id === zooming.id) ?? null : null;

  return (
    <div
      className={`${embedded ? 'relative w-full h-full' : 'fixed inset-0 safe-area-top-ios'} flex flex-col bg-background overflow-hidden`}
      style={{ overscrollBehavior: 'none' }}
    >
      {/* Scrolling marquee header */}
      <div className="relative flex items-center pl-3 pr-3 flex-shrink-0 min-h-[52px] gap-2">
        <PortalReturn />
        <div className="flex-1 min-w-0 overflow-hidden">
          <MarqueeHeader text="LIFE" />
        </div>
      </div>

      {/* 2×2 section grid — four crisp rectangles filling the remaining viewport */}
      <main
        className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-2 px-2 pt-1 pb-2"
        style={{ paddingBottom: 'calc(var(--app-safe-bottom, 0px) + 10px)' }}
      >
        {sections.map((section, i) => {
          const isZooming = zooming?.id === section.id;
          return (
            <motion.button
              key={section.id}
              className="w-full h-full relative overflow-hidden rounded-xl life-section-card text-left"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: isZooming ? 0 : 1, y: 0 }}
              transition={{ duration: 0.45, delay: isZooming ? 0 : i * 0.05, ease: [0.16, 1, 0.3, 1] }}
              whileTap={{ scale: 0.975 }}
              onClick={(e) => handleTap(e, section)}
              aria-label={`Open ${section.label}`}
              style={{ visibility: isZooming ? 'hidden' : 'visible' }}
            >
              <CardContent section={section} mini={renderMini(section.id)} />
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
                borderRadius: 12,
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
              <CardContent section={zoomingSection} mini={renderMini(zooming.id)} />
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
    <div className="absolute inset-0 flex flex-col">
      <div className="flex-1 min-h-0 flex items-center justify-center p-3 life-section-label">
        {mini}
      </div>
      <div className="px-4 pb-4">
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

/* ───────────────────────── Mini previews ───────────────────────── */

function MiniClock() {
  const now = new Date();
  const minutes = now.getMinutes();
  const hours = now.getHours() % 12;
  const minuteAngle = minutes * 6;
  const hourAngle = hours * 30 + minutes * 0.5;
  return (
    <svg viewBox="0 0 100 100" className="w-[64%] aspect-square opacity-80" aria-hidden>
      <circle cx="50" cy="50" r="45" fill="none" stroke="currentColor" strokeWidth="2" />
      {Array.from({ length: 12 }).map((_, i) => (
        <line
          key={i}
          x1="50" y1="8"
          x2="50" y2="13"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          transform={`rotate(${i * 30} 50 50)`}
        />
      ))}
      <line
        x1="50" y1="50" x2="50" y2="28"
        stroke="currentColor" strokeWidth="3" strokeLinecap="round"
        transform={`rotate(${hourAngle} 50 50)`}
      />
      <line
        x1="50" y1="50" x2="50" y2="18"
        stroke="currentColor" strokeWidth="2" strokeLinecap="round"
        transform={`rotate(${minuteAngle} 50 50)`}
      />
      <circle cx="50" cy="50" r="2.5" fill="currentColor" />
    </svg>
  );
}

function MiniTodos({ count }: { count: number }) {
  const slots = 9;
  const filled = Math.max(0, Math.min(count, slots - 2));
  return (
    <div className="w-[68%] grid grid-cols-3 gap-2 opacity-80">
      {Array.from({ length: slots }).map((_, i) => (
        <div
          key={i}
          className={`w-full aspect-square rounded-full border-2 border-current ${i < filled ? 'bg-current' : ''}`}
        />
      ))}
    </div>
  );
}

function MiniHabits() {
  // Staggered streak pattern — hints at daily habit completions across the week.
  const pattern = [1, 1, 0, 1, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1];
  return (
    <div className="w-[72%] grid grid-cols-5 gap-1.5 opacity-80">
      {pattern.map((v, i) => (
        <div
          key={i}
          className={`w-full aspect-square rounded-full ${v ? 'bg-current' : 'border-2 border-current'}`}
        />
      ))}
    </div>
  );
}

function MiniJournal() {
  const widths = [92, 72, 84, 56, 78, 62];
  return (
    <div className="w-[74%] flex flex-col gap-1.5 opacity-70">
      {widths.map((w, i) => (
        <div
          key={i}
          className="h-[3px] bg-current rounded-full"
          style={{ width: `${w}%` }}
        />
      ))}
    </div>
  );
}
