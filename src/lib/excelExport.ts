// Excel-eksport for LTP-modellen
// Genererer én .xlsx-fil med flere ark (Scenario, Assumptions, Comparison, Om modellen)
// Tall i tNOK. Norsk tallformat: tusenseparator = mellomrom, negative i parentes.

import * as XLSX from "xlsx";
import omModellenContent from "@/content/om-modellen.md?raw";
import type { ScenarioBundle } from "@/hooks/useAllScenarios";

const FC_YEARS = [2027, 2028, 2029, 2030, 2031] as const;

// Excel-format for norsk tNOK-stil: tusenseparator + parentes for negative + "-" for null
const NUM_FMT = '#,##0;(#,##0);"-"';
const PCT_FMT = '0.0%;(0.0%);"-"';

// ----- Hjelpere ------------------------------------------------------------

function aoaToSheet(aoa: any[][]): XLSX.WorkSheet {
  return XLSX.utils.aoa_to_sheet(aoa);
}

function applyNumberFormat(
  ws: XLSX.WorkSheet,
  startRow: number,
  endRow: number,
  startCol: number,
  endCol: number,
  fmt = NUM_FMT,
) {
  for (let r = startRow; r <= endRow; r++) {
    for (let c = startCol; c <= endCol; c++) {
      const addr = XLSX.utils.encode_cell({ r, c });
      const cell = ws[addr];
      if (cell && typeof cell.v === "number") {
        cell.z = fmt;
        cell.t = "n";
      }
    }
  }
}

function setBold(ws: XLSX.WorkSheet, row: number, colCount: number) {
  for (let c = 0; c < colCount; c++) {
    const addr = XLSX.utils.encode_cell({ r: row, c });
    const cell = ws[addr];
    if (cell) {
      cell.s = { ...(cell.s ?? {}), font: { bold: true } };
    }
  }
}

function setColWidths(ws: XLSX.WorkSheet, widths: number[]) {
  ws["!cols"] = widths.map((w) => ({ wch: w }));
}

function freezeHeader(ws: XLSX.WorkSheet, rows = 1, cols = 0) {
  ws["!freeze"] = { xSplit: cols, ySplit: rows } as any;
  // SheetJS bruker !pane / Frozen Panes via "!cols"/"!rows" — fallback via !freeze er ikke standard
  // men "!ref" + frozen via XLSX.utils.book_append_sheet + workbook.Workbook.Views fungerer best:
}

// Sett frosne ruter på workbook-nivå (mer pålitelig enn per-sheet)
function freezePanesOnSheet(ws: XLSX.WorkSheet, rows: number, cols = 0) {
  // Ref: SheetJS støtter "!margins" og frozen via Worksheet Views — bygges manuelt:
  (ws as any)["!views"] = [
    {
      state: "frozen",
      ySplit: rows,
      xSplit: cols,
      topLeftCell: XLSX.utils.encode_cell({ r: rows, c: cols }),
      activePane: "bottomRight",
    },
  ];
}

function safeSheetName(name: string): string {
  // Excel-arknavn maks 31 tegn, ikke tillatt: : \ / ? * [ ]
  return name.replace(/[:\\/?*\[\]]/g, "_").slice(0, 31);
}

// ----- Ark 1: Scenario (rådata + beregnede år) -----------------------------

function buildScenarioSheet(bundle: ScenarioBundle): XLSX.WorkSheet {
  const header = [
    "Kategori",
    "Prosjekt",
    "Konto",
    "Navn",
    "Type",
    "AC 2025",
    "BU 2026",
    "FC 2026",
    "FC 2027",
    "FC 2028",
    "FC 2029",
    "FC 2030",
    "FC 2031",
  ];

  const lines = bundle.result.lines;
  const byId = new Map(bundle.inputs.cost_lines.map((c) => [c.id, c]));

  // Sortér etter kategori → konto for stabil rekkefølge
  const sorted = [...lines].sort((a, b) => {
    const cat = a.category.localeCompare(b.category, "nb-NO");
    if (cat !== 0) return cat;
    return (a.account ?? 0) - (b.account ?? 0);
  });

  const dataRows = sorted.map((line) => {
    const cl = byId.get(line.line_id);
    const ac = Number(cl?.ac_2025 ?? 0);
    const bu = (cl?.bu_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0);
    const fc26 = line.base_2026;
    return [
      line.category,
      line.project,
      line.account ?? "",
      line.account_name,
      line.cost_type,
      ac,
      bu,
      fc26,
      line.amounts[2027] ?? 0,
      line.amounts[2028] ?? 0,
      line.amounts[2029] ?? 0,
      line.amounts[2030] ?? 0,
      line.amounts[2031] ?? 0,
    ];
  });

  // Grand Total
  const totals = [0, 0, 0, 0, 0, 0, 0, 0]; // ac, bu, fc26, fc27, fc28, fc29, fc30, fc31
  dataRows.forEach((r) => {
    for (let i = 0; i < 8; i++) totals[i] += Number(r[5 + i] ?? 0);
  });
  const grandTotalRow = [
    "Grand Total",
    "",
    "",
    "",
    "",
    totals[0],
    totals[1],
    totals[2],
    totals[3],
    totals[4],
    totals[5],
    totals[6],
    totals[7],
  ];

  const aoa = [header, ...dataRows, grandTotalRow];
  const ws = aoaToSheet(aoa);

  setColWidths(ws, [22, 14, 8, 38, 9, 12, 12, 12, 12, 12, 12, 12, 12]);
  // Tallformat for alle numeriske kolonner (kol 5..12), datarader + total
  applyNumberFormat(ws, 1, aoa.length - 1, 5, 12, NUM_FMT);
  setBold(ws, 0, header.length);
  setBold(ws, aoa.length - 1, header.length);
  freezePanesOnSheet(ws, 1, 0);

  return ws;
}

