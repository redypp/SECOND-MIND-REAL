-- ============================================================
-- Notifications System V2
-- Enhances the notification infrastructure for intelligent,
-- scheduled, context-aware push and in-app notifications.
-- ============================================================

-- 1. Add notification_type to notifications table
--    Expands on category to capture the origin/purpose of each notification.
--    Types: scheduled_reminder, ai_nudge, time_based, follow_up, insight, daily_digest
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS notification_type TEXT NOT NULL DEFAULT 'ai_nudge'
    CHECK (notification_type IN (
      'scheduled_reminder', -- user-set reminder (from scheduled_reminders table)
      'ai_nudge',           -- AI-generated proactive suggestion
      'time_based',         -- triggered by time + calendar context (e.g. "cook tonight")
      'follow_up',          -- item saved but never acted on
      'insight',            -- AI detected a pattern in archives/habits
      'daily_digest'        -- morning summary
    ));

-- 2. Add status column (mirrors read_at/dismissed_at but explicit for pipeline use)
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'dismissed'));

-- 3. Add push_sent to track whether a native push was dispatched
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS push_sent BOOLEAN NOT NULL DEFAULT false;

-- 4. Add dedup_key so the scheduler never creates duplicate notifications
--    for the same event. Unique per user per key.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS dedup_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup
  ON public.notifications (user_id, dedup_key)
  WHERE dedup_key IS NOT NULL AND dismissed_at IS NULL;

-- 5. Enhance notification_preferences with richer controls
--    Add per-type toggles and push opt-in
ALTER TABLE public.notification_preferences
  ADD COLUMN IF NOT EXISTS push_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ai_nudges_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS insights_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS follow_ups_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS time_based_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'UTC';

-- 6. Ensure service_role can also update notifications (for setting status/push_sent)
--    The existing INSERT policy was replaced in migration 20260125041718 with
--    "Users can insert their own notifications". We need a service-role bypass for
--    the scheduler edge function which runs with service_role and inserts for any user.
--    We use a permissive policy gated on the calling role.

-- Allow service role full access on notifications (scheduler needs to insert + update)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notifications'
      AND policyname = 'Service role full access on notifications'
  ) THEN
    CREATE POLICY "Service role full access on notifications"
      ON public.notifications
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Allow service role full access on notification_preferences
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'notification_preferences'
      AND policyname = 'Service role full access on notification_preferences'
  ) THEN
    CREATE POLICY "Service role full access on notification_preferences"
      ON public.notification_preferences
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- Allow service role full access on scheduled_reminders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'scheduled_reminders'
      AND policyname = 'Service role full access on scheduled_reminders'
  ) THEN
    CREATE POLICY "Service role full access on scheduled_reminders"
      ON public.scheduled_reminders
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- 7. Index improvements for scheduler queries
CREATE INDEX IF NOT EXISTS idx_notifications_status_scheduled
  ON public.notifications (user_id, status, scheduled_for)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_notifications_type
  ON public.notifications (user_id, notification_type)
  WHERE dismissed_at IS NULL;

-- 8. Auto-update status to 'sent' when push_sent flips to true
CREATE OR REPLACE FUNCTION public.sync_notification_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.push_sent = true AND OLD.push_sent = false THEN
    NEW.status := 'sent';
  END IF;
  IF NEW.dismissed_at IS NOT NULL AND OLD.dismissed_at IS NULL THEN
    NEW.status := 'dismissed';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_notification_status ON public.notifications;
CREATE TRIGGER trg_sync_notification_status
  BEFORE UPDATE ON public.notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_notification_status();

-- 9. Helper function: is_in_quiet_hours(user_id)
--    Returns true if the current UTC time falls within the user's quiet hours.
CREATE OR REPLACE FUNCTION public.is_in_quiet_hours(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prefs notification_preferences%ROWTYPE;
  user_tz TEXT;
  local_time TIME;
  q_start TIME;
  q_end TIME;
BEGIN
  SELECT * INTO prefs
  FROM notification_preferences
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    RETURN false; -- no prefs = no quiet hours
  END IF;

  user_tz := COALESCE(prefs.timezone, 'UTC');

  BEGIN
    local_time := (now() AT TIME ZONE user_tz)::TIME;
  EXCEPTION WHEN OTHERS THEN
    local_time := (now() AT TIME ZONE 'UTC')::TIME;
  END;

  q_start := prefs.quiet_hours_start::TIME;
  q_end   := prefs.quiet_hours_end::TIME;

  -- Handle overnight ranges (e.g. 22:00 – 08:00)
  IF q_start > q_end THEN
    RETURN local_time >= q_start OR local_time < q_end;
  ELSE
    RETURN local_time >= q_start AND local_time < q_end;
  END IF;
END;
$$;

-- 10. notification_preferences: ensure service role can read to call helper
GRANT EXECUTE ON FUNCTION public.is_in_quiet_hours(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_in_quiet_hours(UUID) TO authenticated;
