import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSpaces } from '@/contexts/SpacesContext';
import { useCurrentDate } from '@/hooks/useCurrentDate';
import { useLifeSubheadings } from '@/hooks/useLifeSubheadings';
import { MarqueeHeader } from '@/components/MarqueeHeader';
import { PortalReturn } from '@/components/PortalReturn';

interface LifePageProps {
  embedded?: boolean;
  onNavigateToSection?: (path: string) => void;
}

export default function LifePage({ embedded = false, onNavigateToSection }: LifePageProps) {
  const navigate = useNavigate();
  const { items } = useSpaces();
  const { todayString } = useCurrentDate();

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

  // Four core sections — rendered as a 2×2 grid that fills the viewport.
  const sections = [
    { id: 'daily-plan', path: '/daily-plan', label: 'Daily Plan', meta: subheadings.daily_plan },
    { id: 'todos',      path: '/todos',      label: 'To-Do',      meta: subheadings.todo },
    { id: 'habits',     path: '/habits',     label: 'Habits',     meta: subheadings.habits },
    { id: 'journal',    path: '/journal',    label: 'Journal',    meta: subheadings.journal },
  ];

  const handleTap = (path: string) => {
    if (onNavigateToSection) onNavigateToSection(path);
    else navigate(path);
  };

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
        {sections.map((section, i) => (
          <motion.button
            key={section.id}
            className="w-full h-full relative overflow-hidden rounded-xl life-section-card text-left"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: i * 0.05, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.975 }}
            onClick={() => handleTap(section.path)}
            aria-label={`Open ${section.label}`}
          >
            <div className="absolute inset-0 flex flex-col justify-end p-4">
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
          </motion.button>
        ))}
      </main>
    </div>
  );
}
