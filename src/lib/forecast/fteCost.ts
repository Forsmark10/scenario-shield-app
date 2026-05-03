import type { ForecastInputs, Level } from "./types";

const FC_START_YEAR = 2027;
const DEFAULT_FX = 11.3;

export function cumulativeInputFactor(
  startYear: number,
  endYear: number,
  rateSelector: (year: number) => number,
): number {
  if (startYear > endYear) return 1;

  let factor = 1;
  for (let year = startYear; year <= endYear; year += 1) {
    factor *= 1 + rateSelector(year);
  }
  return factor;
}

export function internalDriverPctSum(inputs: ForecastInputs): number {
  return inputs.cost_lines
    .filter((line) => line.category === "Internal FTE" && !line.is_fte_master && line.fte_driver_pct != null)
    .reduce((sum, line) => sum + Number(line.fte_driver_pct ?? 0), 0);
}

export function annualInternalFteCost(
  inputs: ForecastInputs,
  level: Level,
  year: number,
): number {
  const baseRate = inputs.internal_fte_base_rates.find((rate) => rate.level === level)?.base_annual_cost ?? 0;
  const salaryFactor = cumulativeInputFactor(
    FC_START_YEAR,
    year,
    (currentYear) => inputs.global_assumptions.find((g) => g.year === currentYear)?.salary_increase_pct ?? 0,
  );

  return baseRate * salaryFactor * (1 + internalDriverPctSum(inputs));
}

export function externalWorkingMonths(inputs: ForecastInputs, level: Level): number {
  return inputs.external_fte_base_rates.find((rate) => rate.level === level)?.working_months ?? 12;
}

export function annualExternalFteCost(
  inputs: ForecastInputs,
  level: Level,
  year: number,
): number {
  const rate = inputs.external_fte_base_rates.find((row) => row.level === level);
  if (!rate) return 0;

  const priceFactor = cumulativeInputFactor(
    FC_START_YEAR,
    year,
    (currentYear) => inputs.global_assumptions.find((g) => g.year === currentYear)?.price_increase_pct ?? 0,
  );

  return rate.base_monthly_cost * rate.working_months * priceFactor;
}

export function annualNearshoringCost(inputs: ForecastInputs, year: number): number {
  const priceFactor = cumulativeInputFactor(
    FC_START_YEAR,
    year,
    (currentYear) => inputs.global_assumptions.find((g) => g.year === currentYear)?.price_increase_pct ?? 0,
  );
  const fxRate = inputs.global_assumptions.find((g) => g.year === year)?.eur_nok_rate ?? DEFAULT_FX;

  return (inputs.nearshoring_base.base_annual_cost_eur * priceFactor * fxRate) / 1000;
}