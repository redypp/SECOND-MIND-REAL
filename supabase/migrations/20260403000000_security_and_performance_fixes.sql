-- =============================================================================
-- Security & Performance Fixes Migration
-- Fixes: shared_archive RLS, chat_messages RLS, missing indexes, RLS optimization
-- =============================================================================

-- ── 1. Fix shared_archive_prototype RLS: restrict SELECT to public entries ──
DROP POLICY IF EXISTS "Authenticated users can read shared entries" ON public.shared_archive_prototype;

CREATE POLICY "Authenticated users can read public shared entries"
  ON public.shared_archive_prototype FOR SELECT TO authenticated
  USING (visibility = 'public' OR (select auth.uid()) = author_id);

-- Also allow anonymous users to read public entries (for public archive pages)
CREATE POLICY "Anyone can read public shared entries"
  ON public.shared_archive_prototype FOR SELECT TO anon
  USING (visibility = 'public');

-- ── 2. Fix chat_messages RLS: validate session ownership ──────────────────────
DROP POLICY IF EXISTS "Users can manage own chat messages" ON public.chat_messages;

CREATE POLICY "Users can manage own chat messages"
  ON public.chat_messages FOR ALL
  USING (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      WHERE cs.id = chat_messages.session_id
      AND cs.user_id = (select auth.uid())
    )
  )
  WITH CHECK (
    (select auth.uid()) = user_id
    AND EXISTS (
      SELECT 1 FROM public.chat_sessions cs
      WHERE cs.id = chat_messages.session_id
      AND cs.user_id = (select auth.uid())
    )
  );

-- ── 3. Add missing indexes on foreign keys ────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_chat_messages_user_id
  ON public.chat_messages (user_id);

CREATE INDEX IF NOT EXISTS idx_data_integrity_logs_user_id
  ON public.data_integrity_logs (user_id);

CREATE INDEX IF NOT EXISTS idx_space_invites_accepted_by
  ON public.space_invites (accepted_by);

CREATE INDEX IF NOT EXISTS idx_space_invites_created_by
  ON public.space_invites (created_by);

CREATE INDEX IF NOT EXISTS idx_space_invites_space_id
  ON public.space_invites (space_id);

CREATE INDEX IF NOT EXISTS idx_space_members_invited_by
  ON public.space_members (invited_by);

-- ── 4. Optimize RLS policies: use (select auth.uid()) for single evaluation ──
-- This wraps auth.uid() in a subselect so it's evaluated once per query
-- instead of once per row. Significant performance improvement on larger tables.

-- profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile" ON public.profiles
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;
CREATE POLICY "Users can insert their own profile" ON public.profiles
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile" ON public.profiles
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- user_preferences
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.user_preferences;
CREATE POLICY "Users can view their own preferences" ON public.user_preferences
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own preferences" ON public.user_preferences;
CREATE POLICY "Users can create their own preferences" ON public.user_preferences
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.user_preferences;
CREATE POLICY "Users can update their own preferences" ON public.user_preferences
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- notification_preferences
DROP POLICY IF EXISTS "Users can view their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can view their own notification preferences" ON public.notification_preferences
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can insert their own notification preferences" ON public.notification_preferences
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own preferences" ON public.notification_preferences;
CREATE POLICY "Users can update their own notification preferences" ON public.notification_preferences
  FOR UPDATE USING ((select auth.uid()) = user_id);

-- items (high traffic table - most impactful optimization)
DROP POLICY IF EXISTS "Users can view their own items" ON public.items;
CREATE POLICY "Users can view their own items" ON public.items
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own items" ON public.items;
CREATE POLICY "Users can create their own items" ON public.items
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own items" ON public.items;
CREATE POLICY "Users can update their own items" ON public.items
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own items" ON public.items;
CREATE POLICY "Users can delete their own items" ON public.items
  FOR DELETE USING ((select auth.uid()) = user_id);

-- spaces
DROP POLICY IF EXISTS "Users can view their own spaces" ON public.spaces;
CREATE POLICY "Users can view their own spaces" ON public.spaces
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own spaces" ON public.spaces;
CREATE POLICY "Users can create their own spaces" ON public.spaces
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own spaces" ON public.spaces;
CREATE POLICY "Users can update their own spaces" ON public.spaces
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own spaces" ON public.spaces;
CREATE POLICY "Users can delete their own spaces" ON public.spaces
  FOR DELETE USING ((select auth.uid()) = user_id);

-- chat_sessions
DROP POLICY IF EXISTS "Users can manage own chat sessions" ON public.chat_sessions;
CREATE POLICY "Users can manage own chat sessions" ON public.chat_sessions
  FOR ALL USING ((select auth.uid()) = user_id)
  WITH CHECK ((select auth.uid()) = user_id);

-- notifications
DROP POLICY IF EXISTS "Users can view their own notifications" ON public.notifications;
CREATE POLICY "Users can view their own notifications" ON public.notifications
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own notifications" ON public.notifications;
CREATE POLICY "Users can insert their own notifications" ON public.notifications
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own notifications" ON public.notifications;
CREATE POLICY "Users can update their own notifications" ON public.notifications
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own notifications" ON public.notifications;
CREATE POLICY "Users can delete their own notifications" ON public.notifications
  FOR DELETE USING ((select auth.uid()) = user_id);

