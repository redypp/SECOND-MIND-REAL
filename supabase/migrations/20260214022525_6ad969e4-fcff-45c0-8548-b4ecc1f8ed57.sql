
-- Add pinning and recent-use fields to spaces table
ALTER TABLE public.spaces
  ADD COLUMN is_pinned boolean NOT NULL DEFAULT false,
  ADD COLUMN pinned_at timestamp with time zone DEFAULT NULL,
  ADD COLUMN last_used_at timestamp with time zone NOT NULL DEFAULT now();

-- Index for efficient ordering: pinned first, then by last_used_at
CREATE INDEX idx_spaces_pin_order ON public.spaces (user_id, is_pinned DESC, pinned_at DESC NULLS LAST, last_used_at DESC);
