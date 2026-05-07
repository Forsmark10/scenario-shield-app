-- Clean up duplicate/ghost project capex rows
DELETE FROM public.capex_plan WHERE id = '9d6b3506-9512-496d-b7c3-b6a0412f14e8';
DELETE FROM public.capex_plan WHERE capex_type = 'Prosjekt' AND amount = 0 AND (comment IS NULL OR comment = '');