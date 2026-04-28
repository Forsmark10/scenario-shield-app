import { describe, expect, it } from "vitest";
import { calculateForecast } from "@/lib/forecast/engine";
import type { ForecastInputs } from "@/lib/forecast/types";

const YEARS = [2027, 2028, 2029, 2030, 2031] as const;

function buildInputs(overrides?: Partial<ForecastInputs>): ForecastInputs {
  return {
    scenario_id: "scenario-a",
    cost_lines: [
      {
        id: "internal-master",
        category: "Internal FTE",
        project: "Lønn til ansatte",
        account: 50000,
        account_name: "Lønn til ansatte",
        cost_type: "Local",
        ac_2025: 0,
        bu_2026_monthly: Array(12).fill(100),
        fc_2026_monthly: Array(12).fill(100),
        is_fte_master: true,
        fte_driver_pct: null,
        is_existing_depreciation_alfa: false,
        is_existing_depreciation_phaseout: false,
      },
      {
        id: "external-line",
        category: "External FTE",
        project: "Konsulenter",
        account: 60000,
        account_name: "Konsulenter",
        cost_type: "Local",
        ac_2025: 0,
        bu_2026_monthly: Array(12).fill(50),
        fc_2026_monthly: Array(12).fill(50),
        is_fte_master: false,
        fte_driver_pct: null,
        is_existing_depreciation_alfa: false,
        is_existing_depreciation_phaseout: false,
      },
    ],
    global_assumptions: YEARS.map((year) => ({
      scenario_id: "scenario-a",
      year,
      salary_increase_pct: 0.04,
      price_increase_pct: 0.04,
      eur_nok_rate: 11.5,
    })),
    central_assumptions: YEARS.map((year) => ({
      scenario_id: "scenario-a",
      year,
      central_price_increase_pct: 0,
      central_volume_increase_pct: 0,
      central_reduction_pct: 0,
    })),
    internal_fte_changes: [],
    external_fte_changes: [],
    conversions: [],
    nearshoring_additions: [],
    nearshoring_changes: [],
    category_adjustments: [],
    capex_plan: [],
    depreciation_rules: [
      { capex_type: "Hardware", depreciation_years: 5 },
      { capex_type: "Software", depreciation_years: 5 },
      { capex_type: "Prosjekt", depreciation_years: 5 },
    ],
    internal_fte_base_rates: [
      { level: "Low", base_annual_cost: 650 },
      { level: "Medium", base_annual_cost: 1000 },
      { level: "High", base_annual_cost: 1300 },
    ],
    external_fte_base_rates: [
      { level: "Low", base_monthly_cost: 54.1666666667, working_months: 12 },
      { level: "Medium", base_monthly_cost: 83.3333333333, working_months: 12 },
      { level: "High", base_monthly_cost: 108.3333333333, working_months: 12 },
    ],
    nearshoring_base: {
      base_annual_cost_eur: 75000,
      working_months: 12,
    },
    ...overrides,
  };
}

function roundedSeries(values: number[]) {
  return values.map((value) => Number(value.toFixed(2)));
}

describe("calculateForecast FTE accumulation", () => {
  it("accumulates internal FTE changes once per year with salary growth", () => {
    const baseline = calculateForecast(buildInputs());
    const changed = calculateForecast(
      buildInputs({
        internal_fte_changes: [
          { scenario_id: "scenario-a", year: 2027, level: "Low", increase: 0, decrease: 1 },
          { scenario_id: "scenario-a", year: 2027, level: "Medium", increase: 0, decrease: 2 },
        ],
      })
    );

    const baselineMaster = baseline.lines.find((line) => line.line_id === "internal-master");
    const changedMaster = changed.lines.find((line) => line.line_id === "internal-master");

    expect(baselineMaster).toBeTruthy();
    expect(changedMaster).toBeTruthy();

    const deltas = YEARS.map(
      (year) => (changedMaster?.amounts[year] ?? 0) - (baselineMaster?.amounts[year] ?? 0)
    );

    expect(roundedSeries(deltas)).toEqual([-2756, -2866.24, -2980.89, -3100.13, -3224.13]);
  });

  it("accumulates external FTE changes once per year with price growth", () => {
    const baseline = calculateForecast(buildInputs());
    const changed = calculateForecast(
      buildInputs({
        external_fte_changes: [
          { scenario_id: "scenario-a", year: 2027, level: "Low", increase: 0, decrease: 1 },
          { scenario_id: "scenario-a", year: 2027, level: "Medium", increase: 0, decrease: 2 },
        ],
      })
    );

    const baselineExternal = baseline.lines.find((line) => line.line_id === "external-line");
    const changedExternal = changed.lines.find((line) => line.line_id === "external-line");

    expect(baselineExternal).toBeTruthy();
    expect(changedExternal).toBeTruthy();

    const deltas = YEARS.map(
      (year) => (changedExternal?.amounts[year] ?? 0) - (baselineExternal?.amounts[year] ?? 0)
    );

    expect(roundedSeries(deltas)).toEqual([-2756, -2866.24, -2980.89, -3100.13, -3224.13]);
  });
});
