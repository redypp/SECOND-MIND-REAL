-- =============================================================
-- Second Mind — Complete Database Schema
-- Consolidated from all migrations. Use this to set up a fresh
-- Supabase project with the same structure.
--
-- Steps:
--   1. Create a new Supabase project at https://supabase.com
--   2. Open the SQL Editor in your project dashboard
--   3. Paste and run this entire file
--   4. (Optional) Import your data using the export-data edge
--      function: GET <your-project-url>/functions/v1/export-data
-- =============================================================

-- -------------------------------------------------------
-- Extensions
-- -------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- -------------------------------------------------------
-- Shared utility functions
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION public.increment_version()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.version = NEW.version THEN
    NEW.version = OLD.version + 1;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- -------------------------------------------------------
-- profiles
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name   TEXT NOT NULL DEFAULT '',
  birthday    DATE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"   ON public.profiles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (user_id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------
-- user_preferences
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  ai_settings       JSONB NOT NULL DEFAULT '{}'::jsonb,
  theme             TEXT DEFAULT 'system',
  last_cleanup_date DATE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"   ON public.user_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own preferences" ON public.user_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences" ON public.user_preferences FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);

CREATE TRIGGER update_user_preferences_updated_at
  BEFORE UPDATE ON public.user_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------
-- notification_preferences
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  daily_digest_enabled   BOOLEAN NOT NULL DEFAULT false,
  digest_time            TEXT DEFAULT '09:00',
  max_daily_notifications INTEGER NOT NULL DEFAULT 3,
  email_digest_enabled   BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start      TEXT DEFAULT '22:00',
  quiet_hours_end        TEXT DEFAULT '08:00',
  push_enabled           BOOLEAN NOT NULL DEFAULT false,
  ai_nudges_enabled      BOOLEAN NOT NULL DEFAULT true,
  insights_enabled       BOOLEAN NOT NULL DEFAULT true,
  follow_ups_enabled     BOOLEAN NOT NULL DEFAULT true,
  time_based_enabled     BOOLEAN NOT NULL DEFAULT true,
  timezone               TEXT DEFAULT 'UTC',
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own preferences"    ON public.notification_preferences FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own preferences"  ON public.notification_preferences FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own preferences"  ON public.notification_preferences FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access on notification_preferences"
  ON public.notification_preferences FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_notification_preferences_updated_at
  BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------
