import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip as UITooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ScenarioBundle } from "@/hooks/useAllScenarios";
import type { Level } from "@/lib/forecast/types";
import { formatNumberNO } from "@/lib/format";

type ViewMode = "PL" | "Spend";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031] as const;
const CENTRAL_BASE_FX = 11.3;
const LEVELS: Level[] = ["Low", "Medium", "High"];

// Think-cell inspired strong colors
const COLOR_START = "#042C53"; // dark blue (matches dashboard Internal FTE)
const COLOR_END = "#042C53";
const COLOR_INCREASE = "#C0392B"; // strong red
const COLOR_DECREASE = "#1F8A4C"; // strong green
const COLOR_NEUTRAL_DEPR = "#85B7EB"; // light blue (depreciation/capex)
const COLOR_REST = "#B5D4F4";
const COLOR_CONNECTOR = "#94A3B8";

const toM = (v: number) => v / 1000;
const fmtM = (v: number) => formatNumberNO(toM(v), 1);
const fmtMSigned = (v: number) => {
  const m = toM(v);
  const s = formatNumberNO(Math.abs(m), 1);
  if (m > 0) return `+${s}`;
  if (m < 0) return `(${s})`;
  return "0,0";
};
const fmtPctSigned = (v: number) => {
  const s = formatNumberNO(Math.abs(v) * 100, 1);
  if (v > 0) return `+${s}%`;
  if (v < 0) return `−${s}%`;
  return "0,0%";
};

