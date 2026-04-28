import { memo, useEffect, useMemo, useState } from "react";
import { ChevronDown, ChevronRight, Search, X, Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useForecast } from "@/hooks/useForecast";
import { useAllScenarios } from "@/hooks/useAllScenarios";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useActiveScenario } from "@/hooks/useActiveScenario";
import { formatUnit, type Unit } from "@/lib/format";
import { cn } from "@/lib/utils";
import { exportWorkbook } from "@/lib/excelExport";
import { ImportDialog } from "@/components/ImportDialog";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

type Scenario = { id: string; name: string; sort_order: number };

const FC_YEARS = [2027, 2028, 2029, 2030, 2031] as const;
const HISTORICAL_COLS = ["AC 2025", "BU 2026", "FC 2026"] as const;
const ALL_COLS = [...HISTORICAL_COLS, ...FC_YEARS.map((y) => `FC ${y}`)] as const;

const MONTHS_NO = ["Jan", "Feb", "Mar", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Des"];

export default function Scenario() {
  const settings = useAppSettings();
  const allScenarios = useAllScenarios();
  const [unit, setUnit] = useState<Unit>("tNOK");
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [scenarioId, setScenarioIdState] = useState<string | null>(null);
  const [storedScenario, setStoredScenario] = useActiveScenario();
  const setScenarioId = (id: string) => {
    setScenarioIdState(id);
    setStoredScenario(id);
  };
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    if (!allScenarios.scenarios.length || !scenarioId) {
      toast.error("Eksport ikke tilgjengelig");
      return;
    }
    setExporting(true);
    try {
      await new Promise((r) => setTimeout(r, 30));
      exportWorkbook({
        scenarios: allScenarios.scenarios,
        costCenterName: settings?.cost_center_name ?? "Kostnadssenter",
        focusedScenarioId: scenarioId,
      });
      toast.success("Excel-fil lastet ned");
    } catch (e: any) {
      toast.error("Eksport feilet", { description: e?.message ?? String(e) });
    } finally {
      setExporting(false);
    }
  };

  useEffect(() => {
    if (settings) setUnit(settings.default_unit);
  }, [settings]);

  useEffect(() => {
    supabase
      .from("scenarios")
      .select("id, name, sort_order")
      .eq("is_active", true)
      .order("sort_order")
      .then(({ data }) => {
        if (data) {
          setScenarios(data);
          if (!scenarioId && data.length) {
            const valid = storedScenario && data.some((s) => s.id === storedScenario);
            const initial = valid ? storedScenario! : data[0].id;
            setScenarioIdState(initial);
            if (!valid) setStoredScenario(initial);
          }
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { result, inputs, loading, error } = useForecast(scenarioId);

  // Bygg radmodell: én rad per cost_line + virtuelle rader fra resultatet
  const rows = useMemo(() => {
    if (!result || !inputs) return [];
    const byId = new Map(inputs.cost_lines.map((cl) => [cl.id, cl]));
    return result.lines.map((line) => {
      const cl = byId.get(line.line_id);
      const ac_2025 = cl?.ac_2025 ?? 0;
      const bu_2026 = cl ? (cl.bu_2026_monthly ?? []).reduce((a, b) => a + (Number(b) || 0), 0) : 0;
      const fc_2026 = line.base_2026;
      return {
        line_id: line.line_id,
        category: line.category,
        project: line.project,
        account: line.account,
        account_name: line.account_name,
        cost_type: line.cost_type,
        is_capex: line.is_capex,
        is_depreciation: line.is_depreciation,
        ac_2025,
        bu_2026,
        fc_2026,
        fc: line.amounts,
        breakdown: line.breakdown_source,
        monthly_2027: line.monthly_2027,
        bu_2026_monthly: cl?.bu_2026_monthly ?? [],
        fc_2026_monthly: cl?.fc_2026_monthly ?? [],
        source: line.source,
      };
    });
  }, [result, inputs]);

  const allCategories = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => set.add(r.category));
    return Array.from(set).sort();
  }, [rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (categoryFilter !== "all" && r.category !== categoryFilter) return false;
      if (typeFilter !== "all" && r.cost_type !== typeFilter) return false;
      if (search && !r.account_name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [rows, categoryFilter, typeFilter, search]);

  // Grupper per kategori
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filteredRows>();
    filteredRows.forEach((r) => {
      if (!map.has(r.category)) map.set(r.category, []);
      map.get(r.category)!.push(r);
    });
    return Array.from(map.entries())
      .map(([cat, lines]) => ({
        category: cat,
        lines: lines.sort((a, b) => (a.account ?? 0) - (b.account ?? 0)),
        totals: computeTotals(lines),
      }))
      .sort((a, b) => a.category.localeCompare(b.category, "nb-NO"));
  }, [filteredRows]);

  const grandTotals = useMemo(() => computeTotals(filteredRows), [filteredRows]);

  const selected = rows.find((r) => r.line_id === selectedLineId) ?? null;

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Scenario</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Rådata per kostnadslinje med beregnede prognoser 2027–2031.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">Enhet</span>
          <Select value={unit} onValueChange={(v) => setUnit(v as Unit)}>
            <SelectTrigger className="w-[110px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="NOK">NOK</SelectItem>
              <SelectItem value="tNOK">tNOK</SelectItem>
              <SelectItem value="MNOK">MNOK</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> Importer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExport}
            disabled={exporting || !scenarioId || allScenarios.loading}
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="h-4 w-4 mr-1.5" />
            )}
            Eksport Excel
          </Button>
        </div>
      </div>

      {/* Filtre */}
      <div className="flex flex-wrap items-center gap-3 p-3 rounded-lg border bg-card">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Scenario</span>
          <Select value={scenarioId ?? ""} onValueChange={setScenarioId}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue placeholder="Velg scenario" />
            </SelectTrigger>
            <SelectContent>
              {scenarios.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Kategori</span>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-[200px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle kategorier</SelectItem>
              {allCategories.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-muted-foreground">Type</span>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="w-[130px] h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Alle</SelectItem>
              <SelectItem value="Local">Local</SelectItem>
              <SelectItem value="Central">Sentral</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-[200px] max-w-md ml-auto">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Søk i kontonavn…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-9"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="p-3 rounded border border-destructive bg-destructive/10 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Tabell */}
      <div className="rounded-lg border bg-card overflow-hidden">
        <div className="overflow-x-auto max-h-[calc(100vh-320px)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur">
              <tr className="border-b">
                <th className="text-left font-medium px-3 py-2 w-[420px] min-w-[420px]">
                  Kategori / Konto
                </th>
                <th className="text-right font-medium px-3 py-2 w-[80px]">Type</th>
                {ALL_COLS.map((col, i) => {
                  const isFc = i >= 3;
                  return (
                    <th
                      key={col}
                      className={cn(
                        "text-right font-medium px-3 py-2 whitespace-nowrap min-w-[110px]",
                        isFc && "bg-muted",
                      )}
                    >
                      {col}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={11} className="p-6">
                    <div className="space-y-2">
                      {[...Array(5)].map((_, i) => (
                        <Skeleton key={i} className="h-8 w-full" />
                      ))}
                    </div>
                  </td>
                </tr>
              )}
              {!loading && grouped.length === 0 && (
                <tr>
                  <td colSpan={11} className="p-6 text-center text-muted-foreground">
                    Ingen rader matcher filtrene.
                  </td>
                </tr>
              )}
              {!loading &&
                grouped.map((g) => {
                  const isOpen = expanded[g.category] ?? false;
                  return (
                    <FragmentRow
                      key={g.category}
                      group={g}
                      isOpen={isOpen}
                      unit={unit}
                      onToggle={() =>
                        setExpanded((prev) => ({ ...prev, [g.category]: !isOpen }))
                      }
                      onSelect={(id) => setSelectedLineId(id)}
                    />
                  );
                })}
            </tbody>
            {!loading && grouped.length > 0 && (
              <tfoot className="sticky bottom-0 bg-card border-t-2 border-foreground/20">
                <tr className="font-semibold">
                  <td className="px-3 py-3">Grand Total</td>
                  <td className="px-3 py-3"></td>
                  {ALL_COLS.map((col, i) => {
                    const value = colValue(grandTotals, i);
                    return (
                      <td
                        key={col}
                        className={cn("px-3 py-3 text-right tabular-nums", i >= 3 && "bg-muted/50")}
                      >
                        <NumCell value={value} unit={unit} />
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      <div className="text-xs text-muted-foreground flex items-center gap-4">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-3 rounded bg-muted" />
          Beregnede kolonner
        </span>
        <span>· Negative tall vises i parentes og rødt</span>
        <span>· Null vises som —</span>
      </div>

      {/* Detalj-panel */}
      <Sheet open={!!selected} onOpenChange={(o) => !o && setSelectedLineId(null)}>
        <SheetContent className="w-[520px] sm:max-w-[520px] overflow-y-auto">
          {selected && (
            <>
              <SheetHeader>
                <SheetTitle className="text-base">
                  {selected.account ? `${selected.account} · ` : ""}
                  {selected.account_name}
                </SheetTitle>
                <SheetDescription className="flex items-center gap-2 flex-wrap">
                  <Badge variant="outline">{selected.category}</Badge>
                  <Badge variant="outline">{selected.project}</Badge>
                  <Badge variant={selected.cost_type === "Central" ? "default" : "secondary"}>
                    {selected.cost_type === "Central" ? "Sentral" : selected.cost_type}
                  </Badge>
                  {selected.source === "virtual" && <Badge>Virtuell</Badge>}
                </SheetDescription>
              </SheetHeader>

              <div className="mt-6 space-y-6 text-sm">
                <section>
                  <h3 className="font-semibold mb-2">Månedlig 2026 (FC)</h3>
                  <MonthlyGrid values={selected.fc_2026_monthly} unit={unit} />
                </section>

                <section>
                  <h3 className="font-semibold mb-2">Månedlig 2027 (beregnet)</h3>
                  <MonthlyGrid values={selected.monthly_2027} unit={unit} />
                </section>

                <section>
                  <h3 className="font-semibold mb-2">Beregningsforklaring</h3>
                  <div className="space-y-3">
                    {FC_YEARS.map((y) => (
                      <div key={y} className="rounded-md border p-3 bg-muted/30">
                        <div className="flex items-center justify-between mb-1">
                          <span className="font-medium">FC {y}</span>
                          <span className="font-mono tabular-nums">
                            <NumCell value={selected.fc[y] ?? 0} unit={unit} />
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground whitespace-pre-wrap">
                          {selected.breakdown[y] ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <ImportDialog open={importOpen} onOpenChange={setImportOpen} onImported={() => window.location.reload()} />
    </div>
  );
}

// ---- helpers ----

type Row = {
  ac_2025: number;
  bu_2026: number;
  fc_2026: number;
  fc: Record<number, number>;
};

function computeTotals(rows: Row[]) {
  const totals = {
    ac_2025: 0,
    bu_2026: 0,
    fc_2026: 0,
    fc: { 2027: 0, 2028: 0, 2029: 0, 2030: 0, 2031: 0 } as Record<number, number>,
  };
  rows.forEach((r) => {
    totals.ac_2025 += r.ac_2025;
    totals.bu_2026 += r.bu_2026;
    totals.fc_2026 += r.fc_2026;
    FC_YEARS.forEach((y) => {
      totals.fc[y] += r.fc[y] ?? 0;
    });
  });
  return totals;
}

function colValue(t: ReturnType<typeof computeTotals>, i: number): number {
  if (i === 0) return t.ac_2025;
  if (i === 1) return t.bu_2026;
  if (i === 2) return t.fc_2026;
  return t.fc[FC_YEARS[i - 3]] ?? 0;
}

function NumCell({ value, unit }: { value: number; unit: Unit }) {
  if (value === 0 || value === null || value === undefined || isNaN(value)) {
    return <span className="text-muted-foreground">—</span>;
  }
  const formatted = formatUnit(value, unit);
  return <span className={value < 0 ? "text-destructive" : ""}>{formatted}</span>;
}

function MonthlyGrid({ values, unit }: { values: number[]; unit: Unit }) {
  const arr = values?.length === 12 ? values : new Array(12).fill(0);
  return (
    <div className="grid grid-cols-6 gap-1 text-xs">
      {arr.map((v, i) => (
        <div key={i} className="rounded border bg-card px-2 py-1.5">
          <div className="text-muted-foreground text-[10px]">{MONTHS_NO[i]}</div>
          <div className="tabular-nums font-mono">
            <NumCell value={Number(v) || 0} unit={unit} />
          </div>
        </div>
      ))}
    </div>
  );
}

const FragmentRow = memo(function FragmentRow({
  group,
  isOpen,
  unit,
  onToggle,
  onSelect,
}: {
  group: ReturnType<typeof groupShape>;
  isOpen: boolean;
  unit: Unit;
  onToggle: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <>
      <tr
        className="border-b bg-secondary/40 hover:bg-secondary/70 cursor-pointer font-medium"
        onClick={onToggle}
      >
        <td className="px-3 py-2">
          <span className="inline-flex items-center gap-1.5">
            {isOpen ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
            {group.category}
            <span className="text-xs text-muted-foreground font-normal ml-1">
              ({group.lines.length})
            </span>
          </span>
        </td>
        <td className="px-3 py-2"></td>
        {ALL_COLS.map((col, i) => (
          <td
            key={col}
            className={cn(
              "px-3 py-2 text-right tabular-nums font-mono",
              i >= 3 && "bg-muted/40",
            )}
          >
            <NumCell value={colValue(group.totals, i)} unit={unit} />
          </td>
        ))}
      </tr>
      {isOpen &&
        group.lines.map((line) => (
          <tr
            key={line.line_id}
            className="border-b hover:bg-muted/40 cursor-pointer"
            onClick={() => onSelect(line.line_id)}
          >
            <td className="px-3 py-1.5 pl-10">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-mono w-12 shrink-0">
                  {line.account ?? ""}
                </span>
                <span className="truncate">{line.account_name}</span>
                <span className="text-[10px] text-muted-foreground ml-auto truncate">
                  {line.project}
                </span>
              </div>
            </td>
            <td className="px-3 py-1.5 text-right">
              <span
                className={cn(
                  "text-[10px] font-medium px-1.5 py-0.5 rounded",
                  line.cost_type === "Central"
                    ? "bg-primary/10 text-primary"
                    : "bg-muted text-muted-foreground",
                )}
              >
                {line.cost_type}
              </span>
            </td>
            {ALL_COLS.map((col, i) => {
              const value =
                i === 0 ? line.ac_2025
                  : i === 1 ? line.bu_2026
                  : i === 2 ? line.fc_2026
                  : line.fc[FC_YEARS[i - 3]] ?? 0;
              return (
                <td
                  key={col}
                  className={cn(
                    "px-3 py-1.5 text-right tabular-nums font-mono",
                    i >= 3 && "bg-muted/30",
                  )}
                >
                  <NumCell value={value} unit={unit} />
                </td>
              );
            })}
          </tr>
        ))}
    </>
  );
});

// Hjelpefunksjon kun for typing
function groupShape(): {
  category: string;
  lines: (Row & {
    line_id: string;
    category: string;
    project: string;
    account: number | null;
    account_name: string;
    cost_type: "Local" | "Central";
  })[];
  totals: ReturnType<typeof computeTotals>;
} {
  return null as never;
}
