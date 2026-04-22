
-- ===== TABLES =====

CREATE TABLE public.cost_lines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL,
  project TEXT NOT NULL,
  account INTEGER NOT NULL,
  account_name TEXT NOT NULL,
  cost_type TEXT NOT NULL CHECK (cost_type IN ('Local','Central')),
  ac_2025 NUMERIC NOT NULL DEFAULT 0,
  bu_2026_monthly NUMERIC[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::numeric[],
  fc_2026_monthly NUMERIC[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0,0,0,0]::numeric[],
  is_fte_master BOOLEAN NOT NULL DEFAULT false,
  fte_driver_pct NUMERIC,
  is_existing_depreciation_alfa BOOLEAN NOT NULL DEFAULT false,
  is_existing_depreciation_phaseout BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.scenarios (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.global_assumptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  salary_increase_pct NUMERIC NOT NULL DEFAULT 0.04,
  price_increase_pct NUMERIC NOT NULL DEFAULT 0.05,
  eur_nok_rate NUMERIC NOT NULL DEFAULT 11.50,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, year)
);

CREATE TABLE public.central_assumptions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  central_price_increase_pct NUMERIC NOT NULL DEFAULT 0.03,
  central_volume_increase_pct NUMERIC NOT NULL DEFAULT 0.02,
  central_reduction_pct NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, year)
);

CREATE TABLE public.internal_fte_base_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL UNIQUE CHECK (level IN ('Low','Medium','High')),
  base_annual_cost NUMERIC NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.external_fte_base_rates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  level TEXT NOT NULL UNIQUE CHECK (level IN ('Low','Medium','High')),
  base_monthly_cost NUMERIC NOT NULL,
  working_months INTEGER NOT NULL DEFAULT 11,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.nearshoring_base (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  base_annual_cost_eur NUMERIC NOT NULL DEFAULT 75000,
  working_months INTEGER NOT NULL DEFAULT 12,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.internal_fte_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('Low','Medium','High')),
  increase INTEGER NOT NULL DEFAULT 0,
  decrease INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, year, level)
);

CREATE TABLE public.external_fte_changes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  level TEXT NOT NULL CHECK (level IN ('Low','Medium','High')),
  increase INTEGER NOT NULL DEFAULT 0,
  decrease INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, year, level)
);

CREATE TABLE public.conversions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  external_level TEXT NOT NULL CHECK (external_level IN ('Low','Medium','High')),
  internal_level TEXT NOT NULL CHECK (internal_level IN ('Low','Medium','High')),
  count INTEGER NOT NULL DEFAULT 0,
  overlap_months INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.nearshoring_additions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  replaces_external_level TEXT NOT NULL CHECK (replaces_external_level IN ('Low','Medium','High')),
  count INTEGER NOT NULL DEFAULT 0,
  overlap_months INTEGER NOT NULL DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.category_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  year INTEGER NOT NULL,
  adjustment_pct NUMERIC NOT NULL DEFAULT 0 CHECK (adjustment_pct >= -0.5 AND adjustment_pct <= 0.5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (scenario_id, category, year)
);

CREATE TABLE public.capex_plan (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  scenario_id UUID NOT NULL REFERENCES public.scenarios(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  capex_type TEXT NOT NULL CHECK (capex_type IN ('Hardware','Software','Prosjekt')),
  amount NUMERIC NOT NULL DEFAULT 0,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.depreciation_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  capex_type TEXT NOT NULL UNIQUE CHECK (capex_type IN ('Hardware','Software','Prosjekt')),
  depreciation_years INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===== TIMESTAMP TRIGGER =====

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'cost_lines','scenarios','global_assumptions','central_assumptions',
    'internal_fte_base_rates','external_fte_base_rates','nearshoring_base',
    'internal_fte_changes','external_fte_changes','conversions',
    'nearshoring_additions','category_adjustments','capex_plan','depreciation_rules'
  ])
  LOOP
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();', t, t);
  END LOOP;
END $$;

-- ===== RLS (open access — internal planning app, no auth in this phase) =====

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'cost_lines','scenarios','global_assumptions','central_assumptions',
    'internal_fte_base_rates','external_fte_base_rates','nearshoring_base',
    'internal_fte_changes','external_fte_changes','conversions',
    'nearshoring_additions','category_adjustments','capex_plan','depreciation_rules'
  ])
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('CREATE POLICY "Public read %1$s" ON public.%1$I FOR SELECT USING (true);', t);
    EXECUTE format('CREATE POLICY "Public insert %1$s" ON public.%1$I FOR INSERT WITH CHECK (true);', t);
    EXECUTE format('CREATE POLICY "Public update %1$s" ON public.%1$I FOR UPDATE USING (true);', t);
    EXECUTE format('CREATE POLICY "Public delete %1$s" ON public.%1$I FOR DELETE USING (true);', t);
  END LOOP;
END $$;

-- ===== SEED DATA =====

INSERT INTO public.scenarios (name, description, sort_order) VALUES
  ('Steady State', 'Videreføring av dagens drift uten store endringer', 1),
  ('Moderate Saving', 'Moderate kostnadskutt og FTE-reduksjoner', 2),
  ('Aggressive Saving', 'Omfattende kostnadskutt og store FTE-reduksjoner', 3);

INSERT INTO public.internal_fte_base_rates (level, base_annual_cost) VALUES
  ('Low', 650), ('Medium', 1000), ('High', 1300);

INSERT INTO public.external_fte_base_rates (level, base_monthly_cost, working_months) VALUES
  ('Low', 240, 11), ('Medium', 270, 11), ('High', 300, 11);

INSERT INTO public.nearshoring_base (base_annual_cost_eur, working_months) VALUES (75000, 12);

INSERT INTO public.depreciation_rules (capex_type, depreciation_years) VALUES
  ('Hardware', 3), ('Software', 5), ('Prosjekt', 5);

-- Default global + central assumptions for all scenarios, years 2027-2031
INSERT INTO public.global_assumptions (scenario_id, year)
SELECT s.id, y FROM public.scenarios s CROSS JOIN generate_series(2027, 2031) y;

INSERT INTO public.central_assumptions (scenario_id, year)
SELECT s.id, y FROM public.scenarios s CROSS JOIN generate_series(2027, 2031) y;

-- Default category_adjustments = 0 for all scenarios × categories × years
INSERT INTO public.category_adjustments (scenario_id, category, year, adjustment_pct)
SELECT s.id, cat, y, 0
FROM public.scenarios s
CROSS JOIN unnest(ARRAY[
  'Capex','Depreciation','Operations & Personnel-related','Internal FTE',
  'External FTE','Other operating income','IT Costs','Consultancy'
]) cat
CROSS JOIN generate_series(2027, 2031) y;

-- Default FTE changes = 0 for all scenarios × years × levels
INSERT INTO public.internal_fte_changes (scenario_id, year, level)
SELECT s.id, y, lvl
FROM public.scenarios s
CROSS JOIN generate_series(2027, 2031) y
CROSS JOIN unnest(ARRAY['Low','Medium','High']) lvl;

INSERT INTO public.external_fte_changes (scenario_id, year, level)
SELECT s.id, y, lvl
FROM public.scenarios s
CROSS JOIN generate_series(2027, 2031) y
CROSS JOIN unnest(ARRAY['Low','Medium','High']) lvl;
