-- Fix the overly permissive INSERT policy on notifications
-- Drop the old policy and create a more restrictive one
DROP POLICY IF EXISTS "Service role can insert notifications" ON public.notifications;

-- Allow authenticated users to insert notifications for themselves (for edge functions that use user context)
-- The edge function will insert on behalf of the user
CREATE POLICY "Users can insert their own notifications"
ON public.notifications
FOR INSERT
WITH CHECK (auth.uid() = user_id);