// ----- Ark 2: Assumptions ---------------------------------------------------

function buildAssumptionsSheet(bundle: ScenarioBundle): XLSX.WorkSheet {
  const i = bundle.inputs;
  const aoa: any[][] = [];

  const section = (title: string) => {
    aoa.push([]);
    aoa.push([title]);
  };

  // 1. Globale drivere
  section("Globale drivere (per år)");
  aoa.push(["År", "Lønnsvekst", "Prisvekst", "EUR/NOK"]);
  [...i.global_assumptions]
    .sort((a, b) => a.year - b.year)
    .forEach((g) =>
      aoa.push([g.year, g.salary_increase_pct, g.price_increase_pct, g.eur_nok_rate]),
    );

  // 2. Sentrale drivere
  section("Sentrale drivere (per år)");
  aoa.push(["År", "Prisvekst", "Reduksjon %", "Reduksjon tNOK", "EUR/NOK-kurs"]);
  [...i.central_assumptions]
    .sort((a, b) => a.year - b.year)
    .forEach((c: any) =>
      aoa.push([
        c.year,
        c.central_price_increase_pct,
        c.central_reduction_pct,
        c.central_reduction_amount_tnok ?? 0,
        c.central_eur_nok_rate ?? 11.3,
      ]),
    );

  // 3. Internal FTE base rates
  section("Interne FTE – grunnsatser");
  aoa.push(["Nivå", "Årskost (NOK)"]);
  i.internal_fte_base_rates.forEach((r) => aoa.push([r.level, r.base_annual_cost]));

  // 4. Internal FTE changes
  section("Interne FTE – endringer (per år / nivå)");
  aoa.push(["År", "Nivå", "Tilgang", "Avgang"]);
  [...i.internal_fte_changes]
    .sort((a, b) => a.year - b.year || a.level.localeCompare(b.level))
    .forEach((c) => aoa.push([c.year, c.level, c.increase, c.decrease]));

  // 5. External FTE base rates
  section("Eksterne FTE – grunnsatser");
  aoa.push(["Nivå", "Månedskost (NOK)", "Arbeidsmåneder"]);
  i.external_fte_base_rates.forEach((r) =>
    aoa.push([r.level, r.base_monthly_cost, r.working_months]),
  );

  // 6. External FTE changes
  section("Eksterne FTE – endringer (per år / nivå)");
  aoa.push(["År", "Nivå", "Tilgang", "Avgang"]);
  [...i.external_fte_changes]
    .sort((a, b) => a.year - b.year || a.level.localeCompare(b.level))
    .forEach((c) => aoa.push([c.year, c.level, c.increase, c.decrease]));

  // 7. Konverteringer
  section("Konverteringer (ekstern → intern)");
  aoa.push(["År", "Eksternt nivå", "Internt nivå", "Antall", "Overlapp (mnd)"]);
  [...i.conversions]
    .sort((a, b) => a.year - b.year)
    .forEach((c) =>
      aoa.push([c.year, c.external_level, c.internal_level, c.count, c.overlap_months]),
    );

  // 8. Nearshoring
  section("Nearshoring – grunnlag");
  aoa.push(["Årskost EUR", "Arbeidsmåneder"]);
  aoa.push([i.nearshoring_base.base_annual_cost_eur, i.nearshoring_base.working_months]);

  section("Nearshoring – tilvekst");
  aoa.push(["År", "Erstatter ekstern (nivå)", "Antall", "Overlapp (mnd)"]);
  [...i.nearshoring_additions]
    .sort((a, b) => a.year - b.year)
    .forEach((n) =>
      aoa.push([n.year, n.replaces_external_level, n.count, n.overlap_months]),
    );

  // 9. Kategori-justeringer
  section("Kategori-justeringer (% per kategori / år)");
  aoa.push(["År", "Kategori", "Justering %"]);
  [...i.category_adjustments]
    .sort((a, b) => a.year - b.year || a.category.localeCompare(b.category))
    .forEach((a) => aoa.push([a.year, a.category, a.adjustment_pct]));

  // 10. Capex-plan
  section("Capex-plan");
  aoa.push(["År", "Type", "Beløp (tNOK)", "Beskrivelse"]);
  [...i.capex_plan]
    .sort((a, b) => a.year - b.year)
    .forEach((c) =>
      aoa.push([c.year, c.capex_type, c.amount, c.description ?? ""]),
    );

  // 11. Avskrivningsregler
  section("Avskrivningsregler");
  aoa.push(["Capex-type", "Avskrivningstid (år)"]);
  i.depreciation_rules.forEach((d) => aoa.push([d.capex_type, d.depreciation_years]));

  const ws = aoaToSheet(aoa);
  setColWidths(ws, [10, 24, 16, 16, 16]);

  // Bold på seksjonsoverskrifter (rader hvor kun kolonne A har verdi og det er tekst)
  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.length === 0) continue;
    const onlyFirst =
      row[0] && (row.length === 1 || row.slice(1).every((v) => v === undefined || v === ""));
    const isHeader =
      row.length > 1 &&
      typeof row[0] === "string" &&
      ["År", "Nivå", "Capex-type", "Årskost EUR"].includes(String(row[0]));
    if (onlyFirst || isHeader) {
      setBold(ws, r, Math.max(row.length, 5));
    }
  }

  // Tallformat for prosent-kolonner: enkleste sikre tilnærming = bruk PCT_FMT
  // i kolonnene vi vet er prosenter (Globale: 1,2 / Central: 1,2,3 / Kategori-just: 2)
  // Vi finner radene ved å scanne for header-mønstre.
  for (let r = 0; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row) continue;
    if (row[0] === "År" && row[1] === "Lønnsvekst") {
      // Datarader følger til neste tomme rad
      let rr = r + 1;
      while (rr < aoa.length && aoa[rr] && aoa[rr].length) {
        applyNumberFormat(ws, rr, rr, 1, 2, PCT_FMT);
        rr++;
      }
    }
    if (row[0] === "År" && row[1] === "Prisvekst" && row[2] === "Volumvekst") {
      let rr = r + 1;
      while (rr < aoa.length && aoa[rr] && aoa[rr].length) {
        applyNumberFormat(ws, rr, rr, 1, 3, PCT_FMT);
        rr++;
      }
    }
    if (row[0] === "År" && row[1] === "Kategori" && row[2] === "Justering %") {
      let rr = r + 1;
      while (rr < aoa.length && aoa[rr] && aoa[rr].length) {
        applyNumberFormat(ws, rr, rr, 2, 2, PCT_FMT);
        rr++;
      }
    }
  }

  freezePanesOnSheet(ws, 1, 0);
  return ws;
}

