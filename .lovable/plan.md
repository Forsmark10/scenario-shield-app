## Problem

Når man komprimerer scenario-seksjonene til 180px, overlapper verditallene over barene (spesielt "316" på AC 2025/Historisk) med section-label-overlayet ("HISTORISK"/"BASELINE"/"FORECAST") som ligger øverst. Dette er tydelig synlig i Steady State og Aggressive Saving der historisk-baren er høyest.

## Årsak

I `ScenarioSection` (Dashboard.tsx ~linje 540–620):
- Section labels overlay ligger på `top: 0` med høyde ~14px
- `BarChart margin.top` er kun **18px** — gir nesten ingen klaring mellom overlay-tekst og verditall over bar
- Container er **180px** — for stramt for både overlay (14px) + verditall (12px) + bar + x-akse

## Endringer i `src/pages/Dashboard.tsx` (kun `ScenarioSection`)

| Element | Linje | Før | Etter |
|---|---|---|---|
| Bars-container høyde | 542 | `h-[180px]` | `h-[210px]` |
| YoY-container høyde | 622 | `h-[180px]` | `h-[210px]` |
| BarChart `margin.top` (Total) | 570 | `18` | `32` |
| BarChart `margin.top` (Stacked) | 587 | `18` | `32` |
| Dashed dividers `paddingTop` | 559 | `22` | `36` |
| Dashed dividers `paddingBottom` | 560 | `22` | `26` |
| LineChart `margin.top` (YoY) | 625 | `12` | `18` |

### Hvorfor disse tallene

- **Container 180 → 210px**: gir 30px ekstra vertikal plass — nok til at overlay (14px) + verditall (12px) + bar + akse alle får luft, men fortsatt langt mer kompakt enn original 280px.
- **BarChart margin.top 18 → 32**: skyver hele plotteområdet ned slik at verditallene (LabelList `position="top"`) havner UNDER section-label-overlayet, ikke oppå det.
- **Divider paddingTop 22 → 36**: holder de stiplede skillelinjene innenfor det nye plotteområdet (synkronisert med BarChart-marginen).

## Det som **IKKE** endres

- Beregninger, data, farger, tooltip, legend, Y-akse-skjul.
- Filter-rad, toggle Stolpediagram/Waterfall, Executive Summary, Besparelser, Comparison.
- Waterfall-seksjonen forblir uendret (~190px). Stolpediagram blir 210px — fortsatt nært waterfall-størrelsen, men med plass nok til alle labels.
- Typografi (text-[13px] header, text-[11px] subheader) beholdes.

## Verifisering

1. Switch til Stolpediagram-modus: alle tre scenarier viser "316" tydelig over AC 2025-baren uten å overlappe med "HISTORISK"-labelen.
2. Sjekk Steady State (høyest historisk verdi) og Aggressive Saving (mindre forecast-barer) — labels skal være lesbare i begge.
3. Stacked-modus (breakdown ≠ Total): legend nederst skal fortsatt få plass, totaltall over stacks skal ikke kuttes.
4. YoY-prosenter med "(9,0)" på FC 2026 skal ikke kuttes på toppen.