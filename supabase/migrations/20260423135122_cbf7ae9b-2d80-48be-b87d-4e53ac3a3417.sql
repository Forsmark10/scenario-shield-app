-- Tabell for auto-backups av cost_lines
CREATE TABLE public.cost_lines_backups (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  row_count INTEGER NOT NULL DEFAULT 0,
  data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_cost_lines_backups_created_at
  ON public.cost_lines_backups (created_at DESC);

ALTER TABLE public.cost_lines_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read cost_lines_backups"
  ON public.cost_lines_backups FOR SELECT USING (true);

CREATE POLICY "Public insert cost_lines_backups"
  ON public.cost_lines_backups FOR INSERT WITH CHECK (true);

CREATE POLICY "Public delete cost_lines_backups"
  ON public.cost_lines_backups FOR DELETE USING (true);

-- Utvid eksisterende prune-funksjon til også å rydde gamle backups (>30 dager)
CREATE OR REPLACE FUNCTION public.prune_old_auto_versions()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  DELETE FROM public.auto_versions WHERE created_at < now() - interval '30 days';
  DELETE FROM public.cost_lines_backups WHERE created_at < now() - interval '30 days';
$function$;