// ----- Ark 3: Comparison ----------------------------------------------------

function buildComparisonSheet(scenarios: ScenarioBundle[]): XLSX.WorkSheet {
  const years = [2026, ...FC_YEARS];
  const header = ["Kategori", ...scenarios.flatMap((s) => years.map((y) => `${s.meta.name} ${y}`))];

  // Bygg sett av alle kategorier
  const cats = new Set<string>();
  scenarios.forEach((s) => {
    s.inputs.cost_lines.forEach((c) => cats.add(c.category));
    s.result.lines.forEach((l) => cats.add(l.category));
  });
  const sortedCats = Array.from(cats).sort((a, b) => a.localeCompare(b, "nb-NO"));

  function valueFor(b: ScenarioBundle, cat: string, year: number): number {
    if (year === 2026) {
      return b.inputs.cost_lines
        .filter((c) => c.category === cat)
        .reduce(
          (a, c) => a + (c.fc_2026_monthly ?? []).reduce((s, x) => s + Number(x || 0), 0),
          0,
        );
    }
    return b.result.lines
      .filter((l) => l.category === cat)
      .reduce((a, l) => a + (l.amounts[year] ?? 0), 0);
  }

  const dataRows = sortedCats.map((cat) => {
    const row: any[] = [cat];
    scenarios.forEach((s) => years.forEach((y) => row.push(valueFor(s, cat, y))));
    return row;
  });

  // Total-rad
  const totalRow: any[] = ["Grand Total"];
  scenarios.forEach((s) =>
    years.forEach((y) => {
      const sum = sortedCats.reduce((a, c) => a + valueFor(s, c, y), 0);
      totalRow.push(sum);
    }),
  );

  const aoa = [header, ...dataRows, totalRow];
  const ws = aoaToSheet(aoa);
  setColWidths(ws, [24, ...new Array(header.length - 1).fill(13)]);
  applyNumberFormat(ws, 1, aoa.length - 1, 1, header.length - 1, NUM_FMT);
  setBold(ws, 0, header.length);
  setBold(ws, aoa.length - 1, header.length);
  freezePanesOnSheet(ws, 1, 1);
  return ws;
}

