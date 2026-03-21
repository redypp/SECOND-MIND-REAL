-- Add canvas position columns to items table for persisting item layout on freeform canvas
ALTER TABLE public.items 
ADD COLUMN canvas_x NUMERIC DEFAULT NULL,
ADD COLUMN canvas_y NUMERIC DEFAULT NULL,
ADD COLUMN canvas_z INTEGER DEFAULT NULL,
ADD COLUMN canvas_scale NUMERIC DEFAULT 1;