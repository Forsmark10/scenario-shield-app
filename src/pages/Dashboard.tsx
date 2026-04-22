import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  LabelList,
} from "recharts";
import { ChevronDown } from "lucide-react";
import { useAllScenarios, type ScenarioBundle } from "@/hooks/useAllScenarios";
import { formatNumberNO, formatPercentNO } from "@/lib/format";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";

type ViewMode = "PL" | "Spend";
type Breakdown = "Total" | "Stacked";
type TypeFilter = "all" | "Local" | "Central";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031];

const YEAR_COLOR: Record<string, string> = {
  "AC 2025": "hsl(var(--year-ac-2025))",
  "BU 2026": "hsl(var(--year-bu-2026))",
  "FC 2026": "hsl(var(--year-fc-2026))",
  "FC 2027": "hsl(var(--year-fc-2027))",
  "FC 2028": "hsl(var(--year-fc-2028))",
  "FC 2029": "hsl(var(--year-fc-2029))",
  "FC 2030": "hsl(var(--year-fc-2030))",
  "FC 2031": "hsl(var(--year-fc-2031))",
};

const SCENARIO_COLOR = [
  "hsl(var(--scenario-steady))",
  "hsl(var(--scenario-moderate))",
  "hsl(var(--scenario-aggressive))",
];

// Blue palette mapping per category (darkest = largest, placed at bottom of stack)
const CATEGORY_COLOR_MAP: Record<string, string> = {
  "Internal FTE": "#042C53",
  "External FTE": "#0C447C",
  "IT Costs": "#185FA5",
  "Consultancy": "#378ADD",
  "Operations & Personnel-related": "#5DA3E5",
  "Depreciation": "#85B7EB",
  "Capex": "#B5D4F4",
  "Other operating income": "#D3D1C7",
};

// Stack ordering: darkest (largest) at bottom -> lightest at top
const CATEGORY_STACK_ORDER = [
  "Internal FTE",
  "External FTE",
  "IT Costs",
  "Consultancy",
  "Operations & Personnel-related",
  "Depreciation",
  "Capex",
  "Other operating income",
];

const CAT_FALLBACK = "#9CA3AF";
function colorForCategory(cat: string) {
  return CATEGORY_COLOR_MAP[cat] ?? CAT_FALLBACK;
}

// Sort categories so known ones follow stack order, unknown ones appended alphabetically
function sortByStackOrder(cats: string[]): string[] {
  const known = CATEGORY_STACK_ORDER.filter((c) => cats.includes(c));
  const unknown = cats.filter((c) => !CATEGORY_STACK_ORDER.includes(c)).sort();
  return [...known, ...unknown];
}

const DIVIDER_COLOR = "#888780";

// Convert tNOK -> MNOK
const toM = (v: number) => v / 1000;
const fmtM = (v: number) => formatNumberNO(toM(v), 1);

