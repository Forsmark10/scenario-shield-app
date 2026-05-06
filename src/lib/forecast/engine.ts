import {
  CostLineRow,
  ForecastInputs,
  ForecastLine,
  ForecastResult,
  ForecastTotals,
  GlobalAssumption,
  CentralAssumption,
  CategoryAdjustment,
  Level,
  YEARS,
  ForecastYear,
} from "./types";
import {
  annualExternalFteCost,
  annualInternalFteCost,
  annualNearshoringCost,
  cumulativeInputFactor,
  externalWorkingMonths,
} from "./fteCost";

const LEVELS: Level[] = ["Low", "Medium", "High"];
const sum = (arr: number[]) => arr.reduce((a, b) => a + (b ?? 0), 0);

const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Kumulativ vekstfaktor: produkt av (1 + rate(Y)) for Y fra startYear t.o.m. endYear.
 * Returnerer 1 hvis startYear > endYear (ingen vekst-år å multiplisere inn).
 */
function cumulativeFactor(
  scenarioId: string,
  startYear: number,
  endYear: number,
  rateFn: (year: number) => number
): number {
  let f = 1;
  for (let Y = startYear; Y <= endYear; Y++) {
    f *= 1 + rateFn(Y);
  }
  return f;
}

function getGlobal(
  assumptions: GlobalAssumption[],
  scenarioId: string,
  year: number
): GlobalAssumption {
  return (
    assumptions.find((a) => a.scenario_id === scenarioId && a.year === year) ?? {
      scenario_id: scenarioId,
      year,
      salary_increase_pct: 0.04,
      price_increase_pct: 0.05,
      eur_nok_rate: 11.3,
    }
  );
}

function getCentral(
  assumptions: CentralAssumption[],
  scenarioId: string,
  year: number
): CentralAssumption {
  return (
    assumptions.find((a) => a.scenario_id === scenarioId && a.year === year) ?? {
      scenario_id: scenarioId,
      year,
      central_price_increase_pct: 0,
      central_volume_increase_pct: 0,
      central_reduction_pct: 0,
      central_reduction_amount_tnok: 0,
      central_eur_nok_rate: 11.3,
    }
  );
}

/** Default EUR-basis rate that 2026 FC is assumed to be priced at. */
const CENTRAL_BASE_EUR_NOK_RATE = 11.3;

function getCatAdj(
  adjustments: CategoryAdjustment[],
  scenarioId: string,
  category: string,
  year: number
): number {
  const row = adjustments.find(
    (a) => a.scenario_id === scenarioId && a.category === category && a.year === year
  );
  return row?.adjustment_pct ?? 0;
}

/**
 * Kumulativ kategori-justering: PRODUCT((1 + adj_Y) for Y from 2027 to N).
 * En justering er permanent reforhandling – satt i år Y gjelder fra og med Y og alle påfølgende år.
 * Returnerer { factor, desc } der desc viser bidragene per år for breakdown.
 */
function cumulativeCatAdj(
  adjustments: CategoryAdjustment[],
  scenarioId: string,
  category: string,
  endYear: number
): { factor: number; desc: string } {
  let factor = 1;
  const parts: string[] = [];
  for (let Y = 2027; Y <= endYear; Y++) {
    const adj = getCatAdj(adjustments, scenarioId, category, Y);
    if (adj) {
      factor *= 1 + adj;
      parts.push(`(1+${adj}@Y${Y})`);
    }
  }
  return { factor, desc: parts.length ? parts.join("×") : "1" };
}

function categoryAdjustmentEffect(
  adjustments: CategoryAdjustment[],
  scenarioId: string,
  category: string,
  baseAmount: number,
  year: number,
  growthRateFn: ((year: number) => number) | null,
): { amount: number; desc: string } {
  const rows = adjustments
    .filter((a) => a.scenario_id === scenarioId && a.category === category && a.year <= year)
    .sort((a, b) => a.year - b.year);

  let amount = 0;
  const parts: string[] = [];

  for (const row of rows) {
    const pct = Number(row.adjustment_pct ?? 0);
    if (!pct) continue;
    const growthFactor = pct > 0 && growthRateFn
      ? cumulativeFactor(scenarioId, row.year, year, growthRateFn)
      : 1;
    const delta = baseAmount * pct * growthFactor;
    amount += delta;
    parts.push(
      pct > 0
        ? `${round2(baseAmount)} × ${pct} × growth(${row.year}..${year})=${round2(growthFactor)} = ${round2(delta)}`
        : `${round2(baseAmount)} × ${pct} (konstant) = ${round2(delta)}`,
    );
  }

  return { amount, desc: parts.length ? parts.join(" + ") : "0" };
}

function distributeMonthly(annual: number, pattern: number[]): number[] {
  const total = sum(pattern);
  if (total === 0) {
    const even = annual / 12;
    return Array(12).fill(even);
  }
  return pattern.map((p) => (p / total) * annual);
}

type FteChangeRow = {
  year: number;
  level: Level;
  increase: number;
  decrease: number;
};

const fteChangeKey = (year: number, level: Level) => `${year}:${level}`;

