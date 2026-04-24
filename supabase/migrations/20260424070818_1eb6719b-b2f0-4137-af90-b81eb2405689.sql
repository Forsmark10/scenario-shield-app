ALTER TABLE public.category_adjustments
  ADD COLUMN IF NOT EXISTS comment_amount text,
  ADD COLUMN IF NOT EXISTS comment_amount_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_amount_updated_by text;