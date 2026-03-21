-- Expand sub_category CHECK constraint to include all values used by the frontend.
-- Previously only ('scheduling', 'notes', 'todo', 'misc') were allowed, which caused
-- silent DB insert failures for AI-classified items with 'idea', 'task', 'habit',
-- 'journal', or 'reminder' sub_categories.

ALTER TABLE items
  DROP CONSTRAINT IF EXISTS items_sub_category_check;

ALTER TABLE items
  ADD CONSTRAINT items_sub_category_check
    CHECK (sub_category IN ('scheduling', 'notes', 'todo', 'misc', 'idea', 'task', 'habit', 'journal', 'reminder'));
