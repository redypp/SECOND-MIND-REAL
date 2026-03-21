-- Add group_assignments JSONB column to spaces table
-- Stores AI-computed semantic groupings for items in each space
-- Structure: { groups: [{label: string, item_ids: string[]}], organized_at: string, item_count_at_organize: number }

ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS group_assignments JSONB DEFAULT NULL;

COMMENT ON COLUMN spaces.group_assignments IS 'AI-computed semantic groups for items in this space. Cached to avoid redundant AI calls.';
