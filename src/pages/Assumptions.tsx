import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, History, Plus, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { toast as sonnerToast } from "sonner";
import { InfoTip } from "@/components/InfoTip";
import { VersionHistoryPanel } from "@/components/VersionHistoryPanel";
import { GoalSeekPanel } from "@/components/GoalSeekPanel";
import { useAutoVersion } from "@/hooks/useAutoVersion";
import { useActiveScenario } from "@/hooks/useActiveScenario";
import { cn } from "@/lib/utils";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031];
const LEVELS = ["Low", "Medium", "High"] as const;
type Level = (typeof LEVELS)[number];

type Scenario = { id: string; name: string; sort_order: number };

interface AllData {
  scenarios: Scenario[];
  global: any[];
  central: any[];
  intRates: any[];
  extRates: any[];
  intChanges: any[];
  extChanges: any[];
  conversions: any[];
  nearshoringBase: any | null;
  nearshoringAdds: any[];
  catAdj: any[];
  capexPlan: any[];
  depRules: any[];
  categories: string[];
}

type TableKey =
  | "global"
  | "central"
  | "intRates"
  | "extRates"
  | "intChanges"
  | "extChanges"
  | "conversions"
  | "nearshoringBase"
  | "nearshoringAdds"
  | "catAdj"
  | "capexPlan";

type PatchAction =
  | { type: "upsert"; table: TableKey; row: any; matchBy?: (r: any) => boolean }
  | { type: "update"; table: TableKey; id: string; changes: Record<string, any> }
  | { type: "delete"; table: TableKey; id: string }
  | { type: "setSingleton"; table: "nearshoringBase"; row: any };

export type Patch = (action: PatchAction) => void;

