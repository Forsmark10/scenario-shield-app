import { useEffect, useMemo, useState } from "react";
import { Trash2, Eye, GitCompare, RotateCcw, Database } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAllScenarios } from "@/hooks/useAllScenarios";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { formatNumberNO } from "@/lib/format";
import { cn } from "@/lib/utils";
import { listBackups, deleteBackup, type BackupSummary } from "@/lib/excelImport";
import { RestoreBackupDialog } from "@/components/RestoreBackupDialog";

interface Snapshot {
  id: string;
  name: string;
  description: string | null;
  scenario_id: string;
  data: any;
  created_at: string;
}

const FC_YEARS = [2027, 2028, 2029, 2030, 2031];

export default function History() {
  const [snapshots, setSnapshots] = useState<Snapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [viewing, setViewing] = useState<Snapshot | null>(null);
  const [comparing, setComparing] = useState<Snapshot | null>(null);
  const [toDelete, setToDelete] = useState<Snapshot | null>(null);

  const [backups, setBackups] = useState<BackupSummary[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [backupReloadKey, setBackupReloadKey] = useState(0);
  const [restoring, setRestoring] = useState<BackupSummary | null>(null);
  const [backupToDelete, setBackupToDelete] = useState<BackupSummary | null>(null);

  const { scenarios } = useAllScenarios();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await (supabase as any)
        .from("forecast_snapshots")
        .select("*")
        .order("created_at", { ascending: false });
      if (!cancelled) {
        if (error) toast.error("Kunne ikke laste snapshots", { description: error.message });
        setSnapshots((data ?? []) as Snapshot[]);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBackupsLoading(true);
      try {
        const list = await listBackups(10);
        if (!cancelled) setBackups(list);
      } catch (e: any) {
        if (!cancelled)
          toast.error("Kunne ikke laste auto-backups", { description: e?.message ?? String(e) });
      } finally {
        if (!cancelled) setBackupsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backupReloadKey]);

  const scenarioName = (id: string) =>
    scenarios.find((s) => s.meta.id === id)?.meta.name ?? "Ukjent scenario";

  const handleDelete = async () => {
    if (!toDelete) return;
    const { error } = await (supabase as any)
      .from("forecast_snapshots")
      .delete()
      .eq("id", toDelete.id);
    if (error) {
      toast.error("Kunne ikke slette", { description: error.message });
    } else {
      toast.success("Snapshot slettet");
      setReloadKey((k) => k + 1);
    }
    setToDelete(null);
  };

  const handleDeleteBackup = async () => {
    if (!backupToDelete) return;
    try {
      await deleteBackup(backupToDelete.id);
      toast.success("Backup slettet");
      setBackupReloadKey((k) => k + 1);
    } catch (e: any) {
      toast.error("Kunne ikke slette backup", { description: e?.message ?? String(e) });
    } finally {
      setBackupToDelete(null);
    }
  };

  return (
    <div className="p-6 space-y-8 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Historikk</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Frosne kopier av scenarier og auto-backups av baseline-data.
        </p>
      </div>

      {/* === Snapshots === */}
      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Scenario-snapshots</h2>
          <p className="text-xs text-muted-foreground">
            Lagres manuelt fra Dashboard eller Scenario Comparison.
          </p>
        </div>
        {loading ? (
          <div className="space-y-3">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : snapshots.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">
                Ingen snapshots enda. Klikk «Lagre snapshot» fra Dashboard eller Scenario
                Comparison for å lage din første.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {snapshots.map((s) => (
              <Card key={s.id}>
                <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold text-sm">{s.name}</h3>
                      <Badge variant="outline">{scenarioName(s.scenario_id)}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(s.created_at).toLocaleString("nb-NO")}
                    </p>
                    {s.description && (
                      <p className="text-sm text-foreground/85 mt-2">{s.description}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setViewing(s)}>
                      <Eye className="h-4 w-4 mr-1.5" /> Vis
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setComparing(s)}>
                      <GitCompare className="h-4 w-4 mr-1.5" /> Sammenlign
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setToDelete(s)}
                      aria-label="Slett snapshot"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* === Auto-backups av cost_lines === */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Database className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Auto-backups av cost_lines</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Tas automatisk før hver import. Beholdes i 30 dager. Viser de 10 nyeste.
        </p>
        {backupsLoading ? (
          <div className="space-y-2">
            {[...Array(2)].map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : backups.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center">
              <p className="text-sm text-muted-foreground">
                Ingen auto-backups enda. En backup tas neste gang du importerer.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-2">
            {backups.map((b) => (
              <Card key={b.id}>
                <CardContent className="p-3 flex items-center justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-medium text-sm">{b.name}</h3>
                      <Badge variant="secondary">{b.row_count} rader</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(b.created_at).toLocaleString("nb-NO")}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button variant="outline" size="sm" onClick={() => setRestoring(b)}>
                      <RotateCcw className="h-4 w-4 mr-1.5" /> Gjenopprett
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setBackupToDelete(b)}
                      aria-label="Slett backup"
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ViewSnapshotDialog snapshot={viewing} onOpenChange={(o) => !o && setViewing(null)} />
      <CompareSnapshotDialog
        snapshot={comparing}
        currentBundle={
          comparing ? scenarios.find((s) => s.meta.id === comparing.scenario_id) : undefined
        }
        onOpenChange={(o) => !o && setComparing(null)}
      />

      <RestoreBackupDialog
        backup={restoring}
        onOpenChange={(o) => !o && setRestoring(null)}
        onRestored={() => {
          setBackupReloadKey((k) => k + 1);
        }}
      />

      <AlertDialog open={!!toDelete} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette snapshot?</AlertDialogTitle>
            <AlertDialogDescription>
              «{toDelete?.name}» blir permanent slettet. Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Slett</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={!!backupToDelete}
        onOpenChange={(o) => !o && setBackupToDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Slette backup?</AlertDialogTitle>
            <AlertDialogDescription>
              «{backupToDelete?.name}» blir permanent slettet. Dette kan ikke angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteBackup}>Slett</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ---------- View dialog: read-only Scenario-like table ----------
function ViewSnapshotDialog({
  snapshot,
  onOpenChange,
}: {
  snapshot: Snapshot | null;
  onOpenChange: (o: boolean) => void;
}) {
  const rows = useMemo(() => {
    if (!snapshot?.data?.result?.lines) return [];
    return snapshot.data.result.lines as any[];
  }, [snapshot]);

  // Aggregate by category per year
  const byCategory = useMemo(() => {
    const map = new Map<string, Record<number, number>>();
    rows.forEach((l) => {
      if (!map.has(l.category)) {
        map.set(l.category, { 2026: 0, 2027: 0, 2028: 0, 2029: 0, 2030: 0, 2031: 0 });
      }
      const r = map.get(l.category)!;
      r[2026] += l.base_2026 ?? 0;
      FC_YEARS.forEach((y) => (r[y] += l.amounts?.[y] ?? 0));
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "nb-NO"));
  }, [rows]);

  return (
    <Dialog open={!!snapshot} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{snapshot?.name}</DialogTitle>
          <DialogDescription>
            Snapshot fra {snapshot && new Date(snapshot.created_at).toLocaleString("nb-NO")} ·
            read-only
          </DialogDescription>
        </DialogHeader>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/60">
              <tr className="border-b">
                <th className="text-left px-2 py-2">Kategori</th>
                <th className="text-right px-2 py-2">FC 2026</th>
                {FC_YEARS.map((y) => (
                  <th key={y} className="text-right px-2 py-2">
                    FC {y}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {byCategory.map(([cat, vals]) => (
                <tr key={cat} className="border-b">
                  <td className="px-2 py-1.5 font-medium">{cat}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {formatNumberNO(vals[2026], 0)}
                  </td>
                  {FC_YEARS.map((y) => (
                    <td key={y} className="px-2 py-1.5 text-right tabular-nums">
                      {formatNumberNO(vals[y], 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Compare dialog: snapshot vs current ----------
function CompareSnapshotDialog({
  snapshot,
  currentBundle,
  onOpenChange,
}: {
  snapshot: Snapshot | null;
  currentBundle: ReturnType<typeof useAllScenarios>["scenarios"][number] | undefined;
  onOpenChange: (o: boolean) => void;
}) {
  const aggregate = (lines: any[]) => {
    const map = new Map<string, Record<number, number>>();
    lines.forEach((l) => {
      if (!map.has(l.category)) {
        map.set(l.category, { 2026: 0, 2027: 0, 2028: 0, 2029: 0, 2030: 0, 2031: 0 });
      }
      const r = map.get(l.category)!;
      r[2026] += l.base_2026 ?? 0;
      FC_YEARS.forEach((y) => (r[y] += l.amounts?.[y] ?? 0));
    });
    return map;
  };

  const diff = useMemo(() => {
    if (!snapshot || !currentBundle) return [];
    const snap = aggregate(snapshot.data?.result?.lines ?? []);
    const cur = aggregate(currentBundle.result.lines as any[]);
    const cats = new Set<string>([...snap.keys(), ...cur.keys()]);
    return Array.from(cats)
      .sort((a, b) => a.localeCompare(b, "nb-NO"))
      .map((cat) => {
        const s = snap.get(cat) ?? { 2026: 0, 2027: 0, 2028: 0, 2029: 0, 2030: 0, 2031: 0 };
        const c = cur.get(cat) ?? { 2026: 0, 2027: 0, 2028: 0, 2029: 0, 2030: 0, 2031: 0 };
        return { cat, snapshot: s, current: c };
      });
  }, [snapshot, currentBundle]);

  return (
    <Dialog open={!!snapshot} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Sammenlign med nåværende</DialogTitle>
          <DialogDescription>
            «{snapshot?.name}» vs nåværende verdier (i tNOK). Røde tall viser at nåværende er
            lavere; grønne at den er høyere.
          </DialogDescription>
        </DialogHeader>
        {!currentBundle ? (
          <p className="text-sm text-muted-foreground">
            Fant ikke gjeldende scenario for sammenligning.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-muted/60">
                <tr className="border-b">
                  <th className="text-left px-2 py-2">Kategori</th>
                  <th className="text-right px-2 py-2">FC 2026 Δ</th>
                  {FC_YEARS.map((y) => (
                    <th key={y} className="text-right px-2 py-2">
                      FC {y} Δ
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {diff.map((r) => (
                  <tr key={r.cat} className="border-b">
                    <td className="px-2 py-1.5 font-medium">{r.cat}</td>
                    <DiffCell snap={r.snapshot[2026]} cur={r.current[2026]} />
                    {FC_YEARS.map((y) => (
                      <DiffCell key={y} snap={r.snapshot[y]} cur={r.current[y]} />
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DiffCell({ snap, cur }: { snap: number; cur: number }) {
  const delta = cur - snap;
  const sign = delta > 0 ? "+" : "";
  return (
    <td
      className={cn(
        "px-2 py-1.5 text-right tabular-nums",
        Math.abs(delta) < 0.5 && "text-muted-foreground",
        delta >= 0.5 && "text-[hsl(var(--positive))]",
        delta <= -0.5 && "text-destructive",
      )}
      title={`Snapshot: ${formatNumberNO(snap, 0)} · Nåværende: ${formatNumberNO(cur, 0)}`}
    >
      {Math.abs(delta) < 0.5 ? "—" : `${sign}${formatNumberNO(delta, 0)}`}
    </td>
  );
}
