ALTER TABLE public.central_assumptions
  ADD COLUMN IF NOT EXISTS central_reduction_amount_tnok numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS central_eur_nok_rate numeric NOT NULL DEFAULT 11.3,
  ADD COLUMN IF NOT EXISTS comment_amount text,
  ADD COLUMN IF NOT EXISTS comment_amount_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_amount_updated_by text,
  ADD COLUMN IF NOT EXISTS comment_rate text,
  ADD COLUMN IF NOT EXISTS comment_rate_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_rate_updated_by text;