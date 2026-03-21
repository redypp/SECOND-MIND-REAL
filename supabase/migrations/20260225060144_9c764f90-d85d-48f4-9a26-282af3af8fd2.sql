
CREATE TABLE IF NOT EXISTS public.archive_sources (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  item_id UUID NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'website',
  source_url TEXT NOT NULL,
  external_id TEXT,
  title TEXT,
  imported_text TEXT,
  status TEXT NOT NULL DEFAULT 'importing',
  imported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.archive_sources ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own sources"
  ON public.archive_sources FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own sources"
  ON public.archive_sources FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own sources"
  ON public.archive_sources FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own sources"
  ON public.archive_sources FOR DELETE
  USING (auth.uid() = user_id);

CREATE INDEX idx_archive_sources_item_id ON public.archive_sources(item_id);
CREATE INDEX idx_archive_sources_user_id ON public.archive_sources(user_id);
