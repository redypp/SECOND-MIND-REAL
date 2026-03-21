-- Create a function that restores recently soft-deleted archives for the current user.
-- Called automatically on app startup via SpacesContext to recover accidentally deleted archives.
-- Only restores spaces deleted in the last 30 days to avoid undeleting intentionally removed data.

CREATE OR REPLACE FUNCTION public.restore_recent_archives()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Restore spaces soft-deleted in the last 30 days for the current user
  UPDATE public.spaces
  SET deleted_at = NULL
  WHERE user_id = auth.uid()
    AND deleted_at IS NOT NULL
    AND deleted_at > NOW() - INTERVAL '30 days';

  -- Restore items soft-deleted in the last 30 days for the current user
  UPDATE public.items
  SET deleted_at = NULL
  WHERE user_id = auth.uid()
    AND deleted_at IS NOT NULL
    AND deleted_at > NOW() - INTERVAL '30 days';
END;
$$;

-- Allow authenticated users to call this function
GRANT EXECUTE ON FUNCTION public.restore_recent_archives() TO authenticated;
