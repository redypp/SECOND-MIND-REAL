-- Create spaces table for user collections/sections
CREATE TABLE public.spaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    image TEXT,
    color TEXT,
    item_count INTEGER NOT NULL DEFAULT 0,
    merged_from TEXT[],
    position INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create items table for notes, todos, events, etc.
CREATE TABLE public.items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    sub_category TEXT NOT NULL CHECK (sub_category IN ('scheduling', 'notes', 'todo', 'misc')),
    title TEXT,
    content TEXT,
    blocks JSONB NOT NULL DEFAULT '[]'::jsonb,
    space_ids UUID[] DEFAULT ARRAY[]::UUID[],
    people_ids TEXT[],
    keywords TEXT[],
    scheduled_date DATE,
    scheduled_time TEXT,
    color TEXT,
    item_type TEXT,
    thumbnail TEXT,
    url TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create user_preferences table for app settings
CREATE TABLE public.user_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    ai_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    theme TEXT DEFAULT 'system',
    last_cleanup_date DATE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.spaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- RLS policies for spaces
CREATE POLICY "Users can view their own spaces" 
ON public.spaces FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own spaces" 
ON public.spaces FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own spaces" 
ON public.spaces FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own spaces" 
ON public.spaces FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for items
CREATE POLICY "Users can view their own items" 
ON public.items FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own items" 
ON public.items FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own items" 
ON public.items FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own items" 
ON public.items FOR DELETE 
USING (auth.uid() = user_id);

-- RLS policies for user_preferences
CREATE POLICY "Users can view their own preferences" 
ON public.user_preferences FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences" 
ON public.user_preferences FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences" 
ON public.user_preferences FOR UPDATE 
USING (auth.uid() = user_id);

-- Create indexes for performance
CREATE INDEX idx_spaces_user_id ON public.spaces(user_id);
CREATE INDEX idx_spaces_position ON public.spaces(user_id, position);
CREATE INDEX idx_items_user_id ON public.items(user_id);
CREATE INDEX idx_items_sub_category ON public.items(user_id, sub_category);
CREATE INDEX idx_items_scheduled_date ON public.items(user_id, scheduled_date);
CREATE INDEX idx_user_preferences_user_id ON public.user_preferences(user_id);

-- Triggers for updated_at
CREATE TRIGGER update_spaces_updated_at
BEFORE UPDATE ON public.spaces
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_items_updated_at
BEFORE UPDATE ON public.items
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_user_preferences_updated_at
BEFORE UPDATE ON public.user_preferences
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();