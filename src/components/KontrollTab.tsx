import { useMemo, useState, useCallback } from "react";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllScenarios } from "@/hooks/useAllScenarios";
import { calculateForecast } from "@/lib/forecast/engine";
import {
  annualExternalFteCost,
  annualInternalFteCost,
  annualNearshoringCost,
  cumulativeInputFactor,
  externalWorkingMonths,
} from "@/lib/forecast/fteCost";
import type { ForecastInputs } from "@/lib/forecast/types";
import { formatNumberNO } from "@/lib/format";
import { cn } from "@/lib/utils";

type ViewMode = "PL" | "Spend";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031] as const;
const CENTRAL_BASE_FX = 11.3;

/** Format a percentage with Norwegian comma + 1 decimal, e.g. 0.04 → "4,0 %". */
function fmtPct(pct: number): string {
  return `${(pct * 100).toFixed(1).replace(".", ",")} %`;
}

/**
 * Summarize a yearly rate series as a short, readable string.
 * - All equal → "3,0 % per år"
 * - One outlier → "4,0 % i 2027, deretter 3,0 % per år" or "5,0 % per år, men 7,0 % i 2029"
 * - Otherwise → "2027: 4,0 %, 2028–2030: 3,0 %, 2031: 2,5 %"
 */
function formatYearlyRate(values: Array<{ year: number; pct: number }>): string {
  const series = [...values].sort((a, b) => a.year - b.year);
  if (series.length === 0) return "0,0 % per år";

  const unique = Array.from(new Set(series.map((v) => v.pct.toFixed(4))));
  if (unique.length === 1) return `${fmtPct(series[0].pct)} per år`;

  if (unique.length === 2) {
    const counts = new Map<string, number>();
    for (const v of series) counts.set(v.pct.toFixed(4), (counts.get(v.pct.toFixed(4)) ?? 0) + 1);
    const [majorityKey, minorityKey] =
      (counts.get(unique[0]) ?? 0) >= (counts.get(unique[1]) ?? 0)
        ? [unique[0], unique[1]]
        : [unique[1], unique[0]];
    const majority = Number(majorityKey);
    const minority = Number(minorityKey);
    const minorityYears = series.filter((v) => v.pct.toFixed(4) === minorityKey).map((v) => v.year);
    const majorityYears = series.filter((v) => v.pct.toFixed(4) === majorityKey).map((v) => v.year);

    if (minorityYears.length === 1) {
      const isFirst = minorityYears[0] === series[0].year;
      const allLater = majorityYears.every((y) => y > minorityYears[0]);
      if (isFirst && allLater) {
        return `${fmtPct(minority)} i ${minorityYears[0]}, deretter ${fmtPct(majority)} per år`;
      }
      return `${fmtPct(majority)} per år, men ${fmtPct(minority)} i ${minorityYears[0]}`;
    }
  }

  // Fallback: group consecutive equal years
  const groups: Array<{ from: number; to: number; pct: number }> = [];
  for (const v of series) {
    const last = groups[groups.length - 1];
    if (last && last.pct.toFixed(4) === v.pct.toFixed(4) && last.to === v.year - 1) {
      last.to = v.year;
    } else {
      groups.push({ from: v.year, to: v.year, pct: v.pct });
    }
  }
  return groups
    .map((g) => `${g.from === g.to ? g.from : `${g.from}–${g.to}`}: ${fmtPct(g.pct)}`)
    .join(", ");
}

type GroupKey =
  | "GLOBAL"
  | "CENTRAL"
  | "FTE"
  | "CONVERSION"
  | "NEARSHORING"
  | "CATEGORY"
  | "ONEOFF"
  | "CAPEX";

const GROUP_LABEL: Record<GroupKey, string> = {
  GLOBAL: "GLOBALE DRIVERE",
  CENTRAL: "SENTRALE DRIVERE",
  FTE: "FTE-ENDRINGER",
  CONVERSION: "KONVERTERINGER",
  NEARSHORING: "NEARSHORING",
  CATEGORY: "KATEGORI-JUSTERINGER",
  ONEOFF: "ENGANGSEFFEKTER",
  CAPEX: "CAPEX",
};

const GROUP_ORDER: GroupKey[] = [
  "GLOBAL",
  "CENTRAL",
  "FTE",
  "CONVERSION",
  "NEARSHORING",
  "CATEGORY",
  "ONEOFF",
  "CAPEX",
];

type Row = {
  key: string;
  group: GroupKey;
  sortKey: number; // for ordering within group
  name: string;
  type: string;
  details: string;
  yearly: Record<number, number>; // MNOK
  comment?: string | null;
};