function buildFteChangeIndex(changes: FteChangeRow[]): Map<string, number> {
  const index = new Map<string, number>();

  for (const change of changes) {
    index.set(
      fteChangeKey(change.year, change.level),
      (change.increase ?? 0) - (change.decrease ?? 0)
    );
  }

  return index;
}

function buildFteIncDecIndex(
  changes: FteChangeRow[]
): { inc: Map<string, number>; dec: Map<string, number> } {
  const inc = new Map<string, number>();
  const dec = new Map<string, number>();
  for (const c of changes) {
    const k = fteChangeKey(c.year, c.level);
    inc.set(k, (inc.get(k) ?? 0) + (c.increase ?? 0));
    dec.set(k, (dec.get(k) ?? 0) + (c.decrease ?? 0));
  }
  return { inc, dec };
}

function getFteNetChange(index: Map<string, number>, year: number, level: Level): number {
  return index.get(fteChangeKey(year, level)) ?? 0;
}

function getFteAmount(index: Map<string, number>, year: number, level: Level): number {
  return index.get(fteChangeKey(year, level)) ?? 0;
}

function logInternalMasterDebug(payload: {
  scenarioId: string;
  year: number;
  base2026: number;
  salaryFactor: number;
  baseContribution: number;
  changeContributions: Array<{
    changeYear: number;
    level: Level;
    net: number;
    rate: number;
    growthFactor: number;
    delta: number;
  }>;
  conversionContributions: Array<{
    changeYear: number;
    from: Level;
    to: Level;
    count: number;
    rate: number;
    growthFactor: number;
    delta: number;
  }>;
  total: number;
}) {
  if (typeof window === "undefined" || payload.year !== 2028) return;

  console.log("[Forecast] master_amount details", payload);
}

function emptyLine(
  cl: CostLineRow,
  base2026: number
): ForecastLine {
  return {
    line_id: cl.id,
    source: "cost_line",
    category: cl.category,
    project: cl.project,
    account: cl.account,
    account_name: cl.account_name,
    cost_type: cl.cost_type,
    is_capex: cl.category === "Capex",
    is_depreciation: cl.category === "Depreciation",
    base_2026: base2026,
    amounts: {},
    monthly_2027: [],
    breakdown_source: {},
  };
}

