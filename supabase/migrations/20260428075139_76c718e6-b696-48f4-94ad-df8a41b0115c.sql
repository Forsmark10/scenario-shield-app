-- 1. Create nearshoring_changes mirroring internal_fte_changes / external_fte_changes
CREATE TABLE IF NOT EXISTS public.nearshoring_changes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id uuid NOT NULL,
  year integer NOT NULL,
  increase integer NOT NULL DEFAULT 0,
  decrease integer NOT NULL DEFAULT 0,
  comment text,
  comment_updated_at timestamp with time zone,
  comment_updated_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.nearshoring_changes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read nearshoring_changes" ON public.nearshoring_changes FOR SELECT USING (true);
CREATE POLICY "Public insert nearshoring_changes" ON public.nearshoring_changes FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update nearshoring_changes" ON public.nearshoring_changes FOR UPDATE USING (true);
CREATE POLICY "Public delete nearshoring_changes" ON public.nearshoring_changes FOR DELETE USING (true);

CREATE INDEX IF NOT EXISTS idx_nearshoring_changes_scenario_year
  ON public.nearshoring_changes(scenario_id, year);

-- 2. Migrate existing nearshoring_additions data: each addition becomes an increase row.
-- Aggregate counts when there are multiple additions in the same (scenario, year);
-- combine comments by joining with newline. Carry over the latest comment_updated_at.
INSERT INTO public.nearshoring_changes (scenario_id, year, increase, decrease, comment, comment_updated_at, comment_updated_by)
SELECT
  scenario_id,
  year,
  SUM(count)::int AS increase,
  0 AS decrease,
  NULLIF(string_agg(NULLIF(comment, ''), E'\n' ORDER BY created_at), '') AS comment,
  MAX(comment_updated_at) AS comment_updated_at,
  MAX(comment_updated_by) AS comment_updated_by
FROM public.nearshoring_additions
GROUP BY scenario_id, year
ON CONFLICT DO NOTHING;