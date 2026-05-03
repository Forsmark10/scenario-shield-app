-- Internal → Nearshoring conversion table
CREATE TABLE public.internal_to_nearshoring_conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL,
  year INTEGER NOT NULL,
  internal_level TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  overlap_months INTEGER NOT NULL DEFAULT 3,
  comment TEXT,
  comment_updated_at TIMESTAMPTZ,
  comment_updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.internal_to_nearshoring_conversions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read internal_to_nearshoring_conversions"
  ON public.internal_to_nearshoring_conversions FOR SELECT USING (true);
CREATE POLICY "Public insert internal_to_nearshoring_conversions"
  ON public.internal_to_nearshoring_conversions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update internal_to_nearshoring_conversions"
  ON public.internal_to_nearshoring_conversions FOR UPDATE USING (true);
CREATE POLICY "Public delete internal_to_nearshoring_conversions"
  ON public.internal_to_nearshoring_conversions FOR DELETE USING (true);

-- One-off effects table
CREATE TABLE public.one_off_effects (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL,
  year INTEGER NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  amount_tnok NUMERIC NOT NULL DEFAULT 0,
  comment TEXT,
  comment_updated_at TIMESTAMPTZ,
  comment_updated_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.one_off_effects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read one_off_effects"
  ON public.one_off_effects FOR SELECT USING (true);
CREATE POLICY "Public insert one_off_effects"
  ON public.one_off_effects FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update one_off_effects"
  ON public.one_off_effects FOR UPDATE USING (true);
CREATE POLICY "Public delete one_off_effects"
  ON public.one_off_effects FOR DELETE USING (true);