-- scheduled_reminders
DROP POLICY IF EXISTS "Users can view their own reminders" ON public.scheduled_reminders;
CREATE POLICY "Users can view their own reminders" ON public.scheduled_reminders
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own reminders" ON public.scheduled_reminders;
CREATE POLICY "Users can create their own reminders" ON public.scheduled_reminders
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own reminders" ON public.scheduled_reminders;
CREATE POLICY "Users can update their own reminders" ON public.scheduled_reminders
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own reminders" ON public.scheduled_reminders;
CREATE POLICY "Users can delete their own reminders" ON public.scheduled_reminders
  FOR DELETE USING ((select auth.uid()) = user_id);

-- people
DROP POLICY IF EXISTS "Users can view their own people" ON public.people;
CREATE POLICY "Users can view their own people" ON public.people
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own people" ON public.people;
CREATE POLICY "Users can create their own people" ON public.people
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own people" ON public.people;
CREATE POLICY "Users can update their own people" ON public.people
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own people" ON public.people;
CREATE POLICY "Users can delete their own people" ON public.people
  FOR DELETE USING ((select auth.uid()) = user_id);

-- habits
DROP POLICY IF EXISTS "Users can view their own habits" ON public.habits;
CREATE POLICY "Users can view their own habits" ON public.habits
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own habits" ON public.habits;
CREATE POLICY "Users can create their own habits" ON public.habits
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own habits" ON public.habits;
CREATE POLICY "Users can update their own habits" ON public.habits
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own habits" ON public.habits;
CREATE POLICY "Users can delete their own habits" ON public.habits
  FOR DELETE USING ((select auth.uid()) = user_id);

-- habit_entries
DROP POLICY IF EXISTS "Users can view their own entries" ON public.habit_entries;
CREATE POLICY "Users can view their own entries" ON public.habit_entries
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own entries" ON public.habit_entries;
CREATE POLICY "Users can create their own entries" ON public.habit_entries
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own entries" ON public.habit_entries;
CREATE POLICY "Users can update their own entries" ON public.habit_entries
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own entries" ON public.habit_entries;
CREATE POLICY "Users can delete their own entries" ON public.habit_entries
  FOR DELETE USING ((select auth.uid()) = user_id);

-- journal_entries
DROP POLICY IF EXISTS "Users can view their own journal entries" ON public.journal_entries;
CREATE POLICY "Users can view their own journal entries" ON public.journal_entries
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own journal entries" ON public.journal_entries;
CREATE POLICY "Users can create their own journal entries" ON public.journal_entries
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own journal entries" ON public.journal_entries;
CREATE POLICY "Users can update their own journal entries" ON public.journal_entries
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own journal entries" ON public.journal_entries;
CREATE POLICY "Users can delete their own journal entries" ON public.journal_entries
  FOR DELETE USING ((select auth.uid()) = user_id);

-- archive_sources
DROP POLICY IF EXISTS "Users can view their own sources" ON public.archive_sources;
CREATE POLICY "Users can view their own sources" ON public.archive_sources
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can create their own sources" ON public.archive_sources;
CREATE POLICY "Users can create their own sources" ON public.archive_sources
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own sources" ON public.archive_sources;
CREATE POLICY "Users can update their own sources" ON public.archive_sources
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own sources" ON public.archive_sources;
CREATE POLICY "Users can delete their own sources" ON public.archive_sources
  FOR DELETE USING ((select auth.uid()) = user_id);

-- device_tokens
DROP POLICY IF EXISTS "Users can view their own tokens" ON public.device_tokens;
CREATE POLICY "Users can view their own tokens" ON public.device_tokens
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can insert their own tokens" ON public.device_tokens;
CREATE POLICY "Users can insert their own tokens" ON public.device_tokens
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can update their own tokens" ON public.device_tokens;
CREATE POLICY "Users can update their own tokens" ON public.device_tokens
  FOR UPDATE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own tokens" ON public.device_tokens;
CREATE POLICY "Users can delete their own tokens" ON public.device_tokens
  FOR DELETE USING ((select auth.uid()) = user_id);

-- data_integrity_logs
DROP POLICY IF EXISTS "Users can insert their own logs" ON public.data_integrity_logs;
CREATE POLICY "Users can insert their own logs" ON public.data_integrity_logs
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own logs" ON public.data_integrity_logs;
CREATE POLICY "Users can view their own logs" ON public.data_integrity_logs
  FOR SELECT USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can delete their own logs" ON public.data_integrity_logs;
CREATE POLICY "Users can delete their own logs" ON public.data_integrity_logs
  FOR DELETE USING ((select auth.uid()) = user_id);

-- shared_archive_prototype (owner policies)
DROP POLICY IF EXISTS "Users can insert their own shared entries" ON public.shared_archive_prototype;
CREATE POLICY "Users can insert their own shared entries"
  ON public.shared_archive_prototype FOR INSERT TO authenticated
  WITH CHECK ((select auth.uid()) = author_id);

DROP POLICY IF EXISTS "Users can delete their own shared entries" ON public.shared_archive_prototype;
CREATE POLICY "Users can delete their own shared entries"
  ON public.shared_archive_prototype FOR DELETE TO authenticated
  USING ((select auth.uid()) = author_id);

DROP POLICY IF EXISTS "Users can update their own shared entries" ON public.shared_archive_prototype;
CREATE POLICY "Users can update their own shared entries"
  ON public.shared_archive_prototype FOR UPDATE TO authenticated
  USING ((select auth.uid()) = author_id);

-- ── 5. Validate NOT VALID foreign key constraints ─────────────────────────────
ALTER TABLE public.data_integrity_logs VALIDATE CONSTRAINT data_integrity_logs_user_id_fkey;
ALTER TABLE public.device_tokens VALIDATE CONSTRAINT device_tokens_user_id_fkey;
