-- ============================================================
-- Missing FK constraints — 2026-03-19
-- ============================================================
-- data_integrity_logs and device_tokens both declared user_id
-- WITHOUT a FOREIGN KEY reference to auth.users, meaning deleting
-- a user account leaves orphaned private rows permanently in the DB.
-- Also adds the missing DELETE policy on data_integrity_logs.
--
-- NOT VALID skips a full-table scan on existing data (safe for live DBs).
-- Run VALIDATE CONSTRAINT in a maintenance window to enforce on old rows.
-- ============================================================

-- FK for data_integrity_logs
ALTER TABLE public.data_integrity_logs
  ADD CONSTRAINT data_integrity_logs_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

-- FK for device_tokens
ALTER TABLE public.device_tokens
  ADD CONSTRAINT device_tokens_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
  NOT VALID;

-- Missing DELETE policy on data_integrity_logs
-- (SELECT and INSERT existed; DELETE was never added)
CREATE POLICY "Users can delete their own logs"
  ON public.data_integrity_logs
  FOR DELETE
  USING (auth.uid() = user_id);