/** Returner en helt "tom" kopi av inputs der alle scenario-styrte drivere er nullstilt. */
function emptyDriverInputs(base: ForecastInputs): ForecastInputs {
  return {
    ...base,
    global_assumptions: base.global_assumptions.map((g) => ({
      ...g,
      salary_increase_pct: 0,
      price_increase_pct: 0,
      eur_nok_rate: CENTRAL_BASE_FX,
    })),
    central_assumptions: base.central_assumptions.map((c) => ({
      ...c,
      central_price_increase_pct: 0,
      central_volume_increase_pct: 0,
      central_reduction_pct: 0,
      central_reduction_amount_tnok: 0,
      central_eur_nok_rate: CENTRAL_BASE_FX,
    })),
    internal_fte_changes: base.internal_fte_changes.map((r) => ({ ...r, increase: 0, decrease: 0 })),
    external_fte_changes: base.external_fte_changes.map((r) => ({ ...r, increase: 0, decrease: 0 })),
    conversions: [],
    nearshoring_additions: [],
    nearshoring_changes: base.nearshoring_changes.map((r) => ({ ...r, increase: 0, decrease: 0 })),
    category_adjustments: base.category_adjustments.map((a) => ({
      ...a,
      adjustment_pct: 0,
      adjustment_amount_tnok: 0,
    })),
    capex_plan: [],
    depreciation_phaseout: [],
    internal_to_nearshoring_conversions: [],
    one_off_effects: [],
  };
}

/** Beregn årlige totaler for et input-sett, P&L eller Spend. */
function totalsByYear(inputs: ForecastInputs, view: ViewMode): Record<number, number> {
  const r = calculateForecast(inputs);
  const out: Record<number, number> = {};
  for (const Y of FC_YEARS) out[Y] = 0;
  for (const line of r.lines) {
    if (view === "PL" && line.is_capex) continue;
    if (view === "Spend" && line.is_depreciation) continue;
    if (view === "Spend" && line.category === "Other operating income") continue;
    for (const Y of FC_YEARS) {
      out[Y] += (line.amounts[Y] ?? 0) / 1000;
    }
  }
  return out;
}

function diff(a: Record<number, number>, b: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const Y of FC_YEARS) out[Y] = (a[Y] ?? 0) - (b[Y] ?? 0);
  return out;
}

export function KontrollTab({ scenarioId }: { scenarioId: string | null }) {
  const [reloadKey, setReloadKey] = useState(0);

  const handleRefresh = useCallback(() => {
    setReloadKey((k) => k + 1);
  }, []);

  return (
    <div className="mt-6">
      <KontrollTabInner scenarioId={scenarioId} reloadKey={reloadKey} onRefresh={handleRefresh} />
    </div>
  );
}

