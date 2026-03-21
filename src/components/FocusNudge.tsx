import { useState, useEffect, useMemo } from 'react';
import { X } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useSpaces } from '@/contexts/SpacesContext';

interface Nudge {
  id: string;
  message: string;
  type: 'upcoming' | 'overdue';
}

const DISMISS_KEY = 'focus-nudge-dismissed';
const DISMISS_COOLDOWN = 60 * 60 * 1000; // 1 hour

export function FocusNudge() {
  const { items } = useSpaces();
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
      const now = Date.now();
      const active = new Set<string>();
      for (const [id, ts] of Object.entries(stored)) {
        if (now - (ts as number) < DISMISS_COOLDOWN) active.add(id);
      }
      return active;
    } catch { return new Set(); }
  });

  const nudges = useMemo<Nudge[]>(() => {
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const result: Nudge[] = [];

    // Upcoming events in next 60 minutes
    items.forEach(item => {
      if (item.scheduledDate === todayStr && item.scheduledTime) {
        const [h, m] = item.scheduledTime.split(':').map(Number);
        const eventMinutes = h * 60 + m;
        const diff = eventMinutes - currentMinutes;
        if (diff > 0 && diff <= 60) {
          const label = item.title || 'Event';
          result.push({
            id: `upcoming-${item.id}`,
            message: `${label} in ${diff} minutes`,
            type: 'upcoming',
          });
        }
      }
    });

    // Overdue todos
    const overdueTodos = items.filter(item => {
      if (item.subCategory !== 'todo') return false;
      if (!item.scheduledDate) return false;
      return item.scheduledDate < todayStr;
    });

    if (overdueTodos.length > 0) {
      result.push({
        id: 'overdue-todos',
        message: `${overdueTodos.length} overdue task${overdueTodos.length > 1 ? 's' : ''} need${overdueTodos.length === 1 ? 's' : ''} attention`,
        type: 'overdue',
      });
    }

    return result.filter(n => !dismissedIds.has(n.id));
  }, [items, dismissedIds]);

  // Re-check every 60s
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 60000);
    return () => clearInterval(interval);
  }, []);

  const dismiss = (id: string) => {
    setDismissedIds(prev => {
      const next = new Set(prev);
      next.add(id);
      // Persist
      try {
        const stored = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
        stored[id] = Date.now();
        localStorage.setItem(DISMISS_KEY, JSON.stringify(stored));
      } catch {}
      return next;
    });
  };

  const current = nudges[0];
  if (!current) return null;

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={current.id}
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -8 }}
        className="mx-4 mb-3 px-4 py-3 rounded-xl bg-accent/60 border border-border/50 flex items-center justify-between gap-3"
      >
        <p className="text-xs text-muted-foreground">{current.message}</p>
        <button
          onClick={() => dismiss(current.id)}
          className="shrink-0 p-1 rounded-lg hover:bg-accent transition-colors"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </motion.div>
    </AnimatePresence>
  );
}
