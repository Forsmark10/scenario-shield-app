-- Add absolute amount + comment to category_adjustments
ALTER TABLE public.category_adjustments
  ADD COLUMN IF NOT EXISTS adjustment_amount_tnok numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_updated_by text;

-- Add comment fields to all assumption tables
ALTER TABLE public.global_assumptions
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_updated_by text;

ALTER TABLE public.central_assumptions
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_updated_by text;

ALTER TABLE public.internal_fte_changes
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_updated_by text;

ALTER TABLE public.external_fte_changes
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_updated_by text;

ALTER TABLE public.conversions
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_updated_by text;

ALTER TABLE public.nearshoring_additions
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_updated_by text;

ALTER TABLE public.capex_plan
  ADD COLUMN IF NOT EXISTS comment text,
  ADD COLUMN IF NOT EXISTS comment_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_updated_by text;