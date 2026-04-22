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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  const [scenarioId, setScenarioId] = useState<string>("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setScenarioId("");
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast.error("Navn er påkrevd");
      return;
    }
    if (!scenarioId) {
      toast.error("Velg et scenario");
      return;
    }
    const bundle = scenarios.find((s) => s.meta.id === scenarioId);
    if (!bundle) {
      toast.error("Fant ikke scenario");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        description: description.trim() || null,
        scenario_id: scenarioId,
        data: {
          inputs: bundle.inputs,
          result: bundle.result,
          meta: bundle.meta,
          saved_at: new Date().toISOString(),
        } as any,
      };
      const { error } = await (supabase as any)
        .from("forecast_snapshots")
        .insert(payload);
      if (error) throw error;
      toast.success("Snapshot lagret", { description: name });
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
            Frys nåværende forutsetninger og resultater for et scenario.
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
            <Label htmlFor="snap-scenario">Scenario</Label>
            <Select value={scenarioId} onValueChange={setScenarioId}>
              <SelectTrigger id="snap-scenario">
                <SelectValue placeholder="Velg scenario" />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((s) => (
                  <SelectItem key={s.meta.id} value={s.meta.id}>
                    {s.meta.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
