import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
  ReferenceLine,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ScenarioBundle } from "@/hooks/useAllScenarios";
import type { Level } from "@/lib/forecast/types";
import { formatNumberNO } from "@/lib/format";

type ViewMode = "PL" | "Spend";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031] as const;
const CENTRAL_BASE_FX = 11.3;
const LEVELS: Level[] = ["Low", "Medium", "High"];

const COLOR_START = "#1E3A8A"; // dark blue
const COLOR_INCREASE = "#F59E0B"; // amber/orange-red for growth
const COLOR_DECREASE = "hsl(var(--positive))"; // green
const COLOR_NEUTRAL_DEPR = "#9CA3AF"; // grey
const COLOR_REST = "#D1D5DB";

const toM = (v: number) => v / 1000;
const fmtM = (v: number) => formatNumberNO(toM(v), 1);
const fmtMSigned = (v: number) => {
  const m = toM(v);
  const s = formatNumberNO(Math.abs(m), 1);
  if (m > 0) return `+${s}`;
  if (m < 0) return `−${s}`;
  return "0,0";
};

interface BridgeBreakdown {
  label: string;
  value: number; // tNOK
  details: Array<{ label: string; value: number; isHeader?: boolean; indent?: boolean }>;
}

function cumFactor(start: number, end: number, rate: (y: number) => number): number {
  let f = 1;
  for (let y = start; y <= end; y++) f *= 1 + rate(y);
  return f;
}

interface ComputeArgs {
  bundle: ScenarioBundle;
  targetYear: number;
  view: ViewMode;
}

