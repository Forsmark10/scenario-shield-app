## Mål

Komprimere de tre per-scenario stolpediagram-seksjonene (inkl. YoY-vekst-grafen) til samme høyde som hver waterfall (~190 px), så stolpediagram-modus tar like lite vertikal plass som waterfall-modus.

## Endringer i `src/pages/Dashboard.tsx` (kun `ScenarioSection`)

| Element | Før | Etter |
|---|---|---|
| `CardContent` | `pt-5` | `pt-4 pb-3` |
| Scenario-tittel `<h2>` | `text-[15px] font-medium`, `mb-3` | `text-[13px] font-semibold`, `mb-1.5` |
| Subheader (Totalkostnad/CAGR) | `text-xs` | `text-[11px]` |
| Grid gap | `gap-4` | `gap-3` |
| Bars-container høyde | `h-[280px]` | `h-[180px]` |
| Bars `BarChart margin.top` (begge BarChart) | 28 | 18 |
| Section labels overlay paddingTop | (default) | beholdes; overlay-tekst forblir lesbar |
| YoY-container høyde | `h-[280px]` | `h-[180px]` |
| YoY `LineChart margin.top` | 16 | 12 |
| YoY label "YoY-vekst %" | `mb-1` | `mb-0.5` |

Dashboard-side `space-y-6` (mellom Cards) beholdes — det er allerede konsistent.

## Det som **IKKE** endres

- Beregninger, data, farger, tooltip-innhold.
- Filter-rad, Executive Summary, Besparelser, Comparison.
- Waterfall-seksjonen.

## Verifisering

1. Switch til Stolpediagram-modus — hver scenario-section er nå ~190 px høy (matcher waterfall).
2. Akse-labels, verditekst over barer og YoY-prosenter skal fortsatt være lesbare.
3. Stacked-modus (legend nederst) skal fortsatt få plass.
