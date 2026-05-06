import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import type { ScenarioBundle } from "@/hooks/useAllScenarios";
import { captureAssumptionsSnapshot } from "@/lib/versioning";
import { calculateForecast } from "@/lib/forecast/engine";
import type { CostLineRow, ForecastInputs } from "@/lib/forecast/types";

/**
 * Henter ferske inputs (fra DB) for ett scenario og bygger en ForecastInputs.
 * Bruker de allerede-fangede assumptions-tabellene (per-scenario data) og henter
 * delte basisrater/kostnadslinjer på nytt slik at vi alltid lagrer NÅVÆRENDE
 * tilstand – ikke en stale snapshot fra app-mount.
 */
async function buildFreshInputs(
  scenarioId: string,
  tables: Record<string, any[]>,
): Promise<ForecastInputs> {
  const [cl, dr, intRates, extRates, nsBase] = await Promise.all([
    supabase.from("cost_lines").select("*"),
    supabase.from("depreciation_rules").select("*"),
    supabase.from("internal_fte_base_rates").select("*"),
    supabase.from("external_fte_base_rates").select("*"),
    supabase.from("nearshoring_base").select("*").limit(1).maybeSingle(),
  ]);
  const errs = [cl, dr, intRates, extRates, nsBase].map((r) => r.error).filter(Boolean);
  if (errs.length) throw new Error(errs.map((e) => e!.message).join("; "));

  return {
    scenario_id: scenarioId,
    cost_lines: (cl.data ?? []) as unknown as CostLineRow[],
    global_assumptions: tables.global_assumptions ?? [],
    central_assumptions: tables.central_assumptions ?? [],
    internal_fte_changes: (tables.internal_fte_changes ?? []) as ForecastInputs["internal_fte_changes"],
    external_fte_changes: (tables.external_fte_changes ?? []) as ForecastInputs["external_fte_changes"],
    conversions: (tables.conversions ?? []) as ForecastInputs["conversions"],
    nearshoring_additions: (tables.nearshoring_additions ?? []) as ForecastInputs["nearshoring_additions"],
    nearshoring_changes: (tables.nearshoring_changes ?? []) as ForecastInputs["nearshoring_changes"],
    category_adjustments: tables.category_adjustments ?? [],
    capex_plan: (tables.capex_plan ?? []) as ForecastInputs["capex_plan"],
    depreciation_phaseout: (tables.depreciation_phaseout ?? []) as ForecastInputs["depreciation_phaseout"],
    internal_to_nearshoring_conversions: (tables.internal_to_nearshoring_conversions ?? []) as ForecastInputs["internal_to_nearshoring_conversions"],
    one_off_effects: (tables.one_off_effects ?? []) as ForecastInputs["one_off_effects"],
    depreciation_rules: (dr.data ?? []) as ForecastInputs["depreciation_rules"],
    internal_fte_base_rates: (intRates.data ?? []) as ForecastInputs["internal_fte_base_rates"],
    external_fte_base_rates: (extRates.data ?? []) as ForecastInputs["external_fte_base_rates"],
    nearshoring_base:
      (nsBase.data as ForecastInputs["nearshoring_base"]) ?? {
        base_annual_cost_eur: 75000,
        working_months: 12,
      },
  };
}

export function SaveSnapshotDialog({
  open,
  onOpenChange,
  scenarios,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scenarios: ScenarioBundle[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Navn er påkrevd");
      return;
    }
    if (scenarios.length === 0) {
      toast.error("Ingen scenarioer å lagre");
      return;
    }
    setSaving(true);
    try {
      const savedAt = new Date().toISOString();
      const groupId = (globalThis.crypto as any)?.randomUUID
        ? (globalThis.crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // 1) Hent ferske assumptions (alle tabeller per scenario, inkl. kommentarer).
      const assumptionsByScenario = await Promise.all(
        scenarios.map((b) => captureAssumptionsSnapshot(b.meta.id)),
      );

      // 2) Bruk result direkte fra useAllScenarios (allerede beregnet med calculateForecast).
      //    Dette sikrer at lagret result er IDENTISK med det som vises i appen.
      const rows = scenarios.map((bundle, i) => ({
        name: name.trim(),
        description: description.trim() || null,
        scenario_id: bundle.meta.id,
        snapshot_group_id: groupId,
        data: {
          inputs: bundle.inputs,
          result: bundle.result,
          meta: bundle.meta,
          tables: assumptionsByScenario[i].tables,
          saved_at: savedAt,
        } as any,
      })) as any[];
      const { error } = await (supabase as any)
        .from("forecast_snapshots")
        .insert(rows);
      if (error) throw error;
      toast.success(`Snapshot lagret for ${scenarios.length} scenarioer`, { description: name });
      reset();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Kunne ikke lagre", { description: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); onOpenChange(o); }}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Lagre snapshot</DialogTitle>
          <DialogDescription>
            Frys nåværende forutsetninger og beregnede resultater for alle {scenarios.length} scenarioer.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="snap-name">Navn</Label>
            <Input
              id="snap-name"
              placeholder="F.eks. Q4 2025 baseline"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="snap-desc">Beskrivelse (valgfri)</Label>
            <Textarea
              id="snap-desc"
              placeholder="Notat om hvorfor denne snapshoten ble lagret…"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Lagrer…" : "Lagre snapshot"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
