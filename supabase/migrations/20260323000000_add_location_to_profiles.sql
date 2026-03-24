-- Add location column to profiles for personalized, location-aware AI features
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS location TEXT;
