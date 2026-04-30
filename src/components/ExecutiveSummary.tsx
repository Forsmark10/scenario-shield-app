import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, Sparkles, RotateCw } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import { loadScenarioComments } from "@/components/CommentsOverviewPanel";
import type { ScenarioBundle } from "@/hooks/useAllScenarios";

interface Props {
  /** Active scenarios (full bundles for delta computations). */
  scenarios: ScenarioBundle[];
  /** Color per scenario column (matches Dashboard). */
  colors: string[];
}

const STORAGE_KEY = "execSummary.collapsed.v1";

/**
 * Executive Summary panel on top of the Dashboard. Per scenario:
 * - AI-generated short summary (manual trigger), comparing the scenario to Steady State.
 * - Editable manual narrative (auto-saved to scenarios.executive_summary).
 * Steady State (the baseline / first scenario by sort_order) shows only the narrative.
 */
export function ExecutiveSummary({ scenarios, colors }: Props) {
  const [loading, setLoading] = useState(true);
  const [narrativeBy, setNarrativeBy] = useState<Record<string, string>>({});
  const [aiSummaryBy, setAiSummaryBy] = useState<Record<string, string>>({});
  const [aiGeneratedAtBy, setAiGeneratedAtBy] = useState<Record<string, string | null>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      return {};
    }
  });

  const baseline = scenarios[0]; // first by sort_order = Steady State

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ids = scenarios.map((s) => s.meta.id);
      const { data: rows } = await supabase
        .from("scenarios")
        .select("id, executive_summary, ai_executive_summary, ai_executive_summary_generated_at")
        .in("id", ids);
      if (cancelled) return;
      const narrative: Record<string, string> = {};
      const ai: Record<string, string> = {};
      const aiAt: Record<string, string | null> = {};
      (rows ?? []).forEach((r: any) => {
        narrative[r.id] = r.executive_summary ?? "";
        ai[r.id] = r.ai_executive_summary ?? "";
        aiAt[r.id] = r.ai_executive_summary_generated_at ?? null;
      });
      setNarrativeBy(narrative);
      setAiSummaryBy(ai);
      setAiGeneratedAtBy(aiAt);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarios]);

  const toggleCollapsed = useCallback((id: string, isOpen: boolean) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !isOpen };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const isOpen = (s: ScenarioBundle) => {
    if (s.meta.id in collapsed) return !collapsed[s.meta.id];
    return s.meta.sort_order === 0 || scenarios[0]?.meta.id === s.meta.id;
  };

  return (
    <Card>
      <div className="px-6 py-4 border-b">
        <h2 className="text-sm font-semibold">Executive Summary</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          AI-oppsummering og manuelt narrativ per scenario.
        </p>
      </div>
      <CardContent className="pt-4 pb-5">
        <div className="grid gap-4 md:grid-cols-3">
          {scenarios.map((s, i) => (
            <ScenarioColumn
              key={s.meta.id}
              bundle={s}
              baseline={baseline}
              color={colors[i % colors.length]}
              loading={loading}
              narrative={narrativeBy[s.meta.id] ?? ""}
              aiSummary={aiSummaryBy[s.meta.id] ?? ""}
              aiGeneratedAt={aiGeneratedAtBy[s.meta.id] ?? null}
              onNarrativeChange={(v) =>
                setNarrativeBy((p) => ({ ...p, [s.meta.id]: v }))
              }
              onAiUpdate={(text, at) => {
                setAiSummaryBy((p) => ({ ...p, [s.meta.id]: text }));
                setAiGeneratedAtBy((p) => ({ ...p, [s.meta.id]: at }));
              }}
              open={isOpen(s)}
              onOpenChange={(open) => toggleCollapsed(s.meta.id, open)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioColumn({
  bundle,
  baseline,
  color,
  loading,
  narrative,
  aiSummary,
  aiGeneratedAt,
  onNarrativeChange,
  onAiUpdate,
  open,
  onOpenChange,
}: {
  bundle: ScenarioBundle;
  baseline: ScenarioBundle | undefined;
  color: string;
  loading: boolean;
  narrative: string;
  aiSummary: string;
  aiGeneratedAt: string | null;
  onNarrativeChange: (v: string) => void;
  onAiUpdate: (text: string, at: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const isBaseline = !baseline || bundle.meta.id === baseline.meta.id;

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
            style={{ borderLeft: `4px solid ${color}` }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color }}>
                {bundle.meta.name}
              </span>
              {isBaseline && (
                <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                  baseline
                </span>
              )}
            </div>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-3">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <AiSummaryBlock
                  bundle={bundle}
                  baseline={isBaseline ? null : baseline ?? null}
                  aiSummary={aiSummary}
                  aiGeneratedAt={aiGeneratedAt}
                  onUpdate={onAiUpdate}
                />
                <NarrativeEditor
                  scenarioId={bundle.meta.id}
                  value={narrative}
                  onChange={onNarrativeChange}
                />
              </>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function AiSummaryBlock({
  bundle,
  baseline,
  aiSummary,
  aiGeneratedAt,
  onUpdate,
}: {
  bundle: ScenarioBundle;
  baseline: ScenarioBundle | null;
  aiSummary: string;
  aiGeneratedAt: string | null;
  onUpdate: (text: string, at: string) => void;
}) {
  const [generating, setGenerating] = useState(false);
  const isBaselineCol = baseline === null;

  const generate = useCallback(async () => {
    setGenerating(true);
    try {
      // Collect comments for this scenario
      const comments = await loadScenarioComments(bundle.meta.id);

      const totals_by_year = bundle.result.totals.by_year;
      const baseline_totals_by_year = baseline?.result.totals.by_year ?? {};

      const years = Object.keys(totals_by_year).map(Number).sort();
      const lastYear = years[years.length - 1];

      const top_category_deltas: { category: string; year: number; delta: number }[] = [];
      if (baseline) {
        const baseCats = baseline.result.totals.by_category;
        const myCats = bundle.result.totals.by_category;
        const allCatNames = new Set([...Object.keys(baseCats), ...Object.keys(myCats)]);
        for (const cat of allCatNames) {
          const a = Number(myCats[cat]?.[lastYear] ?? 0);
          const b = Number(baseCats[cat]?.[lastYear] ?? 0);
          const d = a - b;
          if (Math.abs(d) > 100) {
            top_category_deltas.push({ category: cat, year: lastYear, delta: d });
          }
        }
        top_category_deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      } else {
        // For baseline: use top categories by absolute size in last year
        const myCats = bundle.result.totals.by_category;
        for (const cat of Object.keys(myCats)) {
          const a = Number(myCats[cat]?.[lastYear] ?? 0);
          if (Math.abs(a) > 100) top_category_deltas.push({ category: cat, year: lastYear, delta: a });
        }
        top_category_deltas.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
      }

      const { data, error } = await supabase.functions.invoke("executive-summary", {
        body: {
          scenario_name: bundle.meta.name,
          baseline_name: baseline?.meta.name ?? null,
          is_baseline: isBaselineCol,
          comments: comments.map((c) => ({ section: c.section, label: c.label, comment: c.comment })),
          totals_by_year,
          baseline_totals_by_year,
          top_category_deltas: top_category_deltas.slice(0, 5),
        },
      });
      if (error) throw error;
      const summary = (data as any)?.summary as string | undefined;
      if (!summary) throw new Error("Tomt AI-svar");

      const at = new Date().toISOString();
      const { error: upErr } = await supabase
        .from("scenarios")
        .update({
          ai_executive_summary: summary,
          ai_executive_summary_generated_at: at,
        } as any)
        .eq("id", bundle.meta.id);
      if (upErr) throw upErr;

      onUpdate(summary, at);
      sonnerToast.success("AI-oppsummering generert", { duration: 1500, position: "bottom-right" });
    } catch (e: any) {
      const msg = e?.message ?? String(e);
      sonnerToast.error("Kunne ikke generere", { description: msg });
    } finally {
      setGenerating(false);
    }
  }, [bundle, baseline, isBaselineCol, onUpdate]);

  const hasSummary = !!aiSummary.trim();

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-2.5">
      <div className="flex items-center justify-between mb-1.5 gap-2">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-primary flex items-center gap-1">
          <Sparkles className="h-3 w-3" />
          AI-oppsummering
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-[10px]"
          onClick={generate}
          disabled={generating}
        >
          {generating ? (
            <RotateCw className="h-3 w-3 mr-1 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3 mr-1" />
          )}
          {hasSummary ? "Generer på nytt" : "Generer oppsummering"}
        </Button>
      </div>
      {hasSummary ? (
        <p className="text-xs italic text-foreground/90 whitespace-pre-wrap leading-relaxed">
          {aiSummary}
        </p>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          Klikk «Generer oppsummering» for å lage en kort AI-tekst som oppsummerer{" "}
          {isBaselineCol
            ? `${bundle.meta.name} (baseline) – nivå, utvikling og største kostnadsdrivere.`
            : `hvordan ${bundle.meta.name} skiller seg fra ${baseline?.meta.name}.`}
        </p>
      )}
      {aiGeneratedAt && hasSummary && (
        <div className="mt-1.5 text-[10px] text-muted-foreground">
          Generert {new Date(aiGeneratedAt).toLocaleString("nb-NO")}
        </div>
      )}
    </div>
  );
}

function NarrativeEditor({
  scenarioId,
  value,
  onChange,
}: {
  scenarioId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value, scenarioId]);

  const save = useCallback(
    async (next: string) => {
      setSaving(true);
      const { error } = await supabase
        .from("scenarios")
        .update({ executive_summary: next.trim() ? next : null } as any)
        .eq("id", scenarioId);
      setSaving(false);
      if (error) {
        sonnerToast.error("Kunne ikke lagre", { description: error.message });
      } else {
        onChange(next);
        sonnerToast.success("Narrativ lagret", { duration: 1500, position: "bottom-right" });
      }
    },
    [scenarioId, onChange],
  );

  const handleChange = (v: string) => {
    setDraft(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => save(v), 500);
  };

  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Narrativ
        </span>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3 mr-1" />
            Rediger
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {saving ? "Lagrer…" : "Auto-lagres"}
          </span>
        )}
      </div>
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (debounce.current) {
              clearTimeout(debounce.current);
              if (draft !== value) save(draft);
            }
          }}
          autoFocus
          rows={6}
          placeholder="Skriv en manuell oppsummering..."
          className="text-xs min-h-[120px]"
        />
      ) : draft.trim() ? (
        <p className="text-xs whitespace-pre-wrap text-foreground/90">{draft}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          Skriv en manuell oppsummering...
        </p>
      )}
    </div>
  );
}
