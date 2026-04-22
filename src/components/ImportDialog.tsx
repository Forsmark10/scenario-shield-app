import { useRef, useState } from "react";
import { Upload, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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
import { cn } from "@/lib/utils";
import {
  parseImportFile,
  commitImport,
  type ParseResult,
  type ParsedRow,
} from "@/lib/excelImport";
import { formatNumberNO } from "@/lib/format";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Kalles etter vellykket import slik at parent kan re-laste data. */
  onImported?: () => void;
}

export function ImportDialog({ open, onOpenChange, onImported }: ImportDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [result, setResult] = useState<ParseResult | null>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    setParsing(false);
    setCommitting(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setParsing(true);
    setResult(null);
    try {
      const r = await parseImportFile(f);
      setResult(r);
    } catch (e: any) {
      toast.error("Kunne ikke lese filen", { description: e?.message ?? String(e) });
      setFile(null);
    } finally {
      setParsing(false);
    }
  };

  const handleCommit = async () => {
    if (!result) return;
    const errors = result.issues.filter((i) => i.severity === "error");
    if (errors.length > 0) {
      toast.error(`Kan ikke importere: ${errors.length} feil må rettes først`);
      return;
    }
    setCommitting(true);
    try {
      const r = await commitImport(result.rows);
      if (r.errors.length > 0) {
        toast.warning(`Importerte ${r.inserted} rader med advarsler`, {
          description: r.errors.slice(0, 3).join(" · "),
        });
      } else {
        toast.success(`Importerte ${r.inserted} rader`);
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

  const errorCount = result?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warningCount = result?.issues.filter((i) => i.severity === "warning").length ?? 0;
  const previewRows = result?.rows.slice(0, 10) ?? [];

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-4xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Importer cost_lines</DialogTitle>
          <DialogDescription>
            Last opp en Excel- eller CSV-fil. Du får en preview og validering før import erstatter eksisterende data.
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
                <span className="text-muted-foreground">
                  Støttede formater: .xlsx, .xls, .csv
                </span>
              )}
            </div>
            {parsing && <Loader2 className="h-4 w-4 animate-spin ml-auto text-muted-foreground" />}
          </div>

          {/* Status */}
          {result && (
            <div className="flex items-center gap-3 flex-wrap">
              <Badge variant="secondary" className="gap-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {result.totalRows} rader funnet
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
          {result && result.issues.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <div className="px-3 py-2 bg-muted/50 text-xs font-medium border-b">
                Valideringsmeldinger
              </div>
              <ScrollArea className="max-h-[140px]">
                <ul className="text-xs divide-y">
                  {result.issues.slice(0, 50).map((iss, i) => (
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
                  {result.issues.length > 50 && (
                    <li className="px-3 py-1.5 text-muted-foreground italic">
                      … og {result.issues.length - 50} til
                    </li>
                  )}
                </ul>
              </ScrollArea>
            </div>
          )}

          {/* Preview */}
          {result && previewRows.length > 0 && (
            <div className="border rounded-lg overflow-hidden flex-1 min-h-0 flex flex-col">
              <div className="px-3 py-2 bg-muted/50 text-xs font-medium border-b flex items-center justify-between">
                <span>Forhåndsvisning – første {previewRows.length} rader</span>
                <span className="text-muted-foreground">tNOK</span>
              </div>
              <ScrollArea className="flex-1">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-card border-b">
                    <tr>
                      {[
                        "Kategori",
                        "Prosjekt",
                        "Konto",
                        "Navn",
                        "Type",
                        "AC 2025",
                        "BU 2026",
                        "FC 2026",
                        "Flagg",
                      ].map((h) => (
                        <th key={h} className="text-left font-medium px-2 py-1.5 whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r: ParsedRow, i) => {
                      const bu = r.bu_2026_monthly.reduce((s, x) => s + x, 0);
                      const fc = r.fc_2026_monthly.reduce((s, x) => s + x, 0);
                      const flags = [
                        r.is_fte_master && "FTE-master",
                        r.fte_driver_pct != null && `driver ${(r.fte_driver_pct * 100).toFixed(2)}%`,
                        r.is_existing_depreciation_alfa && "ALFA",
                        r.is_existing_depreciation_phaseout && "Phaseout",
                      ].filter(Boolean) as string[];
                      return (
                        <tr key={i} className="border-b hover:bg-muted/30">
                          <td className="px-2 py-1">{r.category}</td>
                          <td className="px-2 py-1">{r.project}</td>
                          <td className="px-2 py-1 font-mono">{r.account}</td>
                          <td className="px-2 py-1">{r.account_name}</td>
                          <td className="px-2 py-1">
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                              {r.cost_type}
                            </Badge>
                          </td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatNumberNO(r.ac_2025, 0)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatNumberNO(bu, 0)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{formatNumberNO(fc, 0)}</td>
                          <td className="px-2 py-1">
                            <div className="flex flex-wrap gap-1">
                              {flags.map((f) => (
                                <Badge
                                  key={f}
                                  variant="secondary"
                                  className="text-[10px] px-1.5 py-0"
                                >
                                  {f}
                                </Badge>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollArea>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={committing}>
            Avbryt
          </Button>
          <Button
            onClick={handleCommit}
            disabled={!result || committing || errorCount > 0 || result.totalRows === 0}
          >
            {committing && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Bekreft import ({result?.totalRows ?? 0} rader)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
