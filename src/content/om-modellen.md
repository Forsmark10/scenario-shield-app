# Om LTP-modellen

En praktisk guide til hvordan langtidsplan-appen fungerer, hva den kan brukes til, og hvordan du tolker tallene.

---

## Hva er denne appen?

Dette er et verktøy for langtidsplanlegging (Long-Term Plan, LTP) av kostnader i et kostnadssenter. Du starter med dagens kostnader og beregner hvordan de utvikler seg fem år fremover basert på forutsetninger du selv setter.

Du kan sammenligne tre scenarioer samtidig:

- **Steady State** – business as usual, normal vekst uten spesifikke tiltak
- **Moderate Saving** – moderate kostnadskutt
- **Aggressive Saving** – store kostnadskutt

Når du endrer en forutsetning (for eksempel lønnsvekst, antall ansatte, reforhandlede priser), oppdaterer appen alle tall automatisk. Slik kan du raskt se effekten av ulike beslutninger.

---

## Sidene i appen

### Dashboard
Visuell oversikt med søylediagrammer for alle tre scenarioer, årlig vekst, scenario-sammenligning og besparelses-analyse. Filtrer på P&L eller Spend-view, Total eller Stacked-visning, Type (Local/Central) og kategori.

### Scenario
Rådata per kostnadslinje med beregnede prognoser for 2027-2031. Ekspanderbar tabell med drilldown per kategori, prosjekt og konto. Filtrer på kategori, type eller søk i kontonavn.

### Assumptions
Her endrer du forutsetningene per scenario. Åtte seksjoner: AI-assistert forutsetning, globale drivere, central drivere, internal FTE, external FTE, ekstern→intern konvertering, nearshoring, kategori-justeringer og Capex-plan.

### Scenario Comparison
Detaljert pivottabell med alle tre scenarioer side om side. Toggle mellom Absolute (absolutte beløp) og Delta vs Steady (forskjell fra Steady State).

### Om modellen
Denne siden – forklarer hvordan appen fungerer.

---

## Hvordan er modellen bygget opp?

### Utgangspunktet: 2026
Appen bruker prognosen for 2026 (FC 2026) som startpunkt for alle beregninger. Dette er de faktiske kostnadene dere forventer i år, fordelt på 136 kostnadslinjer (kombinasjoner av kategori, prosjekt og konto).

### Fremskrivning: 2027-2031
For hvert år fremover beregnes hva kostnaden blir basert på:

1. Grunnverdien fra 2026
2. Prisvekst eller lønnsvekst (typisk 4-5% per år)
3. Eventuelle endringer du legger inn (nye ansatte, oppsigelser, reforhandlinger)

### Hovedprinsippet
Hver kostnadstype har sin egen logikk. Lønn vokser med lønnsvekst, eksterne kjøp vokser med prisvekst, og allokeringer fra morselskap har egne drivere. Slik får du en realistisk modell der ulike kostnader kan utvikle seg ulikt.

---

## Nøkkelbegreper

### Local vs Central
- **Local** er kostnader dere selv styrer og kan påvirke. Dette er det meste av kostnadssenterets kostnader.
- **Central** er allokeringer fra morselskap (f.eks. Phoenix IT-services). Dere kan ikke kutte disse direkte, kun forhandle. Central har derfor egne drivere: pris, volum og reduksjon.

### P&L-view vs Spend-view
To måter å se totalkostnaden på:

- **P&L-view** (default) = Opex + Depreciation. Kostnaden som går i resultatregnskapet. Standard for rapportering.
- **Spend-view** = Opex + Capex. Faktisk pengeutgang det året. Nyttig for kontantstrømsperspektiv.

Capex (investeringer) er pengeutgang når det skjer, men blir til Depreciation (avskrivning) i årene etterpå. Du skal ikke telle begge, så velg perspektiv etter hva du vil analysere.

### Interne vs Eksterne FTE
- **Interne FTE** er fast ansatte. Kostnaden er årslønn + sosiale kostnader (AGA, feriepenger, pensjon).
- **Eksterne FTE** er konsulenter/innleide. Kostnaden er månedspris × 11 måneder (ingen juli, typisk norsk praksis).
- **Nearshoring** er en tredje variant – ressurser i lavkostland, faktureres i EUR på årsbasis.

---

## Scenarioer – hvordan de brukes

De tre scenarioene bruker samme grunndata (cost_lines fra 2026), men har hvert sitt sett med forutsetninger. Du endrer forutsetninger under fanen for det scenarioet du vil justere.

