import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  scenarioId: string;
  scenarioName: string;
}

interface CommentEntry {
  section: string;
  label: string;
  comment: string;
  updatedAt: string | null;
}

const SECTION_LABEL: Record<string, string> = {
  global_assumptions: "Globale drivere",
  central_assumptions: "Sentrale drivere",
  internal_fte_changes: "Interne FTE",
  external_fte_changes: "Eksterne FTE",
  conversions: "Konverteringer",
  nearshoring_changes: "Nearshoring",
  category_adjustments: "Kategori-justeringer",
  capex_plan: "Capex-plan",
};

function describe(section: string, row: any, variant?: "pct" | "amt" | "rate" | "central_pct" | "central_amt" | "central_rate"): string {
  switch (section) {
    case "global_assumptions":
      return `${row.year}`;
    case "central_assumptions": {
      if (variant === "central_amt") return `${row.year} · Sentral reduksjon tNOK`;
      if (variant === "central_rate") return `${row.year} · EUR/NOK-kurs`;
      return `${row.year} · Sentral pris/reduksjon %`;
    }
    case "internal_fte_changes":
    case "external_fte_changes":
      return `${row.year} · ${row.level} · inc ${row.increase} / dec ${row.decrease}`;
    case "conversions":
      return `${row.year} · ${row.external_level} → ${row.internal_level} (×${row.count})`;
    case "nearshoring_changes":
      return `${row.year} · inc ${row.increase} / dec ${row.decrease}`;
    case "category_adjustments": {
      const tag = variant === "amt" ? "tNOK" : "%";
      const value =
        variant === "amt"
          ? `${Number(row.adjustment_amount_tnok ?? 0)} tNOK`
          : `${(Number(row.adjustment_pct ?? 0) * 100).toFixed(1)}%`;
      return `${row.category} · ${row.year} · ${tag} (${value})`;
    }
    case "capex_plan":
      return `${row.year} · ${row.capex_type}${row.description ? " · " + row.description : ""} (${row.amount} tNOK)`;
    default:
      return JSON.stringify(row);
  }
}

/** Loads all comments for a scenario — also exported for use by Executive Summary on Dashboard. */
export async function loadScenarioComments(scenarioId: string): Promise<CommentEntry[]> {
  const tables = Object.keys(SECTION_LABEL);
  const results = await Promise.all(
    tables.map((t) =>
      supabase
        .from(t as any)
        .select("*")
        .eq("scenario_id", scenarioId),
    ),
  );
  const list: CommentEntry[] = [];
  results.forEach((res, idx) => {
    const section = tables[idx];
    for (const row of (res.data ?? []) as any[]) {
      if (row.comment && String(row.comment).trim()) {
        list.push({
          section,
          label: describe(section, row, section === "category_adjustments" ? "pct" : undefined),
          comment: row.comment,
          updatedAt: row.comment_updated_at ?? null,
        });
      }
      // Category adjustments has a separate comment for the tNOK cell
      if (section === "category_adjustments" && row.comment_amount && String(row.comment_amount).trim()) {
        list.push({
          section,
          label: describe(section, row, "amt"),
          comment: row.comment_amount,
          updatedAt: row.comment_amount_updated_at ?? null,
        });
      }
    }
  });
  return list;
}

export { SECTION_LABEL };
export type { CommentEntry };

export function CommentsOverviewPanel({ open, onOpenChange, scenarioId, scenarioName }: Props) {
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<CommentEntry[]>([]);

  useEffect(() => {
    if (!open || !scenarioId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const list = await loadScenarioComments(scenarioId);
      if (!cancelled) {
        setEntries(list);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, scenarioId]);

  const grouped = entries.reduce<Record<string, CommentEntry[]>>((acc, e) => {
    (acc[e.section] = acc[e.section] ?? []).push(e);
    return acc;
  }, {});

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[460px] sm:max-w-[460px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4" />
            Kommentarer · {scenarioName}
          </SheetTitle>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-100px)] mt-4 pr-3">
          {loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Ingen kommentarer er lagt inn for dette scenarioet.
            </p>
          ) : (
            <div className="space-y-5">
              {Object.entries(grouped).map(([section, items]) => (
                <div key={section}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                    {SECTION_LABEL[section]} ({items.length})
                  </h3>
                  <ul className="space-y-2">
                    {items.map((e, i) => (
                      <li key={i} className="rounded-md border bg-card p-3 text-xs">
                        <div className="font-medium text-foreground">{e.label}</div>
                        <p className="mt-1 text-foreground/80 whitespace-pre-wrap">{e.comment}</p>
                        {e.updatedAt && (
                          <div className="mt-1.5 text-[10px] text-muted-foreground">
                            {new Date(e.updatedAt).toLocaleString("nb-NO")}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}
