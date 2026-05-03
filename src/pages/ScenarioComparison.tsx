import { Fragment, useEffect, useMemo, useState, type CSSProperties } from "react";
import { ChevronDown, ChevronRight, Download, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { useAllScenarios, type ScenarioBundle } from "@/hooks/useAllScenarios";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useActiveScenario } from "@/hooks/useActiveScenario";
import { formatNumberNO } from "@/lib/format";
import { exportWorkbook } from "@/lib/excelExport";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Mode = "absolute" | "delta";
type View = "all" | "single";
const YEARS = [2026, 2027, 2028, 2029, 2030, 2031];

// All amounts shown in MNOK
const toM = (v: number) => v / 1000;

function value(bundle: ScenarioBundle, category: string, project: string | null, year: number): number {
  if (year === 2026) {
    const cls = bundle.inputs.cost_lines.filter(
      (c) => c.category === category && (project ? c.project === project : true),
    );
    return cls.reduce((a, c) => a + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
  }
  const lines = bundle.result.lines.filter(
    (l) => l.category === category && (project ? l.project === project : true),
  );
  return lines.reduce((a, l) => a + (l.amounts[year] ?? 0), 0);
}

const SCENARIO_COLOR_VAR = [
  "hsl(var(--scenario-steady))",
  "hsl(var(--scenario-moderate))",
  "hsl(var(--scenario-aggressive))",
];

const LOCKED_BG = "bg-slate-100 dark:bg-slate-800/40";

export default function ScenarioComparison() {
  const { loading, error, scenarios } = useAllScenarios();
  const settings = useAppSettings();
  const [view, setView] = useState<View>("all");
  const [mode, setMode] = useState<Mode>("absolute");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [storedScenario, setStoredScenario] = useActiveScenario();
  const [singleId, setSingleId] = useState<string | null>(null);

  // Initialiser valgt enkelt-scenario fra lagret valg når data er klar.
  useEffect(() => {
    if (!scenarios.length) return;
    if (singleId && scenarios.some((s) => s.meta.id === singleId)) return;
    const valid = storedScenario && scenarios.some((s) => s.meta.id === storedScenario);
    const initial = valid ? storedScenario! : scenarios[0].meta.id;
    setSingleId(initial);
  }, [scenarios, storedScenario, singleId]);

  const handleExport = async () => {
    if (!scenarios.length) return;
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 30));
      exportWorkbook({
        scenarios,
        costCenterName: settings?.cost_center_name ?? "Kostnadssenter",
        focusedScenarioId: view === "single" ? singleId ?? undefined : undefined,
      });
      toast.success("Excel-fil lastet ned");
    } catch (e: any) {
      toast.error("Eksport feilet", { description: e?.message ?? String(e) });
    } finally {
      setExporting(false);
    }
  };

  const tree = useMemo(() => {
    const map = new Map<string, Set<string>>();
    scenarios.forEach((b) => {
      b.inputs.cost_lines.forEach((c) => {
        if (!map.has(c.category)) map.set(c.category, new Set());
        map.get(c.category)!.add(c.project);
      });
      b.result.lines
        .filter((l) => l.source === "virtual")
        .forEach((l) => {
          if (!map.has(l.category)) map.set(l.category, new Set());
          map.get(l.category)!.add(l.project);
        });
    });
    return Array.from(map.entries())
      .map(([cat, projs]) => ({ category: cat, projects: Array.from(projs).sort() }))
      .sort((a, b) => a.category.localeCompare(b.category, "nb-NO"));
  }, [scenarios]);

  if (loading) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <div className="p-3 rounded border border-destructive bg-destructive/10 text-sm text-destructive">{error}</div>
      </div>
    );
  }

  const baseScenario = scenarios[0]; // Steady State (sort_order = 0)

  // Hvilke scenarioer som vises i tabellen
  const displayedScenarios =
    view === "single"
      ? scenarios.filter((s) => s.meta.id === singleId)
      : scenarios;

  // Indeks i den fulle scenarios-listen for fargekoding
  const colorIndexFor = (id: string) => scenarios.findIndex((s) => s.meta.id === id);

  const cellValue = (b: ScenarioBundle, cat: string, project: string | null, y: number): number => {
    const v = value(b, cat, project, y);
    if (view === "all" && mode === "delta" && b.meta.id !== baseScenario.meta.id) {
      return v - value(baseScenario, cat, project, y);
    }
    return v;
  };

  const totalRow = (b: ScenarioBundle, y: number): number => {
    const v = scenarios.length
      ? tree.reduce((a, g) => a + value(b, g.category, null, y), 0)
      : 0;
    if (view === "all" && mode === "delta" && b.meta.id !== baseScenario.meta.id) {
      const baseV = tree.reduce((a, g) => a + value(baseScenario, g.category, null, y), 0);
      return v - baseV;
    }
    return v;
  };

  const isDeltaMode = view === "all" && mode === "delta";

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scenarioer</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pivot-tabell – alle tall i MNOK. FC 2026 er låst baseline.
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="h-9">
              <TabsTrigger value="all" className="text-xs px-3">Alle scenarioer</TabsTrigger>
              <TabsTrigger value="single" className="text-xs px-3">Enkelt scenario</TabsTrigger>
            </TabsList>
          </Tabs>

          {view === "single" && (
            <Select
              value={singleId ?? ""}
              onValueChange={(v) => {
                setSingleId(v);
                setStoredScenario(v);
              }}
            >
              <SelectTrigger className="w-[220px] h-9">
                <SelectValue placeholder="Velg scenario" />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((s) => (
                  <SelectItem key={s.meta.id} value={s.meta.id}>
                    {s.meta.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {view === "all" && (
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList className="h-9">
                <TabsTrigger value="absolute" className="text-xs px-3">Absolute</TabsTrigger>
                <TabsTrigger value="delta" className="text-xs px-3">Delta vs Steady</TabsTrigger>
              </TabsList>
            </Tabs>
          )}

          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting || loading}>
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            Eksport Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-[13px] border-separate border-spacing-0">
              <thead className="sticky top-0 bg-card z-10">
                {/* Topp-rad: scenario-navn med farget topplinje, separasjon mellom blokker */}
                <tr>
                  <th className="sticky left-0 bg-card text-left font-medium px-3 py-2.5 z-20 min-w-[260px] border-b">
                    Kategori / Project
                  </th>
                  {displayedScenarios.map((b, i) => {
                    const colorIdx = colorIndexFor(b.meta.id);
                    const sColor = SCENARIO_COLOR_VAR[colorIdx];
                    return (
                      <th
                        key={b.meta.id}
                        colSpan={YEARS.length}
                        className={cn(
                          "text-center px-2 py-3 border-b",
                          i > 0 && "border-l-4 border-l-border",
                        )}
                        style={{
                          borderTop: `3px solid ${sColor ?? "transparent"}`,
                          backgroundColor: sColor ? `color-mix(in srgb, ${sColor} 10%, transparent)` : undefined,
                        }}
                      >
                        <span
                          className="text-base font-bold tracking-tight"
                          style={{ color: sColor ?? undefined }}
                        >
                          {b.meta.name}
                        </span>
                        {isDeltaMode && b.meta.id !== baseScenario.meta.id && (
                          <span className="text-muted-foreground font-normal ml-1.5 text-xs">(Δ vs Steady)</span>
                        )}
                      </th>
                    );
                  })}
                </tr>
                {/* År-rad */}
                <tr className="bg-muted/40">
                  <th className="sticky left-0 bg-muted/40 px-3 py-2 z-20 border-b"></th>
                  {displayedScenarios.map((b, si) =>
                    YEARS.map((y, yi) => {
                      const isLocked = y === 2026;
                      return (
                        <th
                          key={`${b.meta.id}-${y}`}
                          className={cn(
                            "text-right font-medium text-muted-foreground px-2.5 py-2 whitespace-nowrap border-b text-[11.5px] uppercase tracking-wider",
                            si > 0 && yi === 0 && "border-l-4 border-l-border",
                            isLocked && LOCKED_BG,
                          )}
                        >
                          {isLocked ? (
                            <span className="inline-flex items-center gap-1 justify-end">
                              <Lock className="h-3 w-3 opacity-60" />
                              <span>{y}</span>
                            </span>
                          ) : (
                            y
                          )}
                        </th>
                      );
                    }),
                  )}
                </tr>
              </thead>
              <tbody>
                {tree.map((g, gIdx) => {
                  const open = expanded.has(g.category);
                  const zebra = gIdx % 2 === 1;
                  return (
                    <Fragment key={g.category}>
                      <tr
                        className={cn(
                          "hover:bg-secondary/70 cursor-pointer font-medium",
                          zebra ? "bg-secondary/50" : "bg-secondary/30",
                        )}
                        onClick={() => {
                          const next = new Set(expanded);
                          if (open) next.delete(g.category); else next.add(g.category);
                          setExpanded(next);
                        }}
                      >
                        <td
                          className={cn(
                            "sticky left-0 px-3 py-1.5 z-10 border-b",
                            zebra ? "bg-secondary/50" : "bg-secondary/30",
                          )}
                        >
                          <span className="inline-flex items-center gap-1.5">
                            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {g.category}
                          </span>
                        </td>
                        {displayedScenarios.map((b, si) =>
                          YEARS.map((y, yi) => {
                            const v = cellValue(b, g.category, null, y);
                            const isLocked = y === 2026;
                            return (
                              <NumTd
                                key={`${b.meta.id}-${g.category}-${y}`}
                                value={v}
                                delta={isDeltaMode && b.meta.id !== baseScenario.meta.id}
                                locked={isLocked}
                                separator={si > 0 && yi === 0}
                              />
                            );
                          }),
                        )}
                      </tr>
                      {open &&
                        g.projects.map((proj, pIdx) => {
                          const pZebra = pIdx % 2 === 1;
                          return (
                            <tr
                              key={`${g.category}-${proj}`}
                              className={cn(
                                "hover:bg-muted/40",
                                pZebra ? "bg-muted/20" : "bg-card",
                              )}
                            >
                              <td
                                className={cn(
                                  "sticky left-0 px-3 py-1.5 pl-9 text-muted-foreground z-10 border-b",
                                  pZebra ? "bg-muted/20" : "bg-card",
                                )}
                              >
                                {proj}
                              </td>
                              {displayedScenarios.map((b, si) =>
                                YEARS.map((y, yi) => {
                                  const v = cellValue(b, g.category, proj, y);
                                  const isLocked = y === 2026;
                                  return (
                                    <NumTd
                                      key={`${b.meta.id}-${proj}-${y}`}
                                      value={v}
                                      delta={isDeltaMode && b.meta.id !== baseScenario.meta.id}
                                      locked={isLocked}
                                      separator={si > 0 && yi === 0}
                                    />
                                  );
                                }),
                              )}
                            </tr>
                          );
                        })}
                    </Fragment>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="font-semibold">
                  <td className="sticky left-0 bg-card px-3 py-2 z-10 border-t-2 border-foreground/20">Grand Total</td>
                  {displayedScenarios.map((b, si) =>
                    YEARS.map((y, yi) => {
                      const v = totalRow(b, y);
                      const isLocked = y === 2026;
                      return (
                        <NumTd
                          key={`total-${b.meta.id}-${y}`}
                          value={v}
                          delta={isDeltaMode && b.meta.id !== baseScenario.meta.id}
                          bold
                          locked={isLocked}
                          separator={si > 0 && yi === 0}
                          topBorder
                        />
                      );
                    }),
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>Alle tall i MNOK. Negative tall i parentes og rødt. — = null.</span>
        <span className="inline-flex items-center gap-1">
          <Lock className="h-3 w-3 opacity-60" /> = låst FC 2026 baseline
        </span>
      </div>
    </div>
  );
}

function NumTd({
  value: v,
  delta,
  bold,
  locked,
  separator,
  topBorder,
}: {
  value: number;
  delta: boolean;
  bold?: boolean;
  locked?: boolean;
  separator?: boolean;
  topBorder?: boolean;
}) {
  const m = toM(v);
  const baseCls = cn(
    "text-right tabular-nums px-2.5 py-2 font-mono text-[13px] border-b transition-colors",
    bold && "font-bold",
    locked && LOCKED_BG,
    separator && "border-l-4 border-l-border",
    topBorder && "border-t-2 border-t-foreground/20",
  );
  if (m === 0) {
    return <td className={cn(baseCls, "text-muted-foreground")}>—</td>;
  }
  const negative = m < 0;
  const formatted = formatNumberNO(m, 1);
  let style: CSSProperties | undefined;
  if (delta) {
    style = { color: negative ? "rgba(22,163,74,0.85)" : "rgba(220,38,38,0.85)" };
  } else if (negative) {
    style = { color: "rgba(220,38,38,0.85)" };
  }
  return <td className={cn(baseCls)} style={style}>{formatted}</td>;
}
