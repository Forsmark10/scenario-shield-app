CREATE TABLE public.forecast_snapshots (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL,
  description text,
  scenario_id uuid NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  data jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read forecast_snapshots" ON public.forecast_snapshots FOR SELECT USING (true);
CREATE POLICY "Public insert forecast_snapshots" ON public.forecast_snapshots FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update forecast_snapshots" ON public.forecast_snapshots FOR UPDATE USING (true);
CREATE POLICY "Public delete forecast_snapshots" ON public.forecast_snapshots FOR DELETE USING (true);

CREATE TRIGGER update_forecast_snapshots_updated_at
BEFORE UPDATE ON public.forecast_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_forecast_snapshots_scenario ON public.forecast_snapshots(scenario_id);
CREATE INDEX idx_forecast_snapshots_created_at ON public.forecast_snapshots(created_at DESC);