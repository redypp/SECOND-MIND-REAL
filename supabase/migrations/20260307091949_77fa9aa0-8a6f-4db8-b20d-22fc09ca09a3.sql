
CREATE TABLE IF NOT EXISTS public.shared_archive_prototype (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_note_id uuid NOT NULL,
  author_id uuid NOT NULL,
  title text,
  content text,
  tags text[] DEFAULT ARRAY[]::text[],
  visibility text NOT NULL DEFAULT 'public',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.shared_archive_prototype ENABLE ROW LEVEL SECURITY;

-- Authors can manage their own shared entries
CREATE POLICY "Users can insert their own shared entries"
  ON public.shared_archive_prototype FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = author_id);

CREATE POLICY "Users can delete their own shared entries"
  ON public.shared_archive_prototype FOR DELETE TO authenticated
  USING (auth.uid() = author_id);

CREATE POLICY "Users can update their own shared entries"
  ON public.shared_archive_prototype FOR UPDATE TO authenticated
  USING (auth.uid() = author_id);

-- Anyone authenticated can read public shared entries (this is the point of sharing)
CREATE POLICY "Authenticated users can read shared entries"
  ON public.shared_archive_prototype FOR SELECT TO authenticated
  USING (true);
