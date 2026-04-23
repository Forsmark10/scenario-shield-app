-- Auto-versjoner for assumptions (30-dagers retention)
CREATE TABLE public.auto_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id uuid NOT NULL,
  data jsonb NOT NULL,
  summary text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.auto_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read auto_versions" ON public.auto_versions FOR SELECT USING (true);
CREATE POLICY "Public insert auto_versions" ON public.auto_versions FOR INSERT WITH CHECK (true);
CREATE POLICY "Public update auto_versions" ON public.auto_versions FOR UPDATE USING (true);
CREATE POLICY "Public delete auto_versions" ON public.auto_versions FOR DELETE USING (true);

CREATE INDEX idx_auto_versions_scenario_created
  ON public.auto_versions (scenario_id, created_at DESC);

CREATE TRIGGER update_auto_versions_updated_at
  BEFORE UPDATE ON public.auto_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Funksjon som sletter auto-versjoner eldre enn 30 dager.
-- Kjøres opportunistisk fra klienten ved opplastning.
CREATE OR REPLACE FUNCTION public.prune_old_auto_versions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM public.auto_versions WHERE created_at < now() - interval '30 days';
$$;