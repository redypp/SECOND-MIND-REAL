import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface NotificationPreferences {
  daily_digest_enabled: boolean;
  digest_time: string;
  max_daily_notifications: number;
  email_digest_enabled: boolean;
  quiet_hours_start: string;
  quiet_hours_end: string;
  push_enabled: boolean;
  ai_nudges_enabled: boolean;
  insights_enabled: boolean;
  follow_ups_enabled: boolean;
  time_based_enabled: boolean;
  timezone: string;
}

const DEFAULTS: NotificationPreferences = {
  daily_digest_enabled: false,
  digest_time: '09:00',
  max_daily_notifications: 5,
  email_digest_enabled: false,
  quiet_hours_start: '22:00',
  quiet_hours_end: '08:00',
  push_enabled: false,
  ai_nudges_enabled: true,
  insights_enabled: true,
  follow_ups_enabled: true,
  time_based_enabled: true,
  timezone: Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC',
};

export function useNotificationPreferences() {
  const { user } = useAuth();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const fetchPrefs = useCallback(async () => {
    if (!user) {
      setPrefs(DEFAULTS);
      setLoading(false);
      return;
    }

    try {
      const { data, error } = await supabase
        .from('notification_preferences')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPrefs({ ...DEFAULTS, ...data });
      } else {
        // Create default row for this user
        await supabase
          .from('notification_preferences')
          .insert({ user_id: user.id, ...DEFAULTS });
        setPrefs(DEFAULTS);
      }
    } catch (err) {
      console.error('[useNotificationPreferences] fetch error:', err);
      setPrefs(DEFAULTS);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchPrefs();
  }, [fetchPrefs]);

  const updatePrefs = useCallback(
    async (updates: Partial<NotificationPreferences>) => {
      if (!user) return;

      const optimistic = { ...prefs, ...updates };
      setPrefs(optimistic);
      setSaving(true);

      try {
        const { error } = await supabase
          .from('notification_preferences')
          .upsert(
            { user_id: user.id, ...optimistic },
            { onConflict: 'user_id' }
          );

        if (error) {
          // Rollback on error
          setPrefs(prefs);
          throw error;
        }
      } catch (err) {
        console.error('[useNotificationPreferences] save error:', err);
      } finally {
        setSaving(false);
      }
    },
    [user, prefs]
  );

  return { prefs, loading, saving, updatePrefs };
}
