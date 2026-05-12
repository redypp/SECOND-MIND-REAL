import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSpaces } from '@/contexts/SpacesContext';
import { useCurrentDate } from '@/hooks/useCurrentDate';
import { useLifeSubheadings } from '@/hooks/useLifeSubheadings';

/**
 * LifePage — four glassy tiles, each a minimalist icon for the section it opens.
 * Tap a tile and the corresponding sub-page opens. MainLayout handles the
 * page transition.
 */

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

    const todo = taskCount === 0 ? 'no tasks yet' : `${taskCount} task${taskCount !== 1 ? 's' : ''} on your list`;

    return {
      daily_plan,
      todo,
      habits: "track today's habits",
      journal: "write today's entry",
    };
  }, [items, todayString]);

  const subheadings = useLifeSubheadings(fallbacks);

  const sections: Section[] = [
    { id: 'daily-plan', path: '/daily-plan', label: 'Daily Plan', meta: subheadings.daily_plan },
    { id: 'todos',      path: '/todos',      label: 'To-Do',      meta: subheadings.todo },
    { id: 'habits',     path: '/habits',     label: 'Habits',     meta: subheadings.habits },
    { id: 'journal',    path: '/journal',    label: 'Journal',    meta: subheadings.journal },
  ];

  const handleTap = (section: Section) => {
    if (onNavigateToSection) onNavigateToSection(section.path);
    else navigate(section.path);
  };

  return (
    <div
      className={`${embedded ? 'relative w-full h-full' : 'fixed inset-0 safe-area-top-ios'} flex flex-col bg-background overflow-hidden`}
      style={{ overscrollBehavior: 'none' }}
    >
      <main
        className="flex-1 min-h-0 grid grid-cols-2 grid-rows-2 gap-3 p-3"
        style={{ paddingBottom: 'calc(var(--app-safe-bottom, 0px) + 12px)' }}
      >
        {sections.map((section, i) => (
          <motion.button
            key={section.id}
            className="w-full h-full relative overflow-hidden rounded-[20px] life-section-card text-left"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.975 }}
            onClick={() => handleTap(section)}
            aria-label={`Open ${section.label}`}
          >
            <CardContent section={section} />
          </motion.button>
        ))}
      </main>
    </div>
  );
}

/* ───────────────────────── Card content ───────────────────────── */

function CardContent({ section }: { section: Section }) {
  return (
    <div className="absolute inset-0 flex flex-col">
      {/* Icon area — fills the card; label strip sits over the bottom edge */}
      <div className="flex-1 min-h-0 flex items-center justify-center">
        <SectionIcon id={section.id} />
      </div>

      {/* Soft fade so the label always reads clean over the icon */}
      <div
        className="absolute left-0 right-0 bottom-0 px-4 py-3 pointer-events-none"
        style={{
          background:
            'linear-gradient(180deg, hsl(var(--background) / 0) 0%, hsl(var(--background) / 0.65) 60%, hsl(var(--background) / 0.92) 100%)',
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

/* ───────────────────────── Minimalist section icons ───────────────────────── */

/**
 * Custom thin-stroke SVGs — one motif per section. Sized to fill ~48% of the
 * card via viewBox and `width: 48%`; stroke uses currentColor at low opacity
 * so they sit gracefully behind the label. A slow breathing animation keeps
 * the cards feeling alive without competing with the type.
 */
function SectionIcon({ id }: { id: SectionId }) {
  return (
    <motion.div
      className="life-section-icon"
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      style={{ width: '48%', aspectRatio: '1 / 1', display: 'flex' }}
    >
      <motion.div
        style={{ width: '100%', height: '100%' }}
        animate={{ scale: [1, 1.035, 1] }}
        transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
      >
        {id === 'daily-plan' && <DailyPlanGlyph />}
        {id === 'todos'      && <TodoGlyph />}
        {id === 'habits'     && <HabitsGlyph />}
        {id === 'journal'    && <JournalGlyph />}
      </motion.div>
    </motion.div>
  );
}

/* Shared SVG defaults — thin, round, currentColor */
const svgProps = {
  viewBox: '0 0 100 100',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.25,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  width: '100%',
  height: '100%',
};

/** Daily Plan — bare analog clock face, two hands. No tick marks. */
function DailyPlanGlyph() {
  return (
    <svg {...svgProps} aria-hidden>
      <circle cx="50" cy="50" r="34" />
      {/* hour hand */}
      <line x1="50" y1="50" x2="50" y2="32" />
      {/* minute hand */}
      <line x1="50" y1="50" x2="66" y2="56" />
      {/* center pin */}
      <circle cx="50" cy="50" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** To-Do — three stacked rows, the top one ticked off. */
function TodoGlyph() {
  return (
    <svg {...svgProps} aria-hidden>
      {/* row 1 — checked */}
      <circle cx="24" cy="30" r="5.5" />
      <path d="M21 30 l2.5 2.5 L28 27.5" />
      <line x1="36" y1="30" x2="78" y2="30" />
      {/* row 2 */}
      <circle cx="24" cy="50" r="5.5" />
      <line x1="36" y1="50" x2="72" y2="50" />
      {/* row 3 */}
      <circle cx="24" cy="70" r="5.5" />
      <line x1="36" y1="70" x2="66" y2="70" />
    </svg>
  );
}

/** Habits — five-dot streak; the last three filled (today + recent). */
function HabitsGlyph() {
  return (
    <svg {...svgProps} aria-hidden>
      {/* baseline */}
      <line x1="14" y1="50" x2="86" y2="50" opacity="0.35" />
      {/* dots */}
      <circle cx="20" cy="50" r="3.2" />
      <circle cx="35" cy="50" r="3.2" />
      <circle cx="50" cy="50" r="3.6" fill="currentColor" />
      <circle cx="65" cy="50" r="3.6" fill="currentColor" />
      <circle cx="80" cy="50" r="3.6" fill="currentColor" />
      {/* ascending arc above the filled portion — subtle "growth" cue */}
      <path d="M50 38 Q65 28 80 36" opacity="0.55" />
    </svg>
  );
}

/** Journal — three text lines with a diagonal pen stroke across them. */
function JournalGlyph() {
  return (
    <svg {...svgProps} aria-hidden>
      {/* page lines */}
      <line x1="22" y1="34" x2="74" y2="34" />
      <line x1="22" y1="50" x2="78" y2="50" />
      <line x1="22" y1="66" x2="62" y2="66" />
      {/* pen / nib stroke crossing the page */}
      <path d="M30 80 L78 22" opacity="0.9" />
      <path d="M76 20 L82 26 L78 30 Z" fill="currentColor" stroke="none" opacity="0.9" />
    </svg>
  );
}
