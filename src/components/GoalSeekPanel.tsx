// AI-assistert forutsetning ("Goal Seek").
// Sender mål + scenario-kontekst til edge function, viser forslag og lar
// brukeren velge hvilke endringer som skal anvendes.
import { useCallback, useMemo, useRef, useState } from "react";
import { Sparkles, Loader2, Check, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useForecast } from "@/hooks/useForecast";
import { captureAssumptionsSnapshot } from "@/lib/versioning";

type ChangeType =
  | "salary_increase"
  | "price_increase"
  | "central_price"
  | "central_volume"
  | "central_reduction"
  | "internal_fte_change"
  | "external_fte_change"
  | "conversion"
  | "nearshoring"
  | "category_adjustment"
  | "capex";

interface AiChange {
  id: string;
  type: ChangeType;
  description: string;
  year: number;
  details: Record<string, any>;
  estimated_impact_mnok: number;
}

interface AiResponse {
  reasoning: string;
  estimated_result: string;
  changes: AiChange[];
}

interface Props {
  scenarioId: string;
  scenarioName: string;
  categories: string[];
  onApplied: () => void;
}

const RATE_LIMIT_MS = 5000;

export function GoalSeekPanel({ scenarioId, scenarioName, categories, onApplied }: Props) {
  const { toast } = useToast();
  const { inputs, result } = useForecast(scenarioId);
  const [goal, setGoal] = useState("");
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<AiResponse | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const lastCallRef = useRef<number>(0);

  const totalSelectedImpact = useMemo(() => {
    if (!response) return 0;
    return response.changes
      .filter((c) => selected.has(c.id))
      .reduce((s, c) => s + (c.estimated_impact_mnok ?? 0), 0);
  }, [response, selected]);

  const handleSuggest = useCallback(async () => {
    const trimmed = goal.trim();
    if (!trimmed) {
      toast({ title: "Beskriv målet ditt først", variant: "destructive" });
      return;
    }
    const now = Date.now();
    if (now - lastCallRef.current < RATE_LIMIT_MS) {
      const wait = Math.ceil((RATE_LIMIT_MS - (now - lastCallRef.current)) / 1000);
      toast({ title: `Vent ${wait} sekund${wait === 1 ? "" : "er"} før neste forespørsel` });
      return;
    }
    lastCallRef.current = now;
    setLoading(true);
    setResponse(null);
    setSelected(new Set());

    try {
      // Bygg kompakt kontekst
      const context: any = {
        scenario_name: scenarioName,
        categories,
        current_totals_mnok: result?.totals?.by_year ?? {},
        base_2026_total_mnok: result?.totals?.base_2026_total ?? null,
        cagr_2026_2031: result?.totals?.cagr_2026_2031 ?? null,
        by_category_mnok: result?.totals?.by_category ?? {},
        assumptions: inputs
          ? {
              global: inputs.global_assumptions,
              central: inputs.central_assumptions,
              internal_fte_changes: inputs.internal_fte_changes,
              external_fte_changes: inputs.external_fte_changes,
              conversions: inputs.conversions,
              nearshoring: inputs.nearshoring_additions,
              category_adjustments: inputs.category_adjustments,
              capex_plan: inputs.capex_plan,
              internal_fte_base_rates: inputs.internal_fte_base_rates,
              external_fte_base_rates: inputs.external_fte_base_rates,
            }
          : null,
        constraints: {
          salary_increase_pct: [0, 0.15],
          price_increase_pct: [0, 0.15],
          category_adjustment_pct: [-0.5, 0.5],
        },
      };

      const { data, error } = await supabase.functions.invoke("goal-seek", {
        body: { goal: trimmed, context },
      });
      if (error) throw error;
      if (!data || !Array.isArray(data.changes)) {
        throw new Error("Kunne ikke tolke AI-svar, prøv igjen");
      }
      setResponse(data as AiResponse);
      setSelected(new Set(data.changes.map((c: AiChange) => c.id)));
    } catch (e: any) {
      const msg = e?.context?.error || e?.message || String(e);
      toast({ title: "AI-feil", description: msg, variant: "destructive" });
      console.error("goal-seek error", e);
    } finally {
      setLoading(false);
    }
  }, [goal, scenarioName, categories, result, inputs, toast]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleApply = useCallback(async () => {
    if (!response) return;
    const picks = response.changes.filter((c) => selected.has(c.id));
    if (!picks.length) {
      toast({ title: "Velg minst én endring" });
      return;
    }
    setApplying(true);
    console.log(`[GoalSeek] Anvender ${picks.length} endringer for scenario ${scenarioName} (${scenarioId})`);
    try {
      // Lagre versjon FØR endringer (sikkerhet for angring).
      try {
        const snap = await captureAssumptionsSnapshot(scenarioId);
        await supabase.from("auto_versions").insert({
          scenario_id: scenarioId,
          data: snap as any,
          summary: `Før AI-anvendelse (${picks.length} endring${picks.length === 1 ? "" : "er"})`,
        });
        console.log("[GoalSeek] Pre-snapshot lagret i auto_versions");
      } catch (e) {
        console.warn("[GoalSeek] Pre-AI snapshot feilet", e);
      }

      let applied = 0;
      const failures: { change: AiChange; error: string }[] = [];
      for (const c of picks) {
        try {
          console.log(`[GoalSeek] Anvender ${c.type} (år ${c.year}) →`, c.details);
          await applyChange(scenarioId, c);
          applied++;
        } catch (e: any) {
          const msg = e?.message ?? String(e);
          console.error("[GoalSeek] Feil ved anvendelse av endring", c, e);
          failures.push({ change: c, error: msg });
        }
      }

      console.log(`[GoalSeek] Re-fetcher data og re-beregner forecast (${applied}/${picks.length} ok)`);
      if (failures.length) {
        toast({
          title: `${applied}/${picks.length} endringer anvendt`,
          description: `${failures.length} feilet: ${failures[0].error}`,
          variant: "destructive",
        });
      } else {
        toast({
          title: `${applied} endring${applied === 1 ? "" : "er"} anvendt til ${scenarioName}`,
          description: "Dashboard er oppdatert.",
        });
      }
      setResponse(null);
      setSelected(new Set());
      setGoal("");
      onApplied();
      console.log("[GoalSeek] Ferdig — dashboard skal være oppdatert");
    } finally {
      setApplying(false);
    }
  }, [response, selected, scenarioId, scenarioName, toast, onApplied]);

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI-assistert forutsetning</h2>
          <Badge variant="secondary" className="text-[10px]">Beta</Badge>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          Beskriv et mål – AI-en foreslår en kombinasjon av endringer i forutsetningene.
        </p>
        <div className="flex gap-2">
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="Beskriv målet ditt, f.eks. Total kostnad 2031 skal være lik FC 2026"
            rows={2}
            className="flex-1 resize-none"
            disabled={loading}
          />
          <Button onClick={handleSuggest} disabled={loading || !goal.trim()} className="self-start">
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                AI tenker...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 mr-2" />
                Foreslå forutsetninger
              </>
            )}
          </Button>
        </div>

        {response && (
          <div className="space-y-3 border-t pt-3 mt-2">
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs space-y-1">
              <p><span className="font-semibold">Begrunnelse:</span> {response.reasoning}</p>
              <p><span className="font-semibold">Forventet resultat:</span> {response.estimated_result}</p>
            </div>

            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10"></TableHead>
                    <TableHead>Endring</TableHead>
                    <TableHead className="w-16">År</TableHead>
                    <TableHead className="w-32 text-right">Effekt (MNOK)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {response.changes.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(c.id)}
                          onCheckedChange={() => toggle(c.id)}
                        />
                      </TableCell>
                      <TableCell className="text-xs">{c.description}</TableCell>
                      <TableCell className="text-xs">{c.year}</TableCell>
                      <TableCell className={`text-xs text-right tabular-nums ${c.estimated_impact_mnok < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                        {c.estimated_impact_mnok > 0 ? "+" : ""}
                        {c.estimated_impact_mnok.toFixed(1)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs">
                Forventet total effekt av valgte endringer:{" "}
                <span className={`font-semibold tabular-nums ${totalSelectedImpact < 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
                  {totalSelectedImpact > 0 ? "+" : ""}
                  {totalSelectedImpact.toFixed(1)} MNOK
                </span>
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => { setResponse(null); setSelected(new Set()); }} disabled={applying}>
                  <X className="h-4 w-4 mr-1" /> Avbryt
                </Button>
                <Button size="sm" onClick={handleApply} disabled={applying || selected.size === 0}>
                  {applying ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Check className="h-4 w-4 mr-1" />}
                  Bruk valgte
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ---------------------- Anvend AI-endringer ----------------------
async function applyChange(scenarioId: string, c: AiChange) {
  const d = c.details || {};
  switch (c.type) {
    case "salary_increase":
    case "price_increase": {
      const field = c.type === "salary_increase" ? "salary_increase_pct" : "price_increase_pct";
      const { data: existing } = await supabase
        .from("global_assumptions")
        .select("id")
        .eq("scenario_id", scenarioId)
        .eq("year", c.year)
        .maybeSingle();
      const pct = Number(d.pct ?? d.value ?? 0);
      if (existing?.id) {
        await supabase.from("global_assumptions").update({ [field]: pct } as any).eq("id", existing.id);
      } else {
        await supabase.from("global_assumptions").insert({
          scenario_id: scenarioId,
          year: c.year,
          [field]: pct,
        } as any);
      }
      return;
    }
    case "central_price":
    case "central_volume":
    case "central_reduction": {
      const fieldMap: Record<string, string> = {
        central_price: "central_price_increase_pct",
        central_volume: "central_volume_increase_pct",
        central_reduction: "central_reduction_pct",
      };
      const field = fieldMap[c.type];
      const { data: existing } = await supabase
        .from("central_assumptions")
        .select("id")
        .eq("scenario_id", scenarioId)
        .eq("year", c.year)
        .maybeSingle();
      const pct = Number(d.pct ?? d.value ?? 0);
      if (existing?.id) {
        await supabase.from("central_assumptions").update({ [field]: pct } as any).eq("id", existing.id);
      } else {
        await supabase.from("central_assumptions").insert({
          scenario_id: scenarioId,
          year: c.year,
          [field]: pct,
        } as any);
      }
      return;
    }
    case "internal_fte_change":
    case "external_fte_change": {
      const table = c.type === "internal_fte_change" ? "internal_fte_changes" : "external_fte_changes";
      const level = String(d.level ?? "Medium");
      const inc = Number(d.increase ?? 0);
      const dec = Number(d.decrease ?? 0);
      const { data: existing } = await supabase
        .from(table)
        .select("id, increase, decrease")
        .eq("scenario_id", scenarioId)
        .eq("year", c.year)
        .eq("level", level)
        .maybeSingle();
      if (existing?.id) {
        await supabase.from(table).update({
          increase: (existing.increase ?? 0) + inc,
          decrease: (existing.decrease ?? 0) + dec,
        }).eq("id", existing.id);
      } else {
        await supabase.from(table).insert({
          scenario_id: scenarioId,
          year: c.year,
          level,
          increase: inc,
          decrease: dec,
        } as any);
      }
      return;
    }
    case "conversion": {
      await supabase.from("conversions").insert({
        scenario_id: scenarioId,
        year: c.year,
        external_level: String(d.external_level ?? "Medium"),
        internal_level: String(d.internal_level ?? "Low"),
        count: Number(d.count ?? 0),
        overlap_months: Number(d.overlap_months ?? 3),
      } as any);
      return;
    }
    case "nearshoring": {
      await supabase.from("nearshoring_additions").insert({
        scenario_id: scenarioId,
        year: c.year,
        replaces_external_level: String(d.replaces_external_level ?? d.level ?? "Medium"),
        count: Number(d.count ?? 0),
        overlap_months: Number(d.overlap_months ?? 3),
      } as any);
      return;
    }
    case "category_adjustment": {
      const cat = String(d.category ?? "");
      if (!cat) return;
      const pct = Number(d.adjustment_pct ?? d.pct ?? 0);
      const { data: existing } = await supabase
        .from("category_adjustments")
        .select("id")
        .eq("scenario_id", scenarioId)
        .eq("year", c.year)
        .eq("category", cat)
        .maybeSingle();
      if (existing?.id) {
        await supabase.from("category_adjustments").update({ adjustment_pct: pct }).eq("id", existing.id);
      } else {
        await supabase.from("category_adjustments").insert({
          scenario_id: scenarioId,
          year: c.year,
          category: cat,
          adjustment_pct: pct,
        } as any);
      }
      return;
    }
    case "capex": {
      await supabase.from("capex_plan").insert({
        scenario_id: scenarioId,
        year: c.year,
        capex_type: String(d.capex_type ?? "Hardware"),
        amount: Number(d.amount ?? 0),
        description: d.description ?? c.description,
      } as any);
      return;
    }
  }
}