function KontrollTabInner({ scenarioId, reloadKey, onRefresh }: { scenarioId: string | null; reloadKey: number; onRefresh: () => void }) {
  const { loading, scenarios, error } = useAllScenarios(reloadKey);
  const bundle = scenarios.find((s) => s.meta.id === scenarioId);
  const [view, setView] = useState<ViewMode>("PL");
  const [perspective, setPerspective] = useState<"cumulative" | "yearly">("cumulative");

  const calc = useMemo(() => {
    if (!bundle) return null;
    const base = bundle.inputs;
    const empty = emptyDriverInputs(base);
    const baseTotals = totalsByYear(empty, view);
    const fullTotals = totalsByYear(base, view);
    const totalDiff = diff(fullTotals, baseTotals);

    const rows: Row[] = [];
    const cumulativeGrowth = cumulativeInputFactor;

    const isolate = (mutate: (i: ForecastInputs) => ForecastInputs): Record<number, number> => {
      const iso = mutate({
        ...empty,
        global_assumptions: empty.global_assumptions.map((r) => ({ ...r })),
        central_assumptions: empty.central_assumptions.map((r) => ({ ...r })),
        internal_fte_changes: empty.internal_fte_changes.map((r) => ({ ...r })),
        external_fte_changes: empty.external_fte_changes.map((r) => ({ ...r })),
        conversions: [],
        nearshoring_changes: empty.nearshoring_changes.map((r) => ({ ...r })),
        category_adjustments: empty.category_adjustments.map((r) => ({ ...r })),
        capex_plan: [],
        depreciation_phaseout: [],
        internal_to_nearshoring_conversions: [],
        one_off_effects: [],
      });
      return diff(totalsByYear(iso, view), baseTotals);
    };

    // ───────── GLOBAL ─────────
    if (base.global_assumptions.some((g) => Number(g.salary_increase_pct) !== 0)) {
      const yearly = isolate((i) => {
        i.global_assumptions = base.global_assumptions.map((g) => ({
          ...g,
          salary_increase_pct: Number(g.salary_increase_pct) || 0,
          price_increase_pct: 0,
          eur_nok_rate: CENTRAL_BASE_FX,
        }));
        return i;
      });
      const last = base.global_assumptions.find((g) => g.year === 2031);
      rows.push({
        key: "global:salary",
        group: "GLOBAL",
        sortKey: 1,
        name: "Lønnsvekst",
        type: "Global driver",
        details: `${formatYearlyRate(
          base.global_assumptions
            .filter((g) => FC_YEARS.includes(g.year as any))
            .map((g) => ({ year: g.year, pct: Number(g.salary_increase_pct) || 0 })),
        )} på eksisterende interne FTE fra FC 2026`,
        yearly,
      });
    }
    if (base.global_assumptions.some((g) => Number(g.price_increase_pct) !== 0)) {
      const yearly = isolate((i) => {
        i.global_assumptions = base.global_assumptions.map((g) => ({
          ...g,
          salary_increase_pct: 0,
          price_increase_pct: Number(g.price_increase_pct) || 0,
          eur_nok_rate: CENTRAL_BASE_FX,
        }));
        return i;
      });
      const last = base.global_assumptions.find((g) => g.year === 2031);
      rows.push({
        key: "global:price",
        group: "GLOBAL",
        sortKey: 2,
        name: "Prisvekst",
        type: "Global driver",
        details: `${formatYearlyRate(
          base.global_assumptions
            .filter((g) => FC_YEARS.includes(g.year as any))
            .map((g) => ({ year: g.year, pct: Number(g.price_increase_pct) || 0 })),
        )} på lokale ikke-FTE-kostnader`,
        yearly,
      });
    }
    if (base.global_assumptions.some((g) => Number(g.eur_nok_rate) !== CENTRAL_BASE_FX)) {
      const yearly = isolate((i) => {
        i.global_assumptions = base.global_assumptions.map((g) => ({
          ...g,
          salary_increase_pct: 0,
          price_increase_pct: 0,
          eur_nok_rate: Number(g.eur_nok_rate) || CENTRAL_BASE_FX,
        }));
        return i;
      });
      rows.push({
        key: "global:fx",
        group: "GLOBAL",
        sortKey: 3,
        name: "EUR/NOK-kurs (Nearshoring)",
        type: "Global driver",
        details: "Avvik fra default 11,3",
        yearly,
      });
    }

    // ───────── CENTRAL ─────────
    const cAssumps = base.central_assumptions;
    const setCentral = (field: string) => (i: ForecastInputs) => {
      i.central_assumptions = cAssumps.map((c) => ({
        ...c,
        central_price_increase_pct: 0,
        central_volume_increase_pct: 0,
        central_reduction_pct: 0,
        central_reduction_amount_tnok: 0,
        central_eur_nok_rate: CENTRAL_BASE_FX,
        [field]: (c as any)[field] ?? 0,
      }));
      return i;
    };
    if (cAssumps.some((c) => Number(c.central_price_increase_pct) !== 0)) {
      const yearly = isolate(setCentral("central_price_increase_pct"));
      const last = cAssumps.find((c) => c.year === 2031);
      rows.push({
        key: "central:price",
        group: "CENTRAL",
        sortKey: 1,
        name: "Sentral prisvekst",
        type: "Sentral driver",
        details: `${formatYearlyRate(
          cAssumps
            .filter((c) => FC_YEARS.includes(c.year as any))
            .map((c) => ({ year: c.year, pct: Number(c.central_price_increase_pct) || 0 })),
        )} (EUR-basis)`,
        yearly,
      });
    }
    if (cAssumps.some((c) => Number(c.central_reduction_pct) !== 0)) {
      const yearly = isolate(setCentral("central_reduction_pct"));
      rows.push({
        key: "central:redpct",
        group: "CENTRAL",
        sortKey: 2,
        name: "Sentral reduksjon %",
        type: "Sentral driver",
        details: "Permanent multiplikativ reforhandling",
        yearly,
      });
    }
    if (cAssumps.some((c) => Number(c.central_reduction_amount_tnok ?? 0) !== 0)) {
      const yearly = isolate(setCentral("central_reduction_amount_tnok"));
      const firstYear = cAssumps
        .filter((c) => Number(c.central_reduction_amount_tnok ?? 0) !== 0)
        .map((c) => c.year)
        .sort((a, b) => a - b)[0];
      rows.push({
        key: "central:redamt",
        group: "CENTRAL",
        sortKey: 3,
        name: "Sentral reduksjon tNOK",
        type: "Sentral driver",
        details: `Permanent fra ${firstYear ?? "—"}`,
        yearly,
      });
    }
    if (cAssumps.some((c) => Number(c.central_eur_nok_rate ?? CENTRAL_BASE_FX) !== CENTRAL_BASE_FX)) {
      const yearly = isolate(setCentral("central_eur_nok_rate"));
      rows.push({
        key: "central:fx",
        group: "CENTRAL",
        sortKey: 4,
        name: "Sentral EUR/NOK-kurs",
        type: "Sentral driver",
        details: "Avvik fra default 11,3",
        yearly,
      });
    }

    // ───────── FTE-ENDRINGER ─────────
    // Sub-sort: interne økninger → interne reduksjoner → eksterne økninger → eksterne reduksjoner; deretter år
    for (const r of base.internal_fte_changes) {
      const inc = Number(r.increase) || 0;
      const dec = Number(r.decrease) || 0;
      const net = inc - dec;
      if (net === 0) continue;
      const netYearly: Record<number, number> = {};
      const absNet = Math.abs(net);
      for (const Y of FC_YEARS) {
        if (Y < r.year) {
          netYearly[Y] = 0;
          continue;
        }
        if (net > 0) {
          // Økning: vokser med lønnsvekst hvert år
          netYearly[Y] = absNet * annualInternalFteCost(base, r.level, Y) / 1000;
        } else {
          // Besparelse: frosset på kostnadsnivået i startåret, KONSTANT
          netYearly[Y] = -(absNet * annualInternalFteCost(base, r.level, r.year) / 1000);
        }
      }
      rows.push({
        key: `intfte:${r.year}:${r.level}`,
        group: "FTE",
        sortKey: (net > 0 ? 0 : 1) * 1000 + r.year,
        name: `${net > 0 ? "+" : ""}${net} ${r.level} Intern FTE ${r.year}`,
        type: "Intern FTE-endring",
        details: net > 0
          ? "Inkl. kumulativ lønnsvekst fra FC 2026-basis"
          : "Konstant besparelse mot FC 2026-basis",
        yearly: netYearly,
        comment: (r as any).comment ?? (r as any).comment_increase ?? (r as any).comment_decrease,
      });
    }
    for (const r of base.external_fte_changes) {
      const inc = Number(r.increase) || 0;
      const dec = Number(r.decrease) || 0;
      const net = inc - dec;
      if (net === 0) continue;
      const netYearly: Record<number, number> = {};
      const absNet = Math.abs(net);
      for (const Y of FC_YEARS) {
        if (Y < r.year) {
          netYearly[Y] = 0;
          continue;
        }
        if (net > 0) {
          // Økning: vokser med prisvekst hvert år
          netYearly[Y] = absNet * annualExternalFteCost(base, r.level, Y) / 1000;
        } else {
          // Besparelse: frosset på kostnadsnivået i startåret, KONSTANT
          netYearly[Y] = -(absNet * annualExternalFteCost(base, r.level, r.year) / 1000);
        }
      }
      rows.push({
        key: `extfte:${r.year}:${r.level}`,
        group: "FTE",
        sortKey: (net > 0 ? 2 : 3) * 1000 + r.year,
        name: `${net > 0 ? "+" : ""}${net} ${r.level} Ekstern FTE ${r.year}`,
        type: "Ekstern FTE-endring",
        details: net > 0
          ? "Inkl. kumulativ prisvekst fra FC 2026-basis"
          : "Konstant besparelse mot FC 2026-basis",
        yearly: netYearly,
        comment: (r as any).comment ?? (r as any).comment_increase ?? (r as any).comment_decrease,
      });
    }

    // ───────── KONVERTERINGER ─────────
    for (const r of base.conversions) {
      if (!Number(r.count)) continue;
      const netYearly: Record<number, number> = {};
      const frozenExternalAnnual = annualExternalFteCost(base, r.external_level, r.year);
      const externalMonths = externalWorkingMonths(base, r.external_level);
      const overlapMonths = Math.max(0, Math.min(externalMonths, Number(r.overlap_months) || 0));
      for (const Y of FC_YEARS) {
        if (Y < r.year) {
          netYearly[Y] = 0;
          continue;
        }
        const internalCost = r.count * annualInternalFteCost(base, r.internal_level, Y) / 1000;
        const externalCost = Y === r.year
          ? -r.count * (frozenExternalAnnual / externalMonths) * (externalMonths - overlapMonths) / 1000
          : -r.count * frozenExternalAnnual / 1000;
        netYearly[Y] = internalCost + externalCost;
      }
      rows.push({
        key: `conv:${r.year}:${r.external_level}:${r.internal_level}`,
        group: "CONVERSION",
        sortKey: r.year,
        name: `${r.count} konv. ${r.external_level}→${r.internal_level} ${r.year}`,
        type: "Ekstern→Intern",
        details: `${r.overlap_months} mnd overlapp. Besparelse konstant, intern kost vokser med lønnsvekst`,
        yearly: netYearly,
        comment: (r as any).comment,
      });
    }
    for (const r of base.internal_to_nearshoring_conversions ?? []) {
      if (!Number(r.count)) continue;
      const netYearly: Record<number, number> = {};
      const frozenInternalAnnual = annualInternalFteCost(base, r.internal_level, r.year);
      const overlapMonths = Math.max(0, Math.min(12, Number(r.overlap_months) || 3));
      for (const Y of FC_YEARS) {
        if (Y < r.year) {
          netYearly[Y] = 0;
          continue;
        }
        const internalSaving = Y === r.year
          ? -r.count * frozenInternalAnnual * ((12 - overlapMonths) / 12) / 1000
          : -r.count * frozenInternalAnnual / 1000;
        const nearshoringCost = r.count * annualNearshoringCost(base, Y) / 1000;
        netYearly[Y] = internalSaving + nearshoringCost;
      }
      rows.push({
        key: `i2n:${r.year}:${r.internal_level}:${(r as any).id ?? Math.random()}`,
        group: "CONVERSION",
        sortKey: 10000 + r.year,
        name: `${r.count} ${r.internal_level} Intern→Nearshoring ${r.year}`,
        type: "Intern→Nearshoring",
        details: `${r.overlap_months ?? 3} mnd overlapp. Intern besparelse konstant, nearshoring vokser med prisvekst`,
        yearly: netYearly,
        comment: (r as any).comment,
      });
    }

    // ───────── NEARSHORING ─────────
    for (const r of base.nearshoring_changes) {
      const inc = Number(r.increase) || 0;
      const dec = Number(r.decrease) || 0;
      const net = inc - dec;
      if (net === 0) continue;
      const netYearly: Record<number, number> = {};
      const absNet = Math.abs(net);
      for (const Y of FC_YEARS) {
        if (Y < r.year) {
          netYearly[Y] = 0;
          continue;
        }
        if (net > 0) {
          // Økning: vokser med prisvekst hvert år
          netYearly[Y] = absNet * annualNearshoringCost(base, Y) / 1000;
        } else {
          // Besparelse: frosset på kostnadsnivået i startåret, KONSTANT
          netYearly[Y] = -(absNet * annualNearshoringCost(base, r.year) / 1000);
        }
      }
      rows.push({
        key: `ns:${r.year}`,
        group: "NEARSHORING",
        sortKey: r.year,
        name: `${net > 0 ? "+" : ""}${net} Nearshoring ${r.year}`,
        type: "Nearshoring-endring",
        details: net > 0
          ? "Inkl. kumulativ prisvekst fra FC 2026-basis"
          : "Konstant besparelse mot FC 2026-basis",
        yearly: netYearly,
        comment: (r as any).comment ?? (r as any).comment_increase ?? (r as any).comment_decrease,
      });
    }

    // ───────── KATEGORI-JUSTERINGER ─────────
    // %-justering beregnes på basis ETTER prisvekst (waterfall-konsistent)
    // tNOK-justering er fast og vokser ikke
    for (const r of base.category_adjustments) {
      const pct = Number(r.adjustment_pct) || 0;
      const amt = Number((r as any).adjustment_amount_tnok ?? 0);
      if (pct !== 0) {
        // Direkte beregning: negative %-justeringer er konstant mot FC 2026-basis,
        // positive %-justeringer vokser med prisvekst fra tiltaksåret.
        const baseSum = base.cost_lines
          .filter((c) => c.category === r.category && c.cost_type === "Local")
          .reduce(
            (s, c) => s + (c.fc_2026_monthly ?? []).reduce((x, m) => x + Number(m || 0), 0),
            0,
          ) / 1000; // MNOK
        const yearly: Record<number, number> = {};
        for (const Y of FC_YEARS) {
          if (Y < r.year) {
            yearly[Y] = 0;
            continue;
          }
          const growthFactor = pct > 0
            ? base.global_assumptions
                .filter((g) => g.year >= r.year && g.year <= Y)
                .reduce((acc, g) => acc * (1 + Number(g.price_increase_pct ?? 0)), 1)
            : 1;
          yearly[Y] = baseSum * pct * growthFactor;
        }
        rows.push({
          key: `cat:${r.category}:${r.year}:pct`,
          group: "CATEGORY",
          sortKey: r.year,
          name: `${(pct * 100).toFixed(1)} % ${r.category} ${r.year}`,
          type: "Kategori-justering %",
          details: pct > 0
            ? `Vokser med prisvekst fra ${r.year}, permanent mot FC 2026-basis`
            : `Konstant besparelse mot FC 2026-basis, permanent fra ${r.year}`,
          yearly,
          comment: (r as any).comment,
        });
      }
      if (amt !== 0) {
        const isInternalFTE = r.category === "Internal FTE";
        const yearly: Record<number, number> = {};
        for (const Y of FC_YEARS) {
          if (Y < r.year) {
            yearly[Y] = 0;
            continue;
          }
          if (amt > 0) {
            // Positive tNOK (økninger) vokser med lønns-/prisvekst fra tiltaksåret
            const growthAssumptions = base.global_assumptions.filter(
              (g) => g.year >= r.year && g.year <= Y
            );
            const growthFactor = growthAssumptions.reduce(
              (acc, g) => acc * (1 + Number(isInternalFTE ? g.salary_increase_pct : g.price_increase_pct ?? 0)),
              1,
            );
            yearly[Y] = (amt * growthFactor) / 1000;
          } else {
            // Negative tNOK (besparelser) er konstante
            yearly[Y] = amt / 1000;
          }
        }
        rows.push({
          key: `cat:${r.category}:${r.year}:amt`,
          group: "CATEGORY",
          sortKey: 10000 + r.year,
          name: `${amt > 0 ? "+" : ""}${formatNumberNO(amt, 0)} tNOK ${r.category} ${r.year}`,
          type: "Kategori-justering tNOK",
          details: amt > 0
            ? `Permanent fra ${r.year}. Vokser med ${isInternalFTE ? "lønnsvekst" : "prisvekst"}.`
            : `Konstant besparelse, permanent fra ${r.year}. Vokser ikke.`,
          yearly,
          comment: (r as any).comment_amount ?? (r as any).comment,
        });
      }
    }

    // ───────── ENGANGSEFFEKTER ─────────
    for (const r of base.one_off_effects ?? []) {
      if (!Number(r.amount_tnok)) continue;
      const yearly: Record<number, number> = {};
      for (const Y of FC_YEARS) yearly[Y] = Y === r.year ? Number(r.amount_tnok) / 1000 : 0;
      rows.push({
        key: `oneoff:${r.year}:${r.category}:${(r as any).id ?? Math.random()}`,
        group: "ONEOFF",
        sortKey: r.year,
        name: `${r.description || "Engangseffekt"} (${r.category}) ${r.year}`,
        type: "Engangseffekt",
        details: `${formatNumberNO(Number(r.amount_tnok) / 1000, 1)} MNOK kun ${r.year}`,
        yearly,
        comment: (r as any).comment,
      });
    }

    // ───────── CAPEX ─────────
    const capexTypeOrder: Record<string, number> = { Hardware: 0, Software: 1, Prosjekt: 2 };
    for (const r of base.capex_plan) {
      if (!Number(r.amount)) continue;
      const yearly = isolate((i) => {
        i.capex_plan = [{ ...r }];
        return i;
      });
      rows.push({
        key: `capex:${r.year}:${r.capex_type}:${(r as any).id ?? Math.random()}`,
        group: "CAPEX",
        sortKey: (capexTypeOrder[r.capex_type] ?? 9) * 10000 + r.year,
        name: `Capex ${r.capex_type} ${r.year} (${formatNumberNO(Number(r.amount) / 1000, 1)} MNOK)`,
        type: view === "PL" ? "Avskrivning over levetid" : "Direkte utgift",
        details: r.description ?? "—",
        yearly,
        comment: (r as any).comment,
      });
    }

    // Utfasing av eksisterende avskrivninger – fra brukerdefinert tabell (kumulativ)
    if (view === "PL") {
      const phaseouts = (base.depreciation_phaseout ?? []).filter(
        (r: any) => r.scenario_id === bundle.meta.id,
      );
      if (phaseouts.length) {
        const phaseYearly: Record<number, number> = {};
        for (const Y of FC_YEARS) {
          // Kumulativ: alle utfasinger med year <= Y
          const cum = phaseouts
            .filter((r: any) => r.year <= Y)
            .reduce((s: number, r: any) => s + Number(r.amount_tnok || 0), 0);
          phaseYearly[Y] = cum / 1000; // til MNOK
        }
        const hasEffect = FC_YEARS.some((Y) => Math.abs(phaseYearly[Y] ?? 0) > 0.001);
        if (hasEffect) {
          rows.push({
            key: "capex:depr_phaseout",
            group: "CAPEX",
            sortKey: -1,
            name: "Utfasing eksisterende avskrivninger",
            type: "Historiske investeringer",
            details: "Brukerdefinert utfasing av avskrivninger fra investeringer gjort før FC 2026 (kumulativ)",
            yearly: phaseYearly,
            comment: null,
          });
        }
      }
    }

    // Sortér innenfor grupper
    rows.sort((a, b) => {
      const ga = GROUP_ORDER.indexOf(a.group);
      const gb = GROUP_ORDER.indexOf(b.group);
      if (ga !== gb) return ga - gb;
      return a.sortKey - b.sortKey;
    });

    // Subtotaler per gruppe
    const groupSubtotals: Record<GroupKey, Record<number, number>> = {} as any;
    for (const g of GROUP_ORDER) {
      const sub: Record<number, number> = {};
      for (const Y of FC_YEARS) sub[Y] = 0;
      for (const r of rows.filter((x) => x.group === g)) {
        for (const Y of FC_YEARS) sub[Y] += r.yearly[Y] ?? 0;
      }
      groupSubtotals[g] = sub;
    }

    const sumYearly: Record<number, number> = {};
    for (const Y of FC_YEARS) sumYearly[Y] = rows.reduce((s, r) => s + (r.yearly[Y] ?? 0), 0);

    return { rows, groupSubtotals, sumYearly, totalDiff };
  }, [bundle, view]);

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6 space-y-3">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-64 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (error || !bundle || !calc) {
    return (
      <Card>
        <CardContent className="pt-6 text-sm text-muted-foreground">
          {error ?? "Kan ikke beregne kontroll-tabell – ingen data."}
        </CardContent>
      </Card>
    );
  }

  const { rows: rawRows, groupSubtotals: rawGroupSubtotals, sumYearly: rawSumYearly, totalDiff: rawTotalDiff } = calc;

  // Transform to yearly deltas if perspective is "yearly" (stolpediagram-logikk)
  // CAPEX/avskrivninger unntas – de viser alltid faktiske verdier per år, ikke delta.
  const toYearlyDelta = (yearly: Record<number, number>): Record<number, number> => {
    if (perspective === "cumulative") return yearly;
    const result: Record<number, number> = {};
    for (let i = 0; i < FC_YEARS.length; i++) {
      const Y = FC_YEARS[i];
      const prev = i > 0 ? (yearly[FC_YEARS[i - 1]] ?? 0) : 0;
      result[Y] = (yearly[Y] ?? 0) - prev;
    }
    return result;
  };

  const rows = rawRows.map((r) => ({
    ...r,
    // CAPEX-rader viser faktiske verdier, MEN utfasing er kumulativ og skal vise delta i "per år"-modus
    yearly: r.group === "CAPEX" && r.key !== "capex:depr_phaseout" ? r.yearly : toYearlyDelta(r.yearly),
  }));
  // Re-beregn subtotaler fra de (muligens transformerte) radene slik at CAPEX subtotal
  // inkluderer utfasingens delta korrekt i "per år"-modus.
  const groupSubtotals: Record<string, Record<number, number>> = {};
  for (const r of rows) {
    if (!groupSubtotals[r.group]) {
      groupSubtotals[r.group] = {};
      for (const Y of FC_YEARS) groupSubtotals[r.group][Y] = 0;
    }
    for (const Y of FC_YEARS) {
      groupSubtotals[r.group][Y] += r.yearly[Y] ?? 0;
    }
  }
  const sumYearly = toYearlyDelta(rawSumYearly);
  const totalDiff = toYearlyDelta(rawTotalDiff);

  const matchPct = rawTotalDiff[2031] !== 0 ? (rawSumYearly[2031] / rawTotalDiff[2031]) * 100 : 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="space-y-3">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Kontroll – isolert effekt per forutsetning
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hver rad viser hva forutsetningen alene bidrar med på{" "}
              {view === "PL" ? "P&L-totalen" : "Spend (kontant utgift)"}.{" "}
              {perspective === "cumulative"
                ? "Kumulativ visning: total endring fra FC 2026-basis (samme perspektiv som waterfallen)."
                : "Per år-visning: inkrementell endring per år (samme perspektiv som stolpediagrammet). Nye forutsetninger viser full effekt i startåret, deretter kun veksteffekten."}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList>
                <TabsTrigger value="PL">P&amp;L</TabsTrigger>
                <TabsTrigger value="Spend">Spend</TabsTrigger>
              </TabsList>
            </Tabs>
            <Tabs value={perspective} onValueChange={(v) => setPerspective(v as "cumulative" | "yearly")}>
              <TabsList>
                <TabsTrigger value="cumulative">Kumulativ</TabsTrigger>
                <TabsTrigger value="yearly">Per år</TabsTrigger>
              </TabsList>
            </Tabs>
            <button
              onClick={onRefresh}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md border hover:bg-muted/50"
            >
              ↻ Oppdater
            </button>
          </div>
        </div>


        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-xs table-fixed">
            <colgroup>
              <col style={{ width: "22%" }} />
              <col style={{ width: "16%" }} />
              <col style={{ width: "32%" }} />
              {FC_YEARS.map((y) => (
                <col key={y} style={{ width: "6%" }} />
              ))}
            </colgroup>
            <thead className="bg-muted/60">
              <tr>
                <th className="text-left font-medium px-3 py-2">Forutsetning</th>
                <th className="text-left font-medium px-3 py-2">Type</th>
                <th className="text-left font-medium px-3 py-2">Detaljer</th>
                {FC_YEARS.map((y) => (
                  <th key={y} className="text-right font-medium px-2 py-2 whitespace-nowrap">
                    {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3 + FC_YEARS.length} className="px-3 py-6 text-center text-muted-foreground">
                    Ingen forutsetninger satt for dette scenarioet.
                  </td>
                </tr>
              )}
              {GROUP_ORDER.map((g) => {
                const groupRows = rows.filter((r) => r.group === g);
                if (groupRows.length === 0) return null;
                return (
                  <GroupBlock
                    key={g}
                    group={g}
                    rows={groupRows}
                    subtotal={groupSubtotals[g]}
                    perspective={perspective}
                  />
                );
              })}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr
                  className="font-bold"
                  style={{ background: "#edf2f7", borderTop: "2px solid #334155" }}
                >
                  <td className="px-3 py-2" colSpan={3}>
                    Sum isolerte effekter
                  </td>
                  {FC_YEARS.map((y) => (
                    <NumCell key={y} value={sumYearly[y]} bold />
                  ))}
                </tr>
                <tr className="text-muted-foreground" style={{ background: "#f8fafc" }}>
                  <td className="px-3 py-2" colSpan={3}>
                    Modellens totale endring (FC vs. baseline)
                  </td>
                  {FC_YEARS.map((y) => (
                    <NumCell key={y} value={totalDiff[y]} />
                  ))}
                </tr>
                <tr className="text-xs text-muted-foreground" style={{ background: "#f8fafc" }}>
                  <td className="px-3 py-1.5" colSpan={3 + FC_YEARS.length}>
                    Sum/total-match 2031: {formatNumberNO(matchPct, 1)} % – avvik skyldes interaksjon
                    mellom drivere.
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Alle tall i MNOK –{" "}
          {view === "PL"
            ? "P&L-perspektiv: Capex som avskrivninger over levetid"
            : "Spend-perspektiv: Capex som direkte utgift i investeringsåret"}
          . Negative tall (besparelser) i grønt og parentes; positive (kostnadsøkninger) i rødt.
        </p>
      </CardContent>
    </Card>
  );
}

