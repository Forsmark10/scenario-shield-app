import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Pencil, MessageSquare } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast as sonnerToast } from "sonner";
import { cn } from "@/lib/utils";
import {
  loadScenarioComments,
  SECTION_LABEL,
  type CommentEntry,
} from "@/components/CommentsOverviewPanel";

interface Scenario {
  id: string;
  name: string;
  sort_order: number;
}

interface Props {
  /** Active scenarios from useAllScenarios — ordered by sort_order. */
  scenarios: Scenario[];
  /** Color per scenario column (matches Dashboard). */
  colors: string[];
}

const STORAGE_KEY = "execSummary.collapsed.v1";

/**
 * Executive Summary panel on top of the Dashboard. Per scenario:
 * - shows a condensed list of all comments grouped by section
 * - editable free-text narrative persisted in scenarios.executive_summary
 * - whole panel collapsible, persisted per-scenario in localStorage
 */
export function ExecutiveSummary({ scenarios, colors }: Props) {
  const [loading, setLoading] = useState(true);
  const [commentsBy, setCommentsBy] = useState<Record<string, CommentEntry[]>>({});
  const [narrativeBy, setNarrativeBy] = useState<Record<string, string>>({});
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}");
    } catch {
      return {};
    }
  });

  // Load comments + narrative for all scenarios on mount / when scenario list changes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ids = scenarios.map((s) => s.id);
      const [{ data: rows }, ...commentLists] = await Promise.all([
        supabase.from("scenarios").select("id, executive_summary").in("id", ids),
        ...ids.map((id) => loadScenarioComments(id)),
      ]);
      if (cancelled) return;
      const narrative: Record<string, string> = {};
      (rows ?? []).forEach((r: any) => {
        narrative[r.id] = r.executive_summary ?? "";
      });
      const map: Record<string, CommentEntry[]> = {};
      ids.forEach((id, i) => {
        map[id] = commentLists[i] as CommentEntry[];
      });
      setNarrativeBy(narrative);
      setCommentsBy(map);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarios]);

  const toggleCollapsed = useCallback((id: string, isOpen: boolean) => {
    setCollapsed((prev) => {
      const next = { ...prev, [id]: !isOpen };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const isOpen = (s: Scenario) => {
    if (s.id in collapsed) return !collapsed[s.id];
    // Default: only first scenario (Steady) expanded
    return s.sort_order === 0 || scenarios[0]?.id === s.id;
  };

  return (
    <Card>
      <div className="px-6 py-4 border-b">
        <h2 className="text-sm font-semibold">Executive Summary</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Dokumenterte tiltak og narrativ per scenario.
        </p>
      </div>
      <CardContent className="pt-4 pb-5">
        <div className="grid gap-4 md:grid-cols-3">
          {scenarios.map((s, i) => (
            <ScenarioColumn
              key={s.id}
              scenario={s}
              color={colors[i % colors.length]}
              loading={loading}
              comments={commentsBy[s.id] ?? []}
              narrative={narrativeBy[s.id] ?? ""}
              onNarrativeChange={(v) => setNarrativeBy((p) => ({ ...p, [s.id]: v }))}
              open={isOpen(s)}
              onOpenChange={(open) => toggleCollapsed(s.id, open)}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function ScenarioColumn({
  scenario,
  color,
  loading,
  comments,
  narrative,
  onNarrativeChange,
  open,
  onOpenChange,
}: {
  scenario: Scenario;
  color: string;
  loading: boolean;
  comments: CommentEntry[];
  narrative: string;
  onNarrativeChange: (v: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const grouped = useMemo(() => {
    return comments.reduce<Record<string, CommentEntry[]>>((acc, e) => {
      (acc[e.section] = acc[e.section] ?? []).push(e);
      return acc;
    }, {});
  }, [comments]);

  const isEmpty = !loading && comments.length === 0 && !narrative.trim();

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-muted/40 transition-colors"
            style={{ borderLeft: `4px solid ${color}` }}
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="text-sm font-semibold truncate" style={{ color }}>
                {scenario.name}
              </span>
              {!loading && comments.length > 0 && (
                <span className="text-[10px] rounded-full bg-muted px-1.5 py-0.5 text-muted-foreground">
                  {comments.length}
                </span>
              )}
            </div>
            <ChevronDown
              className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")}
            />
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <div className="px-3 pb-3 pt-1 space-y-3">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : isEmpty ? (
              <p className="text-xs text-muted-foreground italic py-3">
                Ingen kommentarer eller oppsummering enda. Klikk på forutsetninger for å legge til kommentarer, eller fyll inn oppsummeringen.
              </p>
            ) : (
              <>
                {comments.length > 0 && (
                  <CommentsList grouped={grouped} />
                )}
                <NarrativeEditor
                  scenarioId={scenario.id}
                  value={narrative}
                  onChange={onNarrativeChange}
                />
              </>
            )}
            {isEmpty && (
              <NarrativeEditor
                scenarioId={scenario.id}
                value={narrative}
                onChange={onNarrativeChange}
              />
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function CommentsList({ grouped }: { grouped: Record<string, CommentEntry[]> }) {
  const [showAll, setShowAll] = useState<Record<string, boolean>>({});
  const MAX = 5;
  return (
    <div className="space-y-3">
      {Object.entries(grouped).map(([section, items]) => {
        const expanded = showAll[section];
        const visible = expanded ? items : items.slice(0, MAX);
        return (
          <div key={section}>
            <h4 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1">
              <MessageSquare className="h-3 w-3" />
              {SECTION_LABEL[section] ?? section}
              <span className="text-muted-foreground/70">({items.length})</span>
            </h4>
            <ul className="space-y-1">
              {visible.map((e, i) => (
                <li key={i} className="text-[11px] leading-snug">
                  <span className="text-muted-foreground">{e.label}:</span>{" "}
                  <span className="text-foreground">{e.comment}</span>
                </li>
              ))}
            </ul>
            {!expanded && items.length > MAX && (
              <button
                className="mt-1 text-[10px] text-primary hover:underline"
                onClick={() => setShowAll((p) => ({ ...p, [section]: true }))}
              >
                Vis alle {items.length} kommentarer →
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

function NarrativeEditor({
  scenarioId,
  value,
  onChange,
}: {
  scenarioId: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setDraft(value);
  }, [value, scenarioId]);

  const save = useCallback(
    async (next: string) => {
      setSaving(true);
      const { error } = await supabase
        .from("scenarios")
        .update({ executive_summary: next.trim() ? next : null } as any)
        .eq("id", scenarioId);
      setSaving(false);
      if (error) {
        sonnerToast.error("Kunne ikke lagre", { description: error.message });
      } else {
        onChange(next);
        sonnerToast.success("Oppsummering lagret", { duration: 1500, position: "bottom-right" });
      }
    },
    [scenarioId, onChange],
  );

  const handleChange = (v: string) => {
    setDraft(v);
    if (debounce.current) clearTimeout(debounce.current);
    debounce.current = setTimeout(() => save(v), 500);
  };

  return (
    <div className="rounded-md border bg-muted/20 p-2.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Narrativ
        </span>
        {!editing ? (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-[10px]"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3 w-3 mr-1" />
            Rediger
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            {saving ? "Lagrer…" : "Auto-lagres"}
          </span>
        )}
      </div>
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={() => {
            setEditing(false);
            if (debounce.current) {
              clearTimeout(debounce.current);
              if (draft !== value) save(draft);
            }
          }}
          autoFocus
          rows={6}
          placeholder="Skriv en oppsummering av dette scenarioet – hvilke tiltak, hva forventet effekt, hvilke risikoer..."
          className="text-xs min-h-[120px]"
        />
      ) : draft.trim() ? (
        <p className="text-xs whitespace-pre-wrap text-foreground/90">{draft}</p>
      ) : (
        <p className="text-xs italic text-muted-foreground">
          Skriv en oppsummering av dette scenarioet – hvilke tiltak, hva forventet effekt, hvilke risikoer...
        </p>
      )}
    </div>
  );
}
