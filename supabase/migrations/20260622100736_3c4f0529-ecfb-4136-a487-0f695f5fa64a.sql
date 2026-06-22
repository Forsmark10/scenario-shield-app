ALTER TABLE public.central_assumptions
  ADD COLUMN IF NOT EXISTS comment_price text,
  ADD COLUMN IF NOT EXISTS comment_price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_price_updated_by text;