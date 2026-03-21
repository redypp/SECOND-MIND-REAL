import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Polls scheduled_reminders every 60s and fires due reminders
 * by creating a notification and marking them as fired.
 */
export function useScheduledReminders() {
  const { user } = useAuth();
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  useEffect(() => {
    if (!user) return;

    const checkReminders = async () => {
      try {
        const now = new Date().toISOString();

        const { data: dueReminders, error } = await supabase
          .from('scheduled_reminders' as any)
          .select('*')
          .eq('user_id', user.id)
          .eq('is_fired', false)
          .lte('remind_at', now)
          .limit(10) as any;

        if (error || !dueReminders?.length) return;

        for (const reminder of dueReminders) {
          // Create notification
          await supabase.from('notifications').insert({
            user_id: user.id,
            title: 'Reminder',
            message: reminder.message,
            category: 'reminder',
            reason: 'Scheduled reminder',
            priority: 'medium',
            scheduled_for: now,
          });

          // Mark as fired
          await supabase
            .from('scheduled_reminders' as any)
            .update({ is_fired: true, fired_at: now } as any)
            .eq('id', reminder.id);
        }
      } catch (err) {
        console.warn('Reminder check failed:', err);
      }
    };

    // Delay first check by 5s so it doesn't compete with the startup data fetch
    // window. Subsequent checks run every 60s as normal.
    const startupDelay = setTimeout(() => {
      checkReminders();
      intervalRef.current = setInterval(checkReminders, 60000);
    }, 5000);

    return () => {
      clearTimeout(startupDelay);
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user]);
}