**Anbefalt tilnærming:**
- **Steady State:** La denne være ren baseline. Kun normal lønns- og prisvekst. Ingen spesifikke tiltak. Dette gir et bra sammenligningsgrunnlag.
- **Moderate Saving:** Realistiske, oppnåelige tiltak.
- **Aggressive Saving:** Ambisiøse tiltak, det du ville gjort hvis målet var maksimal besparelse.

Når du åpner et nytt scenario for å justere det, vil appen huske hvilket scenario du var på sist – også når du navigerer mellom sider.

---

## Hvordan beregningene fungerer

### Vekstrater er kumulative år for år

Både lønnsvekst og prisvekst multipliseres på tvers av år. Hvis du endrer 2027-veksten, påvirker det også 2028-2031 fordi 2027-nivået er basis for kommende år.

**Eksempel:** En IT-konsulent koster 3 MNOK i 2026. Prisvekst 5% per år:
- 2027: 3 000 × 1,05 = 3 150
- 2028: 3 000 × 1,05² = 3 308
- 2029: 3 000 × 1,05³ = 3 473

Hvis prisveksten i 2027 endres til 8%, vokser tallet fra 2027 og resten følger etter:
- 2027: 3 000 × 1,08 = 3 240
- 2028: 3 000 × 1,08 × 1,05 = 3 402
- osv.

### FTE-endringer akkumuleres og vokser med lønn

Når du legger inn +2 medium-lønnede interne i 2028:
- 2027: Ingen effekt
- 2028: Grunnbudsjett + 2 × 1 000 × 1,04² = + 2 163
- 2029: De nye ansatte er fortsatt med, og lønnen deres vokser med 4%

Samme logikk for avganger (negativt tall).

### Fortegn-konvensjon

Alle felter følger en konsekvent regel:
- **Økninger** skrives som **positive tall** (f.eks. Increase = 2)
- **Reduksjoner** skrives som **negative tall** (f.eks. Decrease = −2, Central reduksjon = −5%)

Appen hindrer deg i å skrive feil fortegn og viser feilmelding hvis du prøver.

### Avskrivninger

Avskrivninger (Depreciation) representerer utfasing av tidligere investeringer:

**Eksisterende avskrivninger:**
- ALFA-prosjektet har flat avskrivning alle år (ingen endring)
- Hardware og Software fases ut med 1/3 per år: 2027 = 2/3 av 2026, 2028 = 1/3, 2029 = 0

**Nye Capex-investeringer du legger inn:**
- Hardware: 3 års avskrivningstid
- Software: 5 års avskrivningstid
- Prosjekt: 5 års avskrivningstid
- Avskrivninger starter året etter investeringen

### Konvertering ekstern→intern

Ved konvertering, for eksempel 2 eksterne til 2 interne i 2028:
- 2028: Interne får full årskost + 3 måneders overlapp med de eksterne. Eksternes kost reduseres tilsvarende.
- 2029+: Kun interne-kost. Eksterne er borte.

Besparelsen kommer fordi 1 intern typisk koster mindre enn 1 ekstern over tid, men gevinsten reduseres i konverteringsåret av overlapp-kostnaden.

### Nearshoring

Når du legger til nearshoring-ressurser, erstatter de eksisterende eksterne på valgt nivå:
- Nearshoring-ressursen starter fra år 1 med full årskost (75 000 EUR × 12 måneder × EUR/NOK-kurs)
- Eksterne får 3 måneders overlapp i oppstartsåret
- Etter overlappet er kun nearshoring-kosten igjen

EUR/NOK-kursen settes per år under Nearshoring-seksjonen og kan variere over tid.

### Central-kostnader

Central (allokeringer fra morselskap) har egen beregning:

```
Central år N = Base × (1 + pris)^år × (1 + volum)^år × PRODUCT(1 - reduksjon_Y)
```

**Viktig om reduksjon:** Central reduksjon er **permanent reforhandling**. Når du setter -5% i 2027, gjelder den også 2028-2031. Hvis du legger til ytterligere -3% i 2029, kombineres de multiplikativt.

### Kategori-justeringer (Local)

Kategori-justeringer fungerer på samme måte som Central reduksjon: **permanent reforhandling**.

Hvis du setter -10% på Consultancy i 2027, gjelder det hele 2027-2031. Flere justeringer over år multipliseres sammen.

---

## Besparelser – hvordan de beregnes

Besparelses-seksjonen på Dashboard viser effekten av tiltakene du har lagt inn, målt mot Steady State.

