## Mål

Gjøre Kostnadsbridge-seksjonen mer kompakt så alle tre waterfalls (+ resten av Dashboard) får plass uten å scrolle på en vanlig laptop-skjerm. Ingen funksjonell endring – kun tetthet/spacing.

## Endringer i `src/components/WaterfallBridge.tsx`

**SVG-layout per waterfall:**

| Variabel | Før | Etter |
|---|---|---|
| `H` (svg-høyde) | 300 | 190 |
| `PAD_T` | 32 | 22 |
| `PAD_B` | 56 | 34 |
| `PAD_L` / `PAD_R` | 12 | 10 |
| `driverBarW` (max) | 64 | 56 |
| `totalBarW` (max) | 90 | 78 |
| Verdi-tekst over bar (driver) | 11 | 10 |
| Verdi-tekst over bar (total) | 13 | 12 |
| X-akse-label | 10 | 9 |
| `labelY` offset | `yTop − 7` | `yTop − 5` |
| `xLabelY` offset | `H − PAD_B + 18` | `H − PAD_B + 14` |

**Container-spacing:**

| Element | Før | Etter |
|---|---|---|
| `WaterfallSection` `CardContent` | `pt-5 space-y-6` | `pt-4 space-y-4` |
| Stack mellom waterfalls | `space-y-7` | `space-y-2` |
| Header-rad over hver waterfall (`mb-1`) | beholdt | `mb-0.5`, scenario-tittel `text-[12px]`, %-pill `text-[10px] py-0` |
| `<svg>` `minWidth` | 640 | 560 |

**Header for hele seksjonen:**
- H2 `text-[15px]` → `text-[14px]`, undertekst `text-xs` → `text-[11px]`, marg redusert.

## Det som **IKKE** endres

- All beregningslogikk i `computeBridges`.
- Drilldown-tooltip (full størrelse beholdes – det er en hover-popup uansett).
- Fargepalett, balansering, FX-bar, Rest-bar.
- API til `WaterfallSection` (Dashboard trenger ingen endring).

## Resultat

Hver waterfall går fra ~300 px til ~190 px høy + redusert mellomrom. Total høyde for seksjonen reduseres fra ca. 1050 px til ca. 660 px – ~37 % mindre vertikal plass.

## Verifisering

1. Last Dashboard – alle tre waterfalls + %-pill + akse-labels skal være lesbare uten scrolling på 1212 px viewport.
2. Hover på en driver-bar – drilldown viser samme info som før.
3. Bytt år / P&L↔Spend – alt regner om korrekt.
