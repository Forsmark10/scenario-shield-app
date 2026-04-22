// Norsk tallformatering: mellomrom som tusenseparator, komma som desimalskille,
// negative tall i parentes.
export function formatNumberNO(value: number, decimals = 0): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  if (value === 0) return "-";
  const abs = Math.abs(value);
  const formatted = abs.toLocaleString("nb-NO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `(${formatted})` : formatted;
}

export function isNegative(value: number): boolean {
  return value < 0;
}

export type Unit = "NOK" | "tNOK" | "MNOK";

// Tallene i databasen er lagret i tNOK (tusen NOK).
// Konverter til ønsket visningsenhet før formatering.
export function formatUnit(value: number, unit: Unit = "tNOK", decimals?: number): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  let v = value;
  let dec = decimals ?? 0;
  if (unit === "NOK") {
    v = value * 1000;
  } else if (unit === "MNOK") {
    v = value / 1000;
    dec = decimals ?? 1;
  }
  return formatNumberNO(v, dec);
}

// Komma som desimalskille for prosent o.l.
export function formatPercentNO(value: number, decimals = 1): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
  const formatted = Math.abs(value).toLocaleString("nb-NO", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return value < 0 ? `(${formatted})` : formatted;
}
