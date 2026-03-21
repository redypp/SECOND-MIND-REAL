-- ============================================================
-- Schedule the AI notification scheduler via pg_cron
-- Runs every 30 minutes to generate contextual notifications.
--
-- check-reminders already runs every minute (existing job).
-- This adds a separate job for the AI-driven scheduler.
-- ============================================================

-- Ensure pg_cron extension is available (may already be enabled)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Remove old job if it exists (safe re-run)
SELECT cron.unschedule('ai-notification-scheduler')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'ai-notification-scheduler'
  );

-- Schedule: every 30 minutes
-- The edge function URL follows the pattern: <SUPABASE_URL>/functions/v1/<function-name>
-- In production, replace the URL using your project ref.
SELECT cron.schedule(
  'ai-notification-scheduler',
  '*/30 * * * *',
  $$
  SELECT
    net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/ai-notification-scheduler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    )
  $$
);

-- Also ensure check-reminders still runs every minute (re-create if missing)
SELECT cron.schedule(
  'check-reminders',
  '* * * * *',
  $$
  SELECT
    net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/check-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.service_role_key')
      ),
      body    := '{}'::jsonb
    )
  $$
)
ON CONFLICT (jobname) DO NOTHING;
