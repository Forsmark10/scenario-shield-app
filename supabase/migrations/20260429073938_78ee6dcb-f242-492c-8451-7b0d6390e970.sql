
-- Per-driver comments for global_assumptions (salary, price, rate)
ALTER TABLE public.global_assumptions
  ADD COLUMN IF NOT EXISTS comment_salary text,
  ADD COLUMN IF NOT EXISTS comment_salary_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_salary_updated_by text,
  ADD COLUMN IF NOT EXISTS comment_price text,
  ADD COLUMN IF NOT EXISTS comment_price_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_price_updated_by text,
  ADD COLUMN IF NOT EXISTS comment_rate text,
  ADD COLUMN IF NOT EXISTS comment_rate_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_rate_updated_by text;

-- Migrate existing single 'comment' values into comment_salary (best-guess: was used for salary driver in UI).
UPDATE public.global_assumptions
SET comment_salary = comment,
    comment_salary_updated_at = comment_updated_at,
    comment_salary_updated_by = comment_updated_by
WHERE comment IS NOT NULL AND comment_salary IS NULL;

-- Per-type comments (increase / decrease) for FTE changes
ALTER TABLE public.internal_fte_changes
  ADD COLUMN IF NOT EXISTS comment_increase text,
  ADD COLUMN IF NOT EXISTS comment_increase_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_increase_updated_by text,
  ADD COLUMN IF NOT EXISTS comment_decrease text,
  ADD COLUMN IF NOT EXISTS comment_decrease_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_decrease_updated_by text;

-- Migrate existing comments into comment_increase (best-guess default).
UPDATE public.internal_fte_changes
SET comment_increase = comment,
    comment_increase_updated_at = comment_updated_at,
    comment_increase_updated_by = comment_updated_by
WHERE comment IS NOT NULL AND comment_increase IS NULL;

ALTER TABLE public.external_fte_changes
  ADD COLUMN IF NOT EXISTS comment_increase text,
  ADD COLUMN IF NOT EXISTS comment_increase_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_increase_updated_by text,
  ADD COLUMN IF NOT EXISTS comment_decrease text,
  ADD COLUMN IF NOT EXISTS comment_decrease_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS comment_decrease_updated_by text;

UPDATE public.external_fte_changes
SET comment_increase = comment,
    comment_increase_updated_at = comment_updated_at,
    comment_increase_updated_by = comment_updated_by
WHERE comment IS NOT NULL AND comment_increase IS NULL;

-- AI-generated executive summary per scenario (kept separate from the manual narrative).
ALTER TABLE public.scenarios
  ADD COLUMN IF NOT EXISTS ai_executive_summary text,
  ADD COLUMN IF NOT EXISTS ai_executive_summary_generated_at timestamptz;
