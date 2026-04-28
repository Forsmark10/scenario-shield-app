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
      const rows = scenarios.map((bundle) => ({
        name: name.trim(),
        description: description.trim() || null,
        scenario_id: bundle.meta.id,
        data: {
          inputs: bundle.inputs,
          result: bundle.result,
          meta: bundle.meta,
          saved_at: savedAt,
        } as any,
      }));
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