-- spaces
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.spaces (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  image            TEXT,
  color            TEXT,
  item_count       INTEGER NOT NULL DEFAULT 0,
  merged_from      TEXT[],
  position         INTEGER NOT NULL DEFAULT 0,
  is_pinned        BOOLEAN NOT NULL DEFAULT false,
  pinned_at        TIMESTAMPTZ DEFAULT NULL,
  last_used_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at       TIMESTAMPTZ DEFAULT NULL,
  version          INTEGER DEFAULT 1,
  group_assignments JSONB DEFAULT NULL,
  gif_background   TEXT DEFAULT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN public.spaces.group_assignments IS 'AI-computed semantic groups for items in this space.';
COMMENT ON COLUMN public.spaces.gif_background    IS 'URL of animated GIF background for the archive title page.';

ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own spaces"   ON public.spaces FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own spaces" ON public.spaces FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own spaces" ON public.spaces FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own spaces" ON public.spaces FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_spaces_user_id    ON public.spaces(user_id);
CREATE INDEX IF NOT EXISTS idx_spaces_position   ON public.spaces(user_id, position);
CREATE INDEX IF NOT EXISTS idx_spaces_not_deleted ON public.spaces(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_spaces_deleted_at  ON public.spaces(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spaces_pin_order   ON public.spaces(user_id, is_pinned DESC, pinned_at DESC NULLS LAST, last_used_at DESC);

DROP TRIGGER IF EXISTS increment_spaces_version ON public.spaces;
CREATE TRIGGER increment_spaces_version
  BEFORE UPDATE ON public.spaces
  FOR EACH ROW EXECUTE FUNCTION public.increment_version();

-- -------------------------------------------------------
-- items
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.items (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sub_category   TEXT NOT NULL CHECK (sub_category IN ('scheduling', 'notes', 'todo', 'misc')),
  title          TEXT,
  content        TEXT,
  blocks         JSONB NOT NULL DEFAULT '[]'::jsonb,
  space_ids      UUID[] DEFAULT ARRAY[]::UUID[],
  people_ids     TEXT[],
  keywords       TEXT[],
  scheduled_date DATE,
  scheduled_time TEXT,
  color          TEXT,
  item_type      TEXT,
  thumbnail      TEXT,
  url            TEXT,
  canvas_x       NUMERIC DEFAULT NULL,
  canvas_y       NUMERIC DEFAULT NULL,
  canvas_z       INTEGER DEFAULT NULL,
  canvas_scale   NUMERIC DEFAULT 1,
  deleted_at     TIMESTAMPTZ DEFAULT NULL,
  version        INTEGER DEFAULT 1,
  raw_input      TEXT,
  source_type    TEXT DEFAULT 'text',
  ai_category    TEXT,
  ai_processed   BOOLEAN DEFAULT NULL,
  ai_summary     TEXT DEFAULT NULL,
  ai_tags        TEXT[] DEFAULT NULL,
  extracted_people TEXT[] DEFAULT NULL,
  suggested_space  TEXT DEFAULT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own items"   ON public.items FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own items" ON public.items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own items" ON public.items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own items" ON public.items FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_items_user_id       ON public.items(user_id);
CREATE INDEX IF NOT EXISTS idx_items_sub_category  ON public.items(user_id, sub_category);
CREATE INDEX IF NOT EXISTS idx_items_scheduled_date ON public.items(user_id, scheduled_date);
CREATE INDEX IF NOT EXISTS idx_items_not_deleted   ON public.items(user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_items_deleted_at    ON public.items(deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS items_source_type_idx   ON public.items(user_id, source_type) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS increment_items_version ON public.items;
CREATE TRIGGER increment_items_version
  BEFORE UPDATE ON public.items
  FOR EACH ROW EXECUTE FUNCTION public.increment_version();

-- -------------------------------------------------------
-- habits
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.habits (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  name       TEXT NOT NULL,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own habits"   ON public.habits FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own habits" ON public.habits FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own habits" ON public.habits FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own habits" ON public.habits FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_habits_user_id ON public.habits(user_id);

CREATE TRIGGER update_habits_updated_at
  BEFORE UPDATE ON public.habits
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------
-- habit_entries
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.habit_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  habit_id   UUID NOT NULL REFERENCES public.habits(id) ON DELETE CASCADE,
  date       DATE NOT NULL,
  status     TEXT NOT NULL CHECK (status IN ('done', 'partial', 'missed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (habit_id, date)
);

ALTER TABLE public.habit_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own entries"   ON public.habit_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own entries" ON public.habit_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own entries" ON public.habit_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own entries" ON public.habit_entries FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_habit_entries_habit_date ON public.habit_entries(habit_id, date);
CREATE INDEX IF NOT EXISTS idx_habit_entries_user_id    ON public.habit_entries(user_id);

-- -------------------------------------------------------
-- journal_entries
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.journal_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own journal entries"   ON public.journal_entries FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own journal entries" ON public.journal_entries FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own journal entries" ON public.journal_entries FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own journal entries" ON public.journal_entries FOR DELETE USING (auth.uid() = user_id);

CREATE TRIGGER update_journal_entries_updated_at
  BEFORE UPDATE ON public.journal_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------
-- notifications
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             TEXT NOT NULL,
  message           TEXT NOT NULL,
  reason            TEXT NOT NULL,
  category          TEXT NOT NULL CHECK (category IN ('resurface', 'connection', 'decision', 'task', 'reminder')),
  priority          TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  suggested_action  TEXT,
  related_item_ids  TEXT[],
  scheduled_for     TIMESTAMPTZ NOT NULL DEFAULT now(),
  notification_type TEXT NOT NULL DEFAULT 'ai_nudge'
    CHECK (notification_type IN ('scheduled_reminder','ai_nudge','time_based','follow_up','insight','daily_digest')),
  status            TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','dismissed')),
  push_sent         BOOLEAN NOT NULL DEFAULT false,
  dedup_key         TEXT,
  read_at           TIMESTAMPTZ,
  dismissed_at      TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own notifications"   ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own notifications" ON public.notifications FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own notifications" ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own notifications" ON public.notifications FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access on notifications"
  ON public.notifications FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread    ON public.notifications(user_id, read_at) WHERE read_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_user_scheduled ON public.notifications(user_id, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_notifications_category       ON public.notifications(user_id, category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_notifications_dedup   ON public.notifications(user_id, dedup_key)
  WHERE dedup_key IS NOT NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_notifications_status_scheduled ON public.notifications(user_id, status, scheduled_for)
  WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_notifications_type ON public.notifications(user_id, notification_type)
  WHERE dismissed_at IS NULL;

CREATE OR REPLACE FUNCTION public.sync_notification_status()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
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
  FOR EACH ROW EXECUTE FUNCTION public.sync_notification_status();

-- -------------------------------------------------------
-- scheduled_reminders
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.scheduled_reminders (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  message    TEXT NOT NULL,
  remind_at  TIMESTAMPTZ NOT NULL,
  is_fired   BOOLEAN NOT NULL DEFAULT false,
  fired_at   TIMESTAMPTZ,
  dismissed  BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.scheduled_reminders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own reminders"   ON public.scheduled_reminders FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own reminders" ON public.scheduled_reminders FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own reminders" ON public.scheduled_reminders FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own reminders" ON public.scheduled_reminders FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY "Service role full access on scheduled_reminders"
  ON public.scheduled_reminders FOR ALL TO service_role USING (true) WITH CHECK (true);

-- -------------------------------------------------------
-- archive_sources
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.archive_sources (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       UUID NOT NULL,
  item_id       UUID NOT NULL,
  source_type   TEXT NOT NULL DEFAULT 'website',
  source_url    TEXT NOT NULL,
  external_id   TEXT,
  title         TEXT,
  imported_text TEXT,
  status        TEXT NOT NULL DEFAULT 'importing',
  imported_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.archive_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sources"   ON public.archive_sources FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create their own sources" ON public.archive_sources FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own sources" ON public.archive_sources FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own sources" ON public.archive_sources FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_archive_sources_item_id ON public.archive_sources(item_id);
CREATE INDEX IF NOT EXISTS idx_archive_sources_user_id ON public.archive_sources(user_id);

-- -------------------------------------------------------
-- device_tokens
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.device_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  token      TEXT NOT NULL,
  platform   TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, token)
);

ALTER TABLE public.device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own tokens"   ON public.device_tokens FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own tokens" ON public.device_tokens FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own tokens" ON public.device_tokens FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own tokens" ON public.device_tokens FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- -------------------------------------------------------
-- data_integrity_logs
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.data_integrity_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL,
  event_type TEXT NOT NULL,
  details    JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.data_integrity_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own logs" ON public.data_integrity_logs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can view their own logs"   ON public.data_integrity_logs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own logs" ON public.data_integrity_logs FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.data_integrity_logs
  ADD CONSTRAINT data_integrity_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE NOT VALID;

-- -------------------------------------------------------
-- shared_archive_prototype
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.shared_archive_prototype (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_note_id UUID NOT NULL,
  author_id        UUID NOT NULL,
  title            TEXT,
  content          TEXT,
  tags             TEXT[] DEFAULT ARRAY[]::TEXT[],
  visibility       TEXT NOT NULL DEFAULT 'public',
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_archive_prototype ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert their own shared entries"   ON public.shared_archive_prototype FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Users can delete their own shared entries"   ON public.shared_archive_prototype FOR DELETE TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "Users can update their own shared entries"   ON public.shared_archive_prototype FOR UPDATE TO authenticated USING (auth.uid() = author_id);
CREATE POLICY "Authenticated users can read shared entries" ON public.shared_archive_prototype FOR SELECT TO authenticated USING (true);

-- -------------------------------------------------------
-- chat_sessions
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_sessions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title      TEXT DEFAULT 'New conversation',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chat sessions" ON public.chat_sessions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_user_id ON public.chat_sessions(user_id);

-- -------------------------------------------------------
-- chat_messages
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.chat_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.chat_sessions(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content    TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.chat_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own chat messages" ON public.chat_messages
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_id ON public.chat_messages(session_id);

-- -------------------------------------------------------
-- Storage bucket
-- -------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('user-images', 'user-images', true, 10485760,
  ARRAY['image/jpeg','image/png','image/webp','image/heic','image/gif'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload their own images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'user-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Users can read their own images"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'user-images' AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Public read access for user images"
  ON storage.objects FOR SELECT TO anon
  USING (bucket_id = 'user-images');

CREATE POLICY "Users can delete their own images"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'user-images' AND (storage.foldername(name))[1] = auth.uid()::text);

-- -------------------------------------------------------
-- Helper functions
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_in_quiet_hours(p_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  prefs      notification_preferences%ROWTYPE;
  user_tz    TEXT;
  local_time TIME;
  q_start    TIME;
  q_end      TIME;
BEGIN
  SELECT * INTO prefs FROM notification_preferences WHERE user_id = p_user_id;
  IF NOT FOUND THEN RETURN false; END IF;

  user_tz := COALESCE(prefs.timezone, 'UTC');
  BEGIN
    local_time := (now() AT TIME ZONE user_tz)::TIME;
  EXCEPTION WHEN OTHERS THEN
    local_time := (now() AT TIME ZONE 'UTC')::TIME;
  END;

  q_start := prefs.quiet_hours_start::TIME;
  q_end   := prefs.quiet_hours_end::TIME;
  IF q_start > q_end THEN
    RETURN local_time >= q_start OR local_time < q_end;
  ELSE
    RETURN local_time >= q_start AND local_time < q_end;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.is_in_quiet_hours(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.is_in_quiet_hours(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_recent_archives()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.spaces SET deleted_at = NULL
    WHERE user_id = auth.uid() AND deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '30 days';
  UPDATE public.items SET deleted_at = NULL
    WHERE user_id = auth.uid() AND deleted_at IS NOT NULL AND deleted_at > NOW() - INTERVAL '30 days';
END;
$$;

GRANT EXECUTE ON FUNCTION public.restore_recent_archives() TO authenticated;
