import { useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ScenarioBundle } from "@/hooks/useAllScenarios";
import type { Level } from "@/lib/forecast/types";
import {
  annualExternalFteCost,
  annualInternalFteCost,
  annualNearshoringCost,
} from "@/lib/forecast/fteCost";
import { formatNumberNO } from "@/lib/format";

type ViewMode = "PL" | "Spend";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031] as const;
const CENTRAL_BASE_FX = 11.3;
const LEVELS: Level[] = ["Low", "Medium", "High"];

// Think-cell inspired muted palette (matches reference jsx)
const COLOR_TOTAL = "#1a3353";       // dark navy for FC 2026 / FC {N}
const COLOR_INCREASE = "#b45550";    // muted brick red
const COLOR_DECREASE = "#5a9a6e";    // muted green
const COLOR_DEPR_NEG = "#7ba7c9";    // soft blue when depreciation reduces cost
const COLOR_REST = "#cbd5e1";
const COLOR_CONNECTOR = "#b0c4d8";
const COLOR_TEXT_DEC = "#3d8b5e";    // darker green for value text
const COLOR_TEXT_INC = "#b45550";

const toM = (v: number) => v / 1000;
const fmtM = (v: number) => formatNumberNO(toM(v), 1);
// "+1,2" / "(1,2)" / "0,0" — parentheses on negatives, matches reference
const fmtParen = (vNok: number) => {
  const m = toM(vNok);
  if (Math.abs(m) < 0.05) return "0,0";
  const s = formatNumberNO(Math.abs(m), 1);
  if (m > 0) return `+${s}`;
  return `(${s})`;
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
  details: Array<{ label: string; value: number; isHeader?: boolean; indent?: boolean; isComment?: boolean }>;
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
  const masterBaselineGrowth = masterBase * cumSalary;

  // ─────── Lønnsvekst: kun eksisterende Internal FTE fra FC 2026 ───────
  let salaryBridge = 0;
  const salaryDetails: BridgeBreakdown["details"] = [];
  const masterSalary = masterBase * (cumSalary - 1);
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
  salaryDetails.push({ label: "Lønnsvekst på eksisterende Internal FTE", value: salaryBridge, isHeader: true });
  salaryDetails.push({ label: "Master FTE-linje", value: masterSalary, indent: true });
  if (driverSalary !== 0) salaryDetails.push({ label: "Driver-linjer (AGA, pensjon, m.fl.)", value: driverSalary, indent: true });
  if (otherIntSalary !== 0) salaryDetails.push({ label: "Øvrige Internal FTE", value: otherIntSalary, indent: true });

  // ─────── Prisvekst: lokal + sentral EUR + valutaeffekt på sentral prisvekst ───────
  // Valutaeffekt-søylen får isolert effekt av FX-endring på BASIS (ikke prisvekst-delta)
  let localPrice = 0;
  let extFtePrice = 0;
  let centralPriceNok = 0;       // sentral prisvekst i NOK (inkl. fxN)
  let centralPriceFxOnDelta = 0; // valutaeffekt på selve prisvekst-delta
  let centralFxOnBase = 0;       // valutaeffekt på basis (uten prisvekst)
  for (const cl of inputs.cost_lines) {
    if (!includeRealLine(cl.category)) continue;
    if (cl.category === "Internal FTE") continue;
    if (cl.category === "Depreciation") continue;
    if (cl.category === "Capex") continue;
    const base = (cl.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0);
    if (cl.cost_type === "Central") {
      const eurBasis = base / CENTRAL_BASE_FX;
      // Total sentral effekt = eurBasis * cumCPrice * fxN - base
      // Splitt i: prisvekst (NOK ved fxN) + ren FX på basis
      const priceDeltaNok = eurBasis * (cumCPrice - 1) * fxN;
      const fxOnBase = eurBasis * (fxN - CENTRAL_BASE_FX); // basis-effekt
      centralPriceNok += priceDeltaNok;
      centralFxOnBase += fxOnBase;
      // (priceDeltaNok inneholder allerede valutaeffekt på prisvekst-delen via fxN)
      const priceDeltaAtBaseFx = eurBasis * (cumCPrice - 1) * CENTRAL_BASE_FX;
      centralPriceFxOnDelta += priceDeltaNok - priceDeltaAtBaseFx;
    } else if (cl.category === "External FTE") {
      const v = base * (cumPrice - 1);
      extFtePrice += v;
    } else {
      const v = base * (cumPrice - 1);
      localPrice += v;
    }
  }
  // Prisvekst-søylen: lokal + ext-FTE + sentral prisvekst (inkl. fx-effekt på prisvekst-delta)
  const priceBridge = localPrice + extFtePrice + centralPriceNok;
  const priceDetails: BridgeBreakdown["details"] = [];
  if (localPrice !== 0) priceDetails.push({ label: "Lokal prisvekst", value: localPrice });
  if (extFtePrice !== 0) priceDetails.push({ label: "External FTE prisvekst", value: extFtePrice });
  if (centralPriceNok !== 0) priceDetails.push({ label: "Sentral prisvekst (EUR→NOK)", value: centralPriceNok });
  if (centralPriceFxOnDelta !== 0)
    priceDetails.push({ label: "  herav valutaeffekt på prisvekst", value: centralPriceFxOnDelta, indent: true });

  // ─────── Nearshoring FX-split: skille rent FX fra prisvekst ───────
  const nsFxBaseEffect = (() => {
    const g = inputs.global_assumptions.find((x) => x.year === N);
    const fxn = g?.eur_nok_rate ?? CENTRAL_BASE_FX;
    let cumNet = 0;
    for (let Y = 2027; Y <= N; Y++) {
      for (const r of inputs.nearshoring_changes.filter((n) => n.year === Y)) {
        cumNet += Number(r.increase || 0) - Number(r.decrease || 0);
      }
    }
    // Andel av nearshoring-kost som er ren FX-effekt vs. base-fx
    const baseAnnualEur = inputs.nearshoring_base.base_annual_cost_eur;
    return (cumNet * baseAnnualEur * (fxn - CENTRAL_BASE_FX)) / 1000;
  })();

  // Total valutaeffekt-søyle = isolert FX-effekt på basis (sentrale + nearshoring)
  const fxBridge = centralFxOnBase + nsFxBaseEffect;
  const fxDetails: BridgeBreakdown["details"] = [
    { label: "EUR/NOK-effekt sentrale kost.", value: centralFxOnBase },
    { label: "EUR/NOK-effekt nearshoring", value: nsFxBaseEffect },
  ];

  // ─────── FTE-endring ───────
  const extConvLine = result.lines.find((l) => l.line_id === "virtual:ext_fte_conversions");
  const i2nIntRedLine = result.lines.find((l) => l.line_id === "virtual:i2ns_internal_reduction");
  const i2nNsAddLine = result.lines.find((l) => l.line_id === "virtual:i2ns_nearshoring_addition");
  const extConvAmt = extConvLine?.amounts[N] ?? 0;
  const i2nIntRedAmt = i2nIntRedLine?.amounts[N] ?? 0; // negative (besparelse)
  const i2nNsAddAmt = i2nNsAddLine?.amounts[N] ?? 0;   // positive (kost)
  const i2nNet = i2nIntRedAmt + i2nNsAddAmt;

  let intInc = 0;
  let intDec = 0;
  for (let Y = 2027; Y <= N; Y++) {
    for (const lvl of LEVELS) {
      const rows = inputs.internal_fte_changes.filter((c) => c.year === Y && c.level === lvl);
      const inc = rows.reduce((a, r) => a + Number(r.increase ?? 0), 0);
      const dec = rows.reduce((a, r) => a + Number(r.decrease ?? 0), 0);
      if (inc !== 0) intInc += inc * annualInternalFteCost(inputs, lvl, N);
      if (dec !== 0) intDec += -dec * annualInternalFteCost(inputs, lvl, Y);
    }
    for (const conv of inputs.conversions.filter((c) => c.year === Y)) {
      intInc += conv.count * annualInternalFteCost(inputs, conv.internal_level, N);
    }
  }
  const intIncTot = intInc;
  const intDecTot = intDec;

  let extInc = 0;
  let extDec = 0;
  for (let Y = 2027; Y <= N; Y++) {
    for (const lvl of LEVELS) {
      const rows = inputs.external_fte_changes.filter((c) => c.year === Y && c.level === lvl);
      const inc = rows.reduce((a, r) => a + Number(r.increase ?? 0), 0);
      const dec = rows.reduce((a, r) => a + Number(r.decrease ?? 0), 0);
      if (inc !== 0) extInc += inc * annualExternalFteCost(inputs, lvl, N);
      if (dec !== 0) extDec += -dec * annualExternalFteCost(inputs, lvl, Y);
    }
  }
  const extPctAdjEffect = (() => {
    let total = 0;
    for (let Y = 2027; Y <= N; Y++) {
      const r = inputs.category_adjustments.find(
        (a) => a.category === "External FTE" && a.year === Y,
      );
      const pct = Number(r?.adjustment_pct ?? 0);
      if (!pct) continue;
      const baseSum = inputs.cost_lines
        .filter((c) => c.category === "External FTE" && c.cost_type === "Local")
        .reduce((sum, c) => sum + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
      const growthFactor = pct > 0 ? cumFactor(Y, N, priceRate) : 1;
      total += baseSum * pct * growthFactor;
    }
    return total;
  })();

  let nsInc = 0;
  let nsDec = 0;
  for (let Y = 2027; Y <= N; Y++) {
    for (const r of inputs.nearshoring_changes.filter((n) => n.year === Y)) {
      const inc = Number(r.increase || 0);
      const dec = Number(r.decrease || 0);
      if (inc !== 0) nsInc += inc * annualNearshoringCost(inputs, N);
      if (dec !== 0) nsDec += -dec * annualNearshoringCost(inputs, Y);
    }
  }

  // FTE-endring inkluderer også kategori-justeringer (tNOK + %) for Internal FTE og External FTE
  const fteCatAdjAmount = result.lines
    .filter((l) => l.line_id.startsWith("virtual:cat_adj_amount:"))
    .filter((l) => l.category === "Internal FTE" || l.category === "External FTE")
    .filter(includeForecastLine)
    .reduce((a, l) => a + (l.amounts[N] ?? 0), 0);

  // %-justering for Internal FTE (External FTE allerede inkludert i extInc/extDec via catAdjExtFactor)
  let intCatAdjPct = 0;
  {
    const intBaseSum = inputs.cost_lines
      .filter((c) => c.category === "Internal FTE")
      .reduce((sum, c) => sum + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
    for (let Y = 2027; Y <= N; Y++) {
      const r = inputs.category_adjustments.find(
        (a) => a.category === "Internal FTE" && a.year === Y,
      );
      const pct = Number(r?.adjustment_pct ?? 0);
      if (!pct) continue;
      const growthFactor = pct > 0 ? cumFactor(Y, N, salaryRate) : 1;
      intCatAdjPct += intBaseSum * pct * growthFactor;
    }
  }

  // FTE-endring = KUN direkte beregnede FTE-relaterte kostnadsendringer.
  // Ingen residual: bruk de eksplisitt beregnede komponentene
  // (interne endringer, eksterne endringer, konvertering, nearshoring) + FTE-kategorijusteringer.
  const fteNet =
    intIncTot + intDecTot +
    extInc + extDec +
    nsInc + nsDec +
    extConvAmt +
    i2nNet +
    fteCatAdjAmount + intCatAdjPct + extPctAdjEffect;

  // Splitt kategori-justering FTE i positiv (økning) og negativ (besparelse)
  const fteCatAdjTotal = fteCatAdjAmount + intCatAdjPct + extPctAdjEffect;
  const fteCatAdjInc = fteCatAdjTotal > 0 ? fteCatAdjTotal : 0;
  const fteCatAdjDec = fteCatAdjTotal < 0 ? fteCatAdjTotal : 0;

  // Klassifiser intern→nearshoring konvertering basert på NETTO effekt
  const i2nInc = i2nNet > 0 ? i2nNet : 0;
  const i2nDec = i2nNet < 0 ? i2nNet : 0;

  const incTotFte = intIncTot + extInc + nsInc + fteCatAdjInc + i2nInc;
  const decTotFte = intDecTot + extDec + nsDec + extConvAmt + fteCatAdjDec + i2nDec;

  const fteDetails: BridgeBreakdown["details"] = [
    { label: "ØKNINGER", value: incTotFte, isHeader: true },
    { label: "Interne FTE", value: intIncTot, indent: true },
    { label: "Eksterne FTE", value: extInc, indent: true },
    { label: "Nearshoring", value: nsInc, indent: true },
  ];
  if (i2nInc !== 0) {
    fteDetails.push({ label: "Konvertering intern→nearshoring", value: i2nInc, indent: true });
  }
  if (fteCatAdjInc !== 0) {
    fteDetails.push({ label: "Kategori-justering FTE", value: fteCatAdjInc, indent: true });
  }
  fteDetails.push(
    { label: "BESPARELSER", value: decTotFte, isHeader: true },
    { label: "Interne FTE", value: intDecTot, indent: true },
    { label: "Eksterne FTE", value: extDec, indent: true },
    { label: "Nearshoring", value: nsDec, indent: true },
    { label: "Konvertering (ekstern red.)", value: extConvAmt, indent: true },
  );
  if (i2nDec !== 0) {
    fteDetails.push({ label: "Konvertering intern→nearshoring", value: i2nDec, indent: true });
  }
  if (fteCatAdjDec !== 0) {
    fteDetails.push({ label: "Kategori-justering FTE", value: fteCatAdjDec, indent: true });
  }
  fteDetails.push({ label: "NETTO", value: fteNet, isHeader: true });

  // ─────── Øvrige økninger / Øvrige besparelser ───────
  // STRENG dekomponering per kategori per år:
  //   Ny kostnad = B × (1+p) × (1+j) + tNOK_adj
  //   Prisvekst-effekt   = B × p                       → Prisvekst-søylen (allerede behandlet over)
  //   %-justeringseffekt = B × (1+p) × j               → her, sortert pos/neg
  //   tNOK-effekt        = tNOK_adj (vokser IKKE)      → her, sortert pos/neg
  // Per-komponent sign-split: hver enkelt %-bidrag og hvert enkelt tNOK-bidrag
  // klassifiseres isolert som økning eller besparelse. tNOK og % blandes ALDRI
  // før de er klassifisert.
  const OTHER_CATS = new Set([
    "Consultancy",
    "IT Costs",
    "Operations & Personnel-related",
    "Other operating income",
  ]);

  // Bucket: per kategori, en pos- og en neg-akkumulator (separate komponenter)
  const incByCat: Record<string, number> = {};
  const decByCat: Record<string, number> = {};
  const commentByCat: Record<string, string[]> = {};
  const addComponent = (cat: string, v: number) => {
    if (v === 0) return;
    if (v > 0) incByCat[cat] = (incByCat[cat] ?? 0) + v;
    else decByCat[cat] = (decByCat[cat] ?? 0) + v;
  };
  const addComment = (cat: string, c?: string | null) => {
    if (!c) return;
    const arr = (commentByCat[cat] ??= []);
    if (!arr.includes(c)) arr.push(c);
  };

  // Sum baseline per kategori (kun Local cost_lines i de fire kategoriene)
  const baseByCat: Record<string, number> = {};
  for (const cl of inputs.cost_lines) {
    if (!includeRealLine(cl.category)) continue;
    if (!OTHER_CATS.has(cl.category)) continue;
    if (cl.cost_type !== "Local") continue;
    const base = (cl.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0);
    baseByCat[cl.category] = (baseByCat[cl.category] ?? 0) + base;
  }

  // %-justeringseffekt per kategori: negative justeringer er konstante mot FC 2026-basis,
  // positive justeringer vokser med prisvekst fra tiltaksåret.
  for (const cat of Object.keys(baseByCat)) {
    for (let Y = 2027; Y <= N; Y++) {
      const r = inputs.category_adjustments.find((a) => a.category === cat && a.year === Y);
      const pct = Number(r?.adjustment_pct ?? 0);
      if (!pct) continue;
      if (r?.comment) addComment(cat, r.comment);
      const growthFactor = pct > 0 ? cumFactor(Y, N, priceRate) : 1;
      const pctEffect = baseByCat[cat] * pct * growthFactor;
      addComponent(cat, pctEffect);
    }
  }

  // tNOK-justeringer (faste beløp, vokser IKKE med prisvekst)
  for (const l of result.lines) {
    if (!l.line_id.startsWith("virtual:cat_adj_amount:")) continue;
    if (!OTHER_CATS.has(l.category)) continue;
    if (!includeForecastLine(l)) continue;
    const v = l.amounts[N] ?? 0;
    addComponent(l.category, v);
    for (let Y = 2027; Y <= N; Y++) {
      const r = inputs.category_adjustments.find(
        (a) => a.category === l.category && a.year === Y && (a.adjustment_amount_tnok ?? 0) !== 0,
      ) as any;
      const cmt = r?.comment_amount ?? r?.comment;
      if (cmt) addComment(l.category, cmt);
    }
  }

  // Sentrale reduksjoner (% + tNOK) → klassifisert per komponent
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

  // Klassifiser sentrale komponenter isolert
  let centralRedPctInc = 0, centralRedPctDec = 0;
  if (centralRedPct > 0) centralRedPctInc = centralRedPct; else centralRedPctDec = centralRedPct;
  let centralRedAmtInc = 0, centralRedAmtDec = 0;
  if (centralRedAmt > 0) centralRedAmtInc = centralRedAmt; else centralRedAmtDec = centralRedAmt;

  // Kommentarer for sentrale reduksjoner (hentes fra cellene i Sentrale drivere)
  const centralRedPctComments: string[] = [];
  const centralRedAmtComments: string[] = [];
  for (let Y = 2027; Y <= N; Y++) {
    const r = inputs.central_assumptions.find((g) => g.year === Y) as any;
    if (!r) continue;
    const cmt = r.comment as string | null | undefined;
    const cmtAmt = r.comment_amount as string | null | undefined;
    if ((r.central_reduction_pct ?? 0) !== 0 && cmt && !centralRedPctComments.includes(cmt)) {
      centralRedPctComments.push(cmt);
    }
    if ((r.central_reduction_amount_tnok ?? 0) !== 0 && cmtAmt && !centralRedAmtComments.includes(cmtAmt)) {
      centralRedAmtComments.push(cmtAmt);
    }
  }

  // ─────── Engangseffekter (one-off) – kun aktivt i sitt eget år ───────
  // Engangseffekter ligger som virtual:one_off:<cat>-linjer fra engine; de har
  // kun beløp i året de gjelder. Klassifiser per komponent (ikke per kategori-sum).
  const oneOffIncByCat: Record<string, number> = {};
  const oneOffDecByCat: Record<string, number> = {};
  const oneOffDescByCat: Record<string, string[]> = {};
  for (const l of result.lines) {
    if (!l.line_id.startsWith("virtual:one_off:")) continue;
    if (!includeForecastLine(l)) continue;
    const v = l.amounts[N] ?? 0;
    if (v === 0) continue;
    if (v > 0) oneOffIncByCat[l.category] = (oneOffIncByCat[l.category] ?? 0) + v;
    else oneOffDecByCat[l.category] = (oneOffDecByCat[l.category] ?? 0) + v;
    // Hent beskrivelser fra inputs.one_off_effects for år N
    for (const r of inputs.one_off_effects ?? []) {
      if (r.category !== l.category || r.year !== N) continue;
      const desc = r.description ?? r.comment ?? null;
      if (!desc) continue;
      const arr = (oneOffDescByCat[l.category] ??= []);
      if (!arr.includes(desc)) arr.push(desc);
    }
  }
  const oneOffIncTot = Object.values(oneOffIncByCat).reduce((a, b) => a + b, 0);
  const oneOffDecTot = Object.values(oneOffDecByCat).reduce((a, b) => a + b, 0);

  const incTot =
    Object.values(incByCat).reduce((a, b) => a + b, 0) + centralRedPctInc + centralRedAmtInc + oneOffIncTot;
  const decTot =
    Object.values(decByCat).reduce((a, b) => a + b, 0) + centralRedPctDec + centralRedAmtDec + oneOffDecTot;

  const incDetails: BridgeBreakdown["details"] = [];
  Object.entries(incByCat).forEach(([cat, v]) => {
    incDetails.push({ label: cat, value: v });
    (commentByCat[cat] ?? []).forEach((c) =>
      incDetails.push({ label: c, value: 0, isComment: true }),
    );
  });
  if (centralRedPctInc !== 0) {
    incDetails.push({ label: "Sentral reduksjon %", value: centralRedPctInc });
    centralRedPctComments.forEach((c) => incDetails.push({ label: c, value: 0, isComment: true }));
  }
  if (centralRedAmtInc !== 0) {
    incDetails.push({ label: "Sentral reduksjon tNOK", value: centralRedAmtInc });
    centralRedAmtComments.forEach((c) => incDetails.push({ label: c, value: 0, isComment: true }));
  }
  Object.entries(oneOffIncByCat).forEach(([cat, v]) => {
    incDetails.push({ label: `${cat} (engangseffekt)`, value: v });
    (oneOffDescByCat[cat] ?? []).forEach((d) =>
      incDetails.push({ label: `Engangseffekt: ${d}`, value: 0, isComment: true }),
    );
  });
  if (incDetails.length === 0) incDetails.push({ label: "Ingen positive justeringer", value: 0 });
  else incDetails.push({ label: "SUM", value: incTot, isHeader: true });

  const decDetails: BridgeBreakdown["details"] = [];
  Object.entries(decByCat).forEach(([cat, v]) => {
    decDetails.push({ label: cat, value: v });
    (commentByCat[cat] ?? []).forEach((c) =>
      decDetails.push({ label: c, value: 0, isComment: true }),
    );
  });
  if (centralRedPctDec !== 0) {
    decDetails.push({ label: "Sentral reduksjon %", value: centralRedPctDec });
    centralRedPctComments.forEach((c) => decDetails.push({ label: c, value: 0, isComment: true }));
  }
  if (centralRedAmtDec !== 0) {
    decDetails.push({ label: "Sentral reduksjon tNOK", value: centralRedAmtDec });
    centralRedAmtComments.forEach((c) => decDetails.push({ label: c, value: 0, isComment: true }));
  }
  Object.entries(oneOffDecByCat).forEach(([cat, v]) => {
    decDetails.push({ label: `${cat} (engangseffekt)`, value: v });
    (oneOffDescByCat[cat] ?? []).forEach((d) =>
      decDetails.push({ label: `Engangseffekt: ${d}`, value: 0, isComment: true }),
    );
  });
  if (decDetails.length === 0) decDetails.push({ label: "Ingen besparelser", value: 0 });
  else decDetails.push({ label: "SUM", value: decTot, isHeader: true });

  // ─────── Avskrivning / Capex ───────
  let deprBridge = 0;
  const deprDetails: BridgeBreakdown["details"] = [];
  if (view === "PL") {
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
    deprBridge = existingDelta + newDepr;
    deprDetails.push({ label: "Eksisterende utfasing", value: existingDelta });
    deprDetails.push({ label: "Nye avskrivninger", value: newDepr });
    // Kategori-justeringer for Depreciation
    const deprCatAdj = result.lines
      .filter((l) => l.line_id.startsWith("virtual:cat_adj_amount:") && l.category === "Depreciation")
      .reduce((a, l) => a + (l.amounts[N] ?? 0), 0);
    if (deprCatAdj !== 0) {
      deprDetails.push({ label: "Kategori-justering Depreciation", value: deprCatAdj });
      deprBridge += deprCatAdj;
    }
  } else {
    // Spend-modus: Capex-søylen = total capex i sluttåret minus total capex i FC 2026.
    // Bruker samme datakilde som stolpediagrammet (cost_lines for baseline, result.lines for sluttår).
    const baselineCapex = inputs.cost_lines
      .filter((c) => c.category === "Capex")
      .reduce((a, c) => a + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
    const nCapex = result.lines
      .filter((l) => l.is_capex)
      .reduce((a, l) => a + (l.amounts[N] ?? 0), 0);
    // Splitt per type for sluttåret
    const byType: Record<string, number> = {};
    for (const l of result.lines.filter((x) => x.is_capex)) {
      const t = l.project || l.account_name || "Capex";
      byType[t] = (byType[t] ?? 0) + (l.amounts[N] ?? 0);
    }
    deprBridge = nCapex - baselineCapex;
    if (baselineCapex !== 0) {
      deprDetails.push({ label: `Baseline FC 2026 capex`, value: -baselineCapex });
    }
    Object.entries(byType).forEach(([t, v]) => deprDetails.push({ label: `Nytt: ${t}`, value: v }));
    if (deprDetails.length === 0) deprDetails.push({ label: "Ingen capex", value: 0 });
    const capexCatAdj = result.lines
      .filter((l) => l.line_id.startsWith("virtual:cat_adj_amount:") && l.category === "Capex")
      .reduce((a, l) => a + (l.amounts[N] ?? 0), 0);
    if (capexCatAdj !== 0) {
      deprDetails.push({ label: "Kategori-justering Capex", value: capexCatAdj });
      deprBridge += capexCatAdj;
    }
  }

  const bridges: BridgeBreakdown[] = [
    { label: "Lønnsvekst", value: salaryBridge, details: salaryDetails },
    { label: "Prisvekst", value: priceBridge, details: priceDetails },
    { label: "FTE-endring", value: fteNet, details: fteDetails },
    { label: "Øvrige økninger", value: incTot, details: incDetails },
    { label: "Øvrige besparelser", value: decTot, details: decDetails },
    { label: "Valutaeffekt", value: fxBridge, details: fxDetails },
    {
      label: view === "PL" ? "Avskrivning" : "Capex",
      value: deprBridge,
      details: deprDetails,
    },
  ];

  const sumBridges = bridges.reduce((a, b) => a + b.value, 0);
  const rest = end - (start + sumBridges);

  if (typeof window !== "undefined") {
    console.log("[Waterfall] Rest values", {
      scenario: bundle.meta.name,
      year: N,
      view,
      start,
      end,
      sumBridges,
      rest,
    });
  }

  // Rest legges til som residual-driver rett før FC-N, slik at briden alltid stemmer per definisjon.
  bridges.push({
    label: "Rest",
    value: rest,
    details: [
      {
        label:
          "Modellteknisk differanse som skyldes forskjell mellom faktiske kostnader i FC 2026 og modellens beregnede satser (arbeidsgiveravgift, feriepenger, og andre personalrelaterte beregningsforskjeller). Denne posten påvirkes av samspill med andre drivere og er ikke en selvstendig kostnadsendring.",
        value: 0,
      },
    ],
  });

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
      <CardContent className="pt-4 space-y-3">
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-[14px] font-medium tracking-tight">Kostnadsbridge</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">
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

        <div className="space-y-2">
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
  top: number;
  bottom: number;
  color: string;
  details?: BridgeBreakdown["details"];
  isDepr?: boolean;
}

/* ─────────── Drilldown tooltip (positioned to mouse) ─────────── */
function DrilldownTooltip({
  bar,
  pos,
  viewBadge,
}: {
  bar: BarSpec | null;
  pos: { x: number; y: number };
  viewBadge?: string;
}) {
  if (!bar) return null;

  const isTotal = bar.type === "start" || bar.type === "end";
  const totalText = isTotal ? `${fmtM(bar.raw)} MNOK` : `${fmtParen(bar.raw)} MNOK`;

  // Simple pill for totals
  if (isTotal) {
    return (
      <div
        style={{
          position: "fixed",
          left: pos.x + 16,
          top: pos.y - 16,
          background: "#1e293b",
          color: "#f1f5f9",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 12,
          fontWeight: 600,
          padding: "8px 14px",
          borderRadius: 8,
          pointerEvents: "none",
          boxShadow: "0 8px 24px rgba(0,0,0,.25)",
          zIndex: 999,
        }}
      >
        {bar.name}: {totalText}
      </div>
    );
  }

  // Special tooltip for "Rest" – descriptive paragraph
  if (bar.type === "rest") {
    return (
      <div
        style={{
          position: "fixed",
          left: pos.x + 18,
          top: pos.y - 20,
          background: "#1e293b",
          color: "#e2e8f0",
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 11,
          padding: "12px 16px",
          borderRadius: 8,
          pointerEvents: "none",
          boxShadow: "0 10px 32px rgba(0,0,0,.35)",
          zIndex: 999,
          lineHeight: 1.55,
          width: 320,
          borderLeft: "3px solid #94a3b8",
        }}
      >
        <div style={{ fontWeight: 700, fontSize: 12, color: "#f8fafc", marginBottom: 6 }}>
          Rest ({fmtParen(bar.raw)} MNOK)
        </div>
        <div style={{ borderTop: "1px solid #334155", marginBottom: 6 }} />
        <div style={{ color: "#cbd5e1" }}>
          Modellteknisk differanse som skyldes forskjell mellom faktiske kostnader i FC 2026
          og modellens beregnede satser (arbeidsgiveravgift, feriepenger, og andre
          personalrelaterte beregningsforskjeller). Denne posten påvirkes av samspill med
          andre drivere og er ikke en selvstendig kostnadsendring.
        </div>
      </div>
    );
  }

  const details = bar.details ?? [];
  const hasSections = details.some((d) => d.isHeader);

  return (
    <div
      style={{
        position: "fixed",
        left: pos.x + 18,
        top: pos.y - 20,
        background: "#1e293b",
        color: "#e2e8f0",
        fontFamily: "Menlo, Consolas, Monaco, monospace",
        fontSize: 11,
        padding: "12px 16px",
        borderRadius: 8,
        pointerEvents: "none",
        whiteSpace: "nowrap",
        boxShadow: "0 10px 32px rgba(0,0,0,.35)",
        zIndex: 999,
        lineHeight: 1.65,
        minWidth: 240,
        maxWidth: 380,
        borderLeft: "3px solid #3b82f6",
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6, gap: 12 }}>
        <span style={{ fontWeight: 700, fontSize: 12, color: "#f8fafc", fontFamily: "Inter, system-ui, sans-serif" }}>
          {bar.name} ({totalText})
        </span>
        {viewBadge && bar.isDepr && (
          <span style={{ fontSize: 9, background: "#334155", color: "#94a3b8", padding: "1px 6px", borderRadius: 4 }}>
            {viewBadge}
          </span>
        )}
      </div>
      <div style={{ borderTop: "1px solid #334155", marginBottom: 6 }} />

      {hasSections
        ? details.map((d, di) => {
            if (d.isHeader) {
              const isNetto = d.label === "NETTO";
              const color =
                d.label === "BESPARELSER" ? "#86efac" : d.label === "ØKNINGER" ? "#fca5a5" : "#f8fafc";
              return (
                <div
                  key={di}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontWeight: 700,
                    color,
                    fontSize: isNetto ? 11.5 : 11,
                    borderTop: isNetto ? "1px solid #475569" : "none",
                    paddingTop: isNetto ? 4 : 6,
                    marginTop: isNetto ? 4 : 4,
                    fontFamily: "Inter, system-ui, sans-serif",
                  }}
                >
                  <span>{d.label}</span>
                  <span>{fmtParen(d.value)}</span>
                </div>
              );
            }
            if (d.isComment) {
              return (
                <div
                  key={di}
                  style={{
                    paddingLeft: 14,
                    color: "#94a3b8",
                    fontStyle: "italic",
                    fontSize: 10.5,
                    fontFamily: "Inter, system-ui, sans-serif",
                    whiteSpace: "normal",
                    maxWidth: 360,
                    lineHeight: 1.4,
                    paddingTop: 1,
                    paddingBottom: 2,
                  }}
                >
                  “{d.label}”
                </div>
              );
            }
            return (
              <div
                key={di}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 16,
                  paddingLeft: d.indent ? 12 : 0,
                }}
              >
                <span style={{ color: "#94a3b8" }}>{d.label}</span>
                <span style={{ fontWeight: 500, color: "#cbd5e1" }}>{fmtParen(d.value)}</span>
              </div>
            );
          })
        : details.map((d, di) => (
            <div key={di} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
              <span style={{ color: "#94a3b8" }}>{d.label}</span>
              <span style={{ fontWeight: 600, color: "#f1f5f9" }}>{fmtParen(d.value)}</span>
            </div>
          ))}
      {details.length === 0 && (
        <div style={{ color: "#94a3b8", fontStyle: "italic" }}>Ingen detaljer</div>
      )}
    </div>
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

  const [activeBar, setActiveBar] = useState<BarSpec | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const bars: BarSpec[] = [];
  let running = start;

  bars.push({
    name: "FC 2026",
    type: "start",
    raw: start,
    top: Math.max(0, start),
    bottom: Math.min(0, start),
    color: COLOR_TOTAL,
  });

  bridges.forEach((b, idx) => {
    const next = running + b.value;
    const isRestBar = b.label === "Rest";
    const isDeprBar = !isRestBar && idx === bridges.length - 2; // nest siste = Avskrivning/Capex
    let c: string;
    if (isRestBar) {
      c = COLOR_REST;
    } else if (isDeprBar) {
      // soft blue when reducing, brick when adding
      c = b.value < 0 ? COLOR_DEPR_NEG : COLOR_INCREASE;
    } else if (Math.abs(b.value) < 1) {
      c = COLOR_REST;
    } else if (b.value < 0) {
      c = COLOR_DECREASE;
    } else {
      c = COLOR_INCREASE;
    }
    bars.push({
      name: b.label,
      type: isRestBar ? "rest" : "bridge",
      raw: b.value,
      top: Math.max(running, next),
      bottom: Math.min(running, next),
      color: c,
      details: b.details,
      isDepr: isDeprBar,
    });
    running = next;
  });

  void rest;

  bars.push({
    name: `FC ${year}`,
    type: "end",
    raw: end,
    top: Math.max(0, end),
    bottom: Math.min(0, end),
    color: COLOR_TOTAL,
  });

  // Focused Y-domain
  const tops = bars.map((b) => b.top);
  const bots = bars.map((b) => b.bottom);
  const maxV = Math.max(...tops);
  const minV = Math.min(...bots, 0);
  const span = maxV - minV || 1;
  const yMax = maxV + span * 0.12;
  const yMin = minV - span * 0.04;

  // Layout — original generous proportions, full-width container
  const W = 1200;
  const H = 240;
  const PAD_L = 20;
  const PAD_R = 20;
  const PAD_T = 36;
  const PAD_B = 42;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;
  const n = bars.length;
  const slot = innerW / n;
  const driverBarW = Math.min(72, slot * 0.7);
  const totalBarW = Math.min(80, slot * 0.78);
  const barWidthFor = (b: BarSpec) =>
    b.type === "start" || b.type === "end" ? totalBarW : driverBarW;

  const yScale = (v: number) => PAD_T + ((yMax - v) / (yMax - yMin)) * innerH;
  const xCenter = (i: number) => PAD_L + slot * i + slot / 2;

  const totalChangePct = start === 0 ? 0 : (end - start) / start;
  const isReduction = end < start;
  const totalChangeColor = isReduction ? "#3d8b5e" : COLOR_TEXT_INC;

  const viewBadge = view === "PL" ? "P&L-modus" : "Spend-modus";

  return (
    <div style={{ position: "relative", width: "100%" }}>
      <div className="flex items-center justify-between mb-3 px-2">
        <h3 className="font-bold" style={{ color, fontSize: 14 }}>
          {bundle.meta.name}
        </h3>
        <div
          className="tabular-nums"
          style={{
            backgroundColor: totalChangeColor,
            color: "#ffffff",
            padding: "4px 12px",
            borderRadius: 6,
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.01em",
          }}
          title={`FC 2026 → FC ${year}`}
        >
          {fmtPctSigned(totalChangePct)}
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ minWidth: 560, display: "block" }}>
          {/* zero line */}
          {yMin < 0 && yMax > 0 && (
            <line
              x1={PAD_L}
              x2={W - PAD_R}
              y1={yScale(0)}
              y2={yScale(0)}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
          )}

          {/* connector lines removed for cleaner look */}

          {/* bars — flat, rounded corners, matches stolpediagrammene */}
          {bars.map((b, i) => {
            const w = barWidthFor(b);
            const x = xCenter(i) - w / 2;
            const yTop = yScale(b.top);
            const yBot = yScale(b.bottom);
            const h = Math.max(2, yBot - yTop);
            const isTotal = b.type === "start" || b.type === "end";
            const labelText = isTotal
              ? fmtM(b.raw)
              : Math.abs(toM(b.raw)) < 0.05
                ? "—"
                : fmtParen(b.raw);
            const labelColor = isTotal
              ? COLOR_TOTAL
              : b.raw < 0
                ? COLOR_TEXT_DEC
                : COLOR_TEXT_INC;
            const labelY = yTop - 8;
            const xLabelY = H - PAD_B + 18;
            const isActive = activeBar?.name === b.name && activeBar?.type === b.type;
            return (
              <g
                key={b.name + i}
                onMouseEnter={(e) => {
                  setActiveBar(b);
                  setMousePos({ x: e.clientX, y: e.clientY });
                }}
                onMouseMove={(e) => setMousePos({ x: e.clientX, y: e.clientY })}
                onMouseLeave={() => setActiveBar(null)}
                style={{ cursor: "pointer" }}
              >
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
                  style={{
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: isTotal ? 13 : 11,
                    fontWeight: isTotal ? 700 : 600,
                    fill: labelColor,
                  }}
                >
                  {labelText}
                </text>
                <rect
                  x={x}
                  y={yTop}
                  width={w}
                  height={h}
                  rx={4}
                  fill={b.color}
                  opacity={isActive ? 1 : 0.96}
                />
                <text
                  x={xCenter(i)}
                  y={xLabelY}
                  textAnchor="middle"
                  style={{
                    fontFamily: "Inter, system-ui, sans-serif",
                    fontSize: 10,
                    fill: "hsl(var(--muted-foreground))",
                    fontWeight: 400,
                  }}
                >
                  {b.name}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <DrilldownTooltip bar={activeBar} pos={mousePos} viewBadge={viewBadge} />
    </div>
  );
}