// Compute yearly total for a scenario subject to view + filters
function computeYearTotals(
  bundle: ScenarioBundle,
  view: ViewMode,
  typeFilter: TypeFilter,
  excludedCategories: Set<string>,
) {
  // Historical / baseline come from cost_lines (only Local + Central; never includes Capex except in Spend view)
  const cl = bundle.inputs.cost_lines;
  const filtCl = cl.filter((c) => {
    if (typeFilter !== "all" && c.cost_type !== typeFilter) return false;
    if (excludedCategories.has(c.category)) return false;
    if (view === "PL" && c.category === "Capex") return false;
    if (view === "Spend" && c.category === "Depreciation") return false;
    return true;
  });
  const ac = filtCl.reduce((a, c) => a + Number(c.ac_2025 || 0), 0);
  const bu = filtCl.reduce((a, c) => a + (c.bu_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
  const fc26 = filtCl.reduce((a, c) => a + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);

  // Forecast lines come from engine.lines (includes virtuals)
  const lines = bundle.result.lines.filter((l) => {
    if (typeFilter !== "all" && l.cost_type !== typeFilter) return false;
    if (excludedCategories.has(l.category)) return false;
    if (view === "PL" && l.is_capex) return false;
    if (view === "Spend" && l.is_depreciation) return false;
    return true;
  });

  const fcByYear: Record<number, number> = {};
  for (const y of FC_YEARS) {
    fcByYear[y] = lines.reduce((a, l) => a + (l.amounts[y] ?? 0), 0);
  }

  return { ac, bu, fc26, fc: fcByYear };
}

// Stacked: returns one row per year with category->value (in tNOK)
function computeStackedYearly(
  bundle: ScenarioBundle,
  view: ViewMode,
  typeFilter: TypeFilter,
  excludedCategories: Set<string>,
  categories: string[],
) {
  const cl = bundle.inputs.cost_lines.filter((c) => {
    if (typeFilter !== "all" && c.cost_type !== typeFilter) return false;
    if (excludedCategories.has(c.category)) return false;
    if (view === "PL" && c.category === "Capex") return false;
    if (view === "Spend" && c.category === "Depreciation") return false;
    return true;
  });

  const lines = bundle.result.lines.filter((l) => {
    if (typeFilter !== "all" && l.cost_type !== typeFilter) return false;
    if (excludedCategories.has(l.category)) return false;
    if (view === "PL" && l.is_capex) return false;
    if (view === "Spend" && l.is_depreciation) return false;
    return true;
  });

  const yearLabels = ["AC 2025", "BU 2026", "FC 2026", "FC 2027", "FC 2028", "FC 2029", "FC 2030", "FC 2031"];
  return yearLabels.map((label) => {
    const row: Record<string, number | string> = { year: label };
    categories.forEach((cat) => {
      let v = 0;
      if (label === "AC 2025") {
        v = cl.filter((c) => c.category === cat).reduce((a, c) => a + Number(c.ac_2025 || 0), 0);
      } else if (label === "BU 2026") {
        v = cl
          .filter((c) => c.category === cat)
          .reduce((a, c) => a + (c.bu_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
      } else if (label === "FC 2026") {
        v = cl
          .filter((c) => c.category === cat)
          .reduce((a, c) => a + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
      } else {
        const y = Number(label.replace("FC ", ""));
        v = lines.filter((l) => l.category === cat).reduce((a, l) => a + (l.amounts[y] ?? 0), 0);
      }
      row[cat] = v;
    });
    return row;
  });
}

export default function Dashboard() {
  const { loading, error, scenarios } = useAllScenarios();
  const [view, setView] = useState<ViewMode>("PL");
  const [breakdown, setBreakdown] = useState<Breakdown>("Total");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [excludedCats, setExcludedCats] = useState<Set<string>>(new Set());
  const [tableOpen, setTableOpen] = useState(false);

  // collect all categories across scenarios
  const allCategories = useMemo(() => {
    const set = new Set<string>();
    scenarios.forEach((s) => s.inputs.cost_lines.forEach((c) => set.add(c.category)));
    return Array.from(set).sort();
  }, [scenarios]);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-64 w-full" />
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

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Total kostnadsutvikling per scenario, alle tall i MNOK.</p>
      </div>

      {/* Filters */}
      <div className="sticky top-14 z-20 -mx-6 px-6 py-3 bg-background/95 backdrop-blur border-b">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Visning</span>
            <Tabs value={view} onValueChange={(v) => setView(v as ViewMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="PL" className="text-xs px-3">P&amp;L</TabsTrigger>
                <TabsTrigger value="Spend" className="text-xs px-3">Spend</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Breakdown</span>
            <Tabs value={breakdown} onValueChange={(v) => setBreakdown(v as Breakdown)}>
              <TabsList className="h-8">
                <TabsTrigger value="Total" className="text-xs px-3">Total</TabsTrigger>
                <TabsTrigger value="Stacked" className="text-xs px-3">Stacked</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Type</span>
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as TypeFilter)}>
              <SelectTrigger className="h-8 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle</SelectItem>
                <SelectItem value="Local">Local</SelectItem>
                <SelectItem value="Central">Central</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {breakdown === "Total" && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-muted-foreground">Kategorier</span>
              {allCategories.map((c) => {
                const active = !excludedCats.has(c);
                return (
                  <button
                    key={c}
                    onClick={() => {
                      const next = new Set(excludedCats);
                      if (active) next.add(c); else next.delete(c);
                      setExcludedCats(next);
                    }}
                    className={cn(
                      "text-xs px-2 py-1 rounded border transition-colors",
                      active ? "bg-primary text-primary-foreground border-primary" : "bg-muted text-muted-foreground border-border",
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Per-scenario sections */}
      {scenarios.map((bundle, i) => (
        <ScenarioSection
          key={bundle.meta.id}
          bundle={bundle}
          color={SCENARIO_COLOR[i % SCENARIO_COLOR.length]}
          view={view}
          breakdown={breakdown}
          typeFilter={typeFilter}
          excludedCats={excludedCats}
          allCategories={allCategories}
        />
      ))}

      {/* Comparison */}
      <ScenarioComparisonChart
        scenarios={scenarios}
        view={view}
        typeFilter={typeFilter}
        excludedCats={excludedCats}
      />

      {/* Detail table */}
      <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
        <Card>
          <CollapsibleTrigger asChild>
            <button className="w-full flex items-center justify-between px-6 py-4 text-left">
              <div>
                <h2 className="text-sm font-semibold">Detaljtabell</h2>
                <p className="text-xs text-muted-foreground mt-0.5">Pivot per kategori × år × scenario (MNOK)</p>
              </div>
              <ChevronDown className={cn("h-4 w-4 transition-transform", tableOpen && "rotate-180")} />
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <DetailTable
                scenarios={scenarios}
                view={view}
                typeFilter={typeFilter}
                excludedCats={excludedCats}
                allCategories={allCategories}
              />
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}

// ----------------- Sub components -----------------

function ScenarioSection({
  bundle,
  color,
  view,
  breakdown,
  typeFilter,
  excludedCats,
  allCategories,
}: {
  bundle: ScenarioBundle;
  color: string;
  view: ViewMode;
  breakdown: Breakdown;
  typeFilter: TypeFilter;
  excludedCats: Set<string>;
  allCategories: string[];
}) {
  const totals = useMemo(
    () => computeYearTotals(bundle, view, typeFilter, excludedCats),
    [bundle, view, typeFilter, excludedCats],
  );

  const total2031M = toM(totals.fc[2031] ?? 0);
  const cagr =
    totals.fc26 > 0 && totals.fc[2031] > 0
      ? Math.pow(totals.fc[2031] / totals.fc26, 1 / 5) - 1
      : 0;

  const barData = [
    { year: "AC 2025", value: toM(totals.ac) },
    { year: "BU 2026", value: toM(totals.bu) },
    { year: "FC 2026", value: toM(totals.fc26) },
    { year: "FC 2027", value: toM(totals.fc[2027] ?? 0) },
    { year: "FC 2028", value: toM(totals.fc[2028] ?? 0) },
    { year: "FC 2029", value: toM(totals.fc[2029] ?? 0) },
    { year: "FC 2030", value: toM(totals.fc[2030] ?? 0) },
    { year: "FC 2031", value: toM(totals.fc[2031] ?? 0) },
  ];

  const stackedCats = sortByStackOrder(allCategories.filter((c) => !excludedCats.has(c)));
  const stackedData = useMemo(
    () =>
      computeStackedYearly(bundle, view, typeFilter, excludedCats, stackedCats).map((r) => {
        const out: Record<string, number | string> = { year: r.year };
        let total = 0;
        stackedCats.forEach((c) => {
          const v = toM(Number(r[c] || 0));
          out[c] = v;
          total += v;
        });
        out.__total = total;
        return out;
      }),
    [bundle, view, typeFilter, excludedCats, stackedCats],
  );
  const lastStackCat = stackedCats[stackedCats.length - 1];

  // YoY data — exclude BU 2026 entirely (same year as FC 2026, no growth point)
  // Final x-axis: FC 2026 | FC 2027 | ... | FC 2031 (6 points, first = AC2025 → FC2026 growth)
  const yoySeq = [
    { year: "AC 2025", value: toM(totals.ac) },
    { year: "FC 2026", value: toM(totals.fc26) },
    { year: "FC 2027", value: toM(totals.fc[2027] ?? 0) },
    { year: "FC 2028", value: toM(totals.fc[2028] ?? 0) },
    { year: "FC 2029", value: toM(totals.fc[2029] ?? 0) },
    { year: "FC 2030", value: toM(totals.fc[2030] ?? 0) },
    { year: "FC 2031", value: toM(totals.fc[2031] ?? 0) },
  ];
  const yoyData = yoySeq.slice(1).map((s, i) => {
    const prev = yoySeq[i].value;
    return { year: s.year, value: prev !== 0 ? ((s.value - prev) / prev) * 100 : 0 };
  });

  // Custom tooltip handles both Total and Stacked
  const renderTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    if (breakdown === "Total") {
      const v = Number(payload[0]?.value ?? 0);
      return (
        <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md">
          <div className="font-semibold mb-1">{label}</div>
          <div className="tabular-nums">{formatNumberNO(v, 1)} MNOK</div>
        </div>
      );
    }
    const total = payload.reduce((a: number, p: any) => a + Number(p.value || 0), 0);
    return (
      <div className="rounded-md border bg-background px-3 py-2 text-xs shadow-md min-w-[220px]">
        <div className="font-semibold mb-1">{label}</div>
        <div className="space-y-0.5">
          {[...payload].reverse().map((p: any) => (
            <div key={p.dataKey} className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: p.color }} />
                {p.dataKey}
              </span>
              <span className="tabular-nums">{formatNumberNO(Number(p.value || 0), 1)}</span>
            </div>
          ))}
        </div>
        <div className="mt-1 pt-1 border-t flex items-center justify-between font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatNumberNO(total, 1)} MNOK</span>
        </div>
      </div>
    );
  };

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
          <h2 className="text-[15px] font-medium tracking-tight" style={{ color }}>
            {bundle.meta.name}
          </h2>
          <p className="text-xs text-muted-foreground">
            Totalkostnad 2031: <span className="font-medium text-foreground">{formatNumberNO(total2031M, 1)} MNOK</span>{" "}
            · CAGR 2026–2031:{" "}
            <span className={cn("font-medium", cagr < 0 ? "text-[hsl(var(--positive))]" : "text-foreground")}>
              {formatPercentNO(cagr * 100, 1)} %
            </span>
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-4">
          {/* Bars */}
          <div className="h-[280px] relative">
            <div className="absolute top-0 left-0 right-0 flex justify-around text-[11px] font-bold text-foreground uppercase tracking-wide pointer-events-none z-10">
              <span className="ml-4">Historisk</span>
              <span>Baseline</span>
              <span className="mr-4">Forecast</span>
            </div>
            <ResponsiveContainer width="100%" height="100%">
              {breakdown === "Total" ? (
                <BarChart data={barData} margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <ReferenceLine x="BU 2026" stroke={DIVIDER_COLOR} strokeWidth={2} strokeDasharray="5 4" />
                  <ReferenceLine x="FC 2027" stroke={DIVIDER_COLOR} strokeWidth={2} strokeDasharray="5 4" />
                  <Bar dataKey="value" radius={[3, 3, 0, 0]}>
                    {barData.map((d) => (
                      <Cell key={d.year} fill={YEAR_COLOR[d.year]} />
                    ))}
                    <LabelList
                      dataKey="value"
                      position="top"
                      formatter={(v: number) => formatNumberNO(v, 0)}
                      style={{ fontSize: 10, fontWeight: 500, fill: "hsl(var(--foreground))" }}
                    />
                  </Bar>
                </BarChart>
              ) : (
                <BarChart data={stackedData} margin={{ top: 28, right: 12, bottom: 4, left: 0 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <ReferenceLine x="BU 2026" stroke={DIVIDER_COLOR} strokeWidth={2} strokeDasharray="5 4" />
                  <ReferenceLine x="FC 2027" stroke={DIVIDER_COLOR} strokeWidth={2} strokeDasharray="5 4" />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                  {stackedCats.map((cat) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={colorForCategory(cat)} />
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* YoY */}
          <div className="h-[280px]">
            <div className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">YoY-vekst %</div>
            <ResponsiveContainer width="100%" height="92%">
              <LineChart data={yoyData} margin={{ top: 16, right: 16, bottom: 4, left: 0 }}>
                <XAxis dataKey="year" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number | null) => (v == null ? "" : `${formatPercentNO(v, 1)} %`)}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2}
                  connectNulls={false}
                  dot={(props: any) => {
                    const { cx, cy, payload, index } = props;
                    if (payload?.value == null) return <g key={`empty-${index}`} />;
                    return <circle key={`dot-${index}`} cx={cx} cy={cy} r={3} fill={color} />;
                  }}
                  activeDot={{ r: 5 }}
                >
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v: number | null) => (v == null ? "" : formatPercentNO(v, 1))}
                    style={{ fontSize: 10, fill: "hsl(var(--foreground))" }}
                  />
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioComparisonChart({
  scenarios,
  view,
  typeFilter,
  excludedCats,
}: {
  scenarios: ScenarioBundle[];
  view: ViewMode;
  typeFilter: TypeFilter;
  excludedCats: Set<string>;
}) {
  const data = useMemo(() => {
    const labels = ["AC 2025", "BU 2026", "FC 2026", "FC 2027", "FC 2028", "FC 2029", "FC 2030", "FC 2031"];
    return labels.map((label) => {
      const row: Record<string, number | string> = { year: label };
      scenarios.forEach((b) => {
        const t = computeYearTotals(b, view, typeFilter, excludedCats);
        let v = 0;
        if (label === "AC 2025") v = t.ac;
        else if (label === "BU 2026") v = t.bu;
        else if (label === "FC 2026") v = t.fc26;
        else v = t.fc[Number(label.replace("FC ", ""))] ?? 0;
        row[b.meta.name] = toM(v);
      });
      return row;
    });
  }, [scenarios, view, typeFilter, excludedCats]);

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-[15px] font-medium tracking-tight mb-1">Scenario-sammenligning</h2>
        <p className="text-xs text-muted-foreground mb-3">Totalkostnad per år (MNOK)</p>
        <div className="h-[320px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: 0 }}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => formatNumberNO(v, 0)} />
              <Tooltip formatter={(v: number) => `${formatNumberNO(v, 1)} MNOK`} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={10} />
              {scenarios.map((b, i) => (
                <Line
                  key={b.meta.id}
                  type="monotone"
                  dataKey={b.meta.name}
                  stroke={SCENARIO_COLOR[i % SCENARIO_COLOR.length]}
                  strokeWidth={2.5}
                  dot={{ r: 3 }}
                  activeDot={{ r: 5 }}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function DetailTable({
  scenarios,
  view,
  typeFilter,
  excludedCats,
  allCategories,
}: {
  scenarios: ScenarioBundle[];
  view: ViewMode;
  typeFilter: TypeFilter;
  excludedCats: Set<string>;
  allCategories: string[];
}) {
  const cats = allCategories.filter((c) => !excludedCats.has(c));
  const labels = ["AC 2025", "BU 2026", "FC 2026", "FC 2027", "FC 2028", "FC 2029", "FC 2030", "FC 2031"];

  function valueFor(b: ScenarioBundle, cat: string, label: string): number {
    const cl = b.inputs.cost_lines.filter((c) => {
      if (typeFilter !== "all" && c.cost_type !== typeFilter) return false;
      if (view === "PL" && c.category === "Capex") return false;
      if (view === "Spend" && c.category === "Depreciation") return false;
      return c.category === cat;
    });
    if (label === "AC 2025") return cl.reduce((a, c) => a + Number(c.ac_2025 || 0), 0);
    if (label === "BU 2026")
      return cl.reduce((a, c) => a + (c.bu_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
    if (label === "FC 2026")
      return cl.reduce((a, c) => a + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0), 0);
    const y = Number(label.replace("FC ", ""));
    return b.result.lines
      .filter((l) => {
        if (typeFilter !== "all" && l.cost_type !== typeFilter) return false;
        if (view === "PL" && l.is_capex) return false;
        if (view === "Spend" && l.is_depreciation) return false;
        return l.category === cat;
      })
      .reduce((a, l) => a + (l.amounts[y] ?? 0), 0);
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="sticky left-0 bg-card text-left font-medium px-3 py-2 z-10">Kategori</th>
            {scenarios.map((b) => (
              <th key={b.meta.id} colSpan={labels.length} className="text-center font-medium px-2 py-2 border-l">
                {b.meta.name}
              </th>
            ))}
          </tr>
          <tr className="border-b bg-muted/40">
            <th className="sticky left-0 bg-muted/40 px-3 py-1.5"></th>
            {scenarios.map((b) =>
              labels.map((l) => (
                <th key={`${b.meta.id}-${l}`} className="text-right font-normal text-muted-foreground px-2 py-1.5 whitespace-nowrap">
                  {l}
                </th>
              )),
            )}
          </tr>
        </thead>
        <tbody>
          {cats.map((cat) => (
            <tr key={cat} className="border-b hover:bg-muted/30">
              <td className="sticky left-0 bg-card px-3 py-1.5 font-medium">{cat}</td>
              {scenarios.map((b) =>
                labels.map((l) => {
                  const v = valueFor(b, cat, l);
                  return (
                    <td key={`${b.meta.id}-${cat}-${l}`} className="text-right tabular-nums px-2 py-1.5 font-mono">
                      {v === 0 ? <span className="text-muted-foreground">—</span> : fmtM(v)}
                    </td>
                  );
                }),
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 font-semibold">
            <td className="sticky left-0 bg-card px-3 py-2">Total</td>
            {scenarios.map((b) =>
              labels.map((l) => {
                const v = cats.reduce((a, c) => a + valueFor(b, c, l), 0);
                return (
                  <td key={`tot-${b.meta.id}-${l}`} className="text-right tabular-nums px-2 py-2 font-mono">
                    {fmtM(v)}
                  </td>
                );
              }),
            )}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
