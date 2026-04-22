// Norsk tallformatering: mellomrom som tusenseparator, komma som desimalskille,
// negative tall i parentes.
export function formatNumberNO(value: number, decimals = 0): string {
  if (value === null || value === undefined || isNaN(value)) return "-";
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
