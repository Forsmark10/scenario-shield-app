// Excel/CSV-import for cost_lines.
// Genererer en parsed + validert preview før brukeren bekrefter import.
// Speiler logikken i src/lib/csvImport.ts (samme flagg-regler).

import * as XLSX from "xlsx";
import Papa from "papaparse";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedRow {
  category: string;
  project: string;
  account: number;
  account_name: string;
  cost_type: "Local" | "Central";
  ac_2025: number;
  bu_2026_monthly: number[];
  fc_2026_monthly: number[];
  is_fte_master: boolean;
  fte_driver_pct: number | null;
  is_existing_depreciation_alfa: boolean;
  is_existing_depreciation_phaseout: boolean;
  /** Indeks i originalfilen (1-basert, etter header). */
  source_row: number;
}

export interface RowIssue {
  row: number;
  field: string;
  message: string;
  severity: "error" | "warning";
}

export interface ParseResult {
  rows: ParsedRow[];
  issues: RowIssue[];
  totalRows: number;
  /** Kategorier som finnes i cost_lines fra før (for advarsel ved nye verdier) */
  knownCategories: string[];
}

const num = (v: unknown): number => {
  if (v === null || v === undefined || v === "") return 0;
  if (typeof v === "number") return isNaN(v) ? 0 : v;
  const s = String(v).replace(/\s/g, "").replace(/,/g, ".");
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
};

const isNumericLike = (v: unknown): boolean => {
  if (v === null || v === undefined || v === "") return true;
  if (typeof v === "number") return !isNaN(v);
  const s = String(v).trim();
  if (s === "") return true;
  return /^-?[\d\s.,]+$/.test(s);
};

const monthCols = (prefix: string) =>
  Array.from({ length: 12 }, (_, i) => `${prefix}_${String(i + 1).padStart(2, "0")}`);

function pick(record: Record<string, any>, ...keys: string[]): any {
  for (const k of keys) {
    if (record[k] !== undefined && record[k] !== null && record[k] !== "") return record[k];
    // case-insensitive lookup
    const lower = k.toLowerCase();
    for (const rk of Object.keys(record)) {
      if (rk.toLowerCase() === lower && record[rk] !== "") return record[rk];
    }
  }
  return undefined;
}

function rowsFromXlsx(file: ArrayBuffer): Record<string, any>[] {
  const wb = XLSX.read(file, { type: "array" });
  // Bruk første ark (eller "cost_lines" hvis det finnes)
  const sheetName =
    wb.SheetNames.find((n) => n.toLowerCase().includes("cost_line")) ?? wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: "" });
}

async function rowsFromCsv(file: File): Promise<Record<string, any>[]> {
  const text = await file.text();
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
    transformHeader: (h) => h.trim(),
  });
  return parsed.data;
}

