// Excel/CSV-import for cost_lines.
// Trygg "upsert"-flyt med diff-preview og auto-backup.
//
// Steg:
//   1. parseImportFile(file)  -> ParseResult (validerer rader)
//   2. diffImport(rows)        -> DiffResult  (added/changed/unchanged/removed)
//   3. commitUpsert(diff)      -> CommitResult (tar backup, gjør UPDATE/INSERT/DELETE)
//   4. listBackups() / restoreFromBackup() for gjenoppretting

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
    const lower = k.toLowerCase();
    for (const rk of Object.keys(record)) {
      if (rk.toLowerCase() === lower && record[rk] !== "") return record[rk];
    }
  }
  return undefined;
}

function rowsFromXlsx(file: ArrayBuffer): Record<string, any>[] {
  const wb = XLSX.read(file, { type: "array" });
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
  const sourceRow = idx + 2;

  const category = String(pick(raw, "Category", "category", "Kategori") ?? "").trim();
  const project = String(pick(raw, "Project", "project", "Prosjekt") ?? "").trim();
  const accountRaw = pick(raw, "Account", "account", "Konto");
  const accountName = String(pick(raw, "Account Name", "account_name", "Navn") ?? "").trim();
  const typeRaw = String(pick(raw, "Type", "cost_type") ?? "Local").trim();

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
  // Validate annual fallback columns too
  for (const c of ["BU 2026", "BU_2026", "FC 2026", "FC_2026"]) {
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

  // Read monthly arrays. If month-columns (BU_2026_01..12) exist, use them.
  // Otherwise fall back to a single annual column ("BU 2026") spread evenly across 12 months.
  const readMonthly = (prefix: string, ...annualKeys: string[]): number[] => {
    const monthlyVals = monthCols(prefix).map((c) => raw[c]);
    const hasMonthly = monthlyVals.some((v) => v !== undefined && v !== "");
    if (hasMonthly) return monthlyVals.map(num);
    const annual = num(pick(raw, ...annualKeys));
    if (annual === 0) return Array(12).fill(0);
    return Array(12).fill(annual / 12);
  };

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
    bu_2026_monthly: readMonthly("BU_2026", "BU 2026", "BU_2026"),
    fc_2026_monthly: readMonthly("FC_2026", "FC 2026", "FC_2026"),
    is_fte_master: isFteMaster,
    fte_driver_pct: driver,
    is_existing_depreciation_alfa: isAlfa,
    is_existing_depreciation_phaseout: isPhaseout,
    source_row: sourceRow,
  };

  return { row, issues };
}

export async function parseImportFile(file: File): Promise<ParseResult> {
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

  // Detect future-year columns (FC 2027–2031). These are not stored in cost_lines –
  // the engine forecasts them from FC 2026 + drivers. Warn the user once.
  const futureFcCols = ["FC 2027", "FC 2028", "FC 2029", "FC 2030", "FC 2031"];
  const hasFutureFc = raw.some((r) =>
    futureFcCols.some((c) => r[c] !== undefined && r[c] !== "" && r[c] !== null),
  );
  if (hasFutureFc) {
    issues.push({
      row: 0,
      field: "FC 2027–2031",
      message:
        "FC 2027–2031 ignoreres ved import. Disse framskrives av modellen fra FC 2026 og driverne i Forutsetninger.",
      severity: "warning",
    });
  }

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

// ============================================================
// DIFF + UPSERT
// ============================================================

export interface ExistingRow {
  id: string;
  category: string;
  project: string;
  account: number;
  account_name: string;
  cost_type: string;
  ac_2025: number;
  bu_2026_monthly: number[];
  fc_2026_monthly: number[];
}

export interface ChangedField {
  field: string;
  before: number;
  after: number;
}

export interface ChangedRow {
  existing: ExistingRow;
  next: ParsedRow;
  changedFields: ChangedField[];
}

export interface RemovedRow {
  existing: ExistingRow;
}

export interface AddedRow {
  next: ParsedRow;
}

export interface DiffResult {
  added: AddedRow[];
  changed: ChangedRow[];
  unchanged: number;
  removed: RemovedRow[];
}

const keyOf = (r: { category: string; project: string; account: number; cost_type: string }) =>
  `${r.category}||${r.project}||${r.account}||${r.cost_type}`;

const sumArr = (a: number[]) => a.reduce((s, x) => s + x, 0);

const closeEnough = (a: number, b: number, eps = 0.5) => Math.abs(a - b) < eps;

const arraysCloseEnough = (a: number[], b: number[]) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (!closeEnough(a[i], b[i])) return false;
  }
  return true;
};

