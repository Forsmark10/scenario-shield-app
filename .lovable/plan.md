## Mål

Bruke `kostnadsbridge.jsx` som **visuell og strukturell referanse** for å oppgradere eksisterende `WaterfallBridge.tsx`. Dataene og scenarioene skal fortsatt komme fra `useAllScenarios` / forecast-engine — kun rendering, fargepalett, tooltip-design og driver-oppdeling endres.

Konkret ny vs. gammel oppførsel:

| Element | I dag | Etter |
|---|---|---|
| Bar-farger | sterk rød/grønn | dempet brick (#b45550) / dempet grønn (#5a9a6e), navy totals (#1a3353) |
| Avskrivning | samme rød/grønn som drivers | egen mykblå farge (#7ba7c9 ved negativ, brick ved positiv) |
| "Valutaeffekt (EUR/NOK)" | inne i Prisvekst-tooltip | **egen driver-bar** mellom "Øvrige netto" og "Avskrivning" |
| Tooltip | shadcn UITooltip | mørk drilldown-panel (slate-800) med ØKNINGER/BESPARELSER/NETTO-seksjoner og fargede headings |
| %-badge | finnes | beholdes, men styling justeres til pill (grønn ved reduksjon, brick ved økning) |
| Connector-linjer | finnes | beholdes, lysere grå (#b0c4d8) stiplet 5,4 |
| Verdi-format | `+1,2` / `−1,2` | `+1,2` / `(1,2)` (parentes for negativ, matcher referansen) |
| Bar-bredder | uniform | totals litt bredere (90 vs 64) for emfase |

## Filer som endres

**`src/components/WaterfallBridge.tsx`** (eneste fil)

1. **`computeBridges`** — splitt ut valutaeffekt:
   - I dag: `centralFx` legges inn i `priceBridge`-totalen.
   - Etter: `centralFx` blir egen `BridgeBreakdown` med label "Valutaeffekt", og fjernes fra `priceBridge` og `priceDetails`.
   - Hvis `centralFx === 0` skal baren fortsatt vises (med "—"-label) for å matche referansens layout.

2. **Fargekonstanter** — erstatt eksisterende:
   ```
   COLOR_TOTAL      = "#1a3353"
   COLOR_INCREASE   = "#b45550"   (brick)
   COLOR_DECREASE   = "#5a9a6e"   (muted green)
   COLOR_DEPR_NEG   = "#7ba7c9"   (soft blue når avskrivning reduserer)
   COLOR_CONNECTOR  = "#b0c4d8"
   COLOR_TEXT_DEC   = "#3d8b5e"   (mørkere grønn for verditekst)
   ```

3. **`WaterfallChart` rendering** — skriv om SVG-blokken slik at den følger referansen:
   - Totals-barer 90px brede, driver-barer 64px, gap 28px.
   - Verdi-tekst over bar, x-akse-label under.
   - Header-rad over hver waterfall: scenarionavn til venstre (i scenario-farge) + %-pill til høyre.
   - Format-helpers: legg til lokal `fmtParen` som returnerer `+1,2` / `(1,2)` / `0,0`.

4. **Drilldown-tooltip** — erstatt shadcn `UITooltip` med en custom posisjonert div (følger musen via `onMouseMove`):
   - Mørk bakgrunn `#1e293b`, monospace-font for radene, `Inter` for header.
   - Header: tittel + total i parentes, evt. badge ("P&L-modus").
   - Hvis `details` har `isHeader: true`-rader → render som seksjoner (ØKNINGER rød, BESPARELSER grønn, NETTO med topplinje).
   - Ellers flat rad-liste (label venstre, verdi høyre).
   - Mappes direkte fra eksisterende `BridgeBreakdown.details`-strukturen — ingen dataendring.

5. **Total-bar tooltip** — enkel mørk pille som viser `{label}: {fmtPlain(val)} MNOK` (matcher referansens hover på FC 2026 / FC 2031).

6. **`Rest`-bar** — beholdes som i dag (vises kun hvis |rest| > 0,1 MNOK), men får brick/grønn farge etter fortegn.

## Det som **IKKE** endres

- `WaterfallSection`-API (props `scenarios`, `view`, `scenarioColors`) — Dashboard trenger ingen endringer.
- All databeregning bortsett fra splittingen av valutaeffekt.
- `useAllScenarios`, forecast-engine, types.
- Lønnsvekst/Prisvekst/FTE/Sentrale/Øvrige/Avskrivning-logikk.

## Verifisering etter implementasjon

1. Åpne Dashboard → Kostnadsbridge-seksjonen viser tre stablete waterfalls.
2. Hver waterfall har 9 barer: FC 2026 → Lønnsvekst, Prisvekst, FTE-endring, Sentrale red., Øvrige netto, **Valutaeffekt (ny)**, Avskrivning/Capex, evt. Rest → FC {år}.
3. FC 2026 + sum(broer) + rest = FC {år} (balanserer eksakt).
4. Hover FTE-endring → drilldown med ØKNINGER (rød) / BESPARELSER (grønn) / NETTO.
5. Bytt P&L ↔ Spend → siste bar bytter mellom "Avskrivning" og "Capex"; Valutaeffekt-bar er uavhengig.
6. Bytt år 2027–2031 → alle broer regner om.
7. Negative verdier vises som `(1,2)`, positive som `+1,2`.
