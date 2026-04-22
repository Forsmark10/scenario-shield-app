import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useAllScenarios, type ScenarioBundle } from "@/hooks/useAllScenarios";
import { formatNumberNO } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Download } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type Mode = "absolute" | "delta";
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

export default function ScenarioComparison() {
  const { loading, error, scenarios } = useAllScenarios();
  const [mode, setMode] = useState<Mode>("absolute");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const { toast } = useToast();

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

  const cellValue = (b: ScenarioBundle, cat: string, project: string | null, y: number): number => {
    const v = value(b, cat, project, y);
    if (mode === "delta" && b.meta.id !== baseScenario.meta.id) {
      return v - value(baseScenario, cat, project, y);
    }
    return v;
  };

  const totalRow = (b: ScenarioBundle, y: number): number => {
    const v = scenarios.length
      ? tree.reduce((a, g) => a + value(b, g.category, null, y), 0)
      : 0;
    if (mode === "delta" && b.meta.id !== baseScenario.meta.id) {
      const baseV = tree.reduce((a, g) => a + value(baseScenario, g.category, null, y), 0);
      return v - baseV;
    }
    return v;
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scenario Comparison</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Pivot-tabell – tre scenarioer side ved side, alle tall i MNOK.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
            <TabsList className="h-9">
              <TabsTrigger value="absolute" className="text-xs px-3">Absolute</TabsTrigger>
              <TabsTrigger value="delta" className="text-xs px-3">Delta vs Steady</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button
            variant="outline"
            size="sm"
            disabled
            onClick={() => toast({ title: "Excel-eksport – kommer snart" })}
          >
            <Download className="h-4 w-4 mr-1.5" /> Eksport Excel
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-4">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-card z-10">
                <tr className="border-b">
                  <th className="sticky left-0 bg-card text-left font-medium px-3 py-2 z-20 min-w-[260px]">
                    Kategori / Project
                  </th>
                  {scenarios.map((b, i) => (
                    <th
                      key={b.meta.id}
                      colSpan={YEARS.length}
                      className={cn(
                        "text-center font-semibold px-2 py-2 border-l",
                        i === 0 && "text-[hsl(var(--scenario-steady))]",
                        i === 1 && "text-[hsl(var(--scenario-moderate))]",
                        i === 2 && "text-[hsl(var(--scenario-aggressive))]",
                      )}
                    >
                      {b.meta.name}
                      {mode === "delta" && i > 0 && <span className="text-muted-foreground font-normal ml-1">(Δ)</span>}
                    </th>
                  ))}
                </tr>
                <tr className="border-b bg-muted/40">
                  <th className="sticky left-0 bg-muted/40 px-3 py-1.5 z-20"></th>
                  {scenarios.map((b) =>
                    YEARS.map((y) => (
                      <th
                        key={`${b.meta.id}-${y}`}
                        className="text-right font-normal text-muted-foreground px-2 py-1.5 whitespace-nowrap"
                      >
                        {y}
                      </th>
                    )),
                  )}
                </tr>
              </thead>
              <tbody>
                {tree.map((g) => {
                  const open = expanded.has(g.category);
                  return (
                    <>
                      <tr
                        key={g.category}
                        className="border-b bg-secondary/40 hover:bg-secondary/70 cursor-pointer font-medium"
                        onClick={() => {
                          const next = new Set(expanded);
                          if (open) next.delete(g.category); else next.add(g.category);
                          setExpanded(next);
                        }}
                      >
                        <td className="sticky left-0 bg-secondary/40 px-3 py-1.5 z-10">
                          <span className="inline-flex items-center gap-1.5">
                            {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                            {g.category}
                          </span>
                        </td>
                        {scenarios.map((b) =>
                          YEARS.map((y) => {
                            const v = cellValue(b, g.category, null, y);
                            return <NumTd key={`${b.meta.id}-${g.category}-${y}`} value={v} delta={mode === "delta" && b.meta.id !== baseScenario.meta.id} />;
                          }),
                        )}
                      </tr>
                      {open &&
                        g.projects.map((proj) => (
                          <tr key={`${g.category}-${proj}`} className="border-b hover:bg-muted/30">
                            <td className="sticky left-0 bg-card px-3 py-1.5 pl-9 text-muted-foreground z-10">{proj}</td>
                            {scenarios.map((b) =>
                              YEARS.map((y) => {
                                const v = cellValue(b, g.category, proj, y);
                                return <NumTd key={`${b.meta.id}-${proj}-${y}`} value={v} delta={mode === "delta" && b.meta.id !== baseScenario.meta.id} />;
                              }),
                            )}
                          </tr>
                        ))}
                    </>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 font-semibold">
                  <td className="sticky left-0 bg-card px-3 py-2 z-10">Grand Total</td>
                  {scenarios.map((b) =>
                    YEARS.map((y) => {
                      const v = totalRow(b, y);
                      return <NumTd key={`total-${b.meta.id}-${y}`} value={v} delta={mode === "delta" && b.meta.id !== baseScenario.meta.id} bold />;
                    }),
                  )}
                </tr>
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        Alle tall i MNOK. Negative tall i parentes og rødt. — = null.
      </div>
    </div>
  );
}

function NumTd({ value: v, delta, bold }: { value: number; delta: boolean; bold?: boolean }) {
  const m = toM(v);
  if (m === 0) {
    return (
      <td className={cn("text-right tabular-nums px-2 py-1.5 font-mono text-muted-foreground", bold && "font-bold")}>
        —
      </td>
    );
  }
  const negative = m < 0;
  const formatted = formatNumberNO(m, 1);
  let cls = "";
  if (delta) {
    // For delta, negative = saving (good) shown green; positive = extra cost shown red
    cls = negative ? "text-[hsl(var(--positive))]" : "text-[hsl(var(--negative))]";
  } else if (negative) {
    cls = "text-destructive";
  }
  return (
    <td className={cn("text-right tabular-nums px-2 py-1.5 font-mono", cls, bold && "font-bold")}>{formatted}</td>
  );
}
