-- Ny tabell for utfasing av eksisterende avskrivninger
CREATE TABLE public.depreciation_phaseout (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id uuid NOT NULL,
  type text NOT NULL,
  year integer NOT NULL,
  amount_tnok numeric NOT NULL DEFAULT 0,
  comment text,
  comment_updated_at timestamp with time zone,
  comment_updated_by text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.depreciation_phaseout ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read depreciation_phaseout"
  ON public.depreciation_phaseout FOR SELECT USING (true);
CREATE POLICY "Public insert depreciation_phaseout"
  ON public.depreciation_phaseout FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update depreciation_phaseout"
  ON public.depreciation_phaseout FOR UPDATE USING (true);
CREATE POLICY "Public delete depreciation_phaseout"
  ON public.depreciation_phaseout FOR DELETE USING (true);

CREATE TRIGGER update_depreciation_phaseout_updated_at
  BEFORE UPDATE ON public.depreciation_phaseout
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_depreciation_phaseout_scenario ON public.depreciation_phaseout(scenario_id);