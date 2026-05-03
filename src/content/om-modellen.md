# Om LTP-modellen

En komplett guide til hva appen gjør, hvordan kostnadsmodellen er bygget opp, og hvordan du tolker tallene.

---

## Beregningsprinsipper – økninger vs. besparelser

**Grunnprinsipp:** FC 2026 er baseline og er **frosset** – den vokser ikke. Alle endringer i waterfall og Kontroll-tabben måles mot denne frosne baseline.

- **Økninger** (nye FTE-er, nearshoring-økninger) **vokser** med kumulativ lønnsvekst/prisvekst fra året de inntreffer.
- **Besparelser** (FTE-reduksjoner, nearshoring-reduksjoner) er **permanente og konstante** – de vokser ikke, fordi baseline ikke vokser.
- **Konverteringer** (Ekstern→Intern, Intern→Nearshoring) har en **konstant** besparelse på den fjernede ressursen og en **voksende** kostnad på den nye. Netto besparelse krymper derfor over tid.
- **Kategori-justeringer i tNOK** og **engangseffekter**: konstant beløp, vokser ikke. %-justeringer regnes på basis etter prisvekst.

### Eksempler

**+1 Medium Intern FTE 2027** (rate 1 000 tNOK, lønnsvekst 4 %):
2027: 1 040 · 2028: 1 082 · 2029: 1 125 · 2030: 1 170 · 2031: 1 217 tNOK.

**−2 Medium Intern FTE 2027** (rate 1 000 tNOK):
2027–2031: konstant (2 000) tNOK/år.

**3 konv. Medium Ekstern→Medium Intern 2027** (ekstern 270 × 11 = 2 970, intern 1 000, lønnsvekst 4 %):
- Ekstern besparelse −8 910 tNOK/år (konstant).
- Intern økning vokser fra ~3 120 (2027) til ~3 650 (2031).
- Netto besparelse krymper fra ca. (3 360) i 2027 mot ca. (5 260) i 2031.

### Forskjell mellom stolpediagram og waterfall

- **Stolpediagram**: viser absolutt kostnad per år. En ny FTE i 2027 ligger i 2027-søylen; i 2028-søylen vises bare differansen (lønnsveksten) i forhold til 2027.
- **Waterfall**: viser **total endring fra FC 2026-baseline** til valgt sluttår. En ny FTE i 2027 viser hele årskosten (inkl. kumulativ lønnsvekst) i hvert år, fordi den ikke fantes i baseline.
- **Kontroll-tabben**: samme perspektiv som waterfall – isolert effekt mot baseline.
- ### Modellteknisk differanse (basisjustering)

Waterfallen har en liten innebygd differanse på ca. 4 MNOK mellom summen av alle eksplisitte drivere og den faktiske endringen fra FC 2026 til FC 2031. Denne differansen er **konstant** på tvers av alle scenarioer og alle år, og skyldes forskjellen mellom:

- **FC 2026 (faktiske tall):** Regnskapstallene inneholder faktiske kostnader for arbeidsgiveravgift, feriepenger, pensjon og andre personalrelaterte poster basert på reelle lønninger og individuelle satser.
- **Modellens beregnede satser:** Fra FC 2027 beregnes personalkostnader med standardiserte prosentsatser (AGA 14,1 %, feriepenger 12 %, AGA på feriepenger 1,69 %, pensjon 5 %) på standardiserte basisrater (Low/Medium/High).

Denne forenklede modellen treffer ikke nøyaktig de faktiske FC 2026-tallene, og differansen oppstår i overgangen fra faktisk til modellberegnet. Differansen er ikke en kostnadsendring – den er en modellteknisk artefakt som ikke påvirker nøyaktigheten av de individuelle driverne. Den er skjult i waterfallen for å unngå forvirring, men logges i konsollen for feilsøking.

---


## a) Formål

Appen er et verktøy for **langsiktig kostnadsplanlegging (LTP)** for et kostnadssenter. Den tar utgangspunkt i prognosen for FC 2026 og beregner hvordan kostnadene utvikler seg fra **FC 2026 til FC 2031** under tre ulike scenarioer. Målet er å gjøre det enkelt å forstå *hvilke drivere* som forklarer kostnadsendringer fra år til år, og å sammenligne effekten av ulike tiltak side ved side.

---

## b) De tre scenarioene

Alle tre scenarioene bruker samme baseline (cost_lines fra FC 2026), men har hvert sitt sett med forutsetninger.

### Steady State
Videreføring av dagens drift uten aktive tiltak. Viser hvordan kostnadene utvikler seg under «business as usual» med lønnsvekst, prisvekst og naturlig utfasing av eksisterende avskrivninger. Bør holdes ren – kun normal vekst, ingen tiltak. Brukes som sammenligningsgrunnlag for besparelser i de andre scenarioene.

### Moderate Saving
Moderat innsparing med målrettede tiltak: utvalgte FTE-reduksjoner, ekstern→intern konverteringer, reforhandling av avtaler og utfasing av enkelte capex-investeringer.