export function calculateForecast(inputs: ForecastInputs): ForecastResult {
  const {
    scenario_id,
    cost_lines,
    global_assumptions,
    central_assumptions,
    internal_fte_changes,
    external_fte_changes,
    conversions,
    nearshoring_additions,
    nearshoring_changes,
    category_adjustments,
    capex_plan,
    depreciation_rules,
    internal_fte_base_rates,
    external_fte_base_rates,
    nearshoring_base,
  } = inputs;

  const intRate = (lvl: Level) =>
    internal_fte_base_rates.find((r) => r.level === lvl)?.base_annual_cost ?? 0;
  const extRate = (lvl: Level) =>
    external_fte_base_rates.find((r) => r.level === lvl) ?? {
      level: lvl,
      base_monthly_cost: 0,
      working_months: 11,
    };

  const scenarioCapex = capex_plan.filter((c) => c.scenario_id === scenario_id);
  const scenarioConversions = conversions.filter((c) => c.scenario_id === scenario_id);
  // Old (overlap-based) nearshoring_additions kept around only for legacy version restores.
  // The active model is nearshoring_changes (independent FTE-like resource).
  const scenarioNearshoringChanges = (nearshoring_changes ?? []).filter(
    (n) => n.scenario_id === scenario_id
  );
  const scenarioIntChanges = internal_fte_changes.filter(
    (c) => c.scenario_id === scenario_id
  );
  const scenarioExtChanges = external_fte_changes.filter(
    (c) => c.scenario_id === scenario_id
  );
  const intIncDec = buildFteIncDecIndex(scenarioIntChanges);
  const extIncDec = buildFteIncDecIndex(scenarioExtChanges);


  const lines: ForecastLine[] = [];

  // ---------- Find FTE master line ----------
  const masterLine = cost_lines.find((c) => c.is_fte_master);
  const masterBase = masterLine ? sum(masterLine.fc_2026_monthly) : 0;

  // Pre-compute master amount per year
  const masterByYear: Record<number, number> = {};
  const masterBreakdown: Record<number, string> = {};
  for (const N of YEARS) {
    const salaryRate = (Y: number) =>
      getGlobal(global_assumptions, scenario_id, Y).salary_increase_pct;
    const salaryFactor = cumulativeFactor(scenario_id, 2027, N, salaryRate);
    let amount = masterBase * salaryFactor;
    const changeContributions: Array<{
      changeYear: number;
      level: Level;
      net: number;
      rate: number;
      growthFactor: number;
      delta: number;
    }> = [];
    const conversionContributions: Array<{
      changeYear: number;
      from: Level;
      to: Level;
      count: number;
      rate: number;
      growthFactor: number;
      delta: number;
    }> = [];
    const parts: string[] = [
      `base=${round2(masterBase)} × cum_salary(2027..${N})=${round2(salaryFactor)} → ${round2(masterBase * salaryFactor)}`,
    ];
    for (let Y = 2027; Y <= N; Y++) {
      const currentYearFactor = cumulativeInputFactor(2027, N, salaryRate);
      for (const lvl of LEVELS) {
        const inc = intIncDec.inc.get(fteChangeKey(Y, lvl)) ?? 0;
        const dec = intIncDec.dec.get(fteChangeKey(Y, lvl)) ?? 0;
        if (inc === 0 && dec === 0) continue;
        const rate = intRate(lvl);
        const frozenYearFactor = cumulativeInputFactor(2027, Y, salaryRate);
        // Increase: årskost i gjeldende år. Decrease: fryses på tiltaksårets kostnadsnivå.
        const deltaInc = inc * rate * currentYearFactor;
        const deltaDec = -dec * rate * frozenYearFactor;
        const delta = deltaInc + deltaDec;
        amount += delta;
        changeContributions.push({
          changeYear: Y,
          level: lvl,
          net: inc - dec,
          rate,
          growthFactor: currentYearFactor,
          delta,
        });
        if (inc !== 0) parts.push(`+ Y${Y} ${lvl} inc=${inc} × ${rate} × cum_salary(2027..${N})=${round2(currentYearFactor)} → ${round2(deltaInc)}`);
        if (dec !== 0) parts.push(`- Y${Y} ${lvl} dec=${dec} × ${rate} × cum_salary(2027..${Y})=${round2(frozenYearFactor)} (fryst) → ${round2(deltaDec)}`);
      }
    }
    // Konverteringer øker intern FTE
    for (let Y = 2027; Y <= N; Y++) {
      const currentYearFactor = cumulativeInputFactor(2027, N, salaryRate);
      for (const conv of scenarioConversions.filter((c) => c.year === Y)) {
        const rate = intRate(conv.internal_level);
        const delta = conv.count * rate * currentYearFactor;
        amount += delta;
        conversionContributions.push({
          changeYear: Y,
          from: conv.external_level,
          to: conv.internal_level,
          count: conv.count,
          rate,
          growthFactor: currentYearFactor,
          delta,
        });
        parts.push(
          `+ Konv Y${Y} ${conv.external_level}→${conv.internal_level} ×${conv.count} × ${rate} × cum_salary(2027..${N})=${round2(currentYearFactor)} → ${round2(delta)}`
        );
      }
    }
    masterByYear[N] = amount;
    masterBreakdown[N] = parts.join("\n");
    logInternalMasterDebug({
      scenarioId: scenario_id,
      year: N,
      base2026: masterBase,
      salaryFactor,
      baseContribution: masterBase * salaryFactor,
      changeContributions,
      conversionContributions,
      total: amount,
    });
  }

  // ---------- Loop cost_lines ----------
  for (const cl of cost_lines) {
    const base = sum(cl.fc_2026_monthly);
    const line = emptyLine(cl, base);

    for (const N of YEARS) {
      const g = getGlobal(global_assumptions, scenario_id, N);
      const yearOffset = N - 2026;
      let amount = 0;
      let bd = "";

      const salaryRate = (Y: number) =>
        getGlobal(global_assumptions, scenario_id, Y).salary_increase_pct;
      const priceRate = (Y: number) =>
        getGlobal(global_assumptions, scenario_id, Y).price_increase_pct;
      const cPriceRate = (Y: number) =>
        getCentral(central_assumptions, scenario_id, Y).central_price_increase_pct;

      // ===== CENTRAL =====
      if (cl.cost_type === "Central") {
        // Steg 1: EUR-basis fra FC 2026 (forutsatt priset til 11.3 NOK/EUR)
        const eurBasis = base / CENTRAL_BASE_EUR_NOK_RATE;
        // Steg 2: Kumulativ prisvekst i EUR
        const priceFactor = cumulativeFactor(scenario_id, 2027, N, cPriceRate);
        const eurAfterPrice = eurBasis * priceFactor;
        // Steg 3: Konverter til NOK med kursen for år N
        const fxN = Number(getCentral(central_assumptions, scenario_id, N).central_eur_nok_rate ?? CENTRAL_BASE_EUR_NOK_RATE);
        const nokBeforeReduction = eurAfterPrice * fxN;
        // Steg 4: Permanent multiplikativ reduksjon (negative tall = rabatt)
        const reductionParts: string[] = [];
        let reductionFactor = 1;
        for (let Y = 2027; Y <= N; Y++) {
          const redY = getCentral(central_assumptions, scenario_id, Y).central_reduction_pct;
          if (redY) {
            reductionFactor *= 1 + redY;
            reductionParts.push(`(1${redY >= 0 ? "+" : ""}${redY}@Y${Y})`);
          }
        }
        amount = nokBeforeReduction * reductionFactor;
        // Steg 5: tNOK-reduksjon legges som AGGREGERT virtuell linje under (ikke per cost_line).
        const redDesc = reductionParts.length ? reductionParts.join("×") : "1";
        bd = `Sentral: EUR-basis=${round2(eurBasis)} (base=${round2(base)} / ${CENTRAL_BASE_EUR_NOK_RATE}) × cum_price(2027..${N})=${round2(priceFactor)} = ${round2(eurAfterPrice)} EUR × FX(${N})=${fxN} = ${round2(nokBeforeReduction)} × cum_red=${redDesc}=${round2(reductionFactor)} = ${round2(amount)}`;
      } else if (cl.category === "Internal FTE") {
        // ===== INTERNAL FTE =====
        if (cl.is_fte_master) {
          amount = masterByYear[N];
          bd = `Master:\n${masterBreakdown[N]}`;
        } else if (cl.fte_driver_pct != null) {
          amount = masterByYear[N] * cl.fte_driver_pct;
          bd = `Driver ${cl.fte_driver_pct} × master(${round2(masterByYear[N])}) = ${round2(amount)}`;
        } else {
          const salaryFactor = cumulativeFactor(scenario_id, 2027, N, salaryRate);
          amount = base * salaryFactor;
          bd = `Øvrig Internal FTE: ${round2(base)} × cum_salary(2027..${N})=${round2(salaryFactor)} = ${round2(amount)}`;
        }
      } else if (cl.category === "External FTE") {
        // ===== EXTERNAL FTE (per-linje) =====
        // Kun baseline-prisvekst og kumulativ kategori-justering påvirker
        // den enkelte eksisterende External FTE-linjen. FTE-endringer,
        // konverteringer og nearshoring legges på som SAMLEDE virtuelle
        // linjer lenger ned (slik at de ikke fordeles per cost_line).
        const priceFactor = cumulativeFactor(scenario_id, 2027, N, priceRate);
        const amt = base * priceFactor;
        const { amount: catAdjAmount, desc: catAdjDesc } = categoryAdjustmentEffect(
          category_adjustments,
          scenario_id,
          "External FTE",
          base,
          N,
          priceRate,
        );
        amount = amt + catAdjAmount;
        bd = `External FTE (linje): base=${round2(base)} × cum_price(2027..${N})=${round2(priceFactor)} = ${round2(amt)}; cat_adj=${catAdjDesc} → ${round2(catAdjAmount)}; sum=${round2(amount)}`;
      } else if (cl.category === "Depreciation") {
        // ===== DEPRECIATION (existing) =====
        if (cl.is_existing_depreciation_alfa) {
          amount = base;
          bd = `ALFA flat = ${round2(base)}`;
        } else if (cl.is_existing_depreciation_phaseout) {
          if (yearOffset === 1) {
            amount = base * (2 / 3);
            bd = `Phaseout år 1: ${round2(base)} × 2/3 = ${round2(amount)}`;
          } else if (yearOffset === 2) {
            amount = base * (1 / 3);
            bd = `Phaseout år 2: ${round2(base)} × 1/3 = ${round2(amount)}`;
          } else {
            amount = 0;
            bd = `Phaseout år ${yearOffset}: 0`;
          }
        } else {
          amount = base;
          bd = `Eksisterende avskrivning (flat) = ${round2(base)}`;
        }

        // Aggreger nye avskrivninger fra capex_plan basert på prosjekt-mapping
        // Hardware (60842) ← capex Hardware; Software (60130) ← capex Software; ALFA (60130) ← capex Prosjekt
        const deprMap: Record<string, "Hardware" | "Software" | "Prosjekt" | null> = {
          Hardware: "Hardware",
          Software: "Software",
          ALFA: "Prosjekt",
        };
        const ctForLine = deprMap[cl.project] ?? null;
        if (ctForLine) {
          const rule = depreciation_rules.find((r) => r.capex_type === ctForLine);
          if (rule) {
            const extras: string[] = [];
            let extra = 0;
            for (const cap of scenarioCapex.filter((c) => c.capex_type === ctForLine)) {
              const startY = cap.year + 1;
              const endY = cap.year + rule.depreciation_years;
              if (N >= startY && N <= endY) {
                const annual = cap.amount / rule.depreciation_years;
                extra += annual;
                extras.push(
                  `+ Capex Y${cap.year} ${cap.amount}/${rule.depreciation_years} = ${round2(annual)}`
                );
              }
            }
            if (extra !== 0) {
              amount += extra;
              bd += `\nNye avskrivninger (${ctForLine}):\n${extras.join("\n")}\nSum tillegg = ${round2(extra)}`;
            }
          }
        }
      } else if (cl.category === "Capex") {
        // Aggreger capex_plan-utbetalinger inn i eksisterende Capex-linjer basert på prosjekt-mapping
        // Hardware (11321) ← Hardware; Software (11327) ← Software; Project (11327) ← Prosjekt
        const capexMap: Record<string, "Hardware" | "Software" | "Prosjekt" | null> = {
          Hardware: "Hardware",
          Software: "Software",
          Project: "Prosjekt",
        };
        const ctForLine = capexMap[cl.project] ?? null;
        if (ctForLine) {
          const matches = scenarioCapex.filter(
            (c) => c.capex_type === ctForLine && c.year === N
          );
          amount = matches.reduce((a, c) => a + c.amount, 0);
          bd = `Capex ${ctForLine} år ${N} = ${round2(amount)} (sum av ${matches.length} planlinje(r))`;
        } else {
          amount = 0;
          bd = `Capex baseline (ukjent prosjekt-mapping): 0`;
        }
      } else {
        // ===== ØVRIGE LOKALE (Operations, IT Costs, Consultancy, Other operating income) =====
        const priceFactor = cumulativeFactor(scenario_id, 2027, N, priceRate);
        const pricedBase = base * priceFactor;
        const { amount: catAdjAmount, desc: catAdjDesc } = categoryAdjustmentEffect(
          category_adjustments,
          scenario_id,
          cl.category,
          base,
          N,
          priceRate,
        );
        amount = pricedBase + catAdjAmount;
        bd = `${cl.category}: ${round2(base)} × cum_price(2027..${N})=${round2(priceFactor)} = ${round2(pricedBase)}; cat_adj=${catAdjDesc} → ${round2(catAdjAmount)}; sum=${round2(amount)}`;
      }

      line.amounts[N] = amount;
      line.breakdown_source[N] = bd;
    }

    // Månedlig 2027 basert på fc_2026_monthly mønster
    line.monthly_2027 = distributeMonthly(line.amounts[2027] ?? 0, cl.fc_2026_monthly);
    lines.push(line);
  }

  // (Tidligere virtuelle Capex- og Depreciation-linjer er fjernet.
  // Capex-utbetalinger og nye avskrivninger aggregeres nå direkte inn i


  // ---------- VIRTUAL: Samlede External FTE-effekter ----------
  // FTE-endringer, ekstern→intern konverteringer og nearshoring-erstatninger
  // legges som SAMLEDE virtuelle linjer (ikke fordelt per cost_line, som
  // ville multiplisert effekten med antall External FTE-linjer).
  // Kumulativ kategori-justering for "External FTE" gjelder også disse.
  const extPriceRate = (Y: number) =>
    getGlobal(global_assumptions, scenario_id, Y).price_increase_pct;

  const makeVirtualExtLine = (
    suffix: string,
    accountName: string,
    project: string,
  ): ForecastLine => ({
    line_id: `virtual:${suffix}`,
    source: "virtual",
    category: "External FTE",
    project,
    account: null,
    account_name: accountName,
    cost_type: "Local",
    is_capex: false,
    is_depreciation: false,
    base_2026: 0,
    amounts: {},
    monthly_2027: [],
    breakdown_source: {},
  });

  const extChangesLine = makeVirtualExtLine(
    "ext_fte_changes",
    "External FTE-endringer (Increase/Decrease)",
    "FTE-endringer",
  );
  const extConvLine = makeVirtualExtLine(
    "ext_fte_conversions",
    "Konvertering til intern (ekstern reduksjon)",
    "Konvertering til intern",
  );

  for (const N of YEARS) {
    // 1) FTE-endringer
    {
      let amt = 0;
      const parts: string[] = [];
      for (let Y = 2027; Y <= N; Y++) {
        for (const lvl of LEVELS) {
          const inc = extIncDec.inc.get(fteChangeKey(Y, lvl)) ?? 0;
          const dec = extIncDec.dec.get(fteChangeKey(Y, lvl)) ?? 0;
          if (inc === 0 && dec === 0) continue;
          const deltaInc = inc * annualExternalFteCost(inputs, lvl, N);
          const deltaDec = -dec * annualExternalFteCost(inputs, lvl, Y);
          amt += deltaInc + deltaDec;
          if (inc !== 0) parts.push(`Y${Y} ${lvl} inc=${inc} × annual@${N}=${round2(annualExternalFteCost(inputs, lvl, N))} = ${round2(deltaInc)}`);
          if (dec !== 0) parts.push(`Y${Y} ${lvl} dec=${dec} × annual@${Y}=${round2(annualExternalFteCost(inputs, lvl, Y))} (fryst) = ${round2(deltaDec)}`);
        }
      }
      extChangesLine.amounts[N] = amt;
      extChangesLine.breakdown_source[N] = parts.length
        ? parts.join("\n")
        : "Ingen ekstern FTE-endring";
    }

    // 2) Konverteringer ekstern→intern (kun ekstern-siden; intern-økningen
    //    ligger allerede i master_amount). Konverteringsåret: ekstern jobber
    //    (working_months − overlap_months) måneder. Etter: full reduksjon.
    {
      let amt = 0;
      const parts: string[] = [];
      for (let Y = 2027; Y <= N; Y++) {
        for (const conv of scenarioConversions.filter((c) => c.year === Y)) {
          const frozenAnnual = annualExternalFteCost(inputs, conv.external_level, Y);
          const workingMonths = externalWorkingMonths(inputs, conv.external_level);
          if (Y === N) {
            const months = Math.max(0, workingMonths - conv.overlap_months);
            const reduction = -conv.count * (frozenAnnual / workingMonths) * months;
            amt += reduction;
            parts.push(
              `Konv-år Y${Y} ${conv.external_level}: -${conv.count} × annual@${Y}=${round2(frozenAnnual)} × ${months}/${workingMonths} (fryst) = ${round2(reduction)}`,
            );
          } else {
            const reduction = -conv.count * frozenAnnual;
            amt += reduction;
            parts.push(
              `Etter Y${Y} ${conv.external_level}: -${conv.count} × annual@${Y}=${round2(frozenAnnual)} (fryst) = ${round2(reduction)}`,
            );
          }
        }
      }
      extConvLine.amounts[N] = amt;
      extConvLine.breakdown_source[N] = parts.length
        ? parts.join("\n")
        : "Ingen konvertering";
    }
  }
  extChangesLine.monthly_2027 = Array(12).fill((extChangesLine.amounts[2027] ?? 0) / 12);
  extConvLine.monthly_2027 = Array(12).fill((extConvLine.amounts[2027] ?? 0) / 12);
  lines.push(extChangesLine);
  lines.push(extConvLine);


  // ---------- VIRTUAL: Nearshoring (independent FTE-like resource) ----------
  // Increase / decrease akkumuleres over år (FTE-mønster).
  // Kostnad år N: per ressurs = base_eur × cum_price(2027..N) × eur_nok_rate[N] / 1000 (tNOK).
  // Full årseffekt fra året endringen skjer (samme prinsipp som FTE-endringer).
  const nsLine: ForecastLine = {
    line_id: `virtual:nearshoring`,
    source: "virtual",
    category: "External FTE",
    project: "Nearshoring",
    account: null,
    account_name: "Nearshoring",
    cost_type: "Local",
    is_capex: false,
    is_depreciation: false,
    base_2026: 0,
    amounts: {},
    monthly_2027: [],
    breakdown_source: {},
  };
  for (const N of YEARS) {
    let amt = 0;
    const headcountParts: string[] = [];
    for (let Y = 2027; Y <= N; Y++) {
      const yearChanges = scenarioNearshoringChanges.filter((n) => n.year === Y);
      const inc = yearChanges.reduce((s, n) => s + (Number(n.increase) || 0), 0);
      const dec = yearChanges.reduce((s, n) => s + (Number(n.decrease) || 0), 0);
      if (inc > 0) {
        const annualNokK = annualNearshoringCost(inputs, N);
        amt += inc * annualNokK;
        headcountParts.push(`Y${Y} inc=${inc} x ${round2(annualNokK)} kNOK (vokser)`);
      }
      if (dec > 0) {
        const frozenAnnualNokK = annualNearshoringCost(inputs, Y);
        amt += -dec * frozenAnnualNokK;
        headcountParts.push(`Y${Y} dec=${dec} x ${round2(frozenAnnualNokK)} kNOK (fryst)`);
      }
    }
    nsLine.amounts[N] = amt;
    nsLine.breakdown_source[N] = headcountParts.length === 0
      ? "Ingen aktive nearshoring-ressurser"
      : headcountParts.join(", ") + ` = ${round2(amt)} kNOK`;
  }
  nsLine.monthly_2027 = Array(12).fill((nsLine.amounts[2027] ?? 0) / 12);
  lines.push(nsLine);

  // ---------- VIRTUAL: Kategori-justering (absolutt beløp tNOK) ----------
  // Per kategori: kumulativ sum av adjustment_amount_tnok fom 2027 tom N.
  // Beløpet er PERMANENT: satt i ett år gjelder det samme år og alle påfølgende.
  // POSITIVE beløp (økninger) vokser med lønnsvekst (Internal FTE) eller prisvekst (andre).
  // NEGATIVE beløp (besparelser) er konstante – baseline er frosset.
  const scenarioAdj = category_adjustments.filter((a) => a.scenario_id === scenario_id);
  const adjCategories = Array.from(
    new Set(
      scenarioAdj
        .filter((a) => Number(a.adjustment_amount_tnok ?? 0) !== 0)
        .map((a) => a.category)
    )
  );
  for (const cat of adjCategories) {
    const adjLine: ForecastLine = {
      line_id: `virtual:cat_adj_amount:${cat}`,
      source: "virtual",
      category: cat,
      project: "Kategori-justering (beløp)",
      account: null,
      account_name: `Kategori-justering ${cat} (fast beløp)`,
      cost_type: "Local",
      is_capex: false,
      is_depreciation: false,
      base_2026: 0,
      amounts: {},
      monthly_2027: [],
      breakdown_source: {},
    };
    const growthRateFn = cat === "Internal FTE"
      ? (Y: number) => Number(global_assumptions.find((g) => g.year === Y)?.salary_increase_pct ?? 0)
      : (Y: number) => Number(global_assumptions.find((g) => g.year === Y)?.price_increase_pct ?? 0);
    for (const N of YEARS) {
      let amt = 0;
      const parts: string[] = [];
      for (let Y = 2027; Y <= N; Y++) {
        const row = scenarioAdj.find((a) => a.category === cat && a.year === Y);
        const v = Number(row?.adjustment_amount_tnok ?? 0);
        if (v !== 0) {
          // Positive (økninger) vokser med lønns-/prisvekst fra tiltaksåret. Negative (besparelser) er konstante.
          const growthFactor = v > 0
            ? cumulativeFactor(scenario_id, Y, N, growthRateFn)
            : 1;
          const adjusted = v * growthFactor;
          amt += adjusted;
          parts.push(
            v > 0
              ? `Y${Y}: ${v} tNOK × vekst(${Y}→${N})=${round2(growthFactor)} = ${round2(adjusted)} tNOK`
              : `Y${Y}: ${v} tNOK (permanent, konstant)`
          );
        }
      }
      adjLine.amounts[N] = amt;
      adjLine.breakdown_source[N] = parts.length
        ? `${parts.join("\n")}\nSum aktivt år ${N} = ${round2(amt)} tNOK`
        : "Ingen absolutt justering";
    }
    adjLine.monthly_2027 = Array(12).fill((adjLine.amounts[2027] ?? 0) / 12);
    lines.push(adjLine);
  }

  // ---------- VIRTUAL: Sentral reduksjon (fast beløp tNOK) ----------
  // Permanent reforhandling i fast beløp: satt i år Y gjelder fom Y og alle påfølgende år.
  // Akkumuleres additivt (samme prinsipp som kategori-justering tNOK).
  // Vises som ÉN samlet virtuell linje under IT Costs (reforhandling av intracharges).
  {
    const scenarioCentral = central_assumptions.filter((a) => a.scenario_id === scenario_id);
    const hasAny = scenarioCentral.some((a) => Number(a.central_reduction_amount_tnok ?? 0) !== 0);
    if (hasAny) {
      const cRedLine: ForecastLine = {
        line_id: `virtual:central_reduction_amount`,
        source: "virtual",
        category: "IT Costs",
        project: "Sentral reduksjon (fast beløp)",
        account: null,
        account_name: "Sentral reduksjon (fast beløp)",
        cost_type: "Central",
        is_capex: false,
        is_depreciation: false,
        base_2026: 0,
        amounts: {},
        monthly_2027: [],
        breakdown_source: {},
      };
      for (const N of YEARS) {
        let amt = 0;
        const parts: string[] = [];
        for (let Y = 2027; Y <= N; Y++) {
          const row = scenarioCentral.find((a) => a.year === Y);
          const v = Number(row?.central_reduction_amount_tnok ?? 0);
          if (v !== 0) {
            amt += v;
            parts.push(`Y${Y}: ${v} tNOK (permanent fra ${Y})`);
          }
        }
        cRedLine.amounts[N] = amt;
        cRedLine.breakdown_source[N] = parts.length
          ? `${parts.join("\n")}\nSum aktivt år ${N} = ${round2(amt)} tNOK`
          : "Ingen sentral fast-beløpsreduksjon";
      }
      cRedLine.monthly_2027 = Array(12).fill((cRedLine.amounts[2027] ?? 0) / 12);
      lines.push(cRedLine);
    }
  }

  // ---------- VIRTUAL: Internal → Nearshoring conversions ----------
  // I konverteringsåret: full intern (allerede i master_amount videreført?) + 3 mnd overlapp.
  // Modellen: vi REDUSERER intern (besparelse) og LEGGER TIL nearshoring-kost. I konverteringsåret
  // beholdes 3 mnd intern-overlapp (delvis intern). Etter konverteringsåret: intern fjernes 100 %.
  // Implementeres som én virtuell linje per kategori-effekt (Internal FTE besparelse, External FTE add)
  const i2n = (inputs.internal_to_nearshoring_conversions ?? []).filter(
    (r) => r.scenario_id === scenario_id,
  );
  if (i2n.length > 0) {
    const intRedLine: ForecastLine = {
      line_id: "virtual:i2ns_internal_reduction",
      source: "virtual",
      category: "Internal FTE",
      project: "Konvertering til nearshoring",
      account: null,
      account_name: "Konvertering intern → nearshoring (intern besparelse)",
      cost_type: "Local",
      is_capex: false,
      is_depreciation: false,
      base_2026: 0,
      amounts: {},
      monthly_2027: [],
      breakdown_source: {},
    };
    const nsAddLine: ForecastLine = {
      line_id: "virtual:i2ns_nearshoring_addition",
      source: "virtual",
      category: "External FTE",
      project: "Nearshoring (fra intern-konvertering)",
      account: null,
      account_name: "Nearshoring fra intern-konvertering",
      cost_type: "Local",
      is_capex: false,
      is_depreciation: false,
      base_2026: 0,
      amounts: {},
      monthly_2027: [],
      breakdown_source: {},
    };
    for (const N of YEARS) {
      let intRed = 0;
      let nsAdd = 0;
      const intParts: string[] = [];
      const nsParts: string[] = [];
      for (let Y = 2027; Y <= N; Y++) {
        for (const r of i2n.filter((c) => c.year === Y)) {
          const annualIntFrozen = r.count * annualInternalFteCost(inputs, r.internal_level, Y);
          const overlapMonths = Math.max(0, Math.min(12, r.overlap_months ?? 3));
          if (Y === N) {
            const monthsRemoved = 12 - overlapMonths;
            const reduction = -(annualIntFrozen * monthsRemoved) / 12;
            intRed += reduction;
            intParts.push(`Konv-år Y${Y} ${r.internal_level} x${r.count}: -${monthsRemoved}/12 av annual@${Y}=${round2(annualIntFrozen)} (fryst) = ${round2(reduction)}`);
          } else {
            intRed += -annualIntFrozen;
            intParts.push(`Etter Y${Y} ${r.internal_level} x${r.count}: -annual@${Y}=${round2(annualIntFrozen)} (fryst)`);
          }
          const annualNokK = annualNearshoringCost(inputs, N);
          const nsCost = r.count * annualNokK;
          nsAdd += nsCost;
          nsParts.push(`Y${Y} ×${r.count}: +${round2(annualNokK)} kNOK/ressurs = ${round2(nsCost)}`);
        }
      }
      intRedLine.amounts[N] = intRed;
      intRedLine.breakdown_source[N] = intParts.length ? intParts.join("\n") : "Ingen konvertering intern→nearshoring";
      nsAddLine.amounts[N] = nsAdd;
      nsAddLine.breakdown_source[N] = nsParts.length ? nsParts.join("\n") : "—";
    }
    intRedLine.monthly_2027 = Array(12).fill((intRedLine.amounts[2027] ?? 0) / 12);
    nsAddLine.monthly_2027 = Array(12).fill((nsAddLine.amounts[2027] ?? 0) / 12);
    lines.push(intRedLine);
    lines.push(nsAddLine);
  }

  // ---------- VIRTUAL: One-off effects (engangseffekter) ----------
  // Gjelder KUN det valgte året, vokser ikke, additivt på kategorien.
  const oneOffs = (inputs.one_off_effects ?? []).filter((r) => r.scenario_id === scenario_id);
  const oneOffByCat = new Map<string, typeof oneOffs>();
  for (const r of oneOffs) {
    const arr = oneOffByCat.get(r.category) ?? [];
    arr.push(r);
    oneOffByCat.set(r.category, arr);
  }
  for (const [cat, rows] of oneOffByCat) {
    const ooLine: ForecastLine = {
      line_id: `virtual:one_off:${cat}`,
      source: "virtual",
      category: cat,
      project: "Engangseffekt",
      account: null,
      account_name: `Engangseffekter ${cat}`,
      cost_type: "Local",
      is_capex: false,
      is_depreciation: false,
      base_2026: 0,
      amounts: {},
      monthly_2027: [],
      breakdown_source: {},
    };
    for (const N of YEARS) {
      const matching = rows.filter((r) => r.year === N);
      const amt = matching.reduce((s, r) => s + Number(r.amount_tnok || 0), 0);
      ooLine.amounts[N] = amt;
      ooLine.breakdown_source[N] = matching.length
        ? matching.map((r) => `${r.description ?? "—"}: ${r.amount_tnok} tNOK (kun ${N})`).join("\n")
        : "—";
    }
    ooLine.monthly_2027 = Array(12).fill((ooLine.amounts[2027] ?? 0) / 12);
    lines.push(ooLine);
  }

  // ---------- VIRTUAL: Utfasing av eksisterende avskrivninger ----------
  // Kumulativ: en utfasing satt for år Y gjelder også alle påfølgende år.
  // Beløp er typisk negative (reduksjon i avskrivningskostnad).
  const phaseouts = (inputs.depreciation_phaseout ?? []).filter(
    (r) => r.scenario_id === scenario_id,
  );
  if (phaseouts.length) {
    const phaseTypes = ["Hardware", "Software", "Prosjekt"] as const;
    for (const t of phaseTypes) {
      const tRows = phaseouts.filter((r) => r.type === t);
      if (!tRows.length) continue;
      const phLine: ForecastLine = {
        line_id: `virtual:depr_phaseout:${t}`,
        source: "virtual",
        category: "Depreciation",
        project: "Utfasing",
        account: null,
        account_name: `Utfasing avskrivninger ${t}`,
        cost_type: "Local",
        is_capex: false,
        is_depreciation: true,
        base_2026: 0,
        amounts: {},
        monthly_2027: [],
        breakdown_source: {},
      };
      for (const N of YEARS) {
        const cum = tRows
          .filter((r) => r.year <= N)
          .reduce((s, r) => s + Number(r.amount_tnok || 0), 0);
        phLine.amounts[N] = cum;
        phLine.breakdown_source[N] = `Kumulativ utfasing ${t} t.o.m. ${N}: ${round2(cum)} tNOK`;
      }
      phLine.monthly_2027 = Array(12).fill((phLine.amounts[2027] ?? 0) / 12);
      lines.push(phLine);
    }
  }

  // ---------- TOTALS ----------
  const totals: ForecastTotals = {
    by_year: {},
    by_category: {},
    by_cost_type: { Local: {}, Central: {} },
    cagr_2026_2031: 0,
    base_2026_total: 0,
  };

  // 2026 base = sum of fc_2026 for all real cost_lines except Capex (P&L view)
  totals.base_2026_total = cost_lines
    .filter((c) => c.category !== "Capex")
    .reduce((a, c) => a + sum(c.fc_2026_monthly), 0);

  for (const N of YEARS) {
    totals.by_year[N] = 0;
    totals.by_cost_type.Local[N] = 0;
    totals.by_cost_type.Central[N] = 0;
  }

  for (const line of lines) {
    if (line.is_capex) continue; // Capex ikke i P&L-totals
    if (!totals.by_category[line.category]) {
      totals.by_category[line.category] = {};
      for (const N of YEARS) totals.by_category[line.category][N] = 0;
    }
    for (const N of YEARS) {
      const a = line.amounts[N] ?? 0;
      totals.by_year[N] += a;
      totals.by_category[line.category][N] += a;
      totals.by_cost_type[line.cost_type][N] += a;
    }
  }

  if (totals.base_2026_total > 0 && totals.by_year[2031] > 0) {
    totals.cagr_2026_2031 =
      Math.pow(totals.by_year[2031] / totals.base_2026_total, 1 / 5) - 1;
  }

  return {
    scenario_id,
    lines,
    totals,
    meta: {
      years: [...YEARS],
      generated_at: new Date().toISOString(),
    },
  };
}
