import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { toast as sonnerToast } from "sonner";

interface Props {
  /** Current comment value (null if none). */
  value: string | null | undefined;
  /** Last update timestamp ISO string. */
  updatedAt?: string | null;
  /** Optional author. Currently always null in this app. */
  updatedBy?: string | null;
  /** Persists the new value. Resolve when saved. */
  onSave: (next: string | null) => Promise<void> | void;
  /** Optional context label (e.g. "Lønnsvekst 2027"). Shown in popover header. */
  label?: string;
  className?: string;
}

/**
 * Liten kommentar-prikk i hjørnet av en celle. Klikk åpner popover med
 * tekstfelt og lagre-knapp. Endrer farge basert på om kommentar finnes.
 */
export function CommentPopover({ value, updatedAt, updatedBy, onSave, label, className }: Props) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  const hasComment = !!(value && value.trim());

  useEffect(() => {
    setDraft(value ?? "");
  }, [value, open]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const next = draft.trim() ? draft.trim() : null;
      await onSave(next);
      sonnerToast.success(next ? "Kommentar lagret" : "Kommentar fjernet", {
        duration: 1500,
        position: "bottom-right",
      });
      setOpen(false);
    } catch (e: any) {
      sonnerToast.error("Kunne ikke lagre", { description: e?.message ?? String(e) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={hasComment ? "Vis/rediger kommentar" : "Legg til kommentar"}
          title={hasComment ? value! : "Legg til kommentar"}
          className={cn(
            "absolute top-0.5 right-0.5 z-10 grid place-items-center h-3.5 w-3.5 rounded-sm transition-colors",
            hasComment
              ? "text-primary hover:text-primary/80"
              : "text-muted-foreground/30 hover:text-muted-foreground opacity-0 group-hover:opacity-100",
            className,
          )}
          onClick={(e) => e.stopPropagation()}
        >
          <MessageSquare className="h-3 w-3" strokeWidth={hasComment ? 2.5 : 2} fill={hasComment ? "currentColor" : "none"} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-3 space-y-2"
        align="end"
        side="bottom"
        onClick={(e) => e.stopPropagation()}
      >
        {label && (
          <div className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">
            {label}
          </div>
        )}
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Hvorfor ble dette tiltaket lagt inn?"
          className="text-xs min-h-[80px]"
          autoFocus
          maxLength={1000}
        />
        <div className="flex items-center justify-between gap-2 pt-1">
          <div className="text-[10px] text-muted-foreground leading-tight">
            {updatedAt ? (
              <>
                Sist endret {new Date(updatedAt).toLocaleString("nb-NO")}
                {updatedBy ? ` · ${updatedBy}` : ""}
              </>
            ) : (
              "Ikke lagret enda"
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setOpen(false)}>
              Avbryt
            </Button>
            <Button size="sm" className="h-7 px-3 text-xs" disabled={saving} onClick={handleSave}>
              {saving ? "Lagrer…" : "Lagre"}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