export async function diffImport(rows: ParsedRow[]): Promise<DiffResult> {
  const { data, error } = await supabase
    .from("cost_lines")
    .select("id,category,project,account,account_name,cost_type,ac_2025,bu_2026_monthly,fc_2026_monthly");
  if (error) throw new Error(`Kunne ikke lese eksisterende rader: ${error.message}`);

  const existingByKey = new Map<string, ExistingRow>();
  (data ?? []).forEach((r: any) => {
    existingByKey.set(keyOf(r), {
      id: r.id,
      category: r.category,
      project: r.project ?? "",
      account: Number(r.account),
      account_name: r.account_name ?? "",
      cost_type: r.cost_type,
      ac_2025: Number(r.ac_2025) || 0,
      bu_2026_monthly: (r.bu_2026_monthly ?? []).map(Number),
      fc_2026_monthly: (r.fc_2026_monthly ?? []).map(Number),
    });
  });

  const seenKeys = new Set<string>();
  const added: AddedRow[] = [];
  const changed: ChangedRow[] = [];
  let unchanged = 0;

  for (const next of rows) {
    const k = keyOf(next);
    seenKeys.add(k);
    const existing = existingByKey.get(k);
    if (!existing) {
      added.push({ next });
      continue;
    }
    const fields: ChangedField[] = [];
    if (!closeEnough(existing.ac_2025, next.ac_2025)) {
      fields.push({ field: "AC 2025", before: existing.ac_2025, after: next.ac_2025 });
    }
    const buBefore = sumArr(existing.bu_2026_monthly);
    const buAfter = sumArr(next.bu_2026_monthly);
    if (!arraysCloseEnough(existing.bu_2026_monthly, next.bu_2026_monthly)) {
      fields.push({ field: "BU 2026", before: buBefore, after: buAfter });
    }
    const fcBefore = sumArr(existing.fc_2026_monthly);
    const fcAfter = sumArr(next.fc_2026_monthly);
    if (!arraysCloseEnough(existing.fc_2026_monthly, next.fc_2026_monthly)) {
      fields.push({ field: "FC 2026", before: fcBefore, after: fcAfter });
    }
    if (existing.account_name !== next.account_name) {
      // Tekstendring – vises som info, ikke som tall-diff
      fields.push({ field: "Account Name", before: 0, after: 0 });
    }
    if (fields.length === 0) {
      unchanged++;
    } else {
      changed.push({ existing, next, changedFields: fields });
    }
  }

  const removed: RemovedRow[] = [];
  for (const [k, ex] of existingByKey.entries()) {
    if (!seenKeys.has(k)) removed.push({ existing: ex });
  }

  return { added, changed, unchanged, removed };
}

// ============================================================
// BACKUP
// ============================================================

export interface BackupSummary {
  id: string;
  name: string;
  row_count: number;
  created_at: string;
}

async function createBackup(label: string): Promise<{ id: string | null; error?: string }> {
  const { data, error } = await supabase.from("cost_lines").select("*");
  if (error) return { id: null, error: `Backup feilet: ${error.message}` };
  const rows = data ?? [];
  const { data: ins, error: insErr } = await supabase
    .from("cost_lines_backups" as any)
    .insert({ name: label, row_count: rows.length, data: rows as any })
    .select("id")
    .single();
  if (insErr) return { id: null, error: `Lagring av backup feilet: ${insErr.message}` };
  // Best-effort: prune gamle (>30 dager)
  supabase.rpc("prune_old_auto_versions").then(() => {});
  return { id: (ins as any).id };
}

