import { useRef, useState } from "react";
import {
  Upload,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Plus,
  Pencil,
  Equal,
  Trash2,
  ChevronDown,
} from "lucide-react";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { cn } from "@/lib/utils";
import {
  parseImportFile,
  diffImport,
  commitUpsert,
  type ParseResult,
  type DiffResult,
} from "@/lib/excelImport";
import { formatNumberNO } from "@/lib/format";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [diff, setDiff] = useState<DiffResult | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const reset = () => {
    setFile(null);
    setParsed(null);
    setDiff(null);
    setParsing(false);
    setCommitting(false);
    setConfirmed(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    setParsed(null);
    setDiff(null);
    setConfirmed(false);
    try {
      const r = await parseImportFile(f);
      setParsed(r);
      const errors = r.issues.filter((i) => i.severity === "error");
      if (errors.length === 0 && r.rows.length > 0) {
        const d = await diffImport(r.rows);
        setDiff(d);
      }
    } catch (e: any) {
      toast.error("Kunne ikke lese filen", { description: e?.message ?? String(e) });
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const handleCommit = async () => {
    if (!diff) return;
    setCommitting(true);
    try {
      const r = await commitUpsert(diff);
      if (r.errors.length > 0) {
        toast.warning(
          `Importert: ${r.inserted} nye, ${r.updated} endret, ${r.deleted} slettet (med advarsler)`,
          { description: r.errors.slice(0, 3).join(" · ") },
        );
      } else {
        toast.success(
          `Importert: ${r.inserted} nye, ${r.updated} endret, ${r.deleted} slettet. Auto-backup lagret.`,
        );
      }
      onImported?.();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error("Import feilet", { description: e?.message ?? String(e) });
    } finally {
      setCommitting(false);
    }
  };

  const errorCount = parsed?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warningCount = parsed?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const heavyDelete = (diff?.removed.length ?? 0) > 5;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[88vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Forhåndsvis endringer</DialogTitle>
          <DialogDescription>
            Last opp en Excel- eller CSV-fil. Eksisterende rader matches på Kategori + Prosjekt +
            Konto + Type. Ingen endringer lagres før du bekrefter.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col gap-4">
          {/* Filopplasting */}
          <div className="flex items-center gap-3 p-4 border-2 border-dashed rounded-lg bg-muted/30">
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
            />
            <Button
              variant="outline"
              onClick={() => inputRef.current?.click()}
              disabled={parsing || committing}
            >
              <Upload className="h-4 w-4 mr-2" />
              Velg fil
            </Button>
            <div className="text-sm">
              {file ? (
                <span className="font-medium">{file.name}</span>
              ) : (
                <span className="text-muted-foreground">Støttede formater: .xlsx, .xls, .csv</span>
              )}
            </div>
            {parsing && (
              <Loader2 className="h-4 w-4 animate-spin ml-auto text-muted-foreground" />
            )}
          </div>

          {/* Fil-status */}
          {parsed && (
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {parsed.totalRows} rader i fil
              </Badge>
              {errorCount > 0 && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {errorCount} feil
                </Badge>
              )}
              {warningCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  {warningCount} advarsler
                </Badge>
              )}
            </div>
          )}

          {/* Issues */}
          {parsed && parsed.issues.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/50 text-xs font-medium border-b">
                Valideringsmeldinger
              </div>
              <ScrollArea className="max-h-[120px]">
                <ul className="text-xs divide-y">
                  {parsed.issues.slice(0, 50).map((iss, i) => (
                    <li
                      key={i}
                      className={cn(
                        "px-3 py-1.5 flex items-start gap-2",
                        iss.severity === "error" ? "text-destructive" : "text-muted-foreground",
                      )}
                    >
                      <span className="font-mono shrink-0">Rad {iss.row}</span>
                      <span className="font-mono shrink-0">[{iss.field}]</span>
                      <span>{iss.message}</span>
                    </li>
                  ))}
                  {parsed.issues.length > 50 && (
                    <li className="px-3 py-1.5 text-muted-foreground italic">
                      … og {parsed.issues.length - 50} til
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </div>
          )}

          {/* Diff-seksjoner */}
          {diff && (
            <ScrollArea className="flex-1 min-h-0 pr-2">
              <div className="space-y-3">
                <DiffSection
                  icon={<Plus className="h-4 w-4 text-[hsl(var(--positive))]" />}
                  title="Nye rader som vil legges til"
                  count={diff.added.length}
                  defaultOpen={diff.added.length > 0 && diff.added.length <= 20}
                >
                  {diff.added.length === 0 ? (
                    <EmptyHint>Ingen nye rader.</EmptyHint>
                  ) : (
                    <PreviewTable
                      headers={["Kategori", "Prosjekt", "Konto", "Navn", "Type", "AC 2025", "BU 2026", "FC 2026"]}
                      rows={diff.added.slice(0, 5).map((a) => [
                        a.next.category,
                        a.next.project,
                        a.next.account,
                        a.next.account_name,
                        a.next.cost_type,
                        formatNumberNO(a.next.ac_2025, 0),
                        formatNumberNO(a.next.bu_2026_monthly.reduce((s, x) => s + x, 0), 0),
                        formatNumberNO(a.next.fc_2026_monthly.reduce((s, x) => s + x, 0), 0),
                      ])}
                      footer={
                        diff.added.length > 5
                          ? `Viser 5 av ${diff.added.length}. Resten legges til ved bekreftelse.`
                          : undefined
                      }
                    />
                  )}
                </DiffSection>

                <DiffSection
                  icon={<Pencil className="h-4 w-4 text-[hsl(var(--warning))]" />}
                  title="Endrede rader"
                  count={diff.changed.length}
                  defaultOpen={diff.changed.length > 0 && diff.changed.length <= 30}
                >
                  {diff.changed.length === 0 ? (
                    <EmptyHint>Ingen endringer i eksisterende rader.</EmptyHint>
                  ) : (
                    <div className="border rounded-md overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-2 py-1.5">Kategori / Prosjekt / Konto</th>
                            <th className="text-left px-2 py-1.5">Felt</th>
                            <th className="text-right px-2 py-1.5">Før</th>
                            <th className="text-right px-2 py-1.5">Etter</th>
                            <th className="text-right px-2 py-1.5">Δ</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diff.changed.slice(0, 10).flatMap((c) =>
                            c.changedFields.map((f, fi) => (
                              <tr
                                key={`${c.existing.id}-${fi}`}
                                className="border-t hover:bg-muted/30"
                              >
                                {fi === 0 ? (
                                  <td
                                    className="px-2 py-1 align-top"
                                    rowSpan={c.changedFields.length}
                                  >
                                    <div className="font-medium">{c.existing.category}</div>
                                    <div className="text-muted-foreground">
                                      {c.existing.project} · {c.existing.account}
                                    </div>
                                  </td>
                                ) : null}
                                <td className="px-2 py-1 text-muted-foreground">{f.field}</td>
                                <td className="px-2 py-1 text-right tabular-nums">
                                  {f.field === "Account Name" ? "—" : formatNumberNO(f.before, 0)}
                                </td>
                                <td className="px-2 py-1 text-right tabular-nums">
                                  {f.field === "Account Name" ? "—" : formatNumberNO(f.after, 0)}
                                </td>
                                <td
                                  className={cn(
                                    "px-2 py-1 text-right tabular-nums",
                                    f.after - f.before > 0.5 && "text-destructive",
                                    f.after - f.before < -0.5 && "text-[hsl(var(--positive))]",
                                  )}
                                >
                                  {f.field === "Account Name"
                                    ? "tekst"
                                    : `${f.after - f.before > 0 ? "+" : ""}${formatNumberNO(f.after - f.before, 0)}`}
                                </td>
                              </tr>
                            )),
                          )}
                        </tbody>
                      </table>
                      {diff.changed.length > 10 && (
                        <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30 border-t">
                          Viser 10 av {diff.changed.length} endrede rader.
                        </div>
                      )}
                    </div>
                  )}
                </DiffSection>

                <DiffSection
                  icon={<Equal className="h-4 w-4 text-muted-foreground" />}
                  title="Uendrede rader"
                  count={diff.unchanged}
                >
                  <EmptyHint>
                    {diff.unchanged} rader er identiske og forblir uendret.
                  </EmptyHint>
                </DiffSection>

                <DiffSection
                  icon={<Trash2 className="h-4 w-4 text-destructive" />}
                  title="Rader som vil bli slettet"
                  count={diff.removed.length}
                  variant={heavyDelete ? "danger" : "default"}
                  defaultOpen={diff.removed.length > 0}
                >
                  {diff.removed.length === 0 ? (
                    <EmptyHint>Ingen rader slettes.</EmptyHint>
                  ) : (
                    <>
                      {heavyDelete && (
                        <div className="mb-2 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-xs text-destructive flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                          <span>
                            ⚠️ {diff.removed.length} rader vil bli slettet fra databasen. Sjekk
                            listen over før du bekrefter.
                          </span>
                        </div>
                      )}
                      <PreviewTable
                        headers={[
                          "Kategori",
                          "Prosjekt",
                          "Konto",
                          "Navn",
                          "Type",
                          "AC 2025",
                          "BU 2026",
                          "FC 2026",
                        ]}
                        rows={diff.removed.map((r) => [
                          r.existing.category,
                          r.existing.project,
                          r.existing.account,
                          r.existing.account_name,
                          r.existing.cost_type,
                          formatNumberNO(r.existing.ac_2025, 0),
                          formatNumberNO(r.existing.bu_2026_monthly.reduce((s, x) => s + x, 0), 0),
                          formatNumberNO(r.existing.fc_2026_monthly.reduce((s, x) => s + x, 0), 0),
                        ])}
                      />
                    </>
                  )}
                </DiffSection>

                <p className="text-xs text-muted-foreground italic px-1">
                  En auto-backup av nåværende cost_lines lagres automatisk før endringene
                  utføres. Backupen kan gjenopprettes fra Historikk-siden.
                </p>
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
              onClick={handleCommit}
              disabled={
                !diff ||
                committing ||
                errorCount > 0 ||
                !confirmed ||
                (diff.added.length + diff.changed.length + diff.removed.length === 0)
              }
            >
              {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Bekreft import
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============================================================
// Helpers
// ============================================================

function DiffSection({
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
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          "border rounded-lg overflow-hidden",
          variant === "danger" && "border-destructive/40",
        )}
      >
        <CollapsibleTrigger className="w-full px-3 py-2 bg-muted/40 hover:bg-muted/60 flex items-center justify-between gap-2 transition-colors">
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
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="p-3 border-t">{children}</div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return <p className="text-xs text-muted-foreground italic">{children}</p>;
}

function PreviewTable({
  headers,
  rows,
  footer,
}: {
  headers: string[];
  rows: (string | number)[][];
  footer?: string;
}) {
  return (
    <div className="border rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              {headers.map((h) => (
                <th key={h} className="text-left font-medium px-2 py-1.5 whitespace-nowrap">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className="border-t hover:bg-muted/30">
                {r.map((c, j) => (
                  <td
                    key={j}
                    className={cn(
                      "px-2 py-1",
                      j >= 5 && "text-right tabular-nums",
                      j === 2 && "font-mono",
                    )}
                  >
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {footer && (
        <div className="px-3 py-1.5 text-xs text-muted-foreground bg-muted/30 border-t">
          {footer}
        </div>
      )}
    </div>
  );
}
