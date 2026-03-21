-- Add gif_background column to spaces table
-- Stores URL of animated GIF used as cinematic background on archive title pages

ALTER TABLE spaces
  ADD COLUMN IF NOT EXISTS gif_background TEXT DEFAULT NULL;

COMMENT ON COLUMN spaces.gif_background IS 'URL of animated GIF background for the archive title page. Can be a Giphy CDN URL or any direct GIF URL.';
