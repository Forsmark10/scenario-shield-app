
-- Merge duplicate aggregated capex_plan rows (description IS NULL) per (scenario_id, year, capex_type)
WITH ranked AS (
  SELECT id, scenario_id, year, capex_type, amount,
         ROW_NUMBER() OVER (PARTITION BY scenario_id, year, capex_type ORDER BY created_at) AS rn,
         SUM(amount) OVER (PARTITION BY scenario_id, year, capex_type) AS total_amount
  FROM public.capex_plan
  WHERE description IS NULL OR description = ''
),
to_keep AS (
  SELECT id, total_amount FROM ranked WHERE rn = 1
),
to_delete AS (
  SELECT id FROM ranked WHERE rn > 1
)
UPDATE public.capex_plan cp
SET amount = tk.total_amount
FROM to_keep tk
WHERE cp.id = tk.id;

DELETE FROM public.capex_plan
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY scenario_id, year, capex_type ORDER BY created_at) AS rn
    FROM public.capex_plan
    WHERE description IS NULL OR description = ''
  ) x WHERE rn > 1
);

-- Prevent future duplicates of aggregated bucket rows (those without a description)
CREATE UNIQUE INDEX IF NOT EXISTS capex_plan_unique_aggregated
ON public.capex_plan (scenario_id, year, capex_type)
WHERE description IS NULL OR description = '';