interface BridgeBreakdown {
  label: string;
  value: number;
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
    { label: "NETTO", value: fteNet, isHeader: true },
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
  othersDetails.push({ label: "NETTO", value: incTot + decTot, isHeader: true });

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
    deprBridge = nCapex;
    deprDetails.push({ label: "Nye investeringer", value: nCapex });
  }

  const bridges: BridgeBreakdown[] = [
    { label: "Lønnsvekst", value: salaryBridge, details: salaryDetails },
    { label: "Prisvekst", value: priceBridge, details: priceDetails },
    { label: "FTE-endring", value: fteNet, details: fteDetails },
    { label: "Sentrale red.", value: centralBridge, details: centralDetails },
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
      <CardContent className="pt-5 space-y-6">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-[15px] font-medium tracking-tight">Kostnadsbridge</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Dekomponering av endring fra FC 2026 til valgt år.
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

        <div className="space-y-7">
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

interface BarSpec {
  name: string;
  type: "start" | "bridge" | "end" | "rest";
  raw: number;
  top: number; // value-space top of bar
  bottom: number; // value-space bottom of bar
  color: string;
  details?: BridgeBreakdown["details"];
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

  const bars: BarSpec[] = [];
  let running = start;

  bars.push({
    name: "FC 2026",
    type: "start",
    raw: start,
    top: Math.max(0, start),
    bottom: Math.min(0, start),
    color: COLOR_START,
  });

  bridges.forEach((b, idx) => {
    const next = running + b.value;
    const isDeprBar = idx === bridges.length - 1;
    let c: string;
    if (isDeprBar) c = COLOR_NEUTRAL_DEPR;
    else if (b.label === "Sentrale red.") c = COLOR_DECREASE;
    else if (b.label === "Lønnsvekst" || b.label === "Prisvekst") c = COLOR_INCREASE;
    else c = b.value < 0 ? COLOR_DECREASE : COLOR_INCREASE;
    bars.push({
      name: b.label,
      type: "bridge",
      raw: b.value,
      top: Math.max(running, next),
      bottom: Math.min(running, next),
      color: c,
      details: b.details,
    });
    running = next;
  });

  if (Math.abs(rest) > 100) {
    const next = running + rest;
    bars.push({
      name: "Rest",
      type: "rest",
      raw: rest,
      top: Math.max(running, next),
      bottom: Math.min(running, next),
      color: COLOR_REST,
    });
    running = next;
  }

  bars.push({
    name: `FC ${year}`,
    type: "end",
    raw: end,
    top: Math.max(0, end),
    bottom: Math.min(0, end),
    color: COLOR_END,
  });

  // Focused Y-domain
  const tops = bars.map((b) => b.top);
  const bots = bars.map((b) => b.bottom);
  const maxV = Math.max(...tops);
  const minV = Math.min(...bots, 0);
  const span = maxV - minV || 1;
  const yMax = maxV + span * 0.1;
  const yMin = minV - span * 0.1;

  // Layout
  const W = 880;
  const H = 280;
  const PAD_L = 12;
  const PAD_R = 12;
  const PAD_T = 32;
  const PAD_B = 56;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = bars.length;
  const slot = innerW / n;
  const barW = Math.min(72, slot * 0.6);

  const yScale = (v: number) => PAD_T + ((yMax - v) / (yMax - yMin)) * innerH;
  const xCenter = (i: number) => PAD_L + slot * i + slot / 2;

  const totalChangePct = start === 0 ? 0 : (end - start) / start;
  const totalChangeColor = end < start ? COLOR_DECREASE : COLOR_INCREASE;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[13px] font-semibold" style={{ color }}>
          {bundle.meta.name}
        </h3>
        <div
          className="text-[12px] font-semibold rounded-full px-3 py-1 text-white tabular-nums"
          style={{ backgroundColor: totalChangeColor }}
          title={`FC 2026 → FC ${year}`}
        >
          {fmtPctSigned(totalChangePct)}
        </div>
      </div>

      <TooltipProvider delayDuration={100}>
        <div className="w-full overflow-x-auto">
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 600 }}>
            {/* zero line */}
            {yMin < 0 && yMax > 0 && (
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yScale(0)}
                y2={yScale(0)}
                stroke="hsl(var(--border))"
                strokeWidth={1}
              />
            )}

            {/* connector lines between bars (horizontal stitches at running waterline) */}
            {bars.map((b, i) => {
              if (i === bars.length - 1) return null;
              const nextBar = bars[i + 1];
              // waterline between bar i and i+1:
              // for start -> first bridge: connector at start value (top of start bar)
              // for bridge i -> bridge i+1: connector at running level after bar i
              // for last bridge/rest -> end: connector at end value (top of end bar)
              let yVal: number;
              if (b.type === "start") yVal = b.raw;
              else if (nextBar.type === "end") yVal = nextBar.raw;
              else {
                // running after bar i = bar.top if value positive, bar.bottom if negative
                // We can derive from cumulative: easier to recompute
                yVal = b.raw >= 0 ? b.top : b.bottom;
                // Actually for bridges, running BEFORE bar = the side closest to previous,
                // running AFTER bar = the other side. Determine direction by sign:
                // bridge with positive value: bottom = prev running, top = new running
                // bridge with negative value: top = prev running, bottom = new running
                yVal = b.raw >= 0 ? b.top : b.bottom;
              }
              const x1 = xCenter(i) + barW / 2;
              const x2 = xCenter(i + 1) - barW / 2;
              const y = yScale(yVal);
              return (
                <line
                  key={`conn-${i}`}
                  x1={x1}
                  x2={x2}
                  y1={y}
                  y2={y}
                  stroke={COLOR_CONNECTOR}
                  strokeWidth={1}
                  strokeDasharray="3 3"
                />
              );
            })}

            {/* bars */}
            {bars.map((b, i) => {
              const x = xCenter(i) - barW / 2;
              const yTop = yScale(b.top);
              const yBot = yScale(b.bottom);
              const h = Math.max(1, yBot - yTop);
              const labelText =
                b.type === "start" || b.type === "end" ? fmtM(b.raw) : fmtMSigned(b.raw);
              const labelColor =
                b.type === "start" || b.type === "end"
                  ? "hsl(var(--foreground))"
                  : b.raw < 0
                    ? COLOR_DECREASE
                    : COLOR_INCREASE;
              const labelY = yTop - 6;
              const xLabelY = H - PAD_B + 16;
              return (
                <UITooltip key={b.name + i}>
                  <TooltipTrigger asChild>
                    <g style={{ cursor: "pointer" }}>
                      <rect
                        x={x}
                        y={yTop}
                        width={barW}
                        height={h}
                        fill={b.color}
                        rx={2}
                        ry={2}
                      />
                      {/* hover hit area */}
                      <rect
                        x={xCenter(i) - slot / 2}
                        y={PAD_T}
                        width={slot}
                        height={innerH}
                        fill="transparent"
                      />
                      <text
                        x={xCenter(i)}
                        y={labelY}
                        textAnchor="middle"
                        style={{ fontSize: 11, fontWeight: 600, fill: labelColor }}
                      >
                        {labelText}
                      </text>
                      <text
                        x={xCenter(i)}
                        y={xLabelY}
                        textAnchor="middle"
                        style={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                      >
                        {b.name}
                      </text>
                    </g>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-xs">
                    <div className="text-xs space-y-1 min-w-[220px]">
                      <div className="font-semibold flex items-center justify-between gap-3">
                        <span>{b.name}</span>
                        <span className="tabular-nums">
                          {b.type === "start" || b.type === "end"
                            ? fmtM(b.raw)
                            : fmtMSigned(b.raw)}{" "}
                          MNOK
                        </span>
                      </div>
                      {b.details && b.details.length > 0 && (
                        <div className="space-y-0.5 border-t pt-1.5">
                          {b.details.map((d, di) => (
                            <div
                              key={di}
                              className={
                                "flex items-center justify-between gap-3 " +
                                (d.isHeader
                                  ? "font-semibold uppercase text-[10px] tracking-wide mt-1"
                                  : "") +
                                (d.indent ? " pl-3 opacity-80" : "")
                              }
                            >
                              <span>{d.label}</span>
                              <span className="tabular-nums">{fmtMSigned(d.value)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </TooltipContent>
                </UITooltip>
              );
            })}
          </svg>
        </div>
      </TooltipProvider>
    </div>
  );
}
