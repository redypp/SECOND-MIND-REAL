import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, ListChecks, Repeat, PenLine } from 'lucide-react';
import { useSpaces } from '@/contexts/SpacesContext';
import { useCurrentDate } from '@/hooks/useCurrentDate';
import { useLifeSubheadings } from '@/hooks/useLifeSubheadings';

/**
 * LifePage — four minimal tiles that open the Life sub-pages.
 *
 * Each tile is a clean card with a single line-icon, a display-font label,
 * and a small meta line. No miniature page snapshots, no glass overlays —
 * just type, icon, and breathing room.
 */

interface LifePageProps {
  embedded?: boolean;
  onNavigateToSection?: (path: string) => void;
}

type SectionId = 'daily-plan' | 'todos' | 'habits' | 'journal';
type Section = {
  id: SectionId;
  path: string;
  label: string;
  meta: string;
  Icon: typeof Clock;
};

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
      daily_plan = 'nothing scheduled';
    }

    const todo = taskCount === 0
      ? 'no tasks yet'
      : `${taskCount} task${taskCount !== 1 ? 's' : ''}`;

    return {
      daily_plan,
      todo,
      habits: "today's habits",
      journal: "today's entry",
    };
  }, [items, todayString]);

  const subheadings = useLifeSubheadings(fallbacks);

  const sections: Section[] = [
    { id: 'daily-plan', path: '/daily-plan', label: 'Daily Plan', meta: subheadings.daily_plan, Icon: Clock },
    { id: 'todos',      path: '/todos',      label: 'To-Do',      meta: subheadings.todo,       Icon: ListChecks },
    { id: 'habits',     path: '/habits',     label: 'Habits',     meta: subheadings.habits,     Icon: Repeat },
    { id: 'journal',    path: '/journal',    label: 'Journal',    meta: subheadings.journal,    Icon: PenLine },
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
        style={{
          // Just clear the iOS clock; let the tiles claim the rest of the viewport.
          paddingTop: 'calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 4px)',
          paddingBottom: 'calc(var(--app-safe-bottom, 0px) + 8px)',
        }}
      >
        {sections.map((section, i) => (
          <motion.button
            key={section.id}
            className="group relative w-full h-full overflow-hidden rounded-3xl bg-card border border-border/60 text-left p-5 flex flex-col justify-between transition-colors hover:border-border focus:outline-none focus-visible:ring-1 focus-visible:ring-foreground/20"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            whileHover={{ y: -2 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => handleTap(section)}
            aria-label={`Open ${section.label}`}
          >
            {/* Top: small slot index */}
            <div className="flex items-start justify-between">
              <span className="font-mono tabular-nums text-[11px] tracking-[0.16em] text-muted-foreground/60">
                {String(i + 1).padStart(2, '0')}
              </span>
              <section.Icon
                className="w-5 h-5 text-muted-foreground/70 transition-colors group-hover:text-foreground/80"
                strokeWidth={1.5}
              />
            </div>

            {/* Bottom: label + meta */}
            <div className="flex flex-col gap-1.5">
              <span
                className="leading-[0.9] text-foreground block"
                style={{
                  fontSize: 'clamp(1.4rem, 5.5vw, 2rem)',
                  letterSpacing: '-0.045em',
                  fontFamily: 'var(--font-display)',
                  fontWeight: 700,
                }}
              >
                {section.label}
              </span>
              <span className="text-[10px] uppercase tracking-[0.2em] font-medium text-muted-foreground/70 truncate">
                {section.meta}
              </span>
            </div>
          </motion.button>
        ))}
      </main>
    </div>
  );
}
