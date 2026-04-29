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
      // Felles gruppe-ID slik at alle tre scenario-radene behandles som én snapshot.
      const groupId = (globalThis.crypto as any)?.randomUUID
        ? (globalThis.crypto as any).randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

      // Hent komplett assumptions-tilstand per scenario (alle tabellene + kommentarer).
      const assumptionsByScenario = await Promise.all(
        scenarios.map((b) => captureAssumptionsSnapshot(b.meta.id)),
      );

      const rows = scenarios.map((bundle, i) => ({
        name: name.trim(),
        description: description.trim() || null,
        scenario_id: bundle.meta.id,
        snapshot_group_id: groupId,
        data: {
          inputs: bundle.inputs,
          result: bundle.result,
          meta: bundle.meta,
          // Komplett assumptions-tilstand for restore.
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
            Frys nåværende forutsetninger og resultater for alle {scenarios.length} scenarioer.
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
