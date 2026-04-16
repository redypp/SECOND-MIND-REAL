import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSpaces } from '@/contexts/SpacesContext';
import { useCurrentDate } from '@/hooks/useCurrentDate';
import { useLifeSubheadings } from '@/hooks/useLifeSubheadings';
import { MarqueeHeader } from '@/components/MarqueeHeader';

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

  // Sections: external=true means navigate() directly (not embedded sub-page)
  const sections = [
    { id: 'daily-plan',    path: '/daily-plan',    label: 'Daily Plan',    meta: subheadings.daily_plan,   isExternal: false, isAsk: false },
    { id: 'todos',         path: '/todos',         label: 'To-Do',         meta: subheadings.todo,         isExternal: false, isAsk: false },
    { id: 'habits',        path: '/habits',        label: 'Habits',        meta: subheadings.habits,       isExternal: false, isAsk: false },
    { id: 'journal',       path: '/journal',       label: 'Journal',       meta: subheadings.journal,      isExternal: false, isAsk: false },
    { id: 'notifications', path: '/notifications', label: 'Notifications', meta: 'Your inbox',             isExternal: true,  isAsk: false },
    { id: 'settings',      path: '/settings',      label: 'Settings',      meta: 'Preferences & account',  isExternal: true,  isAsk: false },
  ];

  const handleTap = (path: string, isExternal: boolean) => {
    if (!isExternal && onNavigateToSection) {
      onNavigateToSection(path);
    } else {
      navigate(path);
    }
  };

  // Depth index for the non-ask cards (Ask card gets special styling, so don't count it)
  const getDepth = (index: number) => Math.max(0, index - 1);

  return (
    <div
      className={`${embedded ? 'relative w-full h-full' : 'fixed inset-0 safe-area-top-ios'} flex flex-col bg-background overflow-hidden`}
      style={{ overscrollBehavior: 'none' }}
    >
      {/* Scrolling marquee header */}
      <div className="relative flex items-center pl-0 pr-0 flex-shrink-0 min-h-[52px]">
        <div className="flex-1 min-w-0 overflow-hidden">
          <MarqueeHeader text="LIFE" />
        </div>
      </div>

      {/* Section cards — floating glass cards, fill remaining height equally */}
      <main className="flex-1 min-h-0 flex flex-col gap-2 px-3 py-2" style={{ paddingBottom: 'calc(var(--app-safe-bottom, 0px) + 12px)' }}>
        {sections.map((section, i) => (
          <motion.button
            key={section.id}
            className="flex-1 w-full relative min-h-[56px]"
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
            whileTap={{ scale: 0.97 }}
            onClick={() => handleTap(section.path, section.isExternal)}
            aria-label={`Open ${section.label}`}
          >
            <div
              className={`w-full h-full relative overflow-hidden rounded-2xl life-section-card${section.isAsk ? ' life-section-ask' : ''}`}
              data-depth={section.isAsk ? undefined : getDepth(i)}
            >
              {/* Left-center aligned layout */}
              <div className="absolute inset-0 flex flex-col justify-center px-5">
                <p
                  className="font-display tracking-[-0.05em] leading-[0.88] uppercase life-section-label"
                  style={{ fontSize: 'clamp(2.2rem, 9vw, 3.5rem)', fontWeight: 700 }}
                >
                  {section.label}
                </p>
                <p className="text-[9px] uppercase tracking-[0.16em] font-medium life-section-meta opacity-70 mt-1">
                  {section.meta}
                </p>
              </div>
            </div>
          </motion.button>
        ))}
      </main>
    </div>
  );
}