**Formel:** Besparelse = Steady State − Scenario

Positive tall = besparelse. Negative tall = økt kostnad (for eksempel når nye investeringer overstiger innsparte kostnader).

### Netto-effekt for konverteringer og nearshoring

Ved ekstern→intern konvertering og nearshoring vises **netto-effekten** som besparelse:

- Reduksjon i ekstern-kost: +3 MNOK (besparelse)
- Økning i intern-kost: -1,4 MNOK (kostnad)
- **Netto besparelse: 1,6 MNOK**

Dette gjør det enkelt å svare på "hvor mye sparer vi totalt" uten å måtte regne sammen komponenter.

### Om Steady State som baseline

For at besparelsestallene skal være meningsfulle, bør Steady State holdes "rent" – kun normal lønns- og prisvekst, ingen andre tiltak. Hvis du endrer FTE eller kategorier i Steady State også, er det ikke lenger en ren baseline, og besparelsestallene må tolkes deretter.

---

## AI-assistert forutsetning

Øverst på Assumptions-siden kan du skrive et mål i naturlig språk, og AI-en foreslår konkrete endringer for å nå målet.

**Eksempler på mål:**
- "Total kostnad FC 2031 skal være lik FC 2026"
- "Jeg vil ha 15% kostnadskutt innen 2031"
- "Reduser Consultancy med 20% gjennom hele perioden"

AI-en analyserer gjeldende assumptions og foreslår en kombinasjon av endringer. Du får forslaget som en tabell der du kan huke av hvilke endringer du vil anvende. Ingenting endres uten at du aktivt velger det.

AI-en er en assistent, ikke en autopilot. Bruk forslagene som utgangspunkt og juster selv etter hva som er realistisk for ditt kostnadssenter.

---

## Versjonering og historikk

Appen lagrer historikk automatisk:

**Auto-versjoner** opprettes når du gjør endringer i Assumptions. De lagres i 30 dager og er ment som en "angrefunksjon" hvis du roter til noe.

**Manuelle snapshots** oppretter du selv ved milepæler (for eksempel "Q3 innsending" eller "Styremøte oktober"). Disse beholdes permanent.

Åpne "Historikk"-panelet på Assumptions-siden for å se, forhåndsvise eller gjenopprette tidligere versjoner.

---

## Import og eksport

### Eksport til Excel

Klikk "Eksport Excel" i topbaren for å laste ned hele modellen som en .xlsx-fil med flere ark: Scenario, Assumptions, Comparison og Om modellen. Kan også eksporteres fra Scenario-siden (fokusert på valgt scenario) og Scenario Comparison.

### Import fra Excel

Klikk "Importer" for å oppdatere cost_lines fra en .xlsx eller .csv-fil. Importen er trygg:

1. **Auto-backup tas først** – hele nåværende cost_lines lagres før endringer
2. **Diff-preview** – du ser hvilke rader som legges til, endres eller slettes før du bekrefter
3. **Bekreftelse kreves** – "Bekreft import"-knappen er inaktiv til du har gjennomgått endringene

Import påvirker kun cost_lines. Assumptions, scenarier, FTE-endringer, konverteringer, Capex-plan og versjonshistorikk beholdes uendret.

Auto-backups beholdes i 30 dager og kan gjenopprettes fra Historikk.

### Vanlig arbeidsflyt for oppdateringer

1. **Månedlig eller kvartalsvis:** Oppdater FC 2026-prognosen ved å eksportere, oppdatere tallene i Excel, og importere tilbake. Diff-preview viser nøyaktig hva som endres.
2. **Engangsjobb:** Legg inn historiske Capex-tall (AC 2025, BU 2026, FC 2026).
3. **Ved strukturelle endringer:** Hvis nye kostnadslinjer kommer til eller gamle fjernes, vil diff-preview vise dem og la deg bekrefte.

---

## Filtre på Dashboard

Øverst på Dashboard kan du filtrere alt som vises:

- **View:** P&L (Opex + Depreciation) eller Spend (Opex + Capex)
- **Breakdown:** Total (rene søyler) eller Stacked (kategori-fordelt)
- **Type:** Alle, kun Local, eller kun Central
- **Kategori:** Filtrer bort enkeltkategorier (bare aktivt i Total-modus)

Endringer i filtrene påvirker alle grafer og tabeller på siden, inkludert Besparelser-seksjonen.

---

## Vanlige spørsmål

