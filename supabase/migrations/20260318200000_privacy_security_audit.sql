-- ============================================================
-- Privacy & Security Audit — 2026-03-18
-- ============================================================
-- ISSUES FIXED:
--   1. user-images storage bucket was public=true → private
--      (CDN URLs were readable by anyone on the internet without auth)
--   2. habit_entries INSERT/UPDATE policies did not verify that the
--      referenced habit_id belongs to the current user, allowing a
--      malicious user to pollute another user's habit data and block
--      them from logging entries via UNIQUE(habit_id,date)
--   3. Five tables were missing REFERENCES auth.users(id) ON DELETE CASCADE
--      on user_id, leaving orphaned private data after account deletion
--   4. data_integrity_logs missing DELETE policy
--   5. notification_preferences missing DELETE policy
-- ============================================================


-- ─── 1. STORAGE: Make user-images bucket private ─────────────────────────────
-- The bucket was created with public=true which makes every object
-- accessible via a direct CDN URL (no authentication required).
-- Setting public=false disables that URL pattern; reads now require
-- either an authenticated Supabase client or a signed URL.

UPDATE storage.buckets
SET public = false
WHERE id = 'user-images';

-- Remove the explicit anonymous-read policy.
-- (For a public bucket this policy was redundant — the public=true flag
--  already granted anonymous CDN access. Now that the bucket is private,
--  this policy is also incorrect and must go.)
DROP POLICY IF EXISTS "Public read access for user images" ON storage.objects;


-- ─── 2. habit_entries: prevent cross-user habit_id injection ─────────────────
-- The previous INSERT policy only checked auth.uid() = user_id.
-- It did NOT verify that the referenced habit_id belongs to the
-- current user.  Attack vector:
--   - User A discovers User B's habit UUID (e.g. via a URL or guessing)
--   - User A inserts { user_id: A, habit_id: B_uuid, date: X, status: 'done' }
--   - This passes the old policy (user_id = A = auth.uid())
--   - The UNIQUE(habit_id, date) constraint is now satisfied for (B_uuid, X)
--   - User B tries to log their own entry for the same date → UNIQUE violation
--   - User B's habit tracking is silently broken for that date
-- Fix: require that the habit_id references a habit owned by the caller.

DROP POLICY IF EXISTS "Users can create their own entries" ON public.habit_entries;
DROP POLICY IF EXISTS "Users can update their own entries" ON public.habit_entries;

CREATE POLICY "Users can create their own entries"
  ON public.habit_entries
  FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.habits
      WHERE id = habit_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own entries"
  ON public.habit_entries
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.habits
      WHERE id = habit_id
        AND user_id = auth.uid()
    )
  );


-- ─── 3. Missing FK constraints (orphan protection) ───────────────────────────
-- Several tables declare user_id UUID NOT NULL but omit the FOREIGN KEY
-- reference to auth.users.  Without ON DELETE CASCADE, deleting a user
-- account leaves private rows (journal entries, habits, reminders, etc.)
-- permanently in the database with no owner.

-- NOTE: These constraints use NOT VALID to avoid a full-table lock and
-- scan on existing data.  Run VALIDATE CONSTRAINT separately in a
-- maintenance window if you need strict enforcement on historical rows.

ALTER TABLE public.habits
  ADD CONSTRAINT habits_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.habit_entries
  ADD CONSTRAINT habit_entries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.scheduled_reminders
  ADD CONSTRAINT scheduled_reminders_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

ALTER TABLE public.archive_sources
  ADD CONSTRAINT archive_sources_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;


-- ─── 4. data_integrity_logs: add missing DELETE policy ───────────────────────
-- Users can INSERT and SELECT their own logs but had no DELETE policy,
-- preventing them from pruning debug data they own.

CREATE POLICY "Users can delete their own logs"
  ON public.data_integrity_logs
  FOR DELETE
  USING (auth.uid() = user_id);


-- ─── 5. notification_preferences: add missing DELETE policy ──────────────────
-- Users can SELECT, INSERT, and UPDATE their preferences but cannot
-- delete (reset) them.  Add least-privilege DELETE.

CREATE POLICY "Users can delete their own notification preferences"
  ON public.notification_preferences
  FOR DELETE
  USING (auth.uid() = user_id);
