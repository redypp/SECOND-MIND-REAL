-- Add AI-enrichment columns to items table.
-- These columns were added directly via Supabase Studio and are present in the live
-- schema (reflected in types.ts), but were missing from migration files.
-- Using IF NOT EXISTS so this is safe to run against a DB that already has them.

ALTER TABLE public.items
  ADD COLUMN IF NOT EXISTS ai_processed  BOOLEAN DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_summary    TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS ai_tags       TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS extracted_people TEXT[] DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS suggested_space  TEXT DEFAULT NULL;

-- Index to quickly find items that have been AI-processed
CREATE INDEX IF NOT EXISTS idx_items_ai_processed
  ON public.items (user_id, ai_processed)
  WHERE deleted_at IS NULL;
