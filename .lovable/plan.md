## Problem (root cause)

Den opplastede filen `Scenario_LTP_import.xlsx` har disse kolonnene:

```
Category | Project | Account | Account Name | Type | AC 2025 | BU 2026 | FC 2026 | FC 2027 | FC 2028 | FC 2029 | FC 2030 | FC 2031
```

Men `src/lib/excelImport.ts` leter etter **12 månedskolonner per år**:

```ts
const buCols = monthCols("BU_2026"); // BU_2026_01, BU_2026_02, ... BU_2026_12
const fcCols = monthCols("FC_2026"); // FC_2026_01, ... FC_2026_12
```

Siden filen kun har `BU 2026` (én årskolonne, ikke 12 månedskolonner), blir alle `raw["BU_2026_01"]`...`raw["BU_2026_12"]` `undefined`, og hele månedsarrayen blir `[0,0,...,0]`. AC 2025 fungerer fordi den faktisk leter etter `"AC 2025"`.

I tillegg har filen en tom kolonne A (alle headere starter på kolonne B), og arkfanen heter `"Scenario "` (med trailing space) – ikke noe som inneholder `"cost_line"`. Dette håndteres allerede ved fallback til første ark, så det er ikke selve blocker, men den tomme A-kolonnen betyr at `sheet_to_json` får én ekstra "tom" header.

Filen har også **FC 2027–FC 2031**, som dagens datamodell ikke støtter (kun BU/FC 2026 lagres i `cost_lines`). Disse må enten ignoreres med advarsel, eller mappes til noe meningsfylt.

## Plan

### 1. Utvid header-aliaser i `excelImport.ts`

Legg til støtte for **årskolonner** (sum for hele året) i tillegg til eksisterende månedskolonner:

- `"BU 2026"` / `"BU_2026"` → fordeles likt over 12 måneder (sum / 12 i hver måned), ELLER legges hele i januar. **Anbefaling: fordel likt** – det gir riktig årssum og er det engine.ts bruker uansett.
- `"FC 2026"` / `"FC_2026"` → samme fordeling.

Hvis både årskolonne OG månedskolonner finnes, prioriteres månedskolonnene (mer presist).

### 2. Håndter tom kolonne A

`xlsx.sheet_to_json` med `defval: ""` lager en tom-streng-key (`"__EMPTY"`) for kolonne A. Dette skader ikke noe, men jeg legger til en `range` eller filtrering slik at headerraden detekteres riktig. Konkret: bruk `XLSX.utils.sheet_to_json(ws, { defval: "", blankrows: false })` og la `pick()` håndtere resten.

### 3. Ignorer FC 2027–FC 2031 med info-melding

Disse kolonnene lagres ikke i `cost_lines` (engine framskriver fra FC 2026 via drivere). Legg til en **info/warning** i `parsed.issues` første gang slike kolonner sees, slik at brukeren forstår at de ikke importeres:

> "FC 2027–2031 ignoreres ved import. Disse beregnes av modellen ut fra FC 2026 og driverne i Forutsetninger."

### 4. Verifiser med opplastet fil

Etter endringen skal forhåndsvisningen for denne filen vise BU 2026 = 2000 og FC 2026 = 2000 for raden "Hardware / 11321", ikke 0.

## Tekniske detaljer

Endring i `src/lib/excelImport.ts` — `buildRow()`:

```ts
// Før: kun månedskolonner
const buCols = monthCols("BU_2026");
const fcCols = monthCols("FC_2026");
// raw[c] for c i buCols/fcCols

// Etter: månedskolonner først, fallback til årssum / 12
function readMonthly(raw, prefix, yearLabel): number[] {
  const monthly = monthCols(prefix).map(c => raw[c]);
  const hasMonthly = monthly.some(v => v !== undefined && v !== "");
  if (hasMonthly) return monthly.map(num);
  // Fallback: årskolonne ("BU 2026", "BU_2026")
  const annual = num(pick(raw, yearLabel, prefix));
  if (annual === 0) return Array(12).fill(0);
  return Array(12).fill(annual / 12);
}

const bu_2026_monthly = readMonthly(raw, "BU_2026", "BU 2026");
const fc_2026_monthly = readMonthly(raw, "FC_2026", "FC 2026");
```

I `parseImportFile()`: oppdage og advare om FC 2027+:

```ts
const futureFcCols = ["FC 2027","FC 2028","FC 2029","FC 2030","FC 2031"];
const hasFutureFc = raw.some(r => futureFcCols.some(c => r[c] !== undefined && r[c] !== ""));
if (hasFutureFc) {
  issues.push({
    row: 0, field: "FC 2027–2031",
    message: "FC 2027–2031 ignoreres. Disse framskrives av modellen fra FC 2026 + drivere.",
    severity: "warning",
  });
}
```

Ingen DB-endringer nødvendig.

## Filer som endres

- `src/lib/excelImport.ts` (kun lese-/parselogikk)
