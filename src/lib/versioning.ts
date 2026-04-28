// Hjelpere for versjonering av Assumptions-data.
// Henter, sammenligner og gjenoppretter hele assumptions-state for et scenario.
import { supabase } from "@/integrations/supabase/client";

// Tabeller som inngår i en assumptions-versjon (per scenario).
const SCOPED_TABLES = [
  "global_assumptions",
  "central_assumptions",
  "internal_fte_changes",
  "external_fte_changes",
  "conversions",
  "nearshoring_additions",
  "nearshoring_changes",
  "category_adjustments",
  "capex_plan",
] as const;

export type AssumptionsSnapshot = {
  scenario_id: string;
  taken_at: string;
  tables: Record<string, any[]>;
};

/** Henter alle assumptions-rader for et scenario som en JSON-snapshot. */
export async function captureAssumptionsSnapshot(
  scenarioId: string,
): Promise<AssumptionsSnapshot> {
  const tables: Record<string, any[]> = {};
  await Promise.all(
    SCOPED_TABLES.map(async (t) => {
      const { data, error } = await supabase.from(t).select("*").eq("scenario_id", scenarioId);
      if (error) throw error;
      tables[t] = data ?? [];
    }),
  );
  return { scenario_id: scenarioId, taken_at: new Date().toISOString(), tables };
}

/** Kort, menneskelig oppsummering basert på diff mot forrige snapshot. */
export function diffSummary(
  prev: AssumptionsSnapshot | null,
  next: AssumptionsSnapshot,
): string {
  if (!prev) return "Første versjon";
  const labels: Record<string, string> = {
    global_assumptions: "Globale drivere",
    central_assumptions: "Central drivere",
    internal_fte_changes: "Interne FTE",
    external_fte_changes: "Eksterne FTE",
    conversions: "Konverteringer",
    nearshoring_additions: "Nearshoring (legacy)",
    nearshoring_changes: "Nearshoring",
    category_adjustments: "Kategori-justeringer",
    capex_plan: "Capex-plan",
  };
  const changed: string[] = [];
  for (const t of SCOPED_TABLES) {
    const a = JSON.stringify(stripVolatile(prev.tables[t] ?? []));
    const b = JSON.stringify(stripVolatile(next.tables[t] ?? []));
    if (a !== b) changed.push(labels[t] ?? t);
  }
  if (!changed.length) return "Ingen endringer";
  if (changed.length <= 2) return `Endret: ${changed.join(", ")}`;
  return `Endret ${changed.length} seksjoner`;
}

function stripVolatile(rows: any[]) {
  // Strip auto-managed timestamps/ids, but KEEP comment + comment_updated_at +
  // comment_updated_by + adjustment_amount_tnok so changes to these trigger a
  // new auto-version and show up in the diff summary.
  return rows
    .map(({ created_at, updated_at, id, ...rest }) => rest)
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
}

/**
 * Gjenoppretter en snapshot ved å slette eksisterende rader og sette inn
 * de lagrede. cost_lines røres ikke.
 */
export async function restoreAssumptionsSnapshot(snapshot: AssumptionsSnapshot): Promise<void> {
  const scenarioId = snapshot.scenario_id;
  for (const t of SCOPED_TABLES) {
    const { error: delErr } = await supabase.from(t).delete().eq("scenario_id", scenarioId);
    if (delErr) throw delErr;
    const rows = (snapshot.tables[t] ?? []).map((r: any) => {
      // La id stå – uuid'er er unike og vil ikke kollidere etter delete.
      const { created_at, updated_at, ...rest } = r;
      return { ...rest, scenario_id: scenarioId };
    });
    if (rows.length) {
      const { error: insErr } = await supabase.from(t).insert(rows as any);
      if (insErr) throw insErr;
    }
  }
}