### Aggressive Saving
Ambisiøs kostnadsreduksjon med betydelige kutt i arbeidsstyrken, store reforhandlinger på sentrale og lokale avtaler, og minimum av nye investeringer.

---

## c) Kostnadsmodellens oppbygning

Hver kostnadslinje har sin egen logikk. Driverne nedenfor finnes alle på **Assumptions**-siden og styres separat per scenario.

### Globale drivere
- **Lønnsvekst %** – årlig lønnsvekst som brukes på alle interne FTE.
- **Prisvekst %** – årlig prisvekst som brukes på lokale eksterne kostnader (External FTE, Consultancy, IT Costs, Operations, etc.).

Vekstratene er **kumulative år for år**: 2027-veksten bygger 2027-nivået, 2028-veksten bygger på 2027 osv.

### Sentrale drivere
Sentrale kostnader (allokeringer fra morselskap, f.eks. Phoenix IT-services) faktureres i EUR og har egen, EUR-basert beregning:

| Driver | Effekt |
|---|---|
| **Sentral prisvekst %** | Underliggende EUR-prisøkning, kumulativ år for år. |
| **Sentral reduksjon %** | Permanent multiplikativ reforhandling. Negativt tall = rabatt. |
| **Sentral reduksjon tNOK** | Permanent additiv reduksjon i NOK. Vises som egen virtuell linje. |
| **EUR/NOK-kurs** | Settes per år. Default 11,3 (matcher EUR-basis i FC 2026). |

Beregning per år N:
```
EUR-basis        = FC2026 / 11,3
EUR med vekst    = EUR-basis × ∏(1 + sentral_prisvekst_Y) for Y=2027..N
NOK før reduksjon = EUR med vekst × EUR/NOK-kurs(N)
NOK etter %-red. = NOK før reduksjon × ∏(1 + reduksjon%_Y)
Sentral kost(N)  = NOK etter %-red. + Σ reduksjon_tNOK_Y for Y ≤ N
```

### Internal FTE
- **Basisrater per nivå** (tNOK/år, 2026-nivå): Low 650, Medium 1 000, High 1 300.
- **Endringer per nivå/år/type**: Increase (positiv) og Decrease (negativ).
- Hver FTE-endring vokser med lønnsvekst fra året den skjer.
- Eksisterende interne FTE-linjer drives av en *master*-linje + driver-prosenter (AGA, feriepenger, pensjon).

### External FTE
- **Månedsrater per nivå** (tNOK/mnd): Low 240, Medium 270, High 300.
- **11 arbeidsmåneder** per år (ingen juli, norsk praksis).
- **Endringer per nivå/år/type** (Increase/Decrease) legges som samlet virtuell linje.
- Eksisterende External FTE-linjer drives av prisvekst + kategori-justering.

### Ekstern → Intern konvertering
Ved konvertering av N eksterne på et nivå til N interne på et annet nivå:
- **3 måneders overlapp** i konverteringsåret: full intern årskost + 3 mnd ekstern overlapp.
- **Etter overlappet**: kun intern-kost. Eksterne er borte.
- Netto kostnadseffekt vises som besparelse fordi 1 intern typisk koster mindre enn 1 ekstern over tid.

### Nearshoring
- **Basis**: 75 000 EUR/år, 12 arbeidsmåneder.
- **EUR/NOK-kurs per år** styres separat fra sentrale drivere.
- **Akkumulerende endringer** per år (Increase/Decrease) – nearshoring-ressurser modelleres som en uavhengig FTE-lignende ressurs.

### Kategori-justeringer
Per kategori og år kan du legge inn:
- **Justering %** – multiplikativt på prisvekst, **permanent** fra året den settes (reforhandling).
- **Justering tNOK** – additivt beløp, **permanent** fra året den settes.

Eksempel: −10 % på Consultancy i 2027 gjelder også 2028–2031. Flere justeringer over år multipliseres sammen.

### Capex-plan
Investeringer per år og type:

| Type | Avskrivningstid |
|---|---|
| Hardware | 3 år |
| Software | 5 år |
| Prosjekt | 5 år |

Avskrivninger starter året **etter** investeringen og fordeles lineært. Capex-utbetalingen treffer **Spend-view** i selve investeringsåret; avskrivningene treffer **P&L-view** i påfølgende år.

---

## d) Dashboard

### Stolpediagram
Tre serier:
- **Historisk** (AC 2025) – mørk søyle.
- **Baseline** (FC 2026) – nøytral søyle, samme på tvers av scenarioer.
- **Forecast** (FC 2027–2031) – farget per scenario (Steady / Moderate / Aggressive).

Stacked-modus deler hver søyle på kategorier; Total-modus viser kun summen.

### Kostnadsbridge (waterfall)
Forklarer endringen fra **FC 2026 → FC 2031** søyle for søyle. Hver søyle viser bidraget fra én driver:

