
-- Add missing columns to spaces table that the app code expects
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS group_assignments jsonb DEFAULT NULL;
ALTER TABLE public.spaces ADD COLUMN IF NOT EXISTS gif_background text DEFAULT NULL;
