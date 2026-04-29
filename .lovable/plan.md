## Mål

Legg til en **Diagram**-velger øverst i filter-raden på Dashboard som bytter mellom **Stolpediagram** (de tre eksisterende per-scenario søylediagrammene) og **Waterfall** (Kostnadsbridge-seksjonen). Kun én av dem vises om gangen; alt annet på Dashboard (Executive Summary, Besparelser, Scenario-sammenligning, filtre) vises som før uavhengig av valget.

## Endringer i `src/pages/Dashboard.tsx`

1. **Ny type + state**:
   ```ts
   type ChartMode = "bars" | "waterfall";
   const [chartMode, setChartMode] = useState<ChartMode>("bars");
   ```

2. **Ny Tabs-velger først i filter-raden** (linje ~230, før "Visning"):
   ```tsx
   <div className="flex items-center gap-2">
     <span className="text-xs font-medium text-muted-foreground">Diagram</span>
     <Tabs value={chartMode} onValueChange={(v) => setChartMode(v as ChartMode)}>
       <TabsList className="h-8">
         <TabsTrigger value="bars" className="text-xs px-3">Stolpediagram</TabsTrigger>
         <TabsTrigger value="waterfall" className="text-xs px-3">Waterfall</TabsTrigger>
       </TabsList>
     </Tabs>
   </div>
   ```

3. **Betinget rendering**:
   - Wrap `{scenarios.map(... <ScenarioSection ... />)}` (linje 339–350) med `{chartMode === "bars" && (...)}`
   - Wrap `<WaterfallSection ... />` (linje 353) med `{chartMode === "waterfall" && (...)}`

## Det som **IKKE** endres

- Visning (P&L/Spend), Breakdown, Type, Kategorier-filtrene vises uansett (du sa "alt det andre skal vises som det er").
- Executive Summary, ScenarioComparisonChart, Besparelser-seksjonen og resten av Dashboard er uendret.
- `WaterfallSection`/`ScenarioSection`-komponentene selv endres ikke.

## Verifisering

1. Last Dashboard – ny "Diagram"-toggle vises først i filter-raden, "Stolpediagram" er aktiv.
2. De tre per-scenario søylediagrammene vises som før; Kostnadsbridge er skjult.
3. Klikk "Waterfall" – søylediagrammene forsvinner, Kostnadsbridge-seksjonen vises i stedet.
4. Bytt P&L↔Spend, endre kategori-filter – fungerer uavhengig av Diagram-valget.
