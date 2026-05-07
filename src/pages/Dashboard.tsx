import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { ExecutiveSummary } from "@/components/ExecutiveSummary";
import { WaterfallSection } from "@/components/WaterfallBridge";
import { cn } from "@/lib/utils";

type ViewMode = "PL" | "Spend";
type Breakdown = "Total" | "Stacked";
type TypeFilter = "all" | "Local" | "Central";
type ChartMode = "bars" | "waterfall";

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
    if (view === "Spend" && c.category === "Other operating income") return false;
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
    if (view === "Spend" && l.category === "Other operating income") return false;
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
    if (view === "Spend" && c.category === "Other operating income") return false;
    return true;
  });

  const lines = bundle.result.lines.filter((l) => {
    if (typeFilter !== "all" && l.cost_type !== typeFilter) return false;
    if (excludedCategories.has(l.category)) return false;
    if (view === "PL" && l.is_capex) return false;
    if (view === "Spend" && l.is_depreciation) return false;
    if (view === "Spend" && l.category === "Other operating income") return false;
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
  const [chartMode, setChartMode] = useState<ChartMode>("bars");
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
            <span className="text-xs font-medium text-muted-foreground">Diagram</span>
            <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as ChartMode)}>
              <TabsList className="h-8">
                <TabsTrigger value="bars" className="text-xs px-3">Stolpediagram</TabsTrigger>
                <TabsTrigger value="waterfall" className="text-xs px-3">Waterfall</TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
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
                <SelectItem value="Central">Sentral</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {breakdown === "Total" && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">Kategorier</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className="h-8 text-xs gap-1">
                    {(() => {
                      const included = allCategories.filter((c) => !excludedCats.has(c)).length;
                      const total = allCategories.length;
                      if (total === 0) return "Ingen kategorier";
                      if (included === total) return "Alle kategorier";
                      if (included === 0) return "Ingen valgt";
                      return `${included} av ${total} valgt`;
                    })()}
                    <ChevronDown className="h-3 w-3 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-64 p-2">
                  {(() => {
                    const allSelected = allCategories.length > 0 && allCategories.every((c) => !excludedCats.has(c));
                    const someSelected = allCategories.some((c) => !excludedCats.has(c));
                    return (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            if (allSelected) {
                              setExcludedCats(new Set(allCategories));
                            } else {
                              setExcludedCats(new Set());
                            }
                          }}
                          className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-accent text-sm"
                        >
                          <Checkbox
                            checked={allSelected ? true : someSelected ? "indeterminate" : false}
                            className="pointer-events-none"
                          />
                          <span className="font-medium">Velg alle</span>
                        </button>
                        <Separator className="my-1" />
                        <div className="max-h-72 overflow-y-auto">
                          {allCategories.map((c) => {
                            const active = !excludedCats.has(c);
                            return (
                              <button
                                key={c}
                                type="button"
                                onClick={() => {
                                  const next = new Set(excludedCats);
                                  if (active) next.add(c);
                                  else next.delete(c);
                                  setExcludedCats(next);
                                }}
                                className="flex items-center gap-2 w-full px-2 py-1.5 rounded hover:bg-accent text-sm text-left"
                              >
                                <Checkbox checked={active} className="pointer-events-none" />
                                <span>{c}</span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    );
                  })()}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>
      </div>

      {/* Executive Summary (above scenario sections) */}
      <ExecutiveSummary
        scenarios={scenarios}
        colors={SCENARIO_COLOR}
      />

      {/* Per-scenario sections */}
      {chartMode === "bars" &&
        (() => {
          // Felles y-akse-domain på tvers av scenarier — så like verdier
          // (AC 2025, BU 2026) får identisk bar-høyde i alle tre scenariene.
          let sharedMax = 0;
          for (const b of scenarios) {
            const t = computeYearTotals(b, view, typeFilter, excludedCats);
            const vals = [t.ac, t.bu, t.fc26, ...Object.values(t.fc)].map(toM);
            for (const v of vals) if (v > sharedMax) sharedMax = v;
          }
          // 8% headroom så verditall over høyeste bar får luft.
          const sharedBarMax = sharedMax > 0 ? sharedMax * 1.08 : 1;
          return scenarios.map((bundle, i) => (
            <ScenarioSection
              key={bundle.meta.id}
              bundle={bundle}
              color={SCENARIO_COLOR[i % SCENARIO_COLOR.length]}
              view={view}
              breakdown={breakdown}
              typeFilter={typeFilter}
              excludedCats={excludedCats}
              allCategories={allCategories}
              sharedBarMax={sharedBarMax}
            />
          ));
        })()}

      {/* Cost bridge (waterfall) per scenario */}
      {chartMode === "waterfall" && (
        <WaterfallSection scenarios={scenarios} view={view} scenarioColors={SCENARIO_COLOR} />
      )}
      {/* Comparison */}
      <ScenarioComparisonChart
        scenarios={scenarios}
        view={view}
        typeFilter={typeFilter}
        excludedCats={excludedCats}
      />

      {/* Savings */}
      <SavingsSection
        scenarios={scenarios}
        view={view}
        typeFilter={typeFilter}
        excludedCats={excludedCats}
        allCategories={allCategories}
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
  sharedBarMax,
}: {
  bundle: ScenarioBundle;
  color: string;
  view: ViewMode;
  breakdown: Breakdown;
  typeFilter: TypeFilter;
  excludedCats: Set<string>;
  allCategories: string[];
  sharedBarMax: number;
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
      <CardContent className="pt-4 pb-3">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-1.5">
          <h2 className="text-[13px] font-semibold tracking-tight" style={{ color }}>
            {bundle.meta.name}
          </h2>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-3">
          {/* Bars */}
          <div className="h-[210px] relative">
            {/* Section labels overlay — aligned to bar slots (8 equal columns) */}
            <div
              className="absolute top-0 left-0 right-0 grid pointer-events-none z-10 text-[11px] font-bold text-foreground uppercase tracking-wide"
              style={{ gridTemplateColumns: "repeat(8, 1fr)", paddingLeft: 5, paddingRight: 17 }}
            >
              <div className="text-center">Historisk</div>
              <div className="col-span-2 text-center">Baseline</div>
              <div className="col-span-5 text-center">Forecast</div>
            </div>
            {/* Dashed dividers — centered between AC2025|BU2026 and FC2026|FC2027 */}
            <div
              className="absolute inset-0 grid pointer-events-none z-[5]"
              style={{
                gridTemplateColumns: "repeat(8, 1fr)",
                paddingLeft: 0,
                paddingRight: 12,
                paddingTop: 36,
                paddingBottom: 26,
              }}
            >
              <div className="border-r-2 border-dashed" style={{ borderColor: DIVIDER_COLOR }} />
              <div />
              <div className="border-r-2 border-dashed" style={{ borderColor: DIVIDER_COLOR }} />
              <div /><div /><div /><div /><div />
            </div>
            <ResponsiveContainer width="100%" height="100%">
              {breakdown === "Total" ? (
                <BarChart data={barData} margin={{ top: 32, right: 12, bottom: 4, left: 0 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, sharedBarMax]} />
                  <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
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
                <BarChart data={stackedData} margin={{ top: 32, right: 12, bottom: 4, left: 0 }}>
                  <XAxis dataKey="year" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide domain={[0, sharedBarMax]} />
                  <Tooltip content={renderTooltip} cursor={{ fill: "hsl(var(--muted) / 0.4)" }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} iconSize={8} />
                  {stackedCats.map((cat) => (
                    <Bar key={cat} dataKey={cat} stackId="a" fill={colorForCategory(cat)}>
                      {cat === lastStackCat && (
                        <LabelList
                          dataKey={cat}
                          content={(props: any) => {
                            const { x, y, width, index } = props;
                            const total = Number(stackedData[index]?.__total ?? 0);
                            if (!total) return null;
                            return (
                              <text
                                x={Number(x) + Number(width) / 2}
                                y={Number(y) - 6}
                                textAnchor="middle"
                                style={{ fontSize: 10, fontWeight: 500, fill: "hsl(var(--foreground))" }}
                              >
                                {formatNumberNO(total, 0)}
                              </text>
                            );
                          }}
                        />
                      )}
                    </Bar>
                  ))}
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* YoY */}
          <div className="h-[210px] relative">
            <div className="flex items-center justify-between mb-0.5">
              <div className="text-[10px] text-muted-foreground uppercase tracking-wide">YoY-vekst %</div>
              <div
                className="text-[13px] font-bold tabular-nums"
                style={{
                  color,
                  backgroundColor: `${color}1a`,
                  padding: "2px 10px",
                  borderRadius: 6,
                }}
              >
                CAGR 2026–2031: {formatPercentNO(cagr * 100, 1)} %
              </div>
            </div>
            <ResponsiveContainer width="100%" height="92%">
              <ComposedChart data={yoyData} margin={{ top: 18, right: 24, bottom: 4, left: 16 }}>
                <defs>
                  <linearGradient id={`yoy-grad-${bundle.meta.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.06} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" vertical={false} />
                <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} padding={{ left: 12, right: 12 }} />
                <YAxis hide />
                <Tooltip
                  formatter={(v: number | null) => (v == null ? "" : `${formatPercentNO(v, 1)} %`)}
                />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke="none"
                  fill={`url(#yoy-grad-${bundle.meta.id})`}
                  isAnimationActive={false}
                  tooltipType="none"
                  legendType="none"
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={2.5}
                  connectNulls={false}
                  dot={(props: any) => {
                    const { cx, cy, payload, index } = props;
                    if (payload?.value == null) return <g key={`empty-${index}`} />;
                    return (
                      <circle
                        key={`dot-${index}`}
                        cx={cx}
                        cy={cy}
                        r={3.5}
                        fill="#ffffff"
                        stroke={color}
                        strokeWidth={2.5}
                      />
                    );
                  }}
                  activeDot={{ r: 5, fill: "#ffffff", stroke: color, strokeWidth: 2.5 }}
                >
                  <LabelList
                    dataKey="value"
                    position="top"
                    formatter={(v: number | null) => (v == null ? "" : formatPercentNO(v, 1))}
                    style={{ fontSize: 10, fill: "#64748b" }}
                  />
                </Line>
              </ComposedChart>
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

  const yDomain = useMemo<[number, number]>(() => {
    const vals: number[] = [];
    data.forEach((row) => {
      scenarios.forEach((b) => {
        const v = row[b.meta.name];
        if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
      });
    });
    if (vals.length === 0) return [0, 1];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || Math.abs(max) || 1;
    const pad = range * 0.1;
    const niceFloor = (v: number) => {
      const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(v) || 1)) - 1));
      return Math.floor(v / step) * step;
    };
    const niceCeil = (v: number) => {
      const step = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.abs(v) || 1)) - 1));
      return Math.ceil(v / step) * step;
    };
    return [niceFloor(min - pad), niceCeil(max + pad)];
  }, [data, scenarios]);

  return (
    <Card>
      <CardContent className="pt-5">
        <h2 className="text-[15px] font-medium tracking-tight mb-1">Scenario-sammenligning</h2>
        <p className="text-xs text-muted-foreground mb-3">Totalkostnad per år (MNOK)</p>
        <div className="h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} margin={{ top: 18, right: 28, bottom: 4, left: 8 }}>
              <defs>
                {scenarios.map((b, i) => {
                  const c = SCENARIO_COLOR[i % SCENARIO_COLOR.length];
                  return (
                    <linearGradient key={b.meta.id} id={`scen-grad-${b.meta.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={c} stopOpacity={0.06} />
                      <stop offset="100%" stopColor={c} stopOpacity={0} />
                    </linearGradient>
                  );
                })}
              </defs>
              <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                domain={yDomain}
                allowDataOverflow={false}
                tickCount={4}
                tickFormatter={(v) => formatNumberNO(v, 0)}
              />
              <Tooltip
                contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                formatter={(v: number) => `${formatNumberNO(v, 1)} MNOK`}
              />
              <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={10} />
              {scenarios.map((b, i) => {
                const c = SCENARIO_COLOR[i % SCENARIO_COLOR.length];
                return (
                  <Line
                    key={b.meta.id}
                    type="monotone"
                    dataKey={b.meta.name}
                    stroke={c}
                    strokeWidth={2.5}
                    dot={{ r: 3.5, fill: "#ffffff", stroke: c, strokeWidth: 2.5 }}
                    activeDot={{ r: 5.5, fill: "#ffffff", stroke: c, strokeWidth: 2.5 }}
                  />
                );
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2 italic">
          Y-aksen er tilpasset scenario-rangen for å tydeliggjøre forskjeller.
        </p>
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
      if (view === "Spend" && c.category === "Other operating income") return false;
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
        if (view === "Spend" && l.category === "Other operating income") return false;
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

// ----------------- Savings section -----------------

function computeScenarioYearByCategory(
  bundle: ScenarioBundle,
  view: ViewMode,
  typeFilter: TypeFilter,
  excludedCategories: Set<string>,
): Record<string, Record<number, number>> {
  const lines = bundle.result.lines.filter((l) => {
    if (typeFilter !== "all" && l.cost_type !== typeFilter) return false;
    if (excludedCategories.has(l.category)) return false;
    if (view === "PL" && l.is_capex) return false;
    if (view === "Spend" && l.is_depreciation) return false;
    if (view === "Spend" && l.category === "Other operating income") return false;
    return true;
  });
  const out: Record<string, Record<number, number>> = {};
  for (const l of lines) {
    if (!out[l.category]) out[l.category] = {};
    for (const y of FC_YEARS) {
      out[l.category][y] = (out[l.category][y] ?? 0) + (l.amounts[y] ?? 0);
    }
  }
  return out;
}

function SavingsSection({
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
  const steady = useMemo(() => {
    return (
      scenarios.find((s) => /steady/i.test(s.meta.name)) ??
      scenarios[0] ??
      null
    );
  }, [scenarios]);

  const others = useMemo(
    () => scenarios.filter((s) => s.meta.id !== steady?.meta.id),
    [scenarios, steady],
  );

  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const effectiveSelectedId = selectedScenarioId || others[0]?.meta.id || "";

  const savingsByScenarioYear = useMemo(() => {
    if (!steady) return {} as Record<string, Record<number, number>>;
    const steadyByCat = computeScenarioYearByCategory(steady, view, typeFilter, excludedCats);
    const result: Record<string, Record<number, number>> = {};
    for (const sc of others) {
      const scByCat = computeScenarioYearByCategory(sc, view, typeFilter, excludedCats);
      const yearMap: Record<number, number> = {};
      for (const y of FC_YEARS) {
        let savings = 0;
        const cats = new Set([...Object.keys(steadyByCat), ...Object.keys(scByCat)]);
        for (const cat of cats) {
          const a = steadyByCat[cat]?.[y] ?? 0;
          const b = scByCat[cat]?.[y] ?? 0;
          savings += a - b;
        }
        yearMap[y] = savings;
      }
      result[sc.meta.id] = yearMap;
    }
    return result;
  }, [steady, others, view, typeFilter, excludedCats]);

  const savingsByCategory = useMemo(() => {
    if (!steady) return {} as Record<string, Record<number, number>>;
    const sc = others.find((s) => s.meta.id === effectiveSelectedId);
    if (!sc) return {};
    const steadyByCat = computeScenarioYearByCategory(steady, view, typeFilter, excludedCats);
    const scByCat = computeScenarioYearByCategory(sc, view, typeFilter, excludedCats);
    const cats = new Set([...Object.keys(steadyByCat), ...Object.keys(scByCat)]);
    const result: Record<string, Record<number, number>> = {};
    for (const cat of cats) {
      const yearMap: Record<number, number> = {};
      for (const y of FC_YEARS) {
        const a = steadyByCat[cat]?.[y] ?? 0;
        const b = scByCat[cat]?.[y] ?? 0;
        yearMap[y] = a - b;
      }
      result[cat] = yearMap;
    }
    return result;
  }, [steady, others, effectiveSelectedId, view, typeFilter, excludedCats]);

  if (!steady || others.length === 0) return null;

  const lineData = FC_YEARS.map((y) => {
    const row: Record<string, number | string> = { year: `FC ${y}` };
    others.forEach((sc) => {
      row[sc.meta.name] = toM(savingsByScenarioYear[sc.meta.id]?.[y] ?? 0);
    });
    return row;
  });

  const stackedCats = sortByStackOrder(
    Object.keys(savingsByCategory).filter((c) => !excludedCats.has(c) && allCategories.includes(c)),
  );
  const stackedData = FC_YEARS.map((y) => {
    const row: Record<string, number | string> = { year: `FC ${y}` };
    stackedCats.forEach((c) => {
      row[c] = toM(savingsByCategory[c]?.[y] ?? 0);
    });
    return row;
  });

  const selectedScenario = others.find((s) => s.meta.id === effectiveSelectedId) ?? others[0];
  const sel2031 = toM(savingsByScenarioYear[selectedScenario.meta.id]?.[2031] ?? 0);
  const selCum = FC_YEARS.reduce(
    (a, y) => a + toM(savingsByScenarioYear[selectedScenario.meta.id]?.[y] ?? 0),
    0,
  );
  const catTotals: Array<{ cat: string; total: number }> = Object.entries(savingsByCategory).map(
    ([cat, yearMap]) => ({
      cat,
      total: FC_YEARS.reduce((a, y) => a + toM(yearMap[y] ?? 0), 0),
    }),
  );
  catTotals.sort((a, b) => b.total - a.total);
  const topCat = catTotals[0];

  const lineYDomain: [number | string, number | string] = (() => {
    const vals: number[] = [];
    lineData.forEach((row) => {
      others.forEach((sc) => {
        const v = row[sc.meta.name];
        if (typeof v === "number" && Number.isFinite(v)) vals.push(v);
      });
    });
    vals.push(0);
    if (vals.length === 0) return [0, "auto"];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    const range = max - min || Math.abs(max) || 1;
    const pad = range * 0.1;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  })();

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-baseline justify-between flex-wrap gap-2 mb-4">
          <div>
            <h2 className="text-[15px] font-medium tracking-tight">Besparelser</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Netto-effekt vs Steady State (positivt = besparelse)
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Scenario</span>
            <Select value={effectiveSelectedId} onValueChange={(v) => setSelectedScenarioId(v)}>
              <SelectTrigger className="h-8 w-[180px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {others.map((sc) => (
                  <SelectItem key={sc.meta.id} value={sc.meta.id}>{sc.meta.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Besparelse 2031</div>
            <div className={cn(
              "text-xl font-semibold tabular-nums mt-1",
              sel2031 >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive",
            )}>
              {formatNumberNO(sel2031, 1)} MNOK
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{selectedScenario.meta.name}</div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Akkumulert 2027–2031</div>
            <div className={cn(
              "text-xl font-semibold tabular-nums mt-1",
              selCum >= 0 ? "text-[hsl(var(--positive))]" : "text-destructive",
            )}>
              {formatNumberNO(selCum, 1)} MNOK
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Sum over hele perioden</div>
          </div>
          <div className="rounded-lg border bg-muted/20 p-3">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">Største besparelses-kategori</div>
            <div className="text-xl font-semibold tabular-nums mt-1 truncate">
              {topCat ? topCat.cat : "—"}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5 tabular-nums">
              {topCat ? `${formatNumberNO(topCat.total, 1)} MNOK akkumulert` : ""}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">Besparelser per år (MNOK)</div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData} margin={{ top: 16, right: 20, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="#e2e8f0" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#64748b" }}
                    axisLine={false}
                    tickLine={false}
                    domain={lineYDomain}
                    tickFormatter={(v) => formatNumberNO(v, 0)}
                  />
                  <Tooltip
                    contentStyle={{ borderRadius: 8, border: "1px solid #e2e8f0", fontSize: 12 }}
                    formatter={(v: number) => `${formatNumberNO(v, 1)} MNOK`}
                  />
                  <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" iconSize={10} />
                  {lineYDomain && typeof lineYDomain[0] === "number" && typeof lineYDomain[1] === "number" && lineYDomain[0] < 0 && lineYDomain[1] > 0 && (
                    <ReferenceLine y={0} stroke="#cbd5e1" strokeWidth={1} />
                  )}
                  {others.map((sc, i) => {
                    const idx = scenarios.findIndex((s) => s.meta.id === sc.meta.id);
                    const c = SCENARIO_COLOR[idx >= 0 ? idx : i + 1];
                    return (
                      <Line
                        key={sc.meta.id}
                        type="monotone"
                        dataKey={sc.meta.name}
                        stroke={c}
                        strokeWidth={2.5}
                        dot={{ r: 3.5, fill: "#ffffff", stroke: c, strokeWidth: 2.5 }}
                        activeDot={{ r: 5.5, fill: "#ffffff", stroke: c, strokeWidth: 2.5 }}
                      />
                    );
                  })}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-muted-foreground mb-2">
              Besparelser per kategori — {selectedScenario.meta.name}
            </div>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stackedData} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
                  <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v) => formatNumberNO(v, 0)}
                  />
                  <Tooltip formatter={(v: number, name: string) => [`${formatNumberNO(v, 1)} MNOK`, name]} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="square" iconSize={10} />
                  {stackedCats.map((c) => (
                    <Bar key={c} dataKey={c} stackId="savings" fill={colorForCategory(c)}>
                      {stackedData.map((row, idx) => {
                        const v = Number(row[c] ?? 0);
                        return (
                          <Cell
                            key={`${c}-${idx}`}
                            fill={colorForCategory(c)}
                            fillOpacity={v < 0 ? 0.4 : 1}
                          />
                        );
                      })}
                    </Bar>
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground mt-3 italic">
          Netto-effekter av konverteringer og nearshoring er aggregert: f.eks. besparelse fra fjernet ekstern
          minus kost av ny intern/nearshoring vises som én netto-besparelse. Negative verdier indikerer at nye
          investeringer/kostnader overstiger besparelsene i det året.
        </p>
      </CardContent>
    </Card>
  );
}