1. **FC 2026** (start)
2. **Lønnsvekst** – kumulativ effekt på interne FTE
3. **Prisvekst** – kumulativ effekt på lokale eksterne kostnader
4. **Sentral prisvekst + FX** – EUR-prisvekst og valutaeffekt
5. **FTE-endringer (intern)** – netto økning/reduksjon i intern arbeidsstyrke
6. **FTE-endringer (ekstern)** – netto økning/reduksjon i ekstern arbeidsstyrke
7. **Konverteringer + nearshoring** – netto effekt av strukturendringer
8. **Kategori-justeringer** – reforhandlinger og faste justeringer
9. **Sentral reduksjon** – % og tNOK på sentrale kostnader
10. **Avskrivninger / Capex** – avhengig av P&L- eller Spend-modus
11. **FC 2031** (sluttsum)

Hold musepekeren over en søyle for å se underliggende drivere og kommentarer.

---

## e) Visningsmodus

### P&L-view (default)
**Opex + Depreciation.** Kostnaden som går i resultatregnskapet. Standard for rapportering. Capex-investeringer dukker ikke opp her direkte; de blir til avskrivninger i påfølgende år.

### Spend-view
**Opex + Capex.** Faktisk pengeutgang det året. Nyttig for kontantstrømsperspektiv. Avskrivninger er ikke med (ellers ville du telt dobbelt).

Bridge-en tilpasser «Avskrivninger / Capex»-søylen automatisk basert på valgt modus.

---

## f) Snapshots og historikk

Snapshots brukes til å fryse tilstanden for **alle tre scenarioer samtidig** – inkludert alle assumptions, kommentarer og beregnede resultater.

- **Lagre**: Tar et bilde av nåværende state for alle tre scenarioer som én samlet enhet.
- **Vis**: Åpner en lesemodus av de lagrede beregnede resultatene.
- **Sammenlign**: Stiller to snapshots opp mot hverandre, kategori for kategori.
- **Gjenopprett**: Skriver alle assumptions-inputs tilbake slik at modellen igjen produserer nøyaktig de lagrede tallene. Bekreftelsesdialog vises før overskriving.
- **Slett**: Fjerner alle tre scenarioer i gruppen samtidig.

I tillegg lagres **auto-versjoner** ved hver endring i Assumptions (beholdes 30 dager) som kan gjenopprettes via Historikk-panelet.

---

## g) AI-funksjoner

### AI-oppsummering per scenario
Genererer en kort, CFO-stil executive summary (3–4 setninger på norsk) som beskriver de underliggende driverne og forutsetningene for det aktuelle scenarioet, ikke bare totaltallene. Bruker faktiske drivere, FTE-tall og kommentarer fra Assumptions.

### AI-assistert forutsetning (Goal Seek)
Skriv et mål i naturlig språk, så foreslår AI-en konkrete endringer for å nå målet:
- *«Total kostnad FC 2031 skal være lik FC 2026»*
- *«15 % kostnadskutt innen 2031»*
- *«Reduser Consultancy med 20 % gjennom hele perioden»*

Forslagene vises som en tabell der du selv huker av hvilke endringer som skal anvendes. Ingenting endres uten din bekreftelse.

---

## Kontroll-tab på Assumptions

Under Assumptions finner du en egen **Kontroll**-tab som viser den **isolerte effekten** av hver enkelt forutsetning, slik at du kan verifisere at hver endring gir forventet utslag. Tabellen lister forutsetning, type, detaljer, årlig effekt 2027–2031 og akkumulert effekt 2031, og avsluttes med en sum-rad som tilnærmet matcher differansen mellom FC 2026 og FC 2031 i modellen.

---

## Fortegn-konvensjon

Konsekvent på tvers av hele appen:
- **Økninger** = positive tall (Increase = 2, prisvekst = 0,05).
- **Reduksjoner** = negative tall (Decrease = 2 → vises som −2 i effekt, Sentral reduksjon = −0,05).

---

## Teknisk oppsummering

| Element | Spesifikasjon |
|---|---|
| Antall scenarioer | 3 (Steady, Moderate, Aggressive) |
| Tidshorisont | AC 2025 (historisk), BU/FC 2026 (baseline), FC 2027–2031 (forecast) |
| Antall kostnadslinjer | ca. 136 (standard import) |
| Kategorier | 8 (Capex, Consultancy, Depreciation, External FTE, Internal FTE, IT Costs, Operations & Personnel-related, Other operating income) |
| Internal FTE | Low 650 / Medium 1 000 / High 1 300 tNOK/år (2026-nivå) |
| External FTE | Low 240 / Medium 270 / High 300 tNOK/mnd × 11 mnd |
| Nearshoring | 75 000 EUR/år × 12 mnd |
| Avskrivninger | Hardware 3 år, Software/Prosjekt 5 år |
| Driver-baserte FTE | AGA 14,1 %, Feriepenger 12 %, AGA på feriepenger 1,69 %, Pensjon 5 % |