### Hvorfor er Steady State viktig å holde "ren"?
Steady State brukes som sammenligningsgrunnlag for alt: Scenario Comparison (Delta vs Steady) og Besparelser-dashboardet. Hvis du legger tiltak inn i Steady State også, blir det vanskelig å måle effekten av tiltakene i Moderate og Aggressive.

### Hva skjer hvis jeg endrer lønnsveksten i midten av perioden?
Endringen gjelder fra det året og fremover, og påvirker alle påfølgende år fordi veksten er kumulativ.

### Kan jeg ha ulike lønnsveksttall per år?
Ja. Hvert år (2027-2031) har sin egen lønnsvekst, prisvekst og EUR/NOK-kurs. Default er lik vekst alle år, men du kan fritt overstyre.

### Hva er forskjellen på FTE increase og decrease?
- **Increase:** Antall nye ansettelser det året (positivt tall)
- **Decrease:** Antall avganger det året (negativt tall)

Nettoendringen er sum av begge.

### Hvorfor får jeg ikke samme tall som Excel-filen for 2027?
Appen overstyrer alle FC 2027-tall fra Excel og beregner dem på nytt ut fra Assumptions. Dette er bevisst for å sikre at alle scenarioer er konsistente.

### Hvordan fungerer kategori-justeringene?
Hvis du setter -10% på Consultancy i 2027, gjelder det også 2028-2031 (permanent reforhandling). Dette brukes til å modellere reforhandlede priser eller generelle kostnadskutt.

### Er valutakursen lik hele perioden?
Nei – du setter EUR/NOK-kurs per år under Nearshoring-seksjonen. Dette lar deg modellere valutasensitivitet.

### Hvor mye overlapp er det ved nearshoring?
Når en ekstern erstattes av en nearshoring-ressurs, er det 3 måneders overlapp. Etter det er kun nearshoring-kost igjen.

### Kan jeg angre en import?
Ja. Import lager automatisk en auto-backup før endringer. Du kan gjenopprette fra Historikk-siden innen 30 dager.

### Hvordan skal jeg tolke negative besparelser?
Negative tall på besparelses-linjen betyr at tiltakene netto koster mer enn de sparer i det aktuelle året. Dette er vanlig i oppstartsårene for nearshoring (hvor overlapp-kostnaden slår inn) eller når Capex-investeringer legges til. Sjekk akkumulert besparelse over hele perioden for å se total effekt.

---

## Gode råd ved bruk

**Ved første gangs bruk:**
1. La Steady State være rent – bare default lønns- og prisvekst
2. Legg inn realistiske tiltak i Moderate Saving
3. Legg inn aggressive tiltak i Aggressive Saving
4. Sammenlign på Dashboard og Scenario Comparison

**Ved jevnlig bruk:**
1. Oppdater FC 2026-prognosen månedlig/kvartalsvis via import
2. Lagre manuelle snapshots ved milepæler (kvartalsavslutninger, styremøter)
3. Bruk AI Goal Seek for å utforske hva som skal til for å nå mål
4. Eksporter til Excel når du skal dele eller presentere

**Før du presenterer tall:**
1. Sjekk at alle scenarioer har forventede endringer
2. Se gjennom Scenario Comparison for sanity check
3. Lagre et snapshot slik at tallene er frosne
4. Eksporter som backup

---

## Teknisk oppsummering

| Element | Spesifikasjon |
|---|---|
| Antall scenarioer | 3 (Steady, Moderate, Aggressive) |
| Tidshorisont | AC 2025 (historisk), BU/FC 2026 (baseline), FC 2027-2031 (forecast) |
| Granularitet | Månedlig 2026-2027, årlig 2028-2031 |
| Antall kostnadslinjer | 136 (standard import) |
| Kategorier | 8 (Capex, Consultancy, Depreciation, External FTE, Internal FTE, IT Costs, Operations & Personnel-related, Other operating income) |
| Internal FTE lønnsnivåer | Low 650, Medium 1000, High 1300 (tNOK/år, 2026-nivå) |
| External FTE månedskost | Low 240, Medium 270, High 300 (tNOK/mnd, 2026-nivå) |
| Arbeidsmåneder External | 11 (ingen juli) |
| Nearshoring basis | 75 000 EUR/år, 12 måneder |
| Avskrivningstider | Hardware 3 år, Software/Prosjekt 5 år |
| Driver-baserte FTE-linjer | AGA 14,1%, Feriepenger 12%, AGA på feriepenger 1,69%, Pensjon 5% |
