ALTER TABLE public.nearshoring_changes
ADD COLUMN IF NOT EXISTS comment_increase text,
ADD COLUMN IF NOT EXISTS comment_increase_updated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS comment_increase_updated_by text,
ADD COLUMN IF NOT EXISTS comment_decrease text,
ADD COLUMN IF NOT EXISTS comment_decrease_updated_at timestamp with time zone,
ADD COLUMN IF NOT EXISTS comment_decrease_updated_by text;