function buildRow(
  raw: Record<string, any>,
  idx: number,
  knownCategories: Set<string>,
): { row: ParsedRow | null; issues: RowIssue[] } {
  const issues: RowIssue[] = [];
  const sourceRow = idx + 2; // +1 for header, +1 for 1-basert

  const category = String(pick(raw, "Category", "category", "Kategori") ?? "").trim();
  const project = String(pick(raw, "Project", "project", "Prosjekt") ?? "").trim();
  const accountRaw = pick(raw, "Account", "account", "Konto");
  const accountName = String(pick(raw, "Account Name", "account_name", "Navn") ?? "").trim();
  const typeRaw = String(pick(raw, "Type", "cost_type") ?? "Local").trim();

  // Hopp over tomme rader (ingen kategori OG ingen konto)
  if (!category && (accountRaw === undefined || accountRaw === "")) {
    return { row: null, issues: [] };
  }

  if (!category) {
    issues.push({ row: sourceRow, field: "Category", message: "Kategori mangler", severity: "error" });
  } else if (knownCategories.size > 0 && !knownCategories.has(category)) {
    issues.push({
      row: sourceRow,
      field: "Category",
      message: `Ukjent kategori "${category}" (finnes ikke fra før)`,
      severity: "warning",
    });
  }

  const account = parseInt(String(accountRaw ?? "0"), 10);
  if (!account || isNaN(account)) {
    issues.push({ row: sourceRow, field: "Account", message: "Konto mangler eller er ugyldig", severity: "error" });
  }

  if (typeRaw !== "Local" && typeRaw !== "Central") {
    issues.push({
      row: sourceRow,
      field: "Type",
      message: `Type "${typeRaw}" må være Local eller Central`,
      severity: "error",
    });
  }

  // Numerisk validering for AC + månedskolonner
  const ac2025raw = pick(raw, "AC 2025", "ac_2025");
  if (!isNumericLike(ac2025raw)) {
    issues.push({
      row: sourceRow,
      field: "AC 2025",
      message: `AC 2025 inneholder ikke-numerisk verdi: "${ac2025raw}"`,
      severity: "error",
    });
  }

  const buCols = monthCols("BU_2026");
  const fcCols = monthCols("FC_2026");
  for (const c of [...buCols, ...fcCols]) {
    const v = raw[c];
    if (v !== undefined && v !== "" && !isNumericLike(v)) {
      issues.push({
        row: sourceRow,
        field: c,
        message: `Ikke-numerisk verdi i ${c}: "${v}"`,
        severity: "error",
      });
    }
  }

  const isFteMaster = account === 50000;
  let driver: number | null = null;
  if (account === 54000) driver = 0.141;
  else if (account === 50205) driver = 0.12;
  else if (account === 54005) driver = 0.0169;
  else if (account === 59450) driver = 0.05;

  const isAlfa = category === "Depreciation" && project === "ALFA";
  const isPhaseout =
    category === "Depreciation" && (project === "Hardware" || project === "Software");

  const row: ParsedRow = {
    category,
    project,
    account: account || 0,
    account_name: accountName,
    cost_type: typeRaw === "Central" ? "Central" : "Local",
    ac_2025: num(ac2025raw),
    bu_2026_monthly: buCols.map((c) => num(raw[c])),
    fc_2026_monthly: fcCols.map((c) => num(raw[c])),
    is_fte_master: isFteMaster,
    fte_driver_pct: driver,
    is_existing_depreciation_alfa: isAlfa,
    is_existing_depreciation_phaseout: isPhaseout,
    source_row: sourceRow,
  };

  return { row, issues };
}

export async function parseImportFile(file: File): Promise<ParseResult> {
  // Hent eksisterende kategorier for advarsel om nye verdier
  const { data: existing } = await supabase.from("cost_lines").select("category");
  const knownCategories = new Set<string>(
    (existing ?? []).map((r) => String(r.category)).filter(Boolean),
  );

  let raw: Record<string, any>[] = [];
  const lower = file.name.toLowerCase();
  if (lower.endsWith(".csv")) {
    raw = await rowsFromCsv(file);
  } else {
    const buf = await file.arrayBuffer();
    raw = rowsFromXlsx(buf);
  }

  const rows: ParsedRow[] = [];
  const issues: RowIssue[] = [];
  raw.forEach((r, idx) => {
    const { row, issues: rowIssues } = buildRow(r, idx, knownCategories);
    if (row) rows.push(row);
    issues.push(...rowIssues);
  });

  return {
    rows,
    issues,
    totalRows: rows.length,
    knownCategories: Array.from(knownCategories).sort(),
  };
}

export interface CommitResult {
  inserted: number;
  errors: string[];
}

/** Erstatter cost_lines fullstendig med de parsede radene. */
export async function commitImport(rows: ParsedRow[]): Promise<CommitResult> {
  const errors: string[] = [];
  if (!rows.length) return { inserted: 0, errors: ["Ingen rader å importere."] };

  // Slett alle eksisterende rader
  const { error: delErr } = await supabase
    .from("cost_lines")
    .delete()
    .not("id", "is", null);
  if (delErr) errors.push(`Sletting feilet: ${delErr.message}`);

  // Insert i chunks
  const payload = rows.map(({ source_row, ...r }) => r);
  let inserted = 0;
  const chunkSize = 200;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error, count } = await supabase
      .from("cost_lines")
      .insert(chunk, { count: "exact" });
    if (error) {
      errors.push(`Rad ${i}–${i + chunk.length}: ${error.message}`);
    } else {
      inserted += count ?? chunk.length;
    }
  }

  return { inserted, errors };
}