// ----- Ark 4: Om modellen ---------------------------------------------------

function buildOmModellenSheet(): XLSX.WorkSheet {
  // Splitt markdown i linjer; behold dem som rader. Excel har ikke ekte markdown,
  // så vi gjør lett rensing (fjerner #/* tegn) og marker overskriftslinjer som fete.
  const lines = omModellenContent.split(/\r?\n/);
  const aoa: any[][] = [];
  const boldRows: number[] = [];

  lines.forEach((line) => {
    const m1 = /^#\s+(.+)$/.exec(line);
    const m2 = /^##\s+(.+)$/.exec(line);
    const m3 = /^###\s+(.+)$/.exec(line);
    let text = line;
    if (m1) text = m1[1];
    else if (m2) text = m2[1];
    else if (m3) text = m3[1];
    else {
      // Strip enkel markdown-formatering for lesbarhet
      text = text
        .replace(/^\s*[-*]\s+/, "• ")
        .replace(/\*\*(.+?)\*\*/g, "$1")
        .replace(/\*(.+?)\*/g, "$1")
        .replace(/`(.+?)`/g, "$1");
    }
    aoa.push([text]);
    if (m1 || m2 || m3) boldRows.push(aoa.length - 1);
  });

  const ws = aoaToSheet(aoa);
  setColWidths(ws, [110]);
  boldRows.forEach((r) => setBold(ws, r, 1));
  return ws;
}

// ----- Hovedfunksjon --------------------------------------------------------

export interface ExportOptions {
  scenarios: ScenarioBundle[];
  costCenterName: string;
  /** Hvis satt: ekspandér kun dette scenarioet som "Scenario - X"-ark.
   *  Hvis ikke satt: ett Scenario-ark per scenario. */
  focusedScenarioId?: string;
}

export function exportWorkbook(opts: ExportOptions): void {
  const { scenarios, costCenterName, focusedScenarioId } = opts;
  if (!scenarios.length) {
    throw new Error("Ingen scenarioer tilgjengelig for eksport.");
  }

  const wb = XLSX.utils.book_new();
  // Sett basis-informasjon
  wb.Props = {
    Title: `LTP – ${costCenterName}`,
    Author: "LTP-modellen",
    CreatedDate: new Date(),
  };

  const targets = focusedScenarioId
    ? scenarios.filter((s) => s.meta.id === focusedScenarioId)
    : scenarios;

  // Ark 1+: Scenario per scenario
  targets.forEach((b) => {
    const ws = buildScenarioSheet(b);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(`Scenario - ${b.meta.name}`));
  });

  // Assumptions per scenario
  targets.forEach((b) => {
    const ws = buildAssumptionsSheet(b);
    XLSX.utils.book_append_sheet(wb, ws, safeSheetName(`Assumptions - ${b.meta.name}`));
  });

  // Ark 3: Comparison (alltid alle scenarioer)
  if (scenarios.length > 1) {
    const ws = buildComparisonSheet(scenarios);
    XLSX.utils.book_append_sheet(wb, ws, "Comparison");
  }

  // Ark 4: Om modellen
  XLSX.utils.book_append_sheet(wb, buildOmModellenSheet(), "Om modellen");

  // Filnavn
  const today = new Date();
  const yyyy = today.getFullYear();
  const mm = String(today.getMonth() + 1).padStart(2, "0");
  const dd = String(today.getDate()).padStart(2, "0");
  const safeCC = costCenterName.replace(/[\\/:*?"<>|]/g, "_").trim();
  const filename = `LTP_${safeCC}_${yyyy}-${mm}-${dd}.xlsx`;

  XLSX.writeFile(wb, filename);
}
