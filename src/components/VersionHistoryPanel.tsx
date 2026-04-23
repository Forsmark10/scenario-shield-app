import { useEffect, useState } from "react";
import { formatDistanceToNow, format } from "date-fns";
import { nb } from "date-fns/locale";
import { Clock, Bookmark, Eye, Undo2, Save, Trash2, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { type AssumptionsSnapshot, restoreAssumptionsSnapshot } from "@/lib/versioning";

type AutoVersion = {
  id: string;
  scenario_id: string;
  created_at: string;
  updated_at: string;
  summary: string | null;
  data: AssumptionsSnapshot;
};

type Snapshot = {
  id: string;
  scenario_id: string;
  name: string;
  description: string | null;
  created_at: string;
  data: any;
};

type RestoreTarget =
  | { kind: "auto"; row: AutoVersion }
  | { kind: "snapshot"; row: Snapshot };

type PromoteTarget = { row: AutoVersion };

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  scenarioId: string;
  scenarioName: string;
  /** Kalles etter restore så foreldrekomponenten kan re-fetche. */
  onRestored?: () => void;
}

export function VersionHistoryPanel({ open, onOpenChange, scenarioId, scenarioName, onRestored }: Props) {
  const [autos, setAutos] = useState<AutoVersion[] | null>(null);
  const [snaps, setSnaps] = useState<Snapshot[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<RestoreTarget | null>(null);
  const [promoteTarget, setPromoteTarget] = useState<PromoteTarget | null>(null);
  const [restoring, setRestoring] = useState(false);

  const load = async () => {
    if (!scenarioId) return;
    setLoading(true);
    const [a, s] = await Promise.all([
      supabase
        .from("auto_versions")
        .select("*")
        .eq("scenario_id", scenarioId)
        .order("updated_at", { ascending: false })
        .limit(50),
      supabase
        .from("forecast_snapshots")
        .select("*")
        .eq("scenario_id", scenarioId)
        .order("created_at", { ascending: false }),
    ]);
    setAutos((a.data as any) ?? []);
    setSnaps((s.data as any) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, scenarioId]);

  const handleRestore = async () => {
    if (!restoreTarget) return;
    setRestoring(true);
    try {
      const snapshot: AssumptionsSnapshot =
        restoreTarget.kind === "auto"
          ? restoreTarget.row.data
          : extractAssumptionsFromSnapshot(restoreTarget.row, scenarioId);
      await restoreAssumptionsSnapshot({ ...snapshot, scenario_id: scenarioId });
      // Lag en ny auto-versjon umiddelbart så brukeren kan angre.
      const fresh = await import("@/lib/versioning").then((m) => m.captureAssumptionsSnapshot(scenarioId));
      await supabase
        .from("auto_versions")
        .insert({ scenario_id: scenarioId, data: fresh as any, summary: "Etter gjenoppretting" } as any);
      toast.success("Gjenopprettet");
      onRestored?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Gjenoppretting feilet", { description: err?.message ?? String(err) });
    } finally {
      setRestoring(false);
      setRestoreTarget(null);
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="right" className="w-full sm:max-w-md p-0 flex flex-col">
          <SheetHeader className="p-6 pb-3 border-b">
            <SheetTitle>Versjonshistorikk</SheetTitle>
            <SheetDescription>{scenarioName}</SheetDescription>
          </SheetHeader>
          <ScrollArea className="flex-1">
            <div className="p-6 space-y-6">
              {/* Auto-versjoner */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Nylige endringer</h3>
                  <Badge variant="secondary" className="text-[10px] font-normal">
                    siste 30 dager
                  </Badge>
                </div>
                {loading && !autos ? (
                  <Loading />
                ) : !autos?.length ? (
                  <Empty text="Ingen automatiske versjoner ennå." />
                ) : (
                  <ul className="space-y-2">
                    {autos.map((v) => (
                      <li key={v.id} className="rounded-md border p-3 text-xs space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="font-medium">
                              {formatDistanceToNow(new Date(v.updated_at), { addSuffix: true, locale: nb })}
                            </div>
                            <div className="text-muted-foreground truncate">
                              {v.summary ?? "Endring"}
                            </div>
                            <div className="text-muted-foreground/70 text-[10px] mt-0.5">
                              {format(new Date(v.updated_at), "d. MMM HH:mm", { locale: nb })}
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setPromoteTarget({ row: v })}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Lagre som snapshot
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setRestoreTarget({ kind: "auto", row: v })}
                          >
                            <Undo2 className="h-3 w-3 mr-1" />
                            Gjenopprett
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <Separator />

              {/* Snapshots */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <Bookmark className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Mine snapshots</h3>
                </div>
                {loading && !snaps ? (
                  <Loading />
                ) : !snaps?.length ? (
                  <Empty text="Ingen snapshots lagret." />
                ) : (
                  <ul className="space-y-2">
                    {snaps.map((s) => (
                      <li key={s.id} className="rounded-md border p-3 text-xs space-y-2">
                        <div>
                          <div className="font-medium truncate">{s.name}</div>
                          {s.description && (
                            <div className="text-muted-foreground line-clamp-2">{s.description}</div>
                          )}
                          <div className="text-muted-foreground/70 text-[10px] mt-0.5">
                            {format(new Date(s.created_at), "d. MMM yyyy HH:mm", { locale: nb })}
                          </div>
                        </div>
                        <div className="flex gap-1.5 flex-wrap">
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs"
                            onClick={() => setRestoreTarget({ kind: "snapshot", row: s })}
                          >
                            <Undo2 className="h-3 w-3 mr-1" />
                            Gjenopprett
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 text-xs text-destructive hover:text-destructive"
                            onClick={async () => {
                              await supabase.from("forecast_snapshots").delete().eq("id", s.id);
                              toast.success("Snapshot slettet");
                              load();
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-1" />
                            Slett
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      {/* Bekreft restore */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gjenopprett versjon?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er i ferd med å tilbakestille Assumptions for{" "}
              <span className="font-medium">{scenarioName}</span> til{" "}
              <span className="font-medium">
                {restoreTarget?.kind === "snapshot"
                  ? restoreTarget.row.name
                  : restoreTarget
                    ? format(new Date(restoreTarget.row.updated_at), "d. MMM yyyy HH:mm", { locale: nb })
                    : ""}
              </span>
              . Nåværende verdier blir overskrevet (men lagres som ny auto-versjon, så du kan angre).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={restoring}>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleRestore} disabled={restoring}>
              {restoring && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
              Gjenopprett
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PromoteToSnapshotDialog
        target={promoteTarget}
        scenarioId={scenarioId}
        onClose={(saved) => {
          setPromoteTarget(null);
          if (saved) load();
        }}
      />
    </>
  );
}

function Loading() {
  return (
    <div className="text-xs text-muted-foreground flex items-center gap-2">
      <Loader2 className="h-3 w-3 animate-spin" /> Laster…
    </div>
  );
}
function Empty({ text }: { text: string }) {
  return <p className="text-xs text-muted-foreground italic">{text}</p>;
}

/** Snapshots fra Dashboard inneholder forecast-result. Vi henter ut assumptions-delen. */
function extractAssumptionsFromSnapshot(s: Snapshot, scenarioId: string): AssumptionsSnapshot {
  // Forecast-snapshots fra Dashboard har struktur { inputs, result, meta }.
  // Inputs gjenspeiler ikke nødvendigvis alle tabeller direkte, så vi
  // konverterer best-effort. Hvis ingen "tables" finnes, returner tom.
  const data: any = s.data ?? {};
  if (data?.tables) {
    return { scenario_id: scenarioId, taken_at: s.created_at, tables: data.tables };
  }
  if (data?.inputs?.tables) {
    return { scenario_id: scenarioId, taken_at: s.created_at, tables: data.inputs.tables };
  }
  // Fallback: tom snapshot — restore vil tømme tabellene.
  return { scenario_id: scenarioId, taken_at: s.created_at, tables: {} };
}

function PromoteToSnapshotDialog({
  target,
  scenarioId,
  onClose,
}: {
  target: PromoteTarget | null;
  scenarioId: string;
  onClose: (saved: boolean) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (target) {
      setName("");
      setDescription("");
    }
  }, [target]);

  const handleSave = async () => {
    if (!target) return;
    if (!name.trim()) {
      toast.error("Gi snapshotet et navn");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("forecast_snapshots").insert({
        scenario_id: scenarioId,
        name: name.trim(),
        description: description.trim() || null,
        data: { tables: target.row.data?.tables ?? {}, source: "auto_version", auto_version_id: target.row.id } as any,
      } as any);
      if (error) throw error;
      toast.success("Snapshot lagret");
      onClose(true);
    } catch (err: any) {
      toast.error("Kunne ikke lagre", { description: err?.message ?? String(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => !o && onClose(false)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Lagre som snapshot</DialogTitle>
          <DialogDescription>
            Gi denne versjonen et navn så den beholdes permanent.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Input placeholder="Navn (f.eks. 'Før kategori-justering')" value={name} onChange={(e) => setName(e.target.value)} />
          <Textarea
            placeholder="Beskrivelse (valgfritt)"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onClose(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />}
            Lagre snapshot
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
