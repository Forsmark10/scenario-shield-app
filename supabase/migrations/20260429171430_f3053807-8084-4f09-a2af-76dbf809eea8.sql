ALTER TABLE public.forecast_snapshots
ADD COLUMN IF NOT EXISTS snapshot_group_id uuid;

CREATE INDEX IF NOT EXISTS idx_forecast_snapshots_group ON public.forecast_snapshots(snapshot_group_id);

-- Backfill: group existing rows by (name, created_at within 5s window) per save batch.
-- Simpler approach: group by name + DATE_TRUNC('second', created_at) — same save batch shares timestamp.
UPDATE public.forecast_snapshots fs
SET snapshot_group_id = sub.gid
FROM (
  SELECT name, date_trunc('second', created_at) AS sec, gen_random_uuid() AS gid
  FROM public.forecast_snapshots
  WHERE snapshot_group_id IS NULL
  GROUP BY name, date_trunc('second', created_at)
) sub
WHERE fs.snapshot_group_id IS NULL
  AND fs.name = sub.name
  AND date_trunc('second', fs.created_at) = sub.sec;