export default function Assumptions() {
  const [data, setData] = useState<AllData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeScenario, setActiveScenarioState] = useState<string | null>(null);
  const [storedScenario, setStoredScenario] = useActiveScenario();
  const [reloadKey, setReloadKey] = useState(0);
  const [historyOpen, setHistoryOpen] = useState(false);
  const { toast } = useToast();
  const autoVersion = useAutoVersion();
  const initialFingerprint = useRef<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [
        sRes, gRes, cRes, irRes, erRes, icRes, ecRes, convRes, nbRes, naRes, caRes, capRes, drRes, clRes,
      ] = await Promise.all([
        supabase.from("scenarios").select("*").eq("is_active", true).order("sort_order"),
        supabase.from("global_assumptions").select("*"),
        supabase.from("central_assumptions").select("*"),
        supabase.from("internal_fte_base_rates").select("*"),
        supabase.from("external_fte_base_rates").select("*"),
        supabase.from("internal_fte_changes").select("*"),
        supabase.from("external_fte_changes").select("*"),
        supabase.from("conversions").select("*"),
        supabase.from("nearshoring_base").select("*").limit(1).maybeSingle(),
        supabase.from("nearshoring_additions").select("*"),
        supabase.from("category_adjustments").select("*"),
        supabase.from("capex_plan").select("*"),
        supabase.from("depreciation_rules").select("*"),
        supabase.from("cost_lines").select("category"),
      ]);
      if (cancelled) return;
      const cats = Array.from(new Set((clRes.data ?? []).map((r: any) => r.category))).sort() as string[];
      const next: AllData = {
        scenarios: sRes.data ?? [],
        global: gRes.data ?? [],
        central: cRes.data ?? [],
        intRates: irRes.data ?? [],
        extRates: erRes.data ?? [],
        intChanges: icRes.data ?? [],
        extChanges: ecRes.data ?? [],
        conversions: convRes.data ?? [],
        nearshoringBase: nbRes.data ?? null,
        nearshoringAdds: naRes.data ?? [],
        catAdj: caRes.data ?? [],
        capexPlan: capRes.data ?? [],
        depRules: drRes.data ?? [],
        categories: cats,
      };
      setData(next);
      if (!activeScenario && next.scenarios.length) {
        // Foretrekk lagret scenario hvis det fortsatt finnes blant aktive scenarier.
        const valid = storedScenario && next.scenarios.some((s) => s.id === storedScenario);
        const initial = valid ? storedScenario! : next.scenarios[0].id;
        setActiveScenarioState(initial);
        if (!valid) setStoredScenario(initial);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const setActiveScenario = useCallback(
    (id: string) => {
      setActiveScenarioState(id);
      setStoredScenario(id);
    },
    [setStoredScenario],
  );

  const patch = useCallback<Patch>((action) => {
    setData((prev) => {
      if (!prev) return prev;
      const next = { ...prev } as AllData;
      if (action.type === "setSingleton") {
        (next as any)[action.table] = action.row;
        return next;
      }
      const tbl = action.table;
      const arr = [...((prev as any)[tbl] as any[])];
      if (action.type === "upsert") {
        const matchFn = action.matchBy;
        const idx = matchFn
          ? arr.findIndex(matchFn)
          : arr.findIndex((r) => r.id === action.row.id);
        if (idx >= 0) arr[idx] = { ...arr[idx], ...action.row };
        else arr.push(action.row);
      } else if (action.type === "update") {
        const idx = arr.findIndex((r) => r.id === action.id);
        if (idx >= 0) arr[idx] = { ...arr[idx], ...action.changes };
      } else if (action.type === "delete") {
        const idx = arr.findIndex((r) => r.id === action.id);
        if (idx >= 0) arr.splice(idx, 1);
      }
      (next as any)[tbl] = arr;
      return next;
    });
    // Trigger auto-versjonering – debounced + 5-min vindu håndteres i hooken.
    const sid =
      (action as any).row?.scenario_id ??
      (action as any).changes?.scenario_id ??
      activeScenario;
    if (sid) autoVersion.trigger(sid);
  }, [autoVersion, activeScenario]);

  const refresh = useCallback(() => setReloadKey((k) => k + 1), []);

  if (loading || !data) {
    return (
      <div className="p-6 space-y-3">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assumptions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Globale drivere, FTE-endringer og capex-plan per scenario. Endringer lagres automatisk.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setHistoryOpen(true)}
          disabled={!activeScenario}
        >
          <History className="h-4 w-4 mr-2" />
          Historikk
        </Button>
      </div>

      <Tabs value={activeScenario ?? ""} onValueChange={setActiveScenario}>
        <TabsList>
          {data.scenarios.map((s) => (
            <TabsTrigger key={s.id} value={s.id} className="text-sm">
              {s.name}
            </TabsTrigger>
          ))}
        </TabsList>

        {data.scenarios.map((s) => (
          <TabsContent key={s.id} value={s.id} className="mt-4 space-y-4">
            <GoalSeekPanel
              scenarioId={s.id}
              scenarioName={s.name}
              categories={data.categories}
              onApplied={refresh}
            />
            <SectionGlobal data={data} scenario={s} patch={patch} />
            <SectionCentral data={data} scenario={s} patch={patch} />
            <SectionInternalFte data={data} scenario={s} patch={patch} />
            <SectionExternalFte data={data} scenario={s} patch={patch} />
            <SectionConversions data={data} scenario={s} patch={patch} />
            <SectionNearshoring data={data} scenario={s} patch={patch} />
            <SectionCategoryAdj data={data} scenario={s} patch={patch} />
            <SectionCapex data={data} scenario={s} patch={patch} />

            <div className="flex items-center justify-between pt-2">
              <p className="text-xs text-muted-foreground">Endringer lagres automatisk (debounce 500 ms).</p>
              <Button
                variant="outline"
                size="sm"
                disabled
                onClick={() => toast({ title: "Tilbakestill – kommer snart" })}
              >
                Tilbakestill til default-verdier
              </Button>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {activeScenario && (
        <VersionHistoryPanel
          open={historyOpen}
          onOpenChange={setHistoryOpen}
          scenarioId={activeScenario}
          scenarioName={data.scenarios.find((s) => s.id === activeScenario)?.name ?? ""}
          onRestored={() => {
            autoVersion.resetWindow(activeScenario);
            refresh();
          }}
        />
      )}
    </div>
  );
}

// ---------------------- Section wrapper ----------------------
function Section({
  title,
  description,
  children,
  defaultOpen = true,
  tooltip,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
  tooltip?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CollapsibleTrigger asChild>
          <button className="w-full flex items-center justify-between px-5 py-4 text-left">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-semibold">{title}</h2>
                {tooltip && (
                  <span onClick={(e) => e.stopPropagation()}>
                    <InfoTip text={tooltip} />
                  </span>
                )}
              </div>
              {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
            </div>
            <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0 pb-5">{children}</CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

// ---------------------- Debounced cell ----------------------
function NumCell({
  value,
  onCommit,
  suffix,
  step = "0.001",
  min,
  max,
  className,
  errorHint,
}: {
  value: number;
  onCommit: (v: number) => Promise<void> | void;
  suffix?: string;
  step?: string;
  min?: number;
  max?: number;
  className?: string;
  /** Vist under feltet hvis brukeren skriver en verdi utenfor min/max. */
  errorHint?: string;
}) {
  const [local, setLocal] = useState(String(value ?? 0));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timer = useRef<NodeJS.Timeout>();
  const inputRef = useRef<HTMLInputElement>(null);
  const isFocusedRef = useRef(false);
  const isDirtyRef = useRef(false);

  useEffect(() => {
    // Don't clobber user input while they're editing this cell.
    if (isFocusedRef.current || isDirtyRef.current) return;
    setLocal(String(value ?? 0));
  }, [value]);

  const validate = useCallback(
    (num: number): string | null => {
      if (min !== undefined && num < min) {
        return errorHint ?? `Verdien må være ≥ ${min}.`;
      }
      if (max !== undefined && num > max) {
        return errorHint ?? `Verdien må være ≤ ${max}.`;
      }
      return null;
    },
    [min, max, errorHint],
  );

  const commit = useCallback(
    (raw: string) => {
      const num = Number(raw.replace(",", "."));
      if (isNaN(num)) return;
      const err = validate(num);
      if (err) {
        setError(err);
        sonnerToast.error("Ugyldig verdi", { description: err, duration: 2500 });
        return;
      }
      setError(null);
      setSaving(true);
      Promise.resolve(onCommit(num))
        .then(() => {
          isDirtyRef.current = false;
          sonnerToast.success("Lagret", { duration: 1500, position: "bottom-right" });
        })
        .catch((err: any) => {
          sonnerToast.error("Lagring feilet", { description: err?.message ?? String(err) });
        })
        .finally(() => setSaving(false));
    },
    [onCommit, validate],
  );

  return (
    <div className={cn("relative", className)}>
      <Input
        ref={inputRef}
        type="number"
        step={step}
        min={min}
        max={max}
        value={local}
        onFocus={() => {
          isFocusedRef.current = true;
        }}
        onChange={(e) => {
          isDirtyRef.current = true;
          setLocal(e.target.value);
          // Live-validering for umiddelbar feedback
          const num = Number(e.target.value.replace(",", "."));
          if (!isNaN(num)) {
            const err = validate(num);
            setError(err);
          } else {
            setError(null);
          }
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => commit(e.target.value), 500);
        }}
        onBlur={() => {
          isFocusedRef.current = false;
          if (timer.current) clearTimeout(timer.current);
          if (isDirtyRef.current) commit(local);
        }}
        className={cn(
          "h-8 text-xs text-right tabular-nums font-mono",
          suffix && "pr-6",
          saving && "ring-1 ring-primary/30",
          error && "border-destructive ring-1 ring-destructive/40",
        )}
        aria-invalid={!!error}
      />
      {suffix && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground pointer-events-none">
          {suffix}
        </span>
      )}
      {error && (
        <p className="mt-0.5 text-[10px] leading-tight text-destructive whitespace-normal">
          {error}
        </p>
      )}
    </div>
  );
}

// ---------------------- 1. Global drivers ----------------------
function SectionGlobal({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const get = (year: number) =>
    data.global.find((g) => g.scenario_id === scenario.id && g.year === year) ?? null;

  const upsert = async (year: number, field: string, value: number) => {
    const existing = get(year);
    if (existing) {
      patch({ type: "update", table: "global", id: existing.id, changes: { [field]: value } });
      const { error } = await supabase
        .from("global_assumptions")
        .update({ [field]: value } as any)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const insertRow = {
        scenario_id: scenario.id,
        year,
        salary_increase_pct: 0.04,
        price_increase_pct: 0.05,
        eur_nok_rate: 11.5,
        [field]: value,
      };
      const { data: inserted, error } = await supabase
        .from("global_assumptions")
        .insert(insertRow as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "global", row: inserted });
    }
  };

  const drivers = [
    { key: "salary_increase_pct", label: "Lønnsvekst %", suffix: "%", scale: 100 },
    { key: "price_increase_pct", label: "Prisvekst %", suffix: "%", scale: 100 },
  ];

  return (
    <Section title="Globale drivere" description="Brukes på alle Local-kostnader (lønn og pris).">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left font-medium px-2 py-2 w-[180px]">Driver</th>
            {FC_YEARS.map((y) => (
              <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.key} className="border-b">
              <td className="px-2 py-2">{d.label}</td>
              {FC_YEARS.map((y) => {
                const row = get(y);
                const v = (row?.[d.key] ?? (d.key === "salary_increase_pct" ? 0.04 : 0.05)) * d.scale;
                return (
                  <td key={y} className="px-1 py-1">
                    <NumCell
                      value={Number(v.toFixed(d.scale === 100 ? 2 : 3))}
                      suffix={d.suffix}
                      onCommit={(num) => upsert(y, d.key, num / d.scale)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

// ---------------------- 2. Central drivers ----------------------
function SectionCentral({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const get = (year: number) =>
    data.central.find((g) => g.scenario_id === scenario.id && g.year === year) ?? null;

  const upsert = async (year: number, field: string, value: number) => {
    const existing = get(year);
    if (existing) {
      patch({ type: "update", table: "central", id: existing.id, changes: { [field]: value } });
      const { error } = await supabase.from("central_assumptions").update({ [field]: value } as any).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("central_assumptions")
        .insert({
          scenario_id: scenario.id,
          year,
          central_price_increase_pct: 0.03,
          central_volume_increase_pct: 0.02,
          central_reduction_pct: 0,
          [field]: value,
        } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "central", row: inserted });
    }
  };

  const drivers = [
    { key: "central_price_increase_pct", label: "Central pris %", default: 0.03 },
    { key: "central_volume_increase_pct", label: "Central volum %", default: 0.02 },
    { key: "central_reduction_pct", label: "Central reduksjon %", default: 0 },
  ];

  return (
    <Section
      title="Central drivere"
      description="Pris og volum vokser kumulativt år for år. Reduksjon representerer permanent reforhandling – satt i ett år gjelder den alle påfølgende år, og flere reduksjoner over år multipliseres sammen. Reduksjoner skrives som negative tall (f.eks. −5 for 5% rabatt)."
      tooltip="Pris og volum multipliseres år-for-år (kumulativt). Reduksjon er permanent reforhandling: satt i år Y gjelder den fom Y og alle påfølgende år, og flere reduksjoner multipliseres sammen. Konvensjon: skriv reduksjon som negativ verdi (−5 = 5% rabatt)."
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left font-medium px-2 py-2 w-[180px]">Driver</th>
            {FC_YEARS.map((y) => (
              <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => {
            const isReduction = d.key === "central_reduction_pct";
            return (
              <tr key={d.key} className="border-b">
                <td className="px-2 py-2">
                  <div className="flex items-center gap-1.5">
                    <span>{d.label}</span>
                    {isReduction && (
                      <InfoTip text="Skriv reduksjoner som negative tall. Eksempel: −5 betyr 5% permanent rabatt fra og med dette året." />
                    )}
                  </div>
                </td>
                {FC_YEARS.map((y) => {
                  const row = get(y);
                  const v = ((row?.[d.key] ?? d.default) * 100);
                  return (
                    <td key={y} className="px-1 py-1 align-top">
                      <NumCell
                        value={Number(v.toFixed(2))}
                        suffix="%"
                        max={isReduction ? 0 : undefined}
                        errorHint={
                          isReduction
                            ? "Reduksjon må være 0 eller negativ. Skriv −5 for 5% rabatt."
                            : undefined
                        }
                        onCommit={(num) => upsert(y, d.key, num / 100)}
                      />
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Section>
  );
}

// ---------------------- 3. Internal FTE ----------------------
function SectionInternalFte({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const rateFor = (level: Level) => data.intRates.find((r) => r.level === level);

  const updateRate = async (level: Level, value: number) => {
    const r = rateFor(level);
    if (r) {
      patch({ type: "update", table: "intRates", id: r.id, changes: { base_annual_cost: value } });
      const { error } = await supabase.from("internal_fte_base_rates").update({ base_annual_cost: value }).eq("id", r.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("internal_fte_base_rates")
        .insert({ level, base_annual_cost: value })
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "intRates", row: inserted });
    }
  };

  const getChange = (year: number, level: Level) =>
    data.intChanges.find((c) => c.scenario_id === scenario.id && c.year === year && c.level === level) ?? null;

  const upsertChange = async (year: number, level: Level, field: "increase" | "decrease", value: number) => {
    const existing = getChange(year, level);
    if (existing) {
      patch({ type: "update", table: "intChanges", id: existing.id, changes: { [field]: value } });
      const { error } = await supabase.from("internal_fte_changes").update({ [field]: value } as any).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("internal_fte_changes")
        .insert({ scenario_id: scenario.id, year, level, increase: 0, decrease: 0, [field]: value } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "intChanges", row: inserted });
    }
  };

  return (
    <Section title="Internal FTE" description="Lønnsnivåer (globalt) og scenario-spesifikke FTE-endringer.">
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Basisrater (tNOK/år)
          </h3>
          <table className="text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium px-2 py-2 w-[100px]">Nivå</th>
                <th className="text-right font-medium px-2 py-2 w-[160px]">Basisrate</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((lvl) => {
                const r = rateFor(lvl);
                return (
                  <tr key={lvl} className="border-b">
                    <td className="px-2 py-1.5">{lvl}</td>
                    <td className="px-1 py-1">
                      <NumCell
                        value={Number(r?.base_annual_cost ?? 0)}
                        step="1"
                        onCommit={(v) => updateRate(lvl, v)}
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            FTE-endringer per år
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium px-2 py-2">Nivå</th>
                <th className="text-left font-medium px-2 py-2">Type</th>
                {FC_YEARS.map((y) => (
                  <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.flatMap((lvl) =>
                (["increase", "decrease"] as const).map((type) => (
                  <tr key={`${lvl}-${type}`} className="border-b">
                    <td className="px-2 py-1.5">{lvl}</td>
                    <td className="px-2 py-1.5 capitalize text-muted-foreground">{type}</td>
                    {FC_YEARS.map((y) => {
                      const c = getChange(y, lvl);
                      const stored = Number(c?.[type] ?? 0);
                      // Decrease lagres som positivt antall i DB, men brukeren skal skrive negativt.
                      const display = type === "decrease" ? -stored : stored;
                      return (
                        <td key={y} className="px-1 py-1 align-top">
                          <NumCell
                            value={display}
                            step="1"
                            min={type === "increase" ? 0 : undefined}
                            max={type === "decrease" ? 0 : undefined}
                            errorHint={
                              type === "increase"
                                ? "Increase må være 0 eller positiv."
                                : "Decrease må være 0 eller negativ. Skriv −2 for to færre FTE."
                            }
                            onCommit={(v) => {
                              const stored = type === "decrease" ? Math.abs(Math.round(v)) : Math.round(v);
                              return upsertChange(y, lvl, type, stored);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

// ---------------------- 4. External FTE ----------------------
function SectionExternalFte({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const rateFor = (level: Level) => data.extRates.find((r) => r.level === level);

  const updateRate = async (level: Level, value: number) => {
    const r = rateFor(level);
    if (r) {
      patch({ type: "update", table: "extRates", id: r.id, changes: { base_monthly_cost: value } });
      const { error } = await supabase.from("external_fte_base_rates").update({ base_monthly_cost: value }).eq("id", r.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("external_fte_base_rates")
        .insert({ level, base_monthly_cost: value, working_months: 11 })
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "extRates", row: inserted });
    }
  };

  const getChange = (year: number, level: Level) =>
    data.extChanges.find((c) => c.scenario_id === scenario.id && c.year === year && c.level === level) ?? null;

  const upsertChange = async (year: number, level: Level, field: "increase" | "decrease", value: number) => {
    const existing = getChange(year, level);
    if (existing) {
      patch({ type: "update", table: "extChanges", id: existing.id, changes: { [field]: value } });
      const { error } = await supabase.from("external_fte_changes").update({ [field]: value } as any).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("external_fte_changes")
        .insert({ scenario_id: scenario.id, year, level, increase: 0, decrease: 0, [field]: value } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "extChanges", row: inserted });
    }
  };

  return (
    <Section title="External FTE" description="Månedskost-rater (globalt) og scenario-spesifikke endringer. 11 arbeidsmåneder per år (ingen juli).">
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Basisrater (tNOK/mnd)
          </h3>
          <table className="text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium px-2 py-2 w-[100px]">Nivå</th>
                <th className="text-right font-medium px-2 py-2 w-[160px]">Månedsrate</th>
              </tr>
            </thead>
            <tbody>
              {LEVELS.map((lvl) => {
                const r = rateFor(lvl);
                return (
                  <tr key={lvl} className="border-b">
                    <td className="px-2 py-1.5">{lvl}</td>
                    <td className="px-1 py-1">
                      <NumCell value={Number(r?.base_monthly_cost ?? 0)} step="1" onCommit={(v) => updateRate(lvl, v)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            FTE-endringer per år
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium px-2 py-2">Nivå</th>
                <th className="text-left font-medium px-2 py-2">Type</th>
                {FC_YEARS.map((y) => (
                  <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {LEVELS.flatMap((lvl) =>
                (["increase", "decrease"] as const).map((type) => (
                  <tr key={`${lvl}-${type}`} className="border-b">
                    <td className="px-2 py-1.5">{lvl}</td>
                    <td className="px-2 py-1.5 capitalize text-muted-foreground">{type}</td>
                    {FC_YEARS.map((y) => {
                      const c = getChange(y, lvl);
                      const stored = Number(c?.[type] ?? 0);
                      const display = type === "decrease" ? -stored : stored;
                      return (
                        <td key={y} className="px-1 py-1 align-top">
                          <NumCell
                            value={display}
                            step="1"
                            min={type === "increase" ? 0 : undefined}
                            max={type === "decrease" ? 0 : undefined}
                            errorHint={
                              type === "increase"
                                ? "Increase må være 0 eller positiv."
                                : "Decrease må være 0 eller negativ. Skriv −2 for to færre FTE."
                            }
                            onCommit={(v) => {
                              const stored = type === "decrease" ? Math.abs(Math.round(v)) : Math.round(v);
                              return upsertChange(y, lvl, type, stored);
                            }}
                          />
                        </td>
                      );
                    })}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

// ---------------------- 5. Conversions ----------------------
function SectionConversions({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const rows = data.conversions.filter((c) => c.scenario_id === scenario.id);

  const addRow = async () => {
    const { data: inserted, error } = await supabase
      .from("conversions")
      .insert({
        scenario_id: scenario.id,
        year: 2027,
        external_level: "Low",
        internal_level: "Low",
        count: 0,
        overlap_months: 3,
      })
      .select()
      .single();
    if (error) throw error;
    patch({ type: "upsert", table: "conversions", row: inserted });
  };

  const updateField = async (id: string, field: string, value: any) => {
    patch({ type: "update", table: "conversions", id, changes: { [field]: value } });
    const { error } = await supabase.from("conversions").update({ [field]: value } as any).eq("id", id);
    if (error) throw error;
  };

  const remove = async (id: string) => {
    patch({ type: "delete", table: "conversions", id });
    const { error } = await supabase.from("conversions").delete().eq("id", id);
    if (error) throw error;
  };

  return (
    <Section
      title="Ekstern → Intern konvertering"
      description="Overlapp er 3 måneder (fast)."
      tooltip="Konverterer en ekstern konsulent til intern ansatt. I overlappsperioden (3 mnd standard) regnes begge kostnader. Etter overlapp inngår ny intern i lønnsbasis."
    >
      <div className="space-y-3">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left font-medium px-2 py-2 w-[80px]">År</th>
              <th className="text-left font-medium px-2 py-2 w-[120px]">Ekstern-nivå</th>
              <th className="text-right font-medium px-2 py-2 w-[100px]">Antall</th>
              <th className="text-left font-medium px-2 py-2 w-[120px]">→ Intern-nivå</th>
              <th className="w-[40px]"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={5} className="text-center text-muted-foreground px-2 py-4">Ingen konverteringer ennå.</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="px-1 py-1">
                  <Select value={String(r.year)} onValueChange={(v) => updateField(r.id, "year", Number(v))}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {FC_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-1">
                  <Select value={r.external_level} onValueChange={(v) => updateField(r.id, "external_level", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-1">
                  <NumCell value={Number(r.count)} step="1" min={0} errorHint="Antall må være 0 eller positivt." onCommit={(v) => updateField(r.id, "count", Math.max(0, Math.round(v)))} />
                </td>
                <td className="px-1 py-1">
                  <Select value={r.internal_level} onValueChange={(v) => updateField(r.id, "internal_level", v)}>
                    <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                  </Select>
                </td>
                <td className="px-1 py-1 text-center">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(r.id)}>
                    <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <Button variant="outline" size="sm" onClick={addRow}><Plus className="h-3.5 w-3.5 mr-1" /> Legg til konvertering</Button>
      </div>
    </Section>
  );
}

// ---------------------- 6. Nearshoring ----------------------
function SectionNearshoring({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const base = data.nearshoringBase;
  const adds = data.nearshoringAdds.filter((n) => n.scenario_id === scenario.id);

  const getGlobal = (year: number) =>
    data.global.find((g) => g.scenario_id === scenario.id && g.year === year) ?? null;

  const upsertFx = async (year: number, value: number) => {
    const existing = getGlobal(year);
    if (existing) {
      patch({ type: "update", table: "global", id: existing.id, changes: { eur_nok_rate: value } });
      const { error } = await supabase
        .from("global_assumptions")
        .update({ eur_nok_rate: value } as any)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("global_assumptions")
        .insert({
          scenario_id: scenario.id,
          year,
          salary_increase_pct: 0.04,
          price_increase_pct: 0.05,
          eur_nok_rate: value,
        } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "global", row: inserted });
    }
  };

  const updateBase = async (field: string, value: number) => {
    if (base) {
      patch({ type: "setSingleton", table: "nearshoringBase", row: { ...base, [field]: value } });
      const { error } = await supabase.from("nearshoring_base").update({ [field]: value } as any).eq("id", base.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("nearshoring_base")
        .insert({ base_annual_cost_eur: 75000, working_months: 12, [field]: value } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "setSingleton", table: "nearshoringBase", row: inserted });
    }
  };

  const addRow = async () => {
    const { data: inserted, error } = await supabase
      .from("nearshoring_additions")
      .insert({
        scenario_id: scenario.id,
        year: 2027,
        replaces_external_level: "Low",
        count: 0,
        overlap_months: 3,
      })
      .select()
      .single();
    if (error) throw error;
    patch({ type: "upsert", table: "nearshoringAdds", row: inserted });
  };

  const updateField = async (id: string, field: string, value: any) => {
    patch({ type: "update", table: "nearshoringAdds", id, changes: { [field]: value } });
    const { error } = await supabase.from("nearshoring_additions").update({ [field]: value } as any).eq("id", id);
    if (error) throw error;
  };

  const remove = async (id: string) => {
    patch({ type: "delete", table: "nearshoringAdds", id });
    const { error } = await supabase.from("nearshoring_additions").delete().eq("id", id);
    if (error) throw error;
  };

  return (
    <Section
      title="Nearshoring"
      description="Faktureres i EUR per år, konverteres med EUR/NOK-kurs per år."
      tooltip="Nearshoring-ressurser erstatter eksterne. Kostnaden er i EUR og konverteres med EUR/NOK-kursen for det aktuelle året. Overlapp gir doble kostnader i innfasingsperioden."
    >
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Basiskost (globalt)</h3>
          <div className="flex items-center gap-3">
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Årskost (EUR)</label>
              <NumCell
                value={Number(base?.base_annual_cost_eur ?? 75000)}
                step="100"
                className="w-[160px]"
                onCommit={(v) => updateBase("base_annual_cost_eur", v)}
              />
            </div>
            <div className="space-y-1">
              <label className="text-[11px] text-muted-foreground">Arbeidsmåneder</label>
              <NumCell
                value={Number(base?.working_months ?? 12)}
                step="1"
                className="w-[100px]"
                onCommit={(v) => updateBase("working_months", Math.round(v))}
              />
            </div>
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            EUR/NOK-kurs per år
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                {FC_YEARS.map((y) => (
                  <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {FC_YEARS.map((y) => {
                  const row = getGlobal(y);
                  const v = Number(row?.eur_nok_rate ?? 11.5);
                  return (
                    <td key={y} className="px-1 py-1">
                      <NumCell
                        value={Number(v.toFixed(3))}
                        step="0.01"
                        min={0}
                        errorHint="Valutakurs må være ≥ 0."
                        onCommit={(num) => upsertFx(y, num)}
                      />
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Nye nearshoring-ressurser per år
          </h3>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium px-2 py-2 w-[80px]">År</th>
                <th className="text-left font-medium px-2 py-2 w-[200px]">Erstatter ekstern-nivå</th>
                <th className="text-right font-medium px-2 py-2 w-[100px]">Antall</th>
                <th className="w-[40px]"></th>
              </tr>
            </thead>
            <tbody>
              {adds.length === 0 && (
                <tr><td colSpan={4} className="text-center text-muted-foreground px-2 py-4">Ingen nearshoring-tillegg ennå.</td></tr>
              )}
              {adds.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="px-1 py-1">
                    <Select value={String(r.year)} onValueChange={(v) => updateField(r.id, "year", Number(v))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {FC_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="px-1 py-1">
                    <Select value={r.replaces_external_level} onValueChange={(v) => updateField(r.id, "replaces_external_level", v)}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>{LEVELS.map((l) => <SelectItem key={l} value={l}>{l}</SelectItem>)}</SelectContent>
                    </Select>
                  </td>
                  <td className="px-1 py-1">
                    <NumCell value={Number(r.count)} step="1" min={0} errorHint="Antall må være 0 eller positivt." onCommit={(v) => updateField(r.id, "count", Math.max(0, Math.round(v)))} />
                  </td>
                  <td className="px-1 py-1 text-center">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(r.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="outline" size="sm" className="mt-2" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Legg til ressurs
          </Button>
        </div>
      </div>
    </Section>
  );
}

// ---------------------- 7. Category adjustments ----------------------
function SectionCategoryAdj({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const get = (cat: string, year: number) =>
    data.catAdj.find((a) => a.scenario_id === scenario.id && a.category === cat && a.year === year);

  const upsert = async (cat: string, year: number, value: number) => {
    const r = get(cat, year);
    if (r) {
      patch({ type: "update", table: "catAdj", id: r.id, changes: { adjustment_pct: value } });
      const { error } = await supabase.from("category_adjustments").update({ adjustment_pct: value }).eq("id", r.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("category_adjustments")
        .insert({ scenario_id: scenario.id, category: cat, year, adjustment_pct: value })
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "catAdj", row: inserted });
    }
  };

  return (
    <Section
      title="Kategori-justeringer"
      description="Justering legges på toppen av prisvekst og representerer permanent reforhandling – satt i ett år gjelder den alle påfølgende år, og flere justeringer over år multipliseres sammen. Positive verdier (for eksempel +5%) reverserer tidligere reduksjoner. Gjelder kun Local-kostnader. Range -50% til +50%."
      tooltip="Justering legges på toppen av prisvekst og representerer permanent reforhandling – satt i ett år gjelder den alle påfølgende år, og flere justeringer over år multipliseres sammen. Positive verdier (for eksempel +5%) reverserer tidligere reduksjoner. Gjelder kun Local-kostnader. Range -50% til +50%."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b">
              <th className="text-left font-medium px-2 py-2 w-[180px]">Kategori</th>
              {FC_YEARS.map((y) => (
                <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.categories.map((cat) => (
              <tr key={cat} className="border-b">
                <td className="px-2 py-1.5">{cat}</td>
                {FC_YEARS.map((y) => {
                  const row = get(cat, y);
                  const v = Number((row?.adjustment_pct ?? 0)) * 100;
                  return (
                    <td key={y} className="px-1 py-1">
                      <NumCell
                        value={Number(v.toFixed(2))}
                        suffix="%"
                        min={-50}
                        max={50}
                        onCommit={(num) => upsert(cat, y, num / 100)}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

// ---------------------- 8. Capex plan ----------------------
function SectionCapex({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const types = ["Hardware", "Software", "Prosjekt"] as const;
  const rows = data.capexPlan.filter((c) => c.scenario_id === scenario.id);

  // Aggregated view: sum per type+year
  const aggSum = (type: string, year: number) =>
    rows.filter((r) => r.capex_type === type && r.year === year).reduce((a, r) => a + Number(r.amount || 0), 0);

  // For aggregated edit: when no detailed rows exist, treat as a single placeholder; otherwise show readonly with link to detail
  const aggregatedLine = useMemo(() => {
    const map = new Map<string, any>();
    types.forEach((t) =>
      FC_YEARS.forEach((y) => {
        const matches = rows.filter((r) => r.capex_type === t && r.year === y);
        // If there's exactly one row with no description, treat as the bucket
        const bucket = matches.find((m) => !m.description);
        map.set(`${t}-${y}`, bucket ?? null);
      }),
    );
    return map;
  }, [rows]);

  const upsertAggregated = async (type: string, year: number, value: number) => {
    const existing = aggregatedLine.get(`${type}-${year}`);
    if (existing) {
      if (value === 0) {
        patch({ type: "delete", table: "capexPlan", id: existing.id });
        const { error } = await supabase.from("capex_plan").delete().eq("id", existing.id);
        if (error) throw error;
      } else {
        patch({ type: "update", table: "capexPlan", id: existing.id, changes: { amount: value } });
        const { error } = await supabase.from("capex_plan").update({ amount: value }).eq("id", existing.id);
        if (error) throw error;
      }
    } else if (value !== 0) {
      const { data: inserted, error } = await supabase
        .from("capex_plan")
        .insert({
          scenario_id: scenario.id,
          capex_type: type,
          year,
          amount: value,
          description: null,
        })
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "capexPlan", row: inserted });
    }
  };

  const updateDetailField = async (id: string, field: string, value: any) => {
    patch({ type: "update", table: "capexPlan", id, changes: { [field]: value } });
    const { error } = await supabase.from("capex_plan").update({ [field]: value } as any).eq("id", id);
    if (error) throw error;
  };

  const addDetail = async () => {
    const { data: inserted, error } = await supabase
      .from("capex_plan")
      .insert({
        scenario_id: scenario.id,
        capex_type: "Hardware",
        year: 2027,
        amount: 0,
        description: "Ny investering",
      })
      .select()
      .single();
    if (error) throw error;
    patch({ type: "upsert", table: "capexPlan", row: inserted });
  };

  const removeDetail = async (id: string) => {
    patch({ type: "delete", table: "capexPlan", id });
    const { error } = await supabase.from("capex_plan").delete().eq("id", id);
    if (error) throw error;
  };

  const detailedRows = rows.filter((r) => r.description);

  const depInfo = data.depRules
    .map((r) => `${r.capex_type}: ${r.depreciation_years} år`)
    .join(" · ");

  return (
    <Section
      title="Capex-plan"
      description={`Avskrivningstider: ${depInfo || "Hardware 3 år · Software 5 år · Prosjekt 5 år"}`}
    >
      <div className="space-y-5">
        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Aggregert per type og år (tNOK)
          </h3>
          <p className="text-[11px] text-muted-foreground mb-2">
            Disse bucketene representerer udokumenterte investeringer. Bruk «Detaljert» nedenfor for spesifikke prosjekter.
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium px-2 py-2 w-[130px]">Type</th>
                {FC_YEARS.map((y) => (
                  <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {types.map((t) => (
                <tr key={t} className="border-b">
                  <td className="px-2 py-1.5">{t}</td>
                  {FC_YEARS.map((y) => (
                    <td key={y} className="px-1 py-1">
                      <NumCell
                        value={Number(aggregatedLine.get(`${t}-${y}`)?.amount ?? 0)}
                        step="100"
                        onCommit={(v) => upsertAggregated(t, y, v)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-semibold">
                <td className="px-2 py-2">Sum (alle rader)</td>
                {FC_YEARS.map((y) => (
                  <td key={y} className="text-right tabular-nums font-mono px-2 py-2">
                    {types.reduce((a, t) => a + aggSum(t, y), 0).toLocaleString("nb-NO") || "—"}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
              Detaljert (navngitte investeringer)
            </h3>
            <Button variant="outline" size="sm" onClick={addDetail}>
              <Plus className="h-3.5 w-3.5 mr-1" /> Legg til investering
            </Button>
          </div>
          {detailedRows.length === 0 ? (
            <p className="text-xs text-muted-foreground py-3">Ingen detaljerte investeringer.</p>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b">
                  <th className="text-left font-medium px-2 py-2 w-[130px]">Type</th>
                  <th className="text-left font-medium px-2 py-2">Navn</th>
                  <th className="text-left font-medium px-2 py-2 w-[80px]">År</th>
                  <th className="text-right font-medium px-2 py-2 w-[140px]">Beløp (tNOK)</th>
                  <th className="w-[40px]"></th>
                </tr>
              </thead>
              <tbody>
                {detailedRows.map((r) => (
                  <tr key={r.id} className="border-b">
                    <td className="px-1 py-1">
                      <Select value={r.capex_type} onValueChange={(v) => updateDetailField(r.id, "capex_type", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                      </Select>
                    </td>
                    <td className="px-1 py-1">
                      <Input
                        defaultValue={r.description ?? ""}
                        onBlur={(e) => {
                          if (e.target.value !== r.description) updateDetailField(r.id, "description", e.target.value);
                        }}
                        className="h-8 text-xs"
                      />
                    </td>
                    <td className="px-1 py-1">
                      <Select value={String(r.year)} onValueChange={(v) => updateDetailField(r.id, "year", Number(v))}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {FC_YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </td>
                    <td className="px-1 py-1">
                      <NumCell value={Number(r.amount)} step="100" onCommit={(v) => updateDetailField(r.id, "amount", v)} />
                    </td>
                    <td className="px-1 py-1 text-center">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDetail(r.id)}>
                        <Trash2 className="h-3.5 w-3.5 text-muted-foreground" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Section>
  );
}
