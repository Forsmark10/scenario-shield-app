import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, History, MessageSquare, Plus, RotateCcw, Trash2, Undo2 } from "lucide-react";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
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
import { CommentPopover } from "@/components/CommentPopover";
import { CommentsOverviewPanel } from "@/components/CommentsOverviewPanel";
import { KontrollTab } from "@/components/KontrollTab";
import { useAutoVersion } from "@/hooks/useAutoVersion";
import { captureAssumptionsSnapshot, restoreAssumptionsSnapshot, type AssumptionsSnapshot } from "@/lib/versioning";
import { useActiveScenario } from "@/hooks/useActiveScenario";
import { cn } from "@/lib/utils";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031];
const LEVELS = ["Low", "Medium", "High"] as const;
type Level = (typeof LEVELS)[number];

/**
 * Wrap NumCell + a comment dot in the same relative container.
 * Makes every editable cell discoverable for comments without changing the input footprint.
 */
function CellWithComment({
  comment,
  updatedAt,
  updatedBy,
  onSaveComment,
  label,
  children,
}: {
  comment: string | null | undefined;
  updatedAt?: string | null;
  updatedBy?: string | null;
  onSaveComment: (next: string | null) => Promise<void> | void;
  label?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="relative group">
      {children}
      <CommentPopover
        value={comment}
        updatedAt={updatedAt}
        updatedBy={updatedBy}
        onSave={onSaveComment}
        label={label}
      />
    </div>
  );
}

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
  nearshoringChanges: any[];
  catAdj: any[];
  capexPlan: any[];
  depRules: any[];
  i2nConversions: any[];
  oneOffs: any[];
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
  | "nearshoringChanges"
  | "catAdj"
  | "capexPlan"
  | "i2nConversions"
  | "oneOffs";

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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const { toast } = useToast();
  const autoVersion = useAutoVersion();
  const initialFingerprint = useRef<Record<string, string>>({});

  // Undo-stack: per-scenario stack med snapshot tatt RETT FØR siste mutering.
  // Brukes av "Angre"-knappen for å rulle tilbake siste endring uten å gå via Historikk.
  const undoStackRef = useRef<Record<string, AssumptionsSnapshot[]>>({});
  const [undoTick, setUndoTick] = useState(0); // for å re-rendere knapp-state
  const [undoing, setUndoing] = useState(false);
  const UNDO_LIMIT = 50;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [
        sRes, gRes, cRes, irRes, erRes, icRes, ecRes, convRes, nbRes, naRes, ncRes, caRes, capRes, drRes, clRes, i2nRes, ooRes,
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
        supabase.from("nearshoring_changes").select("*"),
        supabase.from("category_adjustments").select("*"),
        supabase.from("capex_plan").select("*"),
        supabase.from("depreciation_rules").select("*"),
        supabase.from("cost_lines").select("category"),
        supabase.from("internal_to_nearshoring_conversions").select("*"),
        supabase.from("one_off_effects").select("*"),
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
        nearshoringChanges: ncRes.data ?? [],
        catAdj: caRes.data ?? [],
        capexPlan: capRes.data ?? [],
        depRules: drRes.data ?? [],
        i2nConversions: i2nRes.data ?? [],
        oneOffs: ooRes.data ?? [],
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

  // Mapping fra lokal TableKey til DB-tabellnavn (matcher SCOPED_TABLES i versioning.ts).
  // nearshoringBase er global (ikke per scenario) og inngår derfor ikke i undo.
  const TABLE_KEY_TO_DB: Partial<Record<TableKey, string>> = {
    global: "global_assumptions",
    central: "central_assumptions",
    intChanges: "internal_fte_changes",
    extChanges: "external_fte_changes",
    conversions: "conversions",
    nearshoringAdds: "nearshoring_additions",
    nearshoringChanges: "nearshoring_changes",
    catAdj: "category_adjustments",
    capexPlan: "capex_plan",
  };

  // Bygg en AssumptionsSnapshot fra LOKAL state for et gitt scenario.
  // Brukes som "før-bilde" når undo-stack pushes – speiler feltene som
  // restoreAssumptionsSnapshot håndterer.
  const buildLocalSnapshot = useCallback(
    (sid: string, source: AllData): AssumptionsSnapshot => {
      const tables: Record<string, any[]> = {};
      for (const [key, dbName] of Object.entries(TABLE_KEY_TO_DB) as [TableKey, string][]) {
        const rows = (source as any)[key] as any[] | undefined;
        tables[dbName] = (rows ?? []).filter((r) => r?.scenario_id === sid);
      }
      return { scenario_id: sid, taken_at: new Date().toISOString(), tables };
    },
    [],
  );

  const pushUndo = useCallback(
    (sid: string, snap: AssumptionsSnapshot) => {
      const stack = undoStackRef.current[sid] ?? [];
      stack.push(snap);
      if (stack.length > UNDO_LIMIT) stack.shift();
      undoStackRef.current[sid] = stack;
      setUndoTick((t) => t + 1);
    },
    [],
  );

  const patch = useCallback<Patch>((action) => {
    // Capture pre-mutation snapshot for undo (basert på lokal state før setData).
    const sid =
      (action as any).row?.scenario_id ??
      (action as any).changes?.scenario_id ??
      activeScenario;
    setData((prev) => {
      if (!prev) return prev;
      if (sid) {
        try {
          pushUndo(sid, buildLocalSnapshot(sid, prev));
        } catch (e) {
          console.warn("[Undo] Kunne ikke ta snapshot", e);
        }
      }
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
    if (sid) autoVersion.trigger(sid);
  }, [autoVersion, activeScenario, buildLocalSnapshot, pushUndo]);

  const handleUndo = useCallback(async () => {
    if (!activeScenario) return;
    const stack = undoStackRef.current[activeScenario] ?? [];
    const snap = stack.pop();
    if (!snap) return;
    undoStackRef.current[activeScenario] = stack;
    setUndoing(true);
    try {
      // captureAssumptionsSnapshot henter fra DB (kan avvike litt fra lokal state pga
      // nylige writes fra subkomponenter). restoreAssumptionsSnapshot bruker delete+insert
      // og er trygg å kjøre.
      await restoreAssumptionsSnapshot(snap);
      sonnerToast.success("Siste endring angret");
      autoVersion.resetWindow(activeScenario);
      setUndoTick((t) => t + 1);
      refresh();
    } catch (e: any) {
      console.error("[Undo] Feilet", e);
      sonnerToast.error("Kunne ikke angre", { description: e?.message ?? String(e) });
      // Hvis det feilet, push snapshot tilbake så brukeren kan prøve igjen.
      stack.push(snap);
      undoStackRef.current[activeScenario] = stack;
      setUndoTick((t) => t + 1);
    } finally {
      setUndoing(false);
    }
  }, [activeScenario, autoVersion]);

  const undoCount = activeScenario ? (undoStackRef.current[activeScenario]?.length ?? 0) : 0;
  // referer til undoTick for å re-rendere når stack endres
  void undoTick;

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCommentsOpen(true)}
            disabled={!activeScenario}
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Alle kommentarer
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setHistoryOpen(true)}
            disabled={!activeScenario}
          >
            <History className="h-4 w-4 mr-2" />
            Historikk
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleUndo}
            disabled={!activeScenario || undoCount === 0 || undoing}
            title={
              undoCount === 0
                ? "Ingen endringer å angre"
                : `Angre siste endring (${undoCount} tilgjengelig)`
            }
          >
            <Undo2 className="h-4 w-4 mr-2" />
            Angre
          </Button>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="outline" size="sm" disabled={!activeScenario}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Nullstill scenario
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>
                  Nullstill {data.scenarios.find((s) => s.id === activeScenario)?.name ?? "scenarioet"}?
                </AlertDialogTitle>
                <AlertDialogDescription>
                  Dette vil nullstille alle forutsetninger OG kommentarer for {data.scenarios.find((s) => s.id === activeScenario)?.name ?? "scenarioet"}. Er du sikker? Handlingen kan angres via Historikk.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Avbryt</AlertDialogCancel>
                <AlertDialogAction
                  onClick={async () => {
                    if (!activeScenario) return;
                    const sid = activeScenario;
                    console.log("[Reset] Start nullstilling for scenario:", sid);
                    try {
                      // Sekvensielle update-calls med .select() for å verifisere antall rader.
                      // Alle kommentar-felter nullstilles også (krav fra brukeren).
                      const steps: Array<[string, () => any]> = [
                        ["global_assumptions", () =>
                          supabase.from("global_assumptions").update({
                            salary_increase_pct: 0, price_increase_pct: 0, eur_nok_rate: 11.3,
                            comment: null, comment_updated_at: null, comment_updated_by: null,
                            comment_salary: null, comment_salary_updated_at: null, comment_salary_updated_by: null,
                            comment_price: null, comment_price_updated_at: null, comment_price_updated_by: null,
                            comment_rate: null, comment_rate_updated_at: null, comment_rate_updated_by: null,
                          } as any).eq("scenario_id", sid).select("id")],
                        ["central_assumptions", () =>
                          supabase.from("central_assumptions").update({
                            central_price_increase_pct: 0,
                            central_volume_increase_pct: 0,
                            central_reduction_pct: 0,
                            central_reduction_amount_tnok: 0,
                            central_eur_nok_rate: 11.3,
                            comment: null, comment_updated_at: null, comment_updated_by: null,
                            comment_amount: null, comment_amount_updated_at: null, comment_amount_updated_by: null,
                            comment_rate: null, comment_rate_updated_at: null, comment_rate_updated_by: null,
                          } as any).eq("scenario_id", sid).select("id")],
                        ["internal_fte_changes", () =>
                          supabase.from("internal_fte_changes").update({
                            increase: 0, decrease: 0,
                            comment: null, comment_updated_at: null, comment_updated_by: null,
                            comment_increase: null, comment_increase_updated_at: null, comment_increase_updated_by: null,
                            comment_decrease: null, comment_decrease_updated_at: null, comment_decrease_updated_by: null,
                          } as any).eq("scenario_id", sid).select("id")],
                        ["external_fte_changes", () =>
                          supabase.from("external_fte_changes").update({
                            increase: 0, decrease: 0,
                            comment: null, comment_updated_at: null, comment_updated_by: null,
                            comment_increase: null, comment_increase_updated_at: null, comment_increase_updated_by: null,
                            comment_decrease: null, comment_decrease_updated_at: null, comment_decrease_updated_by: null,
                          } as any).eq("scenario_id", sid).select("id")],
                        ["nearshoring_changes", () =>
                          supabase.from("nearshoring_changes").update({
                            increase: 0, decrease: 0,
                            comment: null, comment_updated_at: null, comment_updated_by: null,
                            comment_increase: null, comment_increase_updated_at: null, comment_increase_updated_by: null,
                            comment_decrease: null, comment_decrease_updated_at: null, comment_decrease_updated_by: null,
                          } as any).eq("scenario_id", sid).select("id")],
                        ["category_adjustments", () =>
                          supabase.from("category_adjustments").update({
                            adjustment_pct: 0, adjustment_amount_tnok: 0,
                            comment: null, comment_updated_at: null, comment_updated_by: null,
                            comment_amount: null, comment_amount_updated_at: null, comment_amount_updated_by: null,
                          } as any).eq("scenario_id", sid).select("id")],
                        ["capex_plan (aggregert, amount=0)", () =>
                          supabase.from("capex_plan").update({
                            amount: 0,
                            comment: null, comment_updated_at: null, comment_updated_by: null,
                          } as any).eq("scenario_id", sid).is("description", null).select("id")],
                      ];
                      for (const [label, fn] of steps) {
                        const { data: rows, error } = await fn();
                        if (error) {
                          console.error(`[Reset] FEIL i ${label}:`, error);
                          throw new Error(`${label}: ${error.message}`);
                        }
                        console.log(`[Reset] ${label} → ${rows?.length ?? 0} rader oppdatert`);
                      }
                      // Slett rader som skal fjernes.
                      const deletes: Array<[string, () => any]> = [
                        ["conversions", () =>
                          supabase.from("conversions").delete().eq("scenario_id", sid)],
                        ["nearshoring_additions (legacy)", () =>
                          supabase.from("nearshoring_additions").delete().eq("scenario_id", sid)],
                        ["capex_plan (detaljerte)", () =>
                          supabase.from("capex_plan").delete()
                            .eq("scenario_id", sid).not("description", "is", null)],
                      ];
                      for (const [label, fn] of deletes) {
                        const { error } = await fn();
                        if (error) {
                          console.error(`[Reset] FEIL i delete ${label}:`, error);
                          throw new Error(`${label}: ${error.message}`);
                        }
                        console.log(`[Reset] ${label} slettet`);
                      }
                      // Lag eksplisitt auto-versjon for sporbarhet.
                      try {
                        const snap = await captureAssumptionsSnapshot(sid);
                        const ts = new Date().toLocaleString("nb-NO");
                        await supabase.from("auto_versions").insert({
                          scenario_id: sid,
                          data: snap as any,
                          summary: `Tilbakestilt til null - ${ts}`,
                        } as any);
                        autoVersion.resetWindow(sid);
                      } catch (verr) {
                        console.warn("[Reset] auto-version failed", verr);
                      }
                      // Direkte local-state mutering: nullstill alle relevante felt for dette
                      // scenarioet umiddelbart, slik at UI ikke avhenger av re-fetch.
                      setData((prev) => {
                        if (!prev) return prev;
                        const zeroIfScenario = <T extends { scenario_id: string }>(
                          rows: T[],
                          fields: (keyof T)[],
                        ): T[] =>
                          rows.map((r) =>
                            r.scenario_id === sid
                              ? ({ ...r, ...Object.fromEntries(fields.map((f) => [f, 0])) } as T)
                              : r,
                          );
                        return {
                          ...prev,
                          global: (prev.global as any[]).map((r) =>
                            r.scenario_id === sid
                              ? { ...r, salary_increase_pct: 0, price_increase_pct: 0, eur_nok_rate: 11.3 }
                              : r,
                          ),
                          central: (prev.central as any[]).map((r) =>
                            r.scenario_id === sid
                              ? {
                                  ...r,
                                  central_price_increase_pct: 0,
                                  central_volume_increase_pct: 0,
                                  central_reduction_pct: 0,
                                  central_reduction_amount_tnok: 0,
                                  central_eur_nok_rate: 11.3,
                                }
                              : r,
                          ),
                          intChanges: zeroIfScenario(prev.intChanges as any, ["increase", "decrease"] as any),
                          extChanges: zeroIfScenario(prev.extChanges as any, ["increase", "decrease"] as any),
                          nearshoringChanges: zeroIfScenario(prev.nearshoringChanges as any, ["increase", "decrease"] as any),
                          catAdj: zeroIfScenario(prev.catAdj as any, ["adjustment_pct", "adjustment_amount_tnok"] as any),
                          capexPlan: (prev.capexPlan as any[])
                            .filter((r) => !(r.scenario_id === sid && r.description != null))
                            .map((r) =>
                              r.scenario_id === sid && r.description == null ? { ...r, amount: 0 } : r,
                            ),
                          conversions: (prev.conversions as any[]).filter((r) => r.scenario_id !== sid),
                          nearshoringAdds: (prev.nearshoringAdds as any[]).filter((r) => r.scenario_id !== sid),
                        };
                      });
                      console.log("[Reset] Lokal state nullstilt – starter refresh()");
                      sonnerToast.success("Scenario nullstilt");
                      refresh();
                    } catch (e: any) {
                      console.error("[Reset] Avbrutt:", e);
                      sonnerToast.error("Kunne ikke nullstille", { description: e?.message ?? String(e) });
                    }
                  }}
                >
                  Tilbakestill
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
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

            <KontrollTab scenarioId={s.id} />

            <div className="pt-2">
              <p className="text-xs text-muted-foreground">Endringer lagres automatisk (debounce 500 ms).</p>
            </div>
          </TabsContent>
        ))}
      </Tabs>

      {activeScenario && (
        <>
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
          <CommentsOverviewPanel
            open={commentsOpen}
            onOpenChange={setCommentsOpen}
            scenarioId={activeScenario}
            scenarioName={data.scenarios.find((s) => s.id === activeScenario)?.name ?? ""}
          />
        </>
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
        eur_nok_rate: 11.3,
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

  const upsertCommentField = async (
    year: number,
    commentField: "comment_salary" | "comment_price" | "comment_rate",
    atField: "comment_salary_updated_at" | "comment_price_updated_at" | "comment_rate_updated_at",
    value: string | null,
  ) => {
    const existing = get(year);
    const ts = new Date().toISOString();
    const changes = { [commentField]: value, [atField]: ts } as any;
    if (existing) {
      patch({
        type: "update",
        table: "global",
        id: existing.id,
        changes,
      });
      const { error } = await supabase
        .from("global_assumptions")
        .update(changes)
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
          eur_nok_rate: 11.3,
          ...changes,
        } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "global", row: inserted });
    }
  };

  const drivers: Array<{
    key: string;
    label: string;
    suffix: string;
    scale: number;
    commentField: "comment_salary" | "comment_price";
    atField: "comment_salary_updated_at" | "comment_price_updated_at";
    byField: "comment_salary_updated_by" | "comment_price_updated_by";
  }> = [
    {
      key: "salary_increase_pct", label: "Lønnsvekst %", suffix: "%", scale: 100,
      commentField: "comment_salary", atField: "comment_salary_updated_at", byField: "comment_salary_updated_by",
    },
    {
      key: "price_increase_pct", label: "Prisvekst %", suffix: "%", scale: 100,
      commentField: "comment_price", atField: "comment_price_updated_at", byField: "comment_price_updated_by",
    },
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
                    <CellWithComment
                      comment={row?.[d.commentField]}
                      updatedAt={row?.[d.atField]}
                      updatedBy={row?.[d.byField]}
                      onSaveComment={(next) => upsertCommentField(y, d.commentField, d.atField, next)}
                      label={`Globale drivere ${y} · ${d.label}`}
                    >
                      <NumCell
                        value={Number(v.toFixed(d.scale === 100 ? 2 : 3))}
                        suffix={d.suffix}
                        onCommit={(num) => upsert(y, d.key, num / d.scale)}
                      />
                    </CellWithComment>
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

// ---------------------- 2. Sentrale drivere ----------------------
function SectionCentral({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const get = (year: number) =>
    data.central.find((g) => g.scenario_id === scenario.id && g.year === year) ?? null;

  // Defaults brukes ved opprettelse av ny rad. Vi seeder volum=0 (utgått driver) og bruker 11.3 som default-kurs.
  const insertDefaults = {
    central_price_increase_pct: 0,
    central_volume_increase_pct: 0,
    central_reduction_pct: 0,
    central_reduction_amount_tnok: 0,
    central_eur_nok_rate: 11.3,
  };

  const upsert = async (year: number, field: string, value: number) => {
    const existing = get(year);
    if (existing) {
      patch({ type: "update", table: "central", id: existing.id, changes: { [field]: value } });
      const { error } = await supabase.from("central_assumptions").update({ [field]: value } as any).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("central_assumptions")
        .insert({ scenario_id: scenario.id, year, ...insertDefaults, [field]: value } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "central", row: inserted });
    }
  };

  const upsertCommentField = async (
    year: number,
    commentField: "comment" | "comment_amount" | "comment_rate" | "comment_price",
    atField:
      | "comment_updated_at"
      | "comment_amount_updated_at"
      | "comment_rate_updated_at"
      | "comment_price_updated_at",
    value: string | null,
  ) => {
    const existing = get(year);
    const ts = new Date().toISOString();
    const changes = { [commentField]: value, [atField]: ts } as any;
    if (existing) {
      patch({ type: "update", table: "central", id: existing.id, changes });
      const { error } = await supabase.from("central_assumptions").update(changes).eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("central_assumptions")
        .insert({ scenario_id: scenario.id, year, ...insertDefaults, ...changes } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "central", row: inserted });
    }
  };

  type DriverDef = {
    key: string;
    label: string;
    kind: "pct" | "tnok" | "rate";
    min?: number;
    max?: number;
    errorHint?: string;
    info?: string;
    commentField: "comment" | "comment_amount" | "comment_rate" | "comment_price";
    atField:
      | "comment_updated_at"
      | "comment_amount_updated_at"
      | "comment_rate_updated_at"
      | "comment_price_updated_at";
    byField:
      | "comment_updated_by"
      | "comment_amount_updated_by"
      | "comment_rate_updated_by"
      | "comment_price_updated_by";
  };

  const drivers: DriverDef[] = [
    {
      key: "central_price_increase_pct",
      label: "Sentral prisvekst %",
      kind: "pct",
      info: "Underliggende prisøkning i EUR-avtalen, kumulativt år for år. Negativ verdi tillatt (deflasjon).",
      commentField: "comment_price", atField: "comment_price_updated_at", byField: "comment_price_updated_by",
    },
    {
      key: "central_reduction_pct",
      label: "Sentral reduksjon %",
      kind: "pct",
      max: 0,
      errorHint: "Reduksjon må være 0 eller negativ. Skriv −5 for 5% rabatt.",
      info: "Permanent reforhandling i prosent. Multiplikativt: satt i år Y gjelder fra og med Y. Skriv som negativt tall.",
      commentField: "comment", atField: "comment_updated_at", byField: "comment_updated_by",
    },
    {
      key: "central_reduction_amount_tnok",
      label: "Sentral reduksjon tNOK",
      kind: "tnok",
      max: 0,
      errorHint: "Reduksjon må være 0 eller negativ (tNOK).",
      info: "Permanent fast beløpsreduksjon i tNOK. Additivt: −500 i 2027 og −200 i 2029 gir −700 fra 2029.",
      commentField: "comment_amount", atField: "comment_amount_updated_at", byField: "comment_amount_updated_by",
    },
    {
      key: "central_eur_nok_rate",
      label: "EUR/NOK-kurs",
      kind: "rate",
      min: 5,
      max: 20,
      errorHint: "Valutakurs må være positiv og innenfor rimelig range (5–20).",
      info: "Valutakurs for året. Påvirker NOK-kostnaden direkte. Default = 11,3 (matcher EUR-basis i FC 2026).",
      commentField: "comment_rate", atField: "comment_rate_updated_at", byField: "comment_rate_updated_by",
    },
  ];

  return (
    <Section
      title="Sentrale drivere"
      description="Sentrale kostnader er fakturert i EUR. EUR-basis beregnes fra FC 2026 ved kurs 11,3. Prisvekst er kumulativ år for år. Reduksjoner (% og tNOK) er permanente reforhandlinger – satt i ett år gjelder de alle påfølgende år. EUR/NOK-kurs settes per år og påvirker NOK-kostnaden direkte."
      tooltip="Beregning per år N: EUR-basis (FC2026 / 11,3) × kumulativ prisvekst × FX(N) × kumulativ reduksjon%. tNOK-reduksjon legges på som egen virtuell linje (additivt, permanent)."
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b">
            <th className="text-left font-medium px-2 py-2 w-[220px]">Driver</th>
            {FC_YEARS.map((y) => (
              <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {drivers.map((d) => (
            <tr key={d.key} className="border-b">
              <td className="px-2 py-2">
                <div className="flex items-center gap-1.5">
                  <span>{d.label}</span>
                  {d.info && <InfoTip text={d.info} />}
                </div>
              </td>
              {FC_YEARS.map((y) => {
                const row = get(y);
                let displayValue: number;
                let suffix: string | undefined;
                if (d.kind === "pct") {
                  const raw = row?.[d.key] ?? 0;
                  displayValue = Number((raw * 100).toFixed(2));
                  suffix = "%";
                } else if (d.kind === "rate") {
                  displayValue = Number(row?.[d.key] ?? 11.3);
                  suffix = undefined;
                } else {
                  displayValue = Number(row?.[d.key] ?? 0);
                  suffix = "tNOK";
                }
                return (
                  <td key={y} className="px-1 py-1 align-top">
                    <CellWithComment
                      comment={row?.[d.commentField]}
                      updatedAt={row?.[d.atField]}
                      updatedBy={row?.[d.byField]}
                      onSaveComment={(next) => upsertCommentField(y, d.commentField, d.atField, next)}
                      label={`Sentrale drivere ${y} · ${d.label}`}
                    >
                      <NumCell
                        value={displayValue}
                        suffix={suffix}
                        min={d.min}
                        max={d.max}
                        errorHint={d.errorHint}
                        onCommit={(num) => upsert(y, d.key, d.kind === "pct" ? num / 100 : num)}
                      />
                    </CellWithComment>
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

  const upsertChangeComment = async (
    year: number,
    level: Level,
    type: "increase" | "decrease",
    comment: string | null,
  ) => {
    const existing = getChange(year, level);
    const ts = new Date().toISOString();
    const cField = type === "increase" ? "comment_increase" : "comment_decrease";
    const atField = type === "increase" ? "comment_increase_updated_at" : "comment_decrease_updated_at";
    const changes = { [cField]: comment, [atField]: ts } as any;
    if (existing) {
      patch({ type: "update", table: "intChanges", id: existing.id, changes });
      const { error } = await supabase
        .from("internal_fte_changes")
        .update(changes)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("internal_fte_changes")
        .insert({
          scenario_id: scenario.id,
          year,
          level,
          increase: 0,
          decrease: 0,
          ...changes,
        } as any)
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
                      const cell = (
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
                      );
                      return (
                        <td key={y} className="px-1 py-1 align-top">
                          <CellWithComment
                            comment={type === "increase" ? c?.comment_increase : c?.comment_decrease}
                            updatedAt={type === "increase" ? c?.comment_increase_updated_at : c?.comment_decrease_updated_at}
                            updatedBy={type === "increase" ? c?.comment_increase_updated_by : c?.comment_decrease_updated_by}
                            onSaveComment={(next) => upsertChangeComment(y, lvl, type, next)}
                            label={`Internal ${lvl} ${y} (${type})`}
                          >
                            {cell}
                          </CellWithComment>
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

  const upsertChangeComment = async (
    year: number,
    level: Level,
    type: "increase" | "decrease",
    comment: string | null,
  ) => {
    const existing = getChange(year, level);
    const ts = new Date().toISOString();
    const cField = type === "increase" ? "comment_increase" : "comment_decrease";
    const atField = type === "increase" ? "comment_increase_updated_at" : "comment_decrease_updated_at";
    const changes = { [cField]: comment, [atField]: ts } as any;
    if (existing) {
      patch({ type: "update", table: "extChanges", id: existing.id, changes });
      const { error } = await supabase
        .from("external_fte_changes")
        .update(changes)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("external_fte_changes")
        .insert({
          scenario_id: scenario.id,
          year,
          level,
          increase: 0,
          decrease: 0,
          ...changes,
        } as any)
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
                      const cell = (
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
                      );
                      return (
                        <td key={y} className="px-1 py-1 align-top">
                          <CellWithComment
                            comment={type === "increase" ? c?.comment_increase : c?.comment_decrease}
                            updatedAt={type === "increase" ? c?.comment_increase_updated_at : c?.comment_decrease_updated_at}
                            updatedBy={type === "increase" ? c?.comment_increase_updated_by : c?.comment_decrease_updated_by}
                            onSaveComment={(next) => upsertChangeComment(y, lvl, type, next)}
                            label={`External ${lvl} ${y} (${type})`}
                          >
                            {cell}
                          </CellWithComment>
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
  const rows = [...data.conversions.filter((c) => c.scenario_id === scenario.id)].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
    return aTime - bTime;
  });

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

  const updateComment = async (id: string, comment: string | null) => {
    const row = rows.find((entry) => entry.id === id);
    if (!row) return;
    const ts = new Date().toISOString();
    patch({
      type: "update",
      table: "conversions",
      id,
      changes: { comment, comment_updated_at: ts },
    });
    const { error } = await supabase
      .from("conversions")
      .update({ comment, comment_updated_at: ts } as any)
      .eq("id", row.id);
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
                  <CellWithComment
                    comment={r.comment}
                    updatedAt={r.comment_updated_at}
                    updatedBy={r.comment_updated_by}
                    onSaveComment={(next) => updateComment(r.id, next)}
                    label={`Konvertering ${r.year} · Antall`}
                  >
                    <NumCell value={Number(r.count)} step="1" min={0} errorHint="Antall må være 0 eller positivt." onCommit={(v) => updateField(r.id, "count", Math.max(0, Math.round(v)))} />
                  </CellWithComment>
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

  // Comment on FX (eur_nok_rate) cell — uses dedicated `comment_rate` column on global_assumptions.
  const upsertFxComment = async (year: number, comment: string | null) => {
    const existing = getGlobal(year);
    const ts = new Date().toISOString();
    const changes = { comment_rate: comment, comment_rate_updated_at: ts } as any;
    if (existing) {
      patch({ type: "update", table: "global", id: existing.id, changes });
      const { error } = await supabase
        .from("global_assumptions")
        .update(changes)
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
          eur_nok_rate: 11.3,
          ...changes,
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

  // === New FTE-style Increase/Decrease per year ===
  const getChange = (year: number) =>
    data.nearshoringChanges.find((c) => c.scenario_id === scenario.id && c.year === year) ?? null;

  const upsertChange = async (year: number, field: "increase" | "decrease", value: number) => {
    const existing = getChange(year);
    if (existing) {
      patch({ type: "update", table: "nearshoringChanges", id: existing.id, changes: { [field]: value } });
      const { error } = await supabase
        .from("nearshoring_changes")
        .update({ [field]: value } as any)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("nearshoring_changes")
        .insert({ scenario_id: scenario.id, year, increase: 0, decrease: 0, [field]: value } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "nearshoringChanges", row: inserted });
    }
  };

  const upsertChangeComment = async (year: number, type: "increase" | "decrease", comment: string | null) => {
    const existing = getChange(year);
    const ts = new Date().toISOString();
    const commentField = type === "increase" ? "comment_increase" : "comment_decrease";
    const commentAtField = type === "increase" ? "comment_increase_updated_at" : "comment_decrease_updated_at";
    if (existing) {
      patch({
        type: "update",
        table: "nearshoringChanges",
        id: existing.id,
        changes: { [commentField]: comment, [commentAtField]: ts },
      });
      const { error } = await supabase
        .from("nearshoring_changes")
        .update({ [commentField]: comment, [commentAtField]: ts } as any)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("nearshoring_changes")
        .insert({
          scenario_id: scenario.id,
          year,
          increase: 0,
          decrease: 0,
          [commentField]: comment,
          [commentAtField]: ts,
        } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "nearshoringChanges", row: inserted });
    }
  };

  return (
    <Section
      title="Nearshoring"
      description="Faktureres i EUR per år, konverteres med EUR/NOK-kurs per år."
      tooltip="Nearshoring fungerer som en uavhengig ressurstype, parallell til interne og eksterne FTE-er. Bruk Increase/Decrease per år for å justere antallet aktive ressurser. Endringer akkumuleres år for år; full årseffekt fra året de skjer."
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
                  const v = Number(row?.eur_nok_rate ?? 11.3);
                  return (
                    <td key={y} className="px-1 py-1">
                      <CellWithComment
                        comment={row?.comment_rate}
                        updatedAt={row?.comment_rate_updated_at}
                        updatedBy={row?.comment_rate_updated_by}
                        onSaveComment={(next) => upsertFxComment(y, next)}
                        label={`EUR/NOK-kurs ${y}`}
                      >
                        <NumCell
                          value={Number(v.toFixed(3))}
                          step="0.01"
                          min={0}
                          errorHint="Valutakurs må være ≥ 0."
                          onCommit={(num) => upsertFx(y, num)}
                        />
                      </CellWithComment>
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
            Nearshoring-endringer per år
          </h3>
          <p className="text-[11px] text-muted-foreground mb-2">
            Increase legger til ressurser, Decrease fjerner. Endringer akkumuleres over år (en increase i 2027 gjelder også 2028–2031).
          </p>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b">
                <th className="text-left font-medium px-2 py-2">Type</th>
                {FC_YEARS.map((y) => (
                  <th key={y} className="text-right font-medium px-2 py-2">{y}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(["increase", "decrease"] as const).map((type) => (
                <tr key={type} className="border-b">
                  <td className="px-2 py-1.5 capitalize text-muted-foreground">{type}</td>
                  {FC_YEARS.map((y) => {
                    const c = getChange(y);
                    const stored = Number(c?.[type] ?? 0);
                    const display = type === "decrease" ? -stored : stored;
                    return (
                      <td key={y} className="px-1 py-1 align-top">
                        <CellWithComment
                          comment={type === "increase" ? c?.comment_increase : c?.comment_decrease}
                          updatedAt={type === "increase" ? c?.comment_increase_updated_at : c?.comment_decrease_updated_at}
                          updatedBy={type === "increase" ? c?.comment_increase_updated_by : c?.comment_decrease_updated_by}
                          onSaveComment={(next) => upsertChangeComment(y, type, next)}
                          label={`Nearshoring ${y} (${type})`}
                        >
                          <NumCell
                            value={display}
                            step="1"
                            min={type === "increase" ? 0 : undefined}
                            max={type === "decrease" ? 0 : undefined}
                            errorHint={
                              type === "increase"
                                ? "Increase må være 0 eller positiv."
                                : "Decrease må være 0 eller negativ. Skriv −1 for én færre."
                            }
                            onCommit={(v) => {
                              const stored = type === "decrease" ? Math.abs(Math.round(v)) : Math.round(v);
                              return upsertChange(y, type, stored);
                            }}
                          />
                        </CellWithComment>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Section>
  );
}

// ---------------------- 7. Category adjustments ----------------------
function SectionCategoryAdj({ data, scenario, patch }: { data: AllData; scenario: Scenario; patch: Patch }) {
  const get = (cat: string, year: number) =>
    data.catAdj.find((a) => a.scenario_id === scenario.id && a.category === cat && a.year === year);

  const upsertField = async (
    cat: string,
    year: number,
    field: "adjustment_pct" | "adjustment_amount_tnok",
    value: number,
  ) => {
    const r = get(cat, year);
    if (r) {
      patch({ type: "update", table: "catAdj", id: r.id, changes: { [field]: value } });
      const { error } = await supabase
        .from("category_adjustments")
        .update({ [field]: value } as any)
        .eq("id", r.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("category_adjustments")
        .insert({
          scenario_id: scenario.id,
          category: cat,
          year,
          adjustment_pct: 0,
          adjustment_amount_tnok: 0,
          [field]: value,
        } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "catAdj", row: inserted });
    }
  };

  const upsertComment = async (cat: string, year: number, comment: string | null) => {
    const r = get(cat, year);
    const ts = new Date().toISOString();
    if (r) {
      patch({
        type: "update",
        table: "catAdj",
        id: r.id,
        changes: { comment, comment_updated_at: ts },
      });
      const { error } = await supabase
        .from("category_adjustments")
        .update({ comment, comment_updated_at: ts } as any)
        .eq("id", r.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("category_adjustments")
        .insert({
          scenario_id: scenario.id,
          category: cat,
          year,
          adjustment_pct: 0,
          adjustment_amount_tnok: 0,
          comment,
          comment_updated_at: ts,
        } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "catAdj", row: inserted });
    }
  };

  const upsertAmountComment = async (cat: string, year: number, comment: string | null) => {
    const r = get(cat, year);
    const ts = new Date().toISOString();
    if (r) {
      patch({
        type: "update",
        table: "catAdj",
        id: r.id,
        changes: { comment_amount: comment, comment_amount_updated_at: ts },
      });
      const { error } = await supabase
        .from("category_adjustments")
        .update({ comment_amount: comment, comment_amount_updated_at: ts } as any)
        .eq("id", r.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("category_adjustments")
        .insert({
          scenario_id: scenario.id,
          category: cat,
          year,
          adjustment_pct: 0,
          adjustment_amount_tnok: 0,
          comment_amount: comment,
          comment_amount_updated_at: ts,
        } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "catAdj", row: inserted });
    }
  };

  return (
    <Section
      title="Kategori-justeringer"
      description="To kombinerbare justeringer per kategori og år: prosent (multiplikativt på toppen av prisvekst, permanent reforhandling) og absolutt beløp i tNOK (additivt, fast beløp som ikke vokser med prisvekst). Begge er permanente fra året de settes."
      tooltip="Prosent: -10% i 2027 gjelder 2027-2031 og multipliseres. Beløp: -500 tNOK i 2027 reduserer kategori-totalen med 500 tNOK hvert år fra 2027. Begge kan settes samtidig."
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-separate border-spacing-0">
          <thead>
            <tr>
              <th
                className="text-left font-medium px-2 py-2 w-[160px] border-b align-bottom"
                rowSpan={2}
              >
                Kategori
              </th>
              {FC_YEARS.map((y, i) => (
                <th
                  key={y}
                  className={cn(
                    "text-center font-semibold px-2 py-2 border-b",
                    i > 0 && "border-l",
                  )}
                  colSpan={2}
                >
                  {y}
                </th>
              ))}
            </tr>
            <tr>
              {FC_YEARS.flatMap((y, i) => [
                <th
                  key={`${y}-p`}
                  className={cn(
                    "text-center font-normal text-[10px] text-muted-foreground px-1 py-1 border-b w-[90px]",
                    i > 0 && "border-l",
                  )}
                >
                  %
                </th>,
                <th
                  key={`${y}-a`}
                  className="text-center font-normal text-[10px] text-muted-foreground px-1 py-1 border-b w-[110px]"
                >
                  tNOK
                </th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {data.categories.map((cat) => (
              <tr key={cat} className="border-b">
                <td className="px-2 py-1.5 border-b">{cat}</td>
                {FC_YEARS.flatMap((y, i) => {
                  const row = get(cat, y);
                  const pct = Number((row?.adjustment_pct ?? 0)) * 100;
                  const amt = Number(row?.adjustment_amount_tnok ?? 0);
                  return [
                    <td
                      key={`${y}-p`}
                      className={cn("px-1 py-1 w-[90px] border-b text-right", i > 0 && "border-l")}
                    >
                      <CellWithComment
                        comment={row?.comment}
                        updatedAt={row?.comment_updated_at}
                        updatedBy={row?.comment_updated_by}
                        onSaveComment={(next) => upsertComment(cat, y, next)}
                        label={`${cat} ${y} · %`}
                      >
                        <NumCell
                          value={Number(pct.toFixed(2))}
                          suffix="%"
                          min={-50}
                          max={50}
                          onCommit={(num) => upsertField(cat, y, "adjustment_pct", num / 100)}
                        />
                      </CellWithComment>
                    </td>,
                    <td key={`${y}-a`} className="px-1 py-1 w-[110px] border-b text-right">
                      <CellWithComment
                        comment={row?.comment_amount}
                        updatedAt={row?.comment_amount_updated_at}
                        updatedBy={row?.comment_amount_updated_by}
                        onSaveComment={(next) => upsertAmountComment(cat, y, next)}
                        label={`${cat} ${y} · tNOK`}
                      >
                        <NumCell
                          value={amt}
                          step="10"
                          min={-99999}
                          max={99999}
                          errorHint="Range -99 999 til +99 999 tNOK."
                          onCommit={(num) => upsertField(cat, y, "adjustment_amount_tnok", num)}
                        />
                      </CellWithComment>
                    </td>,
                  ];
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-[11px] text-muted-foreground mt-2">
          Reduksjoner skrives som negative tall (f.eks. <code>-10</code>% eller <code>-500</code> tNOK). %-cellen og tNOK-cellen kan ha hver sin kommentar – klikk på prikken i hjørnet for å dokumentere tiltaket.
        </p>
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

  const updateDetailComment = async (id: string, comment: string | null) => {
    const ts = new Date().toISOString();
    patch({
      type: "update",
      table: "capexPlan",
      id,
      changes: { comment, comment_updated_at: ts },
    });
    const { error } = await supabase
      .from("capex_plan")
      .update({ comment, comment_updated_at: ts } as any)
      .eq("id", id);
    if (error) throw error;
  };

  // Save comment on aggregated bucket. Creates an empty bucket row if none exists yet.
  const upsertAggregatedComment = async (type: string, year: number, comment: string | null) => {
    const existing = aggregatedLine.get(`${type}-${year}`);
    const ts = new Date().toISOString();
    if (existing) {
      patch({
        type: "update",
        table: "capexPlan",
        id: existing.id,
        changes: { comment, comment_updated_at: ts },
      });
      const { error } = await supabase
        .from("capex_plan")
        .update({ comment, comment_updated_at: ts } as any)
        .eq("id", existing.id);
      if (error) throw error;
    } else {
      const { data: inserted, error } = await supabase
        .from("capex_plan")
        .insert({
          scenario_id: scenario.id,
          capex_type: type,
          year,
          amount: 0,
          description: null,
          comment,
          comment_updated_at: ts,
        } as any)
        .select()
        .single();
      if (error) throw error;
      patch({ type: "upsert", table: "capexPlan", row: inserted });
    }
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
                  {FC_YEARS.map((y) => {
                    const bucket = aggregatedLine.get(`${t}-${y}`);
                    return (
                      <td key={y} className="px-1 py-1">
                        <CellWithComment
                          comment={bucket?.comment}
                          updatedAt={bucket?.comment_updated_at}
                          updatedBy={bucket?.comment_updated_by}
                          onSaveComment={(next) => upsertAggregatedComment(t, y, next)}
                          label={`Capex ${t} ${y}`}
                        >
                          <NumCell
                            value={Number(bucket?.amount ?? 0)}
                            step="100"
                            onCommit={(v) => upsertAggregated(t, y, v)}
                          />
                        </CellWithComment>
                      </td>
                    );
                  })}
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
                      <CellWithComment
                        comment={r.comment}
                        updatedAt={r.comment_updated_at}
                        updatedBy={r.comment_updated_by}
                        onSaveComment={(next) => updateDetailComment(r.id, next)}
                        label={`Capex: ${r.description ?? r.capex_type}`}
                      >
                        <Select value={r.capex_type} onValueChange={(v) => updateDetailField(r.id, "capex_type", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>{types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                        </Select>
                      </CellWithComment>
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
