# Fiks: "Other operating income" vises i Spend

## Problem
I Dashboard skiller `Spend`/`PL`-visningen kun mellom `Capex` og `Depreciation`. Kategorien `Other operating income` (inntekt) tas derfor med i Spend, men skal kun vises i `P&L`.

## Endring
I `src/pages/Dashboard.tsx`, på alle steder der filterregelen `if (view === "Spend" && c.category === "Depreciation") return false;` finnes, legg til en parallell regel:

```ts
if (view === "Spend" && c.category === "Other operating income") return false;
```

Tilsvarende for `lines`-filteret (bruker `l.category`).

## Berørte steder (filtrering)
- `computeYearTotals` – cost_lines + forecast lines
- `computeStackedYearly` – cost_lines + forecast lines
- Stacked-by-category-funksjonen rundt linje 700–717
- `computeScenarioYearByCategory` (linje ~787–795)

## Resultat
- **P&L-visning**: uendret (inkluderer Other operating income, ekskluderer Capex)
- **Spend-visning**: ekskluderer både Depreciation **og** Other operating income (inkluderer Capex)

Ingen endringer i datamodell, engine eller andre sider.
