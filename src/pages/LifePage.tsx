import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronRight } from 'lucide-react';
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
    const overdueCount = items.filter(
      i => (i.subCategory === 'todo' || i.subCategory === 'task') && i.scheduledDate && i.scheduledDate < todayString
    ).length;

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
    } else if (overdueCount > 0) {
      todo = `${overdueCount} overdue, ${taskCount} total`;
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
    { id: 'ask',           path: '/ask',           label: 'Ask',           meta: "What's on your mind?",   isExternal: true,  isAsk: true },
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
      style={{ overscrollBehavior: 'none', touchAction: 'pan-x' }}
    >
      {/* Scrolling marquee header */}
      <div className="relative flex items-center pl-0 pr-0 flex-shrink-0 min-h-[52px]">
        <div className="flex-1 min-w-0 overflow-hidden">
          <MarqueeHeader text="LIFE" />
        </div>
      </div>

      {/* Section cards — evenly fill remaining height */}
      <main className="flex-1 min-h-0 flex flex-col px-0 gap-1" style={{ paddingBottom: 'calc(max(var(--app-safe-bottom, 0px), env(safe-area-inset-bottom, 34px)) + 20px)' }}>
        {sections.map((section, i) => (
          <motion.button
            key={section.id}
            className="flex-1 w-full text-left relative"
            style={{ minHeight: 0 }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 420, damping: 34 }}
            whileTap={{ scale: 0.982 }}
            onClick={() => handleTap(section.path, section.isExternal)}
            aria-label={`Open ${section.label}`}
          >
            <div
              className={`w-full h-full flex items-center px-5 gap-4 life-section-card${section.isAsk ? ' life-section-ask' : ''}`}
              data-depth={section.isAsk ? undefined : getDepth(i)}
            >
              <div className="flex-1 min-w-0 py-3">
                <p className="text-2xl font-black tracking-tight leading-none life-section-label">
                  {section.label}
                </p>
                <p className="text-sm mt-1 leading-tight font-semibold life-section-meta">
                  {section.meta}
                </p>
              </div>
              <ChevronRight className="w-4 h-4 life-section-chevron flex-shrink-0" />
            </div>
          </motion.button>
        ))}
      </main>
    </div>
  );
}
