import { useEffect, useState } from "react";
import { Loader2, AlertTriangle, Plus, Pencil, Equal, Trash2, ChevronDown } from "lucide-react";
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
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  loadBackupAsRows,
  diffImport,
  commitUpsert,
  type BackupSummary,
  type DiffResult,
} from "@/lib/excelImport";
import { formatNumberNO } from "@/lib/format";

interface Props {
  backup: BackupSummary | null;
  onOpenChange: (open: boolean) => void;
  onRestored?: () => void;
}

export function RestoreBackupDialog({ backup, onOpenChange, onRestored }: Props) {
  const [loading, setLoading] = useState(false);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [committing, setCommitting] = useState(false);
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!backup) {
      setDiff(null);
      setConfirmed(false);
      return;
    }
    setLoading(true);
    setDiff(null);
    setConfirmed(false);
    (async () => {
      try {
        const rows = await loadBackupAsRows(backup.id);
        const d = await diffImport(rows);
        if (!cancelled) setDiff(d);
      } catch (e: any) {
        if (!cancelled) toast.error("Kunne ikke laste backup", { description: e?.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backup]);

  const handleRestore = async () => {
    if (!diff || !backup) return;
    setCommitting(true);
    try {
      const r = await commitUpsert(diff, {
        backupLabel: `Auto-backup før gjenoppretting ${new Date().toLocaleString("nb-NO", {
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        })}`,
      });
      if (r.errors.length) {
        toast.warning(
          `Gjenopprettet: ${r.inserted} nye, ${r.updated} endret, ${r.deleted} slettet (med advarsler)`,
          { description: r.errors.slice(0, 3).join(" · ") },
        );
      } else {
        toast.success(
          `Gjenopprettet: ${r.inserted} nye, ${r.updated} endret, ${r.deleted} slettet. Ny auto-backup lagret.`,
        );
      }
      onRestored?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("Gjenoppretting feilet", { description: e?.message ?? String(e) });
    } finally {
      setCommitting(false);
    }
  };

  const heavyDelete = (diff?.removed.length ?? 0) > 5;

  return (
    <Dialog open={!!backup} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Gjenopprett fra backup</DialogTitle>
          <DialogDescription>
            «{backup?.name}» ({backup?.row_count ?? 0} rader). Forhåndsvis hva som vil endres.
            En ny auto-backup av nåværende state tas automatisk før gjenoppretting.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Beregner endringer …
            </div>
          )}

          {diff && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="space-y-3">
                <Section
                  icon={<Plus className="h-4 w-4 text-[hsl(var(--positive))]" />}
                  title="Rader som gjenoppstår"
                  count={diff.added.length}
                />
                <Section
                  icon={<Pencil className="h-4 w-4 text-amber-600 dark:text-amber-400" />}
                  title="Rader som endres tilbake"
                  count={diff.changed.length}
                />
                <Section
                  icon={<Equal className="h-4 w-4 text-muted-foreground" />}
                  title="Uendrede rader"
                  count={diff.unchanged}
                />
                <Section
                  icon={<Trash2 className="h-4 w-4 text-destructive" />}
                  title="Rader som forsvinner igjen"
                  count={diff.removed.length}
                  variant={heavyDelete ? "danger" : "default"}
                  defaultOpen={diff.removed.length > 0}
                >
                  {diff.removed.length > 0 && (
                    <>
                      {heavyDelete && (
                        <div className="mb-2 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>
                            ⚠️ {diff.removed.length} rader vil bli slettet fra databasen.
                          </span>
                        </div>
                      )}
                      <div className="border rounded-md overflow-hidden">
                        <table className="w-full text-xs">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="text-left px-2 py-1.5">Kategori</th>
                              <th className="text-left px-2 py-1.5">Prosjekt</th>
                              <th className="text-left px-2 py-1.5">Konto</th>
                              <th className="text-right px-2 py-1.5">FC 2026</th>
                            </tr>
                          </thead>
                          <tbody>
                            {diff.removed.map((r) => (
                              <tr key={r.existing.id} className="border-t">
                                <td className="px-2 py-1">{r.existing.category}</td>
                                <td className="px-2 py-1">{r.existing.project}</td>
                                <td className="px-2 py-1 font-mono">{r.existing.account}</td>
                                <td className="px-2 py-1 text-right tabular-nums">
                                  {formatNumberNO(
                                    r.existing.fc_2026_monthly.reduce((s, x) => s + x, 0),
                                    0,
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </Section>
              </div>
            </ScrollArea>
          )}
        </div>

        <DialogFooter className="flex-col sm:flex-row gap-3 sm:gap-2 items-stretch sm:items-center">
          {diff && (
            <label className="flex items-center gap-2 text-sm mr-auto cursor-pointer select-none">
              <Checkbox
                checked={confirmed}
                onCheckedChange={(v) => setConfirmed(v === true)}
                disabled={committing}
              />
              Jeg har gjennomgått endringene
            </label>
          )}
          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={committing}
            >
              Avbryt
            </Button>
            <Button
              onClick={handleRestore}
              disabled={
                !diff ||
                committing ||
                !confirmed ||
                (diff.added.length + diff.changed.length + diff.removed.length === 0)
              }
            >
              {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Bekreft gjenoppretting
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Section({
  icon,
  title,
  count,
  variant = "default",
  defaultOpen = false,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  variant?: "default" | "danger";
  defaultOpen?: boolean;
  children?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const hasContent = !!children;
  return (
    <Collapsible open={open} onOpenChange={setOpen} disabled={!hasContent}>
      <div
        className={cn(
          "border rounded-lg overflow-hidden",
          variant === "danger" && "border-destructive/40",
        )}
      >
        <CollapsibleTrigger
          className={cn(
            "w-full px-3 py-2 bg-muted/40 flex items-center justify-between gap-2 transition-colors",
            hasContent && "hover:bg-muted/60 cursor-pointer",
            !hasContent && "cursor-default",
          )}
        >
          <div className="flex items-center gap-2 text-sm font-medium">
            {icon}
            <span>{title}</span>
            <Badge
              variant={variant === "danger" && count > 0 ? "destructive" : "secondary"}
              className="ml-1"
            >
              {count}
            </Badge>
          </div>
          {hasContent && (
            <ChevronDown
              className={cn(
                "h-4 w-4 text-muted-foreground transition-transform",
                open && "rotate-180",
              )}
            />
          )}
        </CollapsibleTrigger>
        {hasContent && (
          <CollapsibleContent>
            <div className="p-3 border-t">{children}</div>
          </CollapsibleContent>
        )}
      </div>
    </Collapsible>
  );
}