export async function listBackups(limit = 10): Promise<BackupSummary[]> {
  const { data, error } = await supabase
    .from("cost_lines_backups" as any)
    .select("id,name,row_count,created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as BackupSummary[];
}

export async function deleteBackup(id: string): Promise<void> {
  const { error } = await supabase.from("cost_lines_backups" as any).delete().eq("id", id);
  if (error) throw new Error(error.message);
}

/** Henter en backup og konverterer rader til ParsedRow-format slik at samme diff/commit kan brukes. */
export async function loadBackupAsRows(id: string): Promise<ParsedRow[]> {
  const { data, error } = await supabase
    .from("cost_lines_backups" as any)
    .select("data")
    .eq("id", id)
    .single();
  if (error) throw new Error(error.message);
  const raw = ((data as any)?.data ?? []) as any[];
  return raw.map((r, idx): ParsedRow => ({
    category: r.category,
    project: r.project ?? "",
    account: Number(r.account) || 0,
    account_name: r.account_name ?? "",
    cost_type: r.cost_type === "Central" ? "Central" : "Local",
    ac_2025: Number(r.ac_2025) || 0,
    bu_2026_monthly: (r.bu_2026_monthly ?? []).map(Number),
    fc_2026_monthly: (r.fc_2026_monthly ?? []).map(Number),
    is_fte_master: !!r.is_fte_master,
    fte_driver_pct: r.fte_driver_pct === null || r.fte_driver_pct === undefined ? null : Number(r.fte_driver_pct),
    is_existing_depreciation_alfa: !!r.is_existing_depreciation_alfa,
    is_existing_depreciation_phaseout: !!r.is_existing_depreciation_phaseout,
    source_row: idx + 2,
  }));
}

// ============================================================
// COMMIT (upsert)
// ============================================================

export interface CommitResult {
  inserted: number;
  updated: number;
  deleted: number;
  backupId: string | null;
  errors: string[];
}

const stripParsed = (r: ParsedRow) => {
  const { source_row: _s, ...rest } = r;
  return rest;
};

/** Tar backup, gjør oppdatering/innsetting/sletting basert på diff. */
export async function commitUpsert(
  diff: DiffResult,
  options: { backupLabel?: string } = {},
): Promise<CommitResult> {
  const errors: string[] = [];

  // 1. Auto-backup
  const label =
    options.backupLabel ??
    `Auto-backup før import ${new Date().toLocaleString("nb-NO", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })}`;
  const backup = await createBackup(label);
  if (backup.error) errors.push(backup.error);

  // 2. Inserts
  let inserted = 0;
  if (diff.added.length) {
    const payload = diff.added.map((a) => stripParsed(a.next));
    const chunkSize = 200;
    for (let i = 0; i < payload.length; i += chunkSize) {
      const chunk = payload.slice(i, i + chunkSize);
      const { error, count } = await supabase
        .from("cost_lines")
        .insert(chunk, { count: "exact" });
      if (error) errors.push(`Insert (${i}–${i + chunk.length}): ${error.message}`);
      else inserted += count ?? chunk.length;
    }
  }

  // 3. Updates (én per rad – PostgREST har ingen native bulk-update)
  let updated = 0;
  for (const c of diff.changed) {
    const payload = stripParsed(c.next);
    const { error } = await supabase
      .from("cost_lines")
      .update(payload)
      .eq("id", c.existing.id);
    if (error) errors.push(`Update ${c.existing.id}: ${error.message}`);
    else updated++;
  }

  // 4. Deletes
  let deleted = 0;
  if (diff.removed.length) {
    const ids = diff.removed.map((r) => r.existing.id);
    const chunkSize = 200;
    for (let i = 0; i < ids.length; i += chunkSize) {
      const chunk = ids.slice(i, i + chunkSize);
      const { error, count } = await supabase
        .from("cost_lines")
        .delete({ count: "exact" })
        .in("id", chunk);
      if (error) errors.push(`Delete (${i}–${i + chunk.length}): ${error.message}`);
      else deleted += count ?? chunk.length;
    }
  }

  return { inserted, updated, deleted, backupId: backup.id, errors };
}

// Legacy navn beholdt for bakoverkompatibilitet (brukes ikke lenger i UI)
export interface LegacyCommitResult {
  inserted: number;
  errors: string[];
}
export async function commitImport(rows: ParsedRow[]): Promise<LegacyCommitResult> {
  const diff = await diffImport(rows);
  const res = await commitUpsert(diff);
  return { inserted: res.inserted + res.updated, errors: res.errors };
}