function GroupBlock({
  group,
  rows,
  subtotal,
  perspective,
}: {
  group: GroupKey;
  rows: Row[];
  subtotal: Record<number, number>;
  perspective: "cumulative" | "yearly";
}) {
  const isCapex = group === "CAPEX";
  return (
    <>
      <tr style={{ background: "#edf2f7" }}>
        <td
          className="px-3 py-2 uppercase"
          colSpan={3}
          style={{ fontWeight: 700, fontSize: 12, letterSpacing: "0.03em", color: "#1e293b" }}
        >
          {GROUP_LABEL[group]}
          {isCapex && perspective === "yearly" && (
            <span className="normal-case text-[10px] font-normal text-muted-foreground ml-2">
              (viser faktiske verdier per år)
            </span>
          )}
        </td>
        {FC_YEARS.map((y) => (
          <NumCell key={y} value={subtotal[y]} bold />
        ))}
      </tr>
      {rows.map((r, idx) => {
        const isPhaseout = r.key === "capex:depr_phaseout";
        return (
          <tr
            key={r.key}
            style={{ background: isPhaseout ? "#f1f5f9" : (idx % 2 === 1 ? "#f8fafc" : "#ffffff") }}
            className={cn("hover:bg-muted/40", isPhaseout && "italic")}
          >
            <td className="py-1.5 pr-3" style={{ paddingLeft: 20 }}>
              <span className="inline-flex items-center gap-1.5">
                {r.name}
                {r.comment && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <MessageSquare className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="text-xs whitespace-pre-wrap">{r.comment}</p>
                    </TooltipContent>
                  </Tooltip>
                )}
              </span>
            </td>
            <td className="px-3 py-1.5 text-muted-foreground whitespace-normal break-words">{r.type}</td>
            <td className="px-3 py-1.5 text-muted-foreground whitespace-normal break-words">{r.details}</td>
            {FC_YEARS.map((y) => (
              <NumCell key={y} value={r.yearly[y]} />
            ))}
          </tr>
        );
      })}
    </>
  );
}

function NumCell({ value, bold }: { value: number; bold?: boolean }) {
  if (Math.abs(value) < 0.05) {
    return (
      <td
        className={cn("px-2 py-1.5 text-right tabular-nums", bold && "font-bold")}
        style={{ color: "#94a3b8" }}
      >
        —
      </td>
    );
  }
  const negative = value < 0;
  const formatted = formatNumberNO(Math.abs(value), 1);
  const display = negative ? `(${formatted})` : formatted;
  return (
    <td
      className={cn("px-2 py-1.5 text-right tabular-nums font-mono", bold && "font-bold")}
      style={{ color: negative ? "#16a34a" : "#dc2626" }}
    >
      {display}
    </td>
  );
}