function computeBridges({ bundle, targetYear, view }: ComputeArgs): {
  start: number;
  end: number;
  bridges: BridgeBreakdown[];
  rest: number;
} {
  const N = targetYear;
  const { inputs, result } = bundle;

  const includeRealLine = (cat: string) => {
    if (view === "PL" && cat === "Capex") return false;
    if (view === "Spend" && cat === "Depreciation") return false;
    if (view === "Spend" && cat === "Other operating income") return false;
    return true;
  };
  const includeForecastLine = (l: { is_capex: boolean; is_depreciation: boolean; category: string }) => {
    if (view === "PL" && l.is_capex) return false;
    if (view === "Spend" && l.is_depreciation) return false;
    if (view === "Spend" && l.category === "Other operating income") return false;
    return true;
  };

  const start = inputs.cost_lines
    .filter((c) => includeRealLine(c.category))
    .reduce((a, c) => a + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);

  const end = result.lines
    .filter(includeForecastLine)
    .reduce((a, l) => a + (l.amounts[N] ?? 0), 0);

  const salaryRate = (y: number) =>
    inputs.global_assumptions.find((g) => g.year === y)?.salary_increase_pct ?? 0;
  const priceRate = (y: number) =>
    inputs.global_assumptions.find((g) => g.year === y)?.price_increase_pct ?? 0;
  const cPriceRate = (y: number) =>
    inputs.central_assumptions.find((g) => g.year === y)?.central_price_increase_pct ?? 0;
  const cReductionRate = (y: number) =>
    inputs.central_assumptions.find((g) => g.year === y)?.central_reduction_pct ?? 0;
  const fxN = Number(
    inputs.central_assumptions.find((g) => g.year === N)?.central_eur_nok_rate ?? CENTRAL_BASE_FX,
  );

  const cumSalary = cumFactor(2027, N, salaryRate);
  const cumPrice = cumFactor(2027, N, priceRate);
  const cumCPrice = cumFactor(2027, N, cPriceRate);
  const cumCReduction = cumFactor(2027, N, cReductionRate);

  const masterLine = inputs.cost_lines.find((c) => c.is_fte_master);
  const masterBase = masterLine
    ? (masterLine.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0)
    : 0;
  const masterAtN = result.lines.find((l) => l.line_id === masterLine?.id)?.amounts[N] ?? 0;
  const masterBaselineGrowth = masterBase * cumSalary;

  let salaryBridge = 0;
  const salaryDetails: BridgeBreakdown["details"] = [];
  let masterSalary = masterBase * (cumSalary - 1);
  salaryBridge += masterSalary;
  let driverSalary = 0;
  let otherIntSalary = 0;
  for (const cl of inputs.cost_lines) {
    if (cl.category !== "Internal FTE") continue;
    if (cl.is_fte_master) continue;
    const base = (cl.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0);
    if (cl.fte_driver_pct != null) {
      const v = masterBase * (cumSalary - 1) * cl.fte_driver_pct;
      driverSalary += v;
      salaryBridge += v;
    } else {
      const v = base * (cumSalary - 1);
      otherIntSalary += v;
      salaryBridge += v;
    }
  }
  salaryDetails.push({ label: "Master FTE-linje", value: masterSalary });
  if (driverSalary !== 0) salaryDetails.push({ label: "Driver-linjer (AGA, pensjon, m.fl.)", value: driverSalary });
  if (otherIntSalary !== 0) salaryDetails.push({ label: "Øvrige Internal FTE", value: otherIntSalary });

  let priceBridge = 0;
  let localPrice = 0;
  let extFtePrice = 0;
  let centralPriceEur = 0;
  let centralFx = 0;
  for (const cl of inputs.cost_lines) {
    if (!includeRealLine(cl.category)) continue;
    if (cl.category === "Internal FTE") continue;
    if (cl.category === "Depreciation") continue;
    if (cl.category === "Capex") continue;
    const base = (cl.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0);
    if (cl.cost_type === "Central") {
      const eurBasis = base / CENTRAL_BASE_FX;
      const priceEffect = eurBasis * (cumCPrice - 1) * CENTRAL_BASE_FX;
      const fxEffect = eurBasis * cumCPrice * (fxN - CENTRAL_BASE_FX);
      centralPriceEur += priceEffect;
      centralFx += fxEffect;
      priceBridge += priceEffect + fxEffect;
    } else if (cl.category === "External FTE") {
      const v = base * (cumPrice - 1);
      extFtePrice += v;
      priceBridge += v;
    } else {
      const v = base * (cumPrice - 1);
      localPrice += v;
      priceBridge += v;
    }
  }
  const priceDetails: BridgeBreakdown["details"] = [];
  if (localPrice !== 0) priceDetails.push({ label: "Local prisvekst", value: localPrice });
  if (extFtePrice !== 0) priceDetails.push({ label: "External FTE prisvekst", value: extFtePrice });
  if (centralPriceEur !== 0) priceDetails.push({ label: "Sentral prisvekst (EUR)", value: centralPriceEur });
  if (centralFx !== 0) priceDetails.push({ label: "Valutaeffekt (EUR/NOK)", value: centralFx });

  const internalChangeMaster = masterAtN - masterBaselineGrowth;
  let driverChange = 0;
  for (const cl of inputs.cost_lines) {
    if (cl.category !== "Internal FTE" || cl.is_fte_master) continue;
    if (cl.fte_driver_pct != null) {
      driverChange += (masterAtN - masterBaselineGrowth) * cl.fte_driver_pct;
    }
  }
  const internalTotal = internalChangeMaster + driverChange;

  const extChangesLine = result.lines.find((l) => l.line_id === "virtual:ext_fte_changes");
  const extConvLine = result.lines.find((l) => l.line_id === "virtual:ext_fte_conversions");
  const nsLine = result.lines.find((l) => l.line_id === "virtual:nearshoring");
  const extChangesAmt = extChangesLine?.amounts[N] ?? 0;
  const extConvAmt = extConvLine?.amounts[N] ?? 0;
  const nsAmt = nsLine?.amounts[N] ?? 0;

  let intInc = 0;
  let intDec = 0;
  const intRate = (lvl: Level) =>
    inputs.internal_fte_base_rates.find((r) => r.level === lvl)?.base_annual_cost ?? 0;
  for (let Y = 2027; Y <= N; Y++) {
    const grown = cumFactor(Y, N, salaryRate);
    for (const lvl of LEVELS) {
      const rows = inputs.internal_fte_changes.filter((c) => c.year === Y && c.level === lvl);
      const net = rows.reduce((a, r) => a + (r.increase ?? 0) - (r.decrease ?? 0), 0);
      if (net === 0) continue;
      const v = net * intRate(lvl) * grown;
      if (v >= 0) intInc += v;
      else intDec += v;
    }
    for (const conv of inputs.conversions.filter((c) => c.year === Y)) {
      const v = conv.count * intRate(conv.internal_level) * grown;
      intInc += v;
    }
  }
  const driverPctSum = inputs.cost_lines
    .filter((c) => c.category === "Internal FTE" && !c.is_fte_master && c.fte_driver_pct != null)
    .reduce((a, c) => a + (c.fte_driver_pct ?? 0), 0);
  const intIncTot = intInc * (1 + driverPctSum);
  const intDecTot = intDec * (1 + driverPctSum);

  let extInc = 0;
  let extDec = 0;
  const extRate = (lvl: Level) => {
    const r = inputs.external_fte_base_rates.find((x) => x.level === lvl);
    return r ? r.base_monthly_cost * r.working_months : 0;
  };
  for (let Y = 2027; Y <= N; Y++) {
    const grown = cumFactor(Y, N, priceRate);
    for (const lvl of LEVELS) {
      const rows = inputs.external_fte_changes.filter((c) => c.year === Y && c.level === lvl);
      const net = rows.reduce((a, r) => a + (r.increase ?? 0) - (r.decrease ?? 0), 0);
      if (net === 0) continue;
      const v = net * extRate(lvl) * grown;
      if (v >= 0) extInc += v;
      else extDec += v;
    }
  }
  const catAdjExtFactor = (() => {
    let f = 1;
    for (let Y = 2027; Y <= N; Y++) {
      const r = inputs.category_adjustments.find(
        (a) => a.category === "External FTE" && a.year === Y,
      );
      if (r?.adjustment_pct) f *= 1 + r.adjustment_pct;
    }
    return f;
  })();
  extInc *= catAdjExtFactor;
  extDec *= catAdjExtFactor;

  let nsInc = 0;
  let nsDec = 0;
  {
    const g = inputs.global_assumptions.find((x) => x.year === N);
    const fxn = g?.eur_nok_rate ?? CENTRAL_BASE_FX;
    const annualNokK = (inputs.nearshoring_base.base_annual_cost_eur * cumPrice * fxn) / 1000;
    let cumInc = 0;
    let cumDec = 0;
    for (let Y = 2027; Y <= N; Y++) {
      for (const r of inputs.nearshoring_changes.filter((n) => n.year === Y)) {
        cumInc += Number(r.increase || 0);
        cumDec += Number(r.decrease || 0);
      }
    }
    nsInc = cumInc * annualNokK;
    nsDec = -cumDec * annualNokK;
  }

  const fteNet = internalTotal + extChangesAmt + extConvAmt + nsAmt;
  const fteDetails: BridgeBreakdown["details"] = [
    { label: "ØKNINGER", value: intIncTot + extInc + nsInc, isHeader: true },
    { label: "Interne FTE", value: intIncTot, indent: true },
    { label: "Eksterne FTE", value: extInc, indent: true },
    { label: "Nearshoring", value: nsInc, indent: true },
    { label: "BESPARELSER", value: intDecTot + extDec + nsDec + extConvAmt, isHeader: true },
    { label: "Interne FTE", value: intDecTot, indent: true },
    { label: "Eksterne FTE", value: extDec, indent: true },
    { label: "Nearshoring", value: nsDec, indent: true },
    { label: "Konvertering (ekstern reduksjon)", value: extConvAmt, indent: true },
  ];

  let centralRedPct = 0;
  for (const cl of inputs.cost_lines) {
    if (cl.cost_type !== "Central") continue;
    if (!includeRealLine(cl.category)) continue;
    const base = (cl.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0);
    const eurBasis = base / CENTRAL_BASE_FX;
    const nokBeforeReduction = eurBasis * cumCPrice * fxN;
    centralRedPct += nokBeforeReduction * (cumCReduction - 1);
  }
  const cRedAmtLine = result.lines.find((l) => l.line_id === "virtual:central_reduction_amount");
  const centralRedAmt = cRedAmtLine?.amounts[N] ?? 0;
  const centralBridge = centralRedPct + centralRedAmt;
  const centralDetails: BridgeBreakdown["details"] = [
    { label: "Reduksjon %", value: centralRedPct },
    { label: "Reduksjon tNOK (fast beløp)", value: centralRedAmt },
  ];

  let othersBridge = 0;
  const incByCat: Record<string, number> = {};
  const decByCat: Record<string, number> = {};
  const addCat = (cat: string, v: number) => {
    if (v === 0) return;
    if (v > 0) incByCat[cat] = (incByCat[cat] ?? 0) + v;
    else decByCat[cat] = (decByCat[cat] ?? 0) + v;
  };
  const cumCatFactor = (cat: string) => {
    let f = 1;
    for (let Y = 2027; Y <= N; Y++) {
      const r = inputs.category_adjustments.find((a) => a.category === cat && a.year === Y);
      if (r?.adjustment_pct) f *= 1 + r.adjustment_pct;
    }
    return f;
  };
  for (const cl of inputs.cost_lines) {
    if (!includeRealLine(cl.category)) continue;
    if (cl.cost_type !== "Local") continue;
    if (cl.category === "Internal FTE") continue;
    if (cl.category === "Depreciation" || cl.category === "Capex") continue;
    const base = (cl.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0);
    const cat = cl.category;
    const f = cumCatFactor(cat);
    if (f === 1) continue;
    const v = base * cumPrice * (f - 1);
    addCat(cat, v);
    othersBridge += v;
  }
  for (const l of result.lines) {
    if (!l.line_id.startsWith("virtual:cat_adj_amount:")) continue;
    if (!includeForecastLine(l)) continue;
    const v = l.amounts[N] ?? 0;
    addCat(l.category, v);
    othersBridge += v;
  }
  const incTot = Object.values(incByCat).reduce((a, b) => a + b, 0);
  const decTot = Object.values(decByCat).reduce((a, b) => a + b, 0);
  const othersDetails: BridgeBreakdown["details"] = [];
  othersDetails.push({ label: "ØKNINGER", value: incTot, isHeader: true });
  Object.entries(incByCat).forEach(([cat, v]) => othersDetails.push({ label: cat, value: v, indent: true }));
  othersDetails.push({ label: "BESPARELSER", value: decTot, isHeader: true });
  Object.entries(decByCat).forEach(([cat, v]) => othersDetails.push({ label: cat, value: v, indent: true }));

  let deprBridge = 0;
  const deprDetails: BridgeBreakdown["details"] = [];
  if (view === "PL") {
    const baseDepr = inputs.cost_lines
      .filter((c) => c.category === "Depreciation")
      .reduce((a, c) => a + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
    const nDepr = result.lines
      .filter((l) => l.is_depreciation)
      .reduce((a, l) => a + (l.amounts[N] ?? 0), 0);
    deprBridge = nDepr - baseDepr;
    let existingDelta = 0;
    let newDepr = 0;
    for (const cl of inputs.cost_lines.filter((c) => c.category === "Depreciation")) {
      const base = (cl.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0);
      const line = result.lines.find((l) => l.line_id === cl.id);
      const amt = line?.amounts[N] ?? 0;
      let existing = base;
      const offset = N - 2026;
      if (cl.is_existing_depreciation_phaseout) {
        if (offset === 1) existing = base * (2 / 3);
        else if (offset === 2) existing = base * (1 / 3);
        else existing = 0;
      }
      existingDelta += existing - base;
      newDepr += amt - existing;
    }
    deprDetails.push({ label: "Eksisterende utfasing", value: existingDelta });
    deprDetails.push({ label: "Nye avskrivninger", value: newDepr });
  } else {
    const nCapex = result.lines
      .filter((l) => l.is_capex)
      .reduce((a, l) => a + (l.amounts[N] ?? 0), 0);
    const baseCapex = 0;
    deprBridge = nCapex - baseCapex;
    deprDetails.push({ label: "Nye investeringer", value: nCapex });
  }

  const bridges: BridgeBreakdown[] = [
    { label: "Lønnsvekst", value: salaryBridge, details: salaryDetails },
    { label: "Prisvekst", value: priceBridge, details: priceDetails },
    { label: "FTE-endring", value: fteNet, details: fteDetails },
    { label: "Sentrale reduksjoner", value: centralBridge, details: centralDetails },
    { label: "Øvrige netto", value: othersBridge, details: othersDetails },
    {
      label: view === "PL" ? "Avskrivning" : "Capex",
      value: deprBridge,
      details: deprDetails,
    },
  ];

  const sumBridges = bridges.reduce((a, b) => a + b.value, 0);
  const rest = end - (start + sumBridges);

  return { start, end, bridges, rest };
}

interface WaterfallSectionProps {
  scenarios: ScenarioBundle[];
  view: ViewMode;
  scenarioColors: string[];
}

export function WaterfallSection({ scenarios, view, scenarioColors }: WaterfallSectionProps) {
  const [year, setYear] = useState<number>(2031);

  return (
    <Card>
      <CardContent className="pt-5 space-y-5">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-[15px] font-medium tracking-tight">Kostnadsbridge</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dekomponering av endring fra FC 2026 til valgt år, per scenario.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Vis bridge til</span>
            <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
              <SelectTrigger className="h-8 w-[140px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FC_YEARS.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    FC {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="space-y-5">
          {scenarios.map((b, i) => (
            <WaterfallChart
              key={b.meta.id}
              bundle={b}
              year={year}
              view={view}
              color={scenarioColors[i % scenarioColors.length]}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function WaterfallChart({
  bundle,
  year,
  view,
  color,
}: {
  bundle: ScenarioBundle;
  year: number;
  view: ViewMode;
  color: string;
}) {
  const { start, end, bridges, rest } = useMemo(
    () => computeBridges({ bundle, targetYear: year, view }),
    [bundle, year, view],
  );

  type Row = {
    name: string;
    base: number;
    value: number;
    raw: number;
    color: string;
    type: "start" | "bridge" | "end" | "rest";
    details?: BridgeBreakdown["details"];
  };

  const rows: Row[] = [];
  let running = start;

  rows.push({
    name: "FC 2026",
    base: 0,
    value: toM(start),
    raw: start,
    color: COLOR_START,
    type: "start",
  });

  bridges.forEach((b, idx) => {
    const next = running + b.value;
    const lo = Math.min(running, next);
    const hi = Math.max(running, next);
    const isDeprBar = idx === bridges.length - 1;
    let c: string;
    if (isDeprBar) c = COLOR_NEUTRAL_DEPR;
    else if (b.label === "Sentrale reduksjoner") c = COLOR_DECREASE;
    else if (b.label === "Lønnsvekst" || b.label === "Prisvekst") c = COLOR_INCREASE;
    else c = b.value < 0 ? COLOR_DECREASE : COLOR_INCREASE;
    rows.push({
      name: b.label,
      base: toM(lo),
      value: toM(hi - lo),
      raw: b.value,
      color: c,
      type: "bridge",
      details: b.details,
    });
    running = next;
  });

  if (Math.abs(rest) > 100) {
    const next = running + rest;
    const lo = Math.min(running, next);
    const hi = Math.max(running, next);
    rows.push({
      name: "Rest",
      base: toM(lo),
      value: toM(hi - lo),
      raw: rest,
      color: COLOR_REST,
      type: "rest",
    });
    running = next;
  }

  rows.push({
    name: `FC ${year}`,
    base: 0,
    value: toM(end),
    raw: end,
    color: COLOR_START,
    type: "end",
  });

  const allTops = rows.map((r) => r.base + r.value);
  const allBots = rows.map((r) => r.base);
  const max = Math.max(...allTops);
  const min = Math.min(0, ...allBots);
  const range = max - min || 1;
  const yDomain: [number, number] = [min - range * 0.1, max + range * 0.15];

  const renderTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const r: Row = payload[0]?.payload;
    if (!r) return null;
    return (
      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md min-w-[240px]">
        <div className="font-semibold mb-1.5 flex items-center justify-between gap-3">
          <span>{r.name}</span>
          <span className="tabular-nums">
            {r.type === "start" || r.type === "end" ? `${fmtM(r.raw)}` : fmtMSigned(r.raw)} MNOK
          </span>
        </div>
        {r.details && r.details.length > 0 && (
          <div className="space-y-0.5 border-t pt-1.5">
            {r.details.map((d, i) => (
              <div
                key={i}
                className={
                  "flex items-center justify-between gap-3 " +
                  (d.isHeader ? "font-semibold uppercase text-[10px] tracking-wide mt-1" : "") +
                  (d.indent ? " pl-3 text-muted-foreground" : "")
                }
              >
                <span>{d.label}</span>
                <span className="tabular-nums">{fmtMSigned(d.value)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <h3 className="text-[13px] font-semibold mb-2" style={{ color }}>
        {bundle.meta.name}
      </h3>
      <div className="h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
            <XAxis dataKey="name" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} interval={0} />
            <YAxis hide domain={yDomain} />
            <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.3)" }} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Bar dataKey="base" stackId="w" fill="transparent" isAnimationActive={false} />
            <Bar dataKey="value" stackId="w" radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {rows.map((r, i) => (
                <Cell key={i} fill={r.color} />
              ))}
              <LabelList
                dataKey="value"
                position="top"
                content={(props: any) => {
                  const { x, y, width, index } = props;
                  const r = rows[index];
                  if (!r) return null;
                  const text =
                    r.type === "start" || r.type === "end"
                      ? fmtM(r.raw)
                      : fmtMSigned(r.raw);
                  return (
                    <text
                      x={Number(x) + Number(width) / 2}
                      y={Number(y) - 6}
                      textAnchor="middle"
                      style={{ fontSize: 10, fontWeight: 500, fill: "hsl(var(--foreground))" }}
                    >
                      {text}
                    </text>
                  );
                }}
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
