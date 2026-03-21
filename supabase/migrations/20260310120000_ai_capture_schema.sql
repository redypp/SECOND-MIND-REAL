-- AI Quick Capture schema extensions
-- Adds raw_input, source_type, and ai_category to items table
-- These fields support richer AI capture metadata and future voice/image capture

-- raw_input: stores the original unprocessed user text before any AI cleaning
ALTER TABLE items ADD COLUMN IF NOT EXISTS raw_input TEXT;

-- source_type: origin of the capture — text (default), voice, image
ALTER TABLE items ADD COLUMN IF NOT EXISTS source_type TEXT DEFAULT 'text';

-- ai_category: the full AI-classified category (e.g. task, idea, recipe, experiment)
-- Separate from sub_category which is the storage routing value
ALTER TABLE items ADD COLUMN IF NOT EXISTS ai_category TEXT;

-- Index on source_type for filtering by capture type
CREATE INDEX IF NOT EXISTS items_source_type_idx ON items (user_id, source_type)
  WHERE deleted_at IS NULL;
