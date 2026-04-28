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
      eur_nok_rate: 11.5,
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

function getFteNetChange(index: Map<string, number>, year: number, level: Level): number {
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
  const intChangeIndex = buildFteChangeIndex(scenarioIntChanges);
  const extChangeIndex = buildFteChangeIndex(scenarioExtChanges);

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
      const grown = cumulativeFactor(scenario_id, Y, N, salaryRate);
      for (const lvl of LEVELS) {
        const net = getFteNetChange(intChangeIndex, Y, lvl);
        if (net === 0) continue;
        const rate = intRate(lvl);
        const delta = net * rate * grown;
        amount += delta;
        changeContributions.push({
          changeYear: Y,
          level: lvl,
          net,
          rate,
          growthFactor: grown,
          delta,
        });
        parts.push(
          `+ Y${Y} ${lvl} net=${net} × rate=${rate} × cum_salary(${Y}..${N})=${round2(grown)} → ${round2(delta)}`
        );
      }
    }
    // Konverteringer øker intern FTE
    for (let Y = 2027; Y <= N; Y++) {
      const grown = cumulativeFactor(scenario_id, Y, N, salaryRate);
      for (const conv of scenarioConversions.filter((c) => c.year === Y)) {
        const rate = intRate(conv.internal_level);
        const delta = conv.count * rate * grown;
        amount += delta;
        conversionContributions.push({
          changeYear: Y,
          from: conv.external_level,
          to: conv.internal_level,
          count: conv.count,
          rate,
          growthFactor: grown,
          delta,
        });
        parts.push(
          `+ Konv Y${Y} ${conv.external_level}→${conv.internal_level} ×${conv.count} × ${rate} × ${round2(grown)} → ${round2(delta)}`
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
        const { factor: catFactor, desc: catDesc } = cumulativeCatAdj(
          category_adjustments,
          scenario_id,
          "External FTE",
          N
        );
        amount = amt * catFactor;
        bd = `External FTE (linje): base=${round2(base)} × cum_price(2027..${N})=${round2(priceFactor)} × cum_cat_adj=${catDesc}=${round2(catFactor)} = ${round2(amount)}`;
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
        const { factor: catFactor, desc: catDesc } = cumulativeCatAdj(
          category_adjustments,
          scenario_id,
          cl.category,
          N
        );
        amount = base * priceFactor * catFactor;
        bd = `${cl.category}: ${round2(base)} × cum_price(2027..${N})=${round2(priceFactor)} × cum_cat_adj(2027..${N})=${catDesc}=${round2(catFactor)} = ${round2(amount)}`;
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
    const { factor: catFactor, desc: catDesc } = cumulativeCatAdj(
      category_adjustments,
      scenario_id,
      "External FTE",
      N,
    );

    // 1) FTE-endringer
    {
      let amt = 0;
      const parts: string[] = [];
      for (let Y = 2027; Y <= N; Y++) {
        const grown = cumulativeFactor(scenario_id, Y, N, extPriceRate);
        for (const lvl of LEVELS) {
          const net = getFteNetChange(extChangeIndex, Y, lvl);
          if (net === 0) continue;
          const r = extRate(lvl);
          const annual = r.base_monthly_cost * r.working_months;
          const delta = net * annual * grown;
          amt += delta;
          parts.push(
            `Y${Y} ${lvl} net=${net} × annual=${annual} × cum_price(${Y}..${N})=${round2(grown)} = ${round2(delta)}`,
          );
        }
      }
      extChangesLine.amounts[N] = amt * catFactor;
      extChangesLine.breakdown_source[N] = parts.length
        ? `${parts.join("\n")}\n× cum_cat_adj=${catDesc}=${round2(catFactor)} = ${round2(amt * catFactor)}`
        : "Ingen ekstern FTE-endring";
    }

    // 2) Konverteringer ekstern→intern (kun ekstern-siden; intern-økningen
    //    ligger allerede i master_amount). Konverteringsåret: ekstern jobber
    //    (working_months − overlap_months) måneder. Etter: full reduksjon.
    {
      let amt = 0;
      const parts: string[] = [];
      for (let Y = 2027; Y <= N; Y++) {
        const grown = cumulativeFactor(scenario_id, Y, N, extPriceRate);
        for (const conv of scenarioConversions.filter((c) => c.year === Y)) {
          const r = extRate(conv.external_level);
          if (Y === N) {
            const months = Math.max(0, r.working_months - conv.overlap_months);
            const reduction = -conv.count * r.base_monthly_cost * months * grown;
            amt += reduction;
            parts.push(
              `Konv-år Y${Y} ${conv.external_level}: -${conv.count} × ${r.base_monthly_cost} × (${r.working_months}-${conv.overlap_months})=${months}m × cum=${round2(grown)} = ${round2(reduction)}`,
            );
          } else {
            const annual = r.base_monthly_cost * r.working_months;
            const reduction = -conv.count * annual * grown;
            amt += reduction;
            parts.push(
              `Etter Y${Y} ${conv.external_level}: -${conv.count} × annual=${annual} × cum=${round2(grown)} = ${round2(reduction)}`,
            );
          }
        }
      }
      extConvLine.amounts[N] = amt * catFactor;
      extConvLine.breakdown_source[N] = parts.length
        ? `${parts.join("\n")}\n× cum_cat_adj=${catDesc}=${round2(catFactor)} = ${round2(amt * catFactor)}`
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
    const g = getGlobal(global_assumptions, scenario_id, N);
    const priceRate = (Y: number) =>
      getGlobal(global_assumptions, scenario_id, Y).price_increase_pct;
    // Cumulative net headcount through year N
    let cumulativeHeadcount = 0;
    const headcountParts: string[] = [];
    for (let Y = 2027; Y <= N; Y++) {
      const yearChanges = scenarioNearshoringChanges.filter((n) => n.year === Y);
      const inc = yearChanges.reduce((s, n) => s + (Number(n.increase) || 0), 0);
      const dec = yearChanges.reduce((s, n) => s + (Number(n.decrease) || 0), 0);
      const net = inc - dec;
      if (net !== 0) {
        cumulativeHeadcount += net;
        headcountParts.push(`Y${Y} net=${net}`);
      }
    }
    const priceFactor = cumulativeFactor(scenario_id, 2027, N, priceRate);
    const annualEur = nearshoring_base.base_annual_cost_eur * priceFactor;
    const annualNokK = (annualEur * g.eur_nok_rate) / 1000;
    const amt = cumulativeHeadcount * annualNokK;
    nsLine.amounts[N] = amt;
    nsLine.breakdown_source[N] = cumulativeHeadcount === 0
      ? "Ingen aktive nearshoring-ressurser"
      : `${headcountParts.join(", ")} → cum=${cumulativeHeadcount} × ${round2(annualEur)} EUR × ${g.eur_nok_rate} NOK/EUR / 1000 = ${round2(amt)} kNOK (cum_price(2027..${N})=${round2(priceFactor)})`;
  }
  nsLine.monthly_2027 = Array(12).fill((nsLine.amounts[2027] ?? 0) / 12);
  lines.push(nsLine);

  // ---------- VIRTUAL: Kategori-justering (absolutt beløp tNOK) ----------
  // Per kategori: kumulativ sum av adjustment_amount_tnok fom 2027 tom N.
  // Beløpet er PERMANENT: satt i ett år gjelder det samme år og alle påfølgende.
  // Vokser IKKE med prisvekst (matcher hvordan konkrete tiltak ofte er kjent som fast beløp).
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
    for (const N of YEARS) {
      let amt = 0;
      const parts: string[] = [];
      for (let Y = 2027; Y <= N; Y++) {
        const row = scenarioAdj.find((a) => a.category === cat && a.year === Y);
        const v = Number(row?.adjustment_amount_tnok ?? 0);
        if (v !== 0) {
          amt += v;
          parts.push(`Y${Y}: ${v} tNOK (permanent fra ${Y})`);
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
