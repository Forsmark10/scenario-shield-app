import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";

export interface ImportResult {
  inserted: number;
  skipped: number;
  errors: string[];
}

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  const s = String(v).replace(/\s/g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const monthCols = (prefix: string) =>
  Array.from({ length: 12 }, (_, i) => `${prefix}_${String(i + 1).padStart(2, "0")}`);

export async function importCostLinesFromCsv(file: File): Promise<ImportResult> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });

  const errors: string[] = [];
  if (parsed.errors.length) {
    parsed.errors.slice(0, 5).forEach((e) => errors.push(`CSV: ${e.message}`));
  }

  const buCols = monthCols("BU_2026");
  const fcCols = monthCols("FC_2026");

  const rows = parsed.data
    .filter((r) => r && (r.Category || r.category))
    .map((r) => {
      const account = parseInt(String(r.Account ?? r.account ?? "0"), 10) || 0;
      const project = String(r.Project ?? r.project ?? "").trim();
      const category = String(r.Category ?? r.category ?? "").trim();
      const isFteMaster = account === 50000;
      let driver: number | null = null;
      if (account === 54000) driver = 0.141;
      else if (account === 50205) driver = 0.12;
      else if (account === 54005) driver = 0.0169;
      else if (account === 59450) driver = 0.05;

      const isAlfa = category === "Depreciation" && project === "ALFA";
      const isPhaseout =
        category === "Depreciation" && (project === "Hardware" || project === "Software");

      return {
        category,
        project,
        account,
        account_name: String(r["Account Name"] ?? r.account_name ?? "").trim(),
        cost_type: (String(r.Type ?? r.cost_type ?? "Local").trim() || "Local") as
          | "Local"
          | "Central",
        ac_2025: num(r["AC 2025"] ?? r.ac_2025),
        bu_2026_monthly: buCols.map((c) => num(r[c])),
        fc_2026_monthly: fcCols.map((c) => num(r[c])),
        is_fte_master: isFteMaster,
        fte_driver_pct: driver,
        is_existing_depreciation_alfa: isAlfa,
        is_existing_depreciation_phaseout: isPhaseout,
      };
    });

  if (rows.length === 0) {
    return { inserted: 0, skipped: 0, errors: [...errors, "Ingen gyldige rader funnet."] };
  }

  // Tøm tabellen før import for å unngå duplikater
  const { error: delErr } = await supabase
    .from("cost_lines")
    .delete()
    .not("id", "is", null);
  if (delErr) errors.push(`Sletting: ${delErr.message}`);

  // Bulk insert i chunks
  let inserted = 0;
  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from("cost_lines")
      .insert(chunk, { count: "exact" });
    if (error) {
      errors.push(`Rad ${i}-${i + chunk.length}: ${error.message}`);
    } else {
      inserted += count ?? chunk.length;
    }
  }

  return { inserted, skipped: rows.length - inserted, errors };
}
