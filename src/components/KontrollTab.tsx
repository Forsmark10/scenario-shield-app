import { useMemo, useState } from "react";
import { CheckCircle2, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAllScenarios } from "@/hooks/useAllScenarios";
import { calculateForecast } from "@/lib/forecast/engine";
import type { ForecastInputs } from "@/lib/forecast/types";
import { formatNumberNO } from "@/lib/format";
import { cn } from "@/lib/utils";

type ViewMode = "PL" | "Spend";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031] as const;

type Row = {
  key: string;
  name: string;
  type: string;
  details: string;
  yearly: Record<number, number>; // MNOK
  acc2031: number; // MNOK
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
      eur_nok_rate: 11.3,
    })),
    central_assumptions: base.central_assumptions.map((c) => ({
      ...c,
      central_price_increase_pct: 0,
      central_volume_increase_pct: 0,
      central_reduction_pct: 0,
      central_reduction_amount_tnok: 0,
      central_eur_nok_rate: 11.3,
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

/** Diff: scenario − baseline, per år. */
function diff(a: Record<number, number>, b: Record<number, number>): Record<number, number> {
  const out: Record<number, number> = {};
  for (const Y of FC_YEARS) out[Y] = (a[Y] ?? 0) - (b[Y] ?? 0);
  return out;
}

export function KontrollTab({ scenarioId }: { scenarioId: string | null }) {
  const { loading, scenarios, error } = useAllScenarios();
  const bundle = scenarios.find((s) => s.meta.id === scenarioId);
  const [view, setView] = useState<ViewMode>("PL");

  // Beregn baseline (alle drivere = 0) og total-diff samt per-driver isolert diff.
  const calc = useMemo(() => {
    if (!bundle) return null;
    const base = bundle.inputs;
    const empty = emptyDriverInputs(base);
    const baseTotals = totalsByYear(empty, view);
    const fullTotals = totalsByYear(base, view);
    const totalDiff = diff(fullTotals, baseTotals);

    const rows: Row[] = [];

    // Helper: lag isolert input ved å kun overskrive felter på "empty"
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
        internal_to_nearshoring_conversions: [],
        one_off_effects: [],
      });
      return diff(totalsByYear(iso, view), baseTotals);
    };

    // ---- Globale drivere (per år, men slå sammen til én rad per type) ----
    {
      const salaryAny = base.global_assumptions.some((g) => Number(g.salary_increase_pct) !== 0);
      if (salaryAny) {
        const yearly = isolate((i) => {
          i.global_assumptions = base.global_assumptions.map((g) => ({
            ...g,
            salary_increase_pct: Number(g.salary_increase_pct) || 0,
            price_increase_pct: 0,
            eur_nok_rate: 11.3,
          }));
          return i;
        });
        const last = base.global_assumptions.find((g) => g.year === 2031);
        rows.push({
          key: "global:salary",
          name: "Lønnsvekst",
          type: "Global driver",
          details: `${(Number(last?.salary_increase_pct ?? 0) * 100).toFixed(1)} % per år på interne FTE`,
          yearly,
          acc2031: yearly[2031],
          comment: base.global_assumptions.find((g) => (g as any).comment_salary)?.["comment_salary" as any] as string | undefined,
        });
      }
      const priceAny = base.global_assumptions.some((g) => Number(g.price_increase_pct) !== 0);
      if (priceAny) {
        const yearly = isolate((i) => {
          i.global_assumptions = base.global_assumptions.map((g) => ({
            ...g,
            salary_increase_pct: 0,
            price_increase_pct: Number(g.price_increase_pct) || 0,
            eur_nok_rate: 11.3,
          }));
          return i;
        });
        const last = base.global_assumptions.find((g) => g.year === 2031);
        rows.push({
          key: "global:price",
          name: "Prisvekst",
          type: "Global driver",
          details: `${(Number(last?.price_increase_pct ?? 0) * 100).toFixed(1)} % per år på lokale eksterne kostnader`,
          yearly,
          acc2031: yearly[2031],
          comment: base.global_assumptions.find((g) => (g as any).comment_price)?.["comment_price" as any] as string | undefined,
        });
      }
      const fxAny = base.global_assumptions.some((g) => Number(g.eur_nok_rate) !== 11.3);
      if (fxAny) {
        const yearly = isolate((i) => {
          i.global_assumptions = base.global_assumptions.map((g) => ({
            ...g,
            salary_increase_pct: 0,
            price_increase_pct: 0,
            eur_nok_rate: Number(g.eur_nok_rate) || 11.3,
          }));
          return i;
        });
        rows.push({
          key: "global:fx",
          name: "EUR/NOK-kurs (Nearshoring)",
          type: "Global driver",
          details: "Avvik fra default 11,3",
          yearly,
          acc2031: yearly[2031],
        });
      }
    }

    // ---- Sentrale drivere ----
    const cAssumps = base.central_assumptions;
    const setCentral = (field: string) => (i: ForecastInputs) => {
      i.central_assumptions = cAssumps.map((c) => ({
        ...c,
        central_price_increase_pct: 0,
        central_volume_increase_pct: 0,
        central_reduction_pct: 0,
        central_reduction_amount_tnok: 0,
        central_eur_nok_rate: 11.3,
        [field]: (c as any)[field] ?? 0,
      }));
      return i;
    };
    if (cAssumps.some((c) => Number(c.central_price_increase_pct) !== 0)) {
      const yearly = isolate(setCentral("central_price_increase_pct"));
      const last = cAssumps.find((c) => c.year === 2031);
      rows.push({
        key: "central:price",
        name: "Sentral prisvekst",
        type: "Sentral driver",
        details: `${(Number(last?.central_price_increase_pct ?? 0) * 100).toFixed(1)} % per år (EUR-basis)`,
        yearly,
        acc2031: yearly[2031],
      });
    }
    if (cAssumps.some((c) => Number(c.central_reduction_pct) !== 0)) {
      const yearly = isolate(setCentral("central_reduction_pct"));
      rows.push({
        key: "central:redpct",
        name: "Sentral reduksjon %",
        type: "Sentral driver",
        details: "Permanent multiplikativ reforhandling",
        yearly,
        acc2031: yearly[2031],
      });
    }
    if (cAssumps.some((c) => Number(c.central_reduction_amount_tnok ?? 0) !== 0)) {
      const yearly = isolate(setCentral("central_reduction_amount_tnok"));
      const firstYear = cAssumps
        .filter((c) => Number(c.central_reduction_amount_tnok ?? 0) !== 0)
        .map((c) => c.year)
        .sort((a, b) => a - b)[0];
      const annualAmt = cAssumps
        .filter((c) => Number(c.central_reduction_amount_tnok ?? 0) !== 0)
        .reduce((s, c) => s + Number(c.central_reduction_amount_tnok ?? 0), 0);
      rows.push({
        key: "central:redamt",
        name: "Sentral reduksjon tNOK",
        type: "Sentral driver",
        details: `Permanent fra ${firstYear ?? "—"}, ${formatNumberNO(annualAmt, 0)} tNOK/år`,
        yearly,
        acc2031: yearly[2031],
      });
    }
    if (cAssumps.some((c) => Number(c.central_eur_nok_rate ?? 11.3) !== 11.3)) {
      const yearly = isolate(setCentral("central_eur_nok_rate"));
      rows.push({
        key: "central:fx",
        name: "Sentral EUR/NOK-kurs",
        type: "Sentral driver",
        details: "Avvik fra default 11,3",
        yearly,
        acc2031: yearly[2031],
      });
    }

    // ---- Internal FTE-endringer ----
    for (const r of base.internal_fte_changes) {
      const net = (Number(r.increase) || 0) - (Number(r.decrease) || 0);
      if (net === 0) continue;
      const yearly = isolate((i) => {
        i.internal_fte_changes = base.internal_fte_changes.map((x) =>
          x.year === r.year && x.level === r.level
            ? { ...x, increase: Number(r.increase) || 0, decrease: Number(r.decrease) || 0 }
            : { ...x, increase: 0, decrease: 0 },
        );
        return i;
      });
      rows.push({
        key: `intfte:${r.year}:${r.level}`,
        name: `${net > 0 ? "+" : ""}${net} ${r.level} Intern FTE ${r.year}`,
        type: "Intern FTE-endring",
        details: `Increase=${r.increase}, Decrease=${r.decrease}`,
        yearly,
        acc2031: yearly[2031],
        comment: (r as any).comment ?? (r as any).comment_increase ?? (r as any).comment_decrease,
      });
    }

    // ---- External FTE-endringer ----
    for (const r of base.external_fte_changes) {
      const net = (Number(r.increase) || 0) - (Number(r.decrease) || 0);
      if (net === 0) continue;
      const yearly = isolate((i) => {
        i.external_fte_changes = base.external_fte_changes.map((x) =>
          x.year === r.year && x.level === r.level
            ? { ...x, increase: Number(r.increase) || 0, decrease: Number(r.decrease) || 0 }
            : { ...x, increase: 0, decrease: 0 },
        );
        return i;
      });
      rows.push({
        key: `extfte:${r.year}:${r.level}`,
        name: `${net > 0 ? "+" : ""}${net} ${r.level} Ekstern FTE ${r.year}`,
        type: "Ekstern FTE-endring",
        details: `Increase=${r.increase}, Decrease=${r.decrease}`,
        yearly,
        acc2031: yearly[2031],
        comment: (r as any).comment ?? (r as any).comment_increase ?? (r as any).comment_decrease,
      });
    }

    // ---- Konverteringer ----
    for (const r of base.conversions) {
      if (!Number(r.count)) continue;
      const yearly = isolate((i) => {
        i.conversions = [{ ...r }];
        return i;
      });
      rows.push({
        key: `conv:${r.year}:${r.external_level}:${r.internal_level}`,
        name: `${r.count} konv. ${r.external_level}→${r.internal_level} ${r.year}`,
        type: "Konvertering",
        details: `${r.overlap_months} mnd overlapp`,
        yearly,
        acc2031: yearly[2031],
        comment: (r as any).comment,
      });
    }

    // ---- Nearshoring-endringer ----
    for (const r of base.nearshoring_changes) {
      const net = (Number(r.increase) || 0) - (Number(r.decrease) || 0);
      if (net === 0) continue;
      const yearly = isolate((i) => {
        i.nearshoring_changes = base.nearshoring_changes.map((x) =>
          x.year === r.year
            ? { ...x, increase: Number(r.increase) || 0, decrease: Number(r.decrease) || 0 }
            : { ...x, increase: 0, decrease: 0 },
        );
        return i;
      });
      rows.push({
        key: `ns:${r.year}`,
        name: `${net > 0 ? "+" : ""}${net} Nearshoring ${r.year}`,
        type: "Nearshoring-endring",
        details: `Increase=${r.increase}, Decrease=${r.decrease}`,
        yearly,
        acc2031: yearly[2031],
        comment: (r as any).comment ?? (r as any).comment_increase ?? (r as any).comment_decrease,
      });
    }

    // ---- Kategori-justeringer (% og tNOK – én rad per (kategori, år, type)) ----
    for (const r of base.category_adjustments) {
      const pct = Number(r.adjustment_pct) || 0;
      const amt = Number((r as any).adjustment_amount_tnok ?? 0);
      if (pct !== 0) {
        const yearly = isolate((i) => {
          i.category_adjustments = base.category_adjustments.map((x) =>
            x.year === r.year && x.category === r.category
              ? { ...x, adjustment_pct: pct, adjustment_amount_tnok: 0 }
              : { ...x, adjustment_pct: 0, adjustment_amount_tnok: 0 },
          );
          return i;
        });
        rows.push({
          key: `cat:${r.category}:${r.year}:pct`,
          name: `${(pct * 100).toFixed(1)} % ${r.category} ${r.year}`,
          type: "Kategori-justering %",
          details: `Permanent fra ${r.year}`,
          yearly,
          acc2031: yearly[2031],
          comment: (r as any).comment,
        });
      }
      if (amt !== 0) {
        const yearly = isolate((i) => {
          i.category_adjustments = base.category_adjustments.map((x) =>
            x.year === r.year && x.category === r.category
              ? { ...x, adjustment_pct: 0, adjustment_amount_tnok: amt }
              : { ...x, adjustment_pct: 0, adjustment_amount_tnok: 0 },
          );
          return i;
        });
        rows.push({
          key: `cat:${r.category}:${r.year}:amt`,
          name: `${amt > 0 ? "+" : ""}${formatNumberNO(amt, 0)} tNOK ${r.category} ${r.year}`,
          type: "Kategori-justering tNOK",
          details: `Permanent fra ${r.year}`,
          yearly,
          acc2031: yearly[2031],
          comment: (r as any).comment_amount ?? (r as any).comment,
        });
      }
    }

    // ---- Capex-plan ----
    for (const r of base.capex_plan) {
      if (!Number(r.amount)) continue;
      const yearly = isolate((i) => {
        i.capex_plan = [{ ...r }];
        return i;
      });
      rows.push({
        key: `capex:${r.year}:${r.capex_type}:${(r as any).id ?? Math.random()}`,
        name: `Capex ${r.capex_type} ${r.year} (${formatNumberNO(Number(r.amount) / 1000, 1)} MNOK)`,
        type: "Capex-investering",
        details: r.description ?? "—",
        yearly,
        acc2031: yearly[2031],
        comment: (r as any).comment,
      });
    }

    // ---- Internal → Nearshoring konvertering ----
    for (const r of base.internal_to_nearshoring_conversions ?? []) {
      if (!Number(r.count)) continue;
      const yearly = isolate((i) => {
        i.internal_to_nearshoring_conversions = [{ ...r }];
        return i;
      });
      rows.push({
        key: `i2n:${r.year}:${r.internal_level}:${(r as any).id ?? Math.random()}`,
        name: `${r.count} ${r.internal_level} Intern→Nearshoring ${r.year}`,
        type: "Intern→Nearshoring",
        details: `${r.overlap_months ?? 3} mnd overlapp`,
        yearly,
        acc2031: yearly[2031],
        comment: (r as any).comment,
      });
    }

    // ---- Engangseffekter ----
    for (const r of base.one_off_effects ?? []) {
      if (!Number(r.amount_tnok)) continue;
      const yearly = isolate((i) => {
        i.one_off_effects = [{ ...r }];
        return i;
      });
      rows.push({
        key: `oneoff:${r.year}:${r.category}:${(r as any).id ?? Math.random()}`,
        name: `${r.description || "Engangseffekt"} (${r.category}) ${r.year}`,
        type: "Engangseffekt",
        details: `${formatNumberNO(Number(r.amount_tnok) / 1000, 1)} MNOK kun ${r.year}`,
        yearly,
        acc2031: yearly[2031],
        comment: (r as any).comment,
      });
    }

    // Sum-rad
    const sumYearly: Record<number, number> = {};
    for (const Y of FC_YEARS) sumYearly[Y] = rows.reduce((s, r) => s + (r.yearly[Y] ?? 0), 0);

    return {
      rows: rows.sort((a, b) => Math.abs(b.acc2031) - Math.abs(a.acc2031)),
      sumYearly,
      totalDiff,
    };
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

  const { rows, sumYearly, totalDiff } = calc;
  const matchPct =
    totalDiff[2031] !== 0 ? (sumYearly[2031] / totalDiff[2031]) * 100 : 0;

  return (
    <Card>
      <CardContent className="pt-6 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-base font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-primary" />
              Kontroll – isolert effekt per forutsetning
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Hver rad viser hva forutsetningen alene bidrar med på P&L-totalen,
              alt annet likt. Sum nederst skal tilnærmet matche modellens totale endring 2026 → 2031.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border">
          <table className="w-full text-xs">
            <thead className="bg-muted/60 sticky top-0">
              <tr>
                <th className="text-left font-medium px-3 py-2 min-w-[280px]">Forutsetning</th>
                <th className="text-left font-medium px-3 py-2">Type</th>
                <th className="text-left font-medium px-3 py-2 min-w-[180px]">Detaljer</th>
                {FC_YEARS.map((y) => (
                  <th key={y} className="text-right font-medium px-2 py-2 whitespace-nowrap">
                    {y}
                  </th>
                ))}
                <th className="text-right font-medium px-3 py-2 whitespace-nowrap bg-muted">
                  Akk. 2031
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-6 text-center text-muted-foreground">
                    Ingen forutsetninger satt for dette scenarioet.
                  </td>
                </tr>
              )}
              {rows.map((r, idx) => (
                <tr
                  key={r.key}
                  className={cn(idx % 2 === 1 ? "bg-muted/20" : "bg-card", "hover:bg-muted/40")}
                >
                  <td className="px-3 py-1.5">
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
                  <td className="px-3 py-1.5 text-muted-foreground">{r.type}</td>
                  <td className="px-3 py-1.5 text-muted-foreground">{r.details}</td>
                  {FC_YEARS.map((y) => (
                    <NumCell key={y} value={r.yearly[y]} />
                  ))}
                  <NumCell value={r.acc2031} bold />
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="font-semibold bg-muted/40 border-t-2 border-foreground/20">
                  <td className="px-3 py-2" colSpan={3}>
                    Sum isolerte effekter
                  </td>
                  {FC_YEARS.map((y) => (
                    <NumCell key={y} value={sumYearly[y]} bold />
                  ))}
                  <NumCell value={sumYearly[2031]} bold />
                </tr>
                <tr className="text-muted-foreground">
                  <td className="px-3 py-2" colSpan={3}>
                    Modellens totale endring (FC 2031 − baseline)
                  </td>
                  {FC_YEARS.map((y) => (
                    <NumCell key={y} value={totalDiff[y]} />
                  ))}
                  <NumCell value={totalDiff[2031]} />
                </tr>
                <tr className="text-xs text-muted-foreground">
                  <td className="px-3 py-1.5" colSpan={8}>
                    Sum/total-match: {formatNumberNO(matchPct, 1)} % – avvik skyldes interaksjon
                    mellom drivere (f.eks. lønnsvekst på FTE-endringer).
                  </td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        <p className="text-xs text-muted-foreground">
          Alle tall i MNOK (P&L-perspektiv). Positivt = økt kostnad, negativt = besparelse.
        </p>
      </CardContent>
    </Card>
  );
}

function NumCell({ value, bold }: { value: number; bold?: boolean }) {
  if (Math.abs(value) < 0.05) {
    return <td className={cn("px-2 py-1.5 text-right text-muted-foreground tabular-nums", bold && "font-bold")}>—</td>;
  }
  const negative = value < 0;
  return (
    <td
      className={cn(
        "px-2 py-1.5 text-right tabular-nums font-mono",
        bold && "font-bold",
        negative ? "text-[hsl(var(--positive))]" : "text-foreground",
      )}
    >
      {formatNumberNO(value, 1)}
    </td>
  );
}
