export type Level = "Low" | "Medium" | "High";
export type CostType = "Local" | "Central";
export const YEARS = [2027, 2028, 2029, 2030, 2031] as const;
export type ForecastYear = (typeof YEARS)[number];

export interface CostLineRow {
  id: string;
  category: string;
  project: string;
  account: number;
  account_name: string;
  cost_type: CostType;
  ac_2025: number;
  bu_2026_monthly: number[];
  fc_2026_monthly: number[];
  is_fte_master: boolean;
  fte_driver_pct: number | null;
  is_existing_depreciation_alfa: boolean;
  is_existing_depreciation_phaseout: boolean;
}

export interface GlobalAssumption {
  scenario_id: string;
  year: number;
  salary_increase_pct: number;
  price_increase_pct: number;
  eur_nok_rate: number;
}

export interface CentralAssumption {
  scenario_id: string;
  year: number;
  central_price_increase_pct: number;
  central_volume_increase_pct: number;
  central_reduction_pct: number;
  central_reduction_amount_tnok?: number;
  central_eur_nok_rate?: number;
}

export interface FteChange {
  scenario_id: string;
  year: number;
  level: Level;
  increase: number;
  decrease: number;
}

export interface Conversion {
  scenario_id: string;
  year: number;
  external_level: Level;
  internal_level: Level;
  count: number;
  overlap_months: number;
}

export interface NearshoringAddition {
  scenario_id: string;
  year: number;
  replaces_external_level: Level;
  count: number;
  overlap_months: number;
}

/** New model: nearshoring as an independent FTE-like resource. */
export interface NearshoringChange {
  scenario_id: string;
  year: number;
  increase: number;
  decrease: number;
  comment?: string | null;
}

export interface CategoryAdjustment {
  scenario_id: string;
  category: string;
  year: number;
  adjustment_pct: number;
  adjustment_amount_tnok?: number;
  comment?: string | null;
}

/** Internal → Nearshoring conversion. Intern FTE fjernes, nearshoring legges til, 3 mnd overlapp. */
export interface InternalToNearshoringConversion {
  scenario_id: string;
  year: number;
  internal_level: Level;
  count: number;
  overlap_months: number;
  comment?: string | null;
}

/** Engangseffekt (one-off): gjelder kun ett år, vokser ikke, additivt på kategori. */
export interface OneOffEffect {
  scenario_id: string;
  year: number;
  category: string;
  description?: string | null;
  amount_tnok: number;
  comment?: string | null;
}

export interface CapexPlan {
  scenario_id: string;
  year: number;
  capex_type: "Hardware" | "Software" | "Prosjekt";
  amount: number;
  description: string | null;
}

export interface DepreciationPhaseout {
  id?: string;
  scenario_id: string;
  type: "Hardware" | "Software" | "Prosjekt";
  year: number;
  amount_tnok: number;
  comment?: string | null;
}

export interface DepreciationRule {
  capex_type: "Hardware" | "Software" | "Prosjekt";
  depreciation_years: number;
}

export interface InternalFteBaseRate {
  level: Level;
  base_annual_cost: number;
}

export interface ExternalFteBaseRate {
  level: Level;
  base_monthly_cost: number;
  working_months: number;
}

export interface NearshoringBase {
  base_annual_cost_eur: number;
  working_months: number;
}

export interface ForecastLine {
  line_id: string; // unik nøkkel: cost_line.id eller "virtual:..."
  source: "cost_line" | "virtual";
  category: string;
  project: string;
  account: number | null;
  account_name: string;
  cost_type: CostType;
  is_capex: boolean;
  is_depreciation: boolean;
  base_2026: number;
  amounts: Record<number, number>; // år -> beløp
  monthly_2027: number[]; // 12 måneder
  breakdown_source: Record<number, string>; // år -> tekstforklaring
}

export interface ForecastTotals {
  by_year: Record<number, number>;
  by_category: Record<string, Record<number, number>>;
  by_cost_type: { Local: Record<number, number>; Central: Record<number, number> };
  cagr_2026_2031: number;
  base_2026_total: number;
}

export interface ForecastResult {
  scenario_id: string;
  lines: ForecastLine[];
  totals: ForecastTotals;
  meta: {
    years: number[];
    generated_at: string;
  };
}

export interface ForecastInputs {
  scenario_id: string;
  cost_lines: CostLineRow[];
  global_assumptions: GlobalAssumption[];
  central_assumptions: CentralAssumption[];
  internal_fte_changes: FteChange[];
  external_fte_changes: FteChange[];
  conversions: Conversion[];
  nearshoring_additions: NearshoringAddition[];
  nearshoring_changes: NearshoringChange[];
  internal_to_nearshoring_conversions?: InternalToNearshoringConversion[];
  one_off_effects?: OneOffEffect[];
  category_adjustments: CategoryAdjustment[];
  capex_plan: CapexPlan[];
  depreciation_rules: DepreciationRule[];
  depreciation_phaseout?: DepreciationPhaseout[];
  internal_fte_base_rates: InternalFteBaseRate[];
  external_fte_base_rates: ExternalFteBaseRate[];
  nearshoring_base: NearshoringBase;
}
