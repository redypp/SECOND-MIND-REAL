-- Add soft-delete and version tracking to items table
ALTER TABLE public.items 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Add soft-delete and version tracking to spaces table
ALTER TABLE public.spaces 
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL,
ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1;

-- Create index for soft-delete queries (exclude deleted items by default)
CREATE INDEX IF NOT EXISTS idx_items_not_deleted ON public.items (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_spaces_not_deleted ON public.spaces (user_id) WHERE deleted_at IS NULL;

-- Create index for recovery queries (find recently deleted)
CREATE INDEX IF NOT EXISTS idx_items_deleted_at ON public.items (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_spaces_deleted_at ON public.spaces (deleted_at) WHERE deleted_at IS NOT NULL;

-- Add a data integrity log table for debugging
CREATE TABLE IF NOT EXISTS public.data_integrity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  event_type TEXT NOT NULL, -- 'merge', 'conflict', 'recovery', 'discrepancy'
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on data_integrity_logs
ALTER TABLE public.data_integrity_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for data_integrity_logs
CREATE POLICY "Users can insert their own logs" 
ON public.data_integrity_logs 
FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can view their own logs" 
ON public.data_integrity_logs 
FOR SELECT 
USING (auth.uid() = user_id);

-- Create trigger to auto-increment version on update
CREATE OR REPLACE FUNCTION public.increment_version()
RETURNS TRIGGER AS $$
BEGIN
  -- Only increment if this is a real update (not just the version changing)
  IF OLD.version = NEW.version THEN
    NEW.version = OLD.version + 1;
  END IF;
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply version trigger to items
DROP TRIGGER IF EXISTS increment_items_version ON public.items;
CREATE TRIGGER increment_items_version
BEFORE UPDATE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.increment_version();

-- Apply version trigger to spaces
DROP TRIGGER IF EXISTS increment_spaces_version ON public.spaces;
CREATE TRIGGER increment_spaces_version
BEFORE UPDATE ON public.spaces
FOR EACH ROW
EXECUTE FUNCTION public.increment_version();