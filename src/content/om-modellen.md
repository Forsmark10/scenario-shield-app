# Om LTP-modellen

En forklaring av hvordan langtidsplanen er bygget og hvorfor.

---

## Hva gjør appen?

Appen hjelper deg å planlegge kostnadene for kostnadssenteret fem år fremover. Du starter med dagens kostnader (fra 2025 og 2026), og appen beregner hva kostnadene blir i 2027, 2028, 2029, 2030 og 2031 basert på forutsetningene du setter.

Du kan sammenligne tre ulike scenarioer side om side:

- **Steady State** – alt fortsetter som i dag, normal vekst
- **Moderate Saving** – moderate kostnadskutt
- **Aggressive Saving** – store kostnadskutt

Når du endrer en forutsetning (f.eks. lønnsøkning, antall ansatte, reforhandlede priser), oppdaterer appen alle tall automatisk. Slik kan du raskt se effekten av ulike valg.

---

## Hvordan er modellen bygget opp?

### Utgangspunktet: 2026
Appen bruker prognosen for 2026 (FC 2026) som startpunkt for alle beregninger. Dette er de faktiske kostnadene dere forventer i år, fordelt på 136 kostnadslinjer (kombinasjoner av kategori, prosjekt og konto).

### Fremskrivning: 2027-2031
For hvert år fremover beregner appen hva kostnaden blir, basert på:

1. **Grunnverdien fra 2026** 
2. **Prisvekst eller lønnsvekst** (typisk 4-5% per år)
3. **Eventuelle endringer du legger inn** (nye ansatte, oppsigelser, reforhandlinger osv.)

### Hovedprinsippet
Hver kostnadstype har sin egen logikk. Lønn vokser med lønnsvekst, eksterne kjøp vokser med prisvekst, og allokeringer fra morselskap har egne drivere. Slik får du en realistisk modell der ulike kostnader kan utvikle seg ulikt.

---

## Nøkkelbegreper

### Local vs Central
- **Local** er kostnader dere selv styrer og kan påvirke. Dette er det meste av kostnadssenterets kostnader.
- **Central** er allokeringer fra morselskap (f.eks. Phoenix IT-services). Dere kan ikke kutte disse direkte, men forhandle. Central har derfor egne drivere: generell prisvekst, volumvekst (hvis morselskap tar på seg mer) og reforhandlet reduksjon.

### P&L-view vs Spend-view
Dette er to måter å se totalkostnaden på:

- **P&L-view** (default) = Opex + Depreciation. Dette er den kostnaden som går i resultatregnskapet. Det controlleren din bruker til rapportering.
- **Spend-view** = Opex + Capex. Dette er faktisk pengeutgang det året. Nyttig for kontantstrømsperspektiv.

Forskjellen: **Capex** (investeringer) er pengeutgang når det skjer, men blir til en **Depreciation** (avskrivning) i årene etterpå. Du skal ikke telle begge, så velg perspektiv etter hva du vil analysere.

### Interne vs Eksterne FTE
- **Interne FTE** er fast ansatte. Kostnaden er årslønn + sosiale kostnader (AGA, feriepenger, pensjon).
- **Eksterne FTE** er konsulenter/innleide. Kostnaden er månedspris × 11 måneder (ingen juli, typisk norsk praksis).
- **Nearshoring** er en tredje variant – ressurser i lavkostland, faktureres i EUR på årsbasis.

---

## Hvordan fungerer beregningen?

### Enkel forklaring: et konsulent-eksempel

Du har en IT-konsulent i 2026 som koster 3 000 000 kr. Prisvekst er 5% per år. Hva koster vedkommende i 2029?

3 000 000 × 1,05 × 1,05 × 1,05 = **3 472 875 kr**

Dette er den enkleste fremskrivningen. Appen gjør dette for 136 kostnadslinjer samtidig, med riktig vekst for hver type.

### FTE-endringer (nye ansettelser og avganger)

Hvis du legger inn +2 nye medium-lønnede interne i 2028:

- 2027: Ingen effekt
- 2028: Grunnbudsjett + 2 × 1 000 000 × 1,04² = grunnbudsjett + 2 163 200
- 2029: Grunnbudsjett + 2 × 1 000 000 × 1,04³ = grunnbudsjett + 2 249 728

De nye ansatte blir altså med i alle påfølgende år, og lønnen deres vokser med den generelle lønnsveksten.

Samme logikk for avganger, bare med negativt fortegn: -3 FTE gir en reduksjon som akkumuleres fremover.

### Spesialtilfelle: Avskrivninger

Avskrivninger (Depreciation) er spesielle fordi de representerer utfasing av gamle investeringer:

- **ALFA-prosjektet** har en flat avskrivning alle år (ingen endring)
- **Hardware og Software** (eksisterende) fases ut med 1/3 per år: 2027 = 2/3, 2028 = 1/3, 2029 = 0

Samtidig: når du legger inn nye investeringer i Capex-planen, legger appen automatisk til nye avskrivninger de neste 3-5 årene (avhengig av type):

- Hardware: 3 års avskrivningstid
- Software: 5 år
- Prosjekt: 5 år

Avskrivningene starter året etter investeringen er gjort.

### Konvertering: ekstern → intern

Hvis du konverterer 2 eksterne til 2 interne i 2028:

- 2028: De 2 interne får full årskost + 3 måneders overlapp med eksterne (kontinuitet). Eksternes kost reduseres tilsvarende.
- 2029 og fremover: Kun interne-kost, eksterne er borte.

3-måneders-overlappet er en reell tilleggskost som reflekterer at konverteringer koster noe.

---

## Hvordan fungerer scenarioene?

De tre scenarioene bruker samme grunndata (cost_lines fra 2026), men har hvert sitt sett med forutsetninger:

- **Steady State:** Normal vekst, jevn tilvekst av interne for å kompensere naturlig avgang
- **Moderate Saving:** Mindre vekst, noen kategori-justeringer (f.eks. -5% på Consultancy etter reforhandling)
- **Aggressive Saving:** Stor reduksjon i FTE-er, nearshoring av eksterne, store kategori-kutt

Når du bytter mellom scenario-tabene i Assumptions, ser du bare forutsetningene for det scenarioet. Dashboard viser alltid alle tre samtidig for enkel sammenligning.

---

## Hvilke filtre og visninger har jeg?

### På Dashboard
- **View-toggle:** P&L (Opex + Depreciation) eller Spend (Opex + Capex)
- **Breakdown:** Total (rene søyler) eller Stacked (fordelt på kategori)
- **Type:** Alle, kun Local, eller kun Central
- **Kategori:** Filtrer bort enkeltkategorier

### På Scenario-siden
- Fullstendig drilldown per kategori → prosjekt → konto
- Månedlig visning for 2026-2027
- Årsverdier for 2028-2031

---

## Vanlige spørsmål

### Hva skjer hvis jeg endrer lønnsveksten i midten av perioden?
Endringen gjelder fra det året og fremover, ikke bakover. Hvis du setter 2029-lønnsvekst til 6% (fra 4%), blir 2029 beregnet med 6%, mens 2027-2028 forblir uendret.

### Kan jeg ha ulike lønnsveksttall per år?
Ja. Hvert år (2027-2031) har sin egen lønnsvekst, prisvekst og EUR/NOK-kurs. Default er lik vekst alle år, men du kan fritt overstyre.

### Hva er forskjellen på FTE-increase og FTE-decrease?
- **Increase:** Antall nye ansettelser det året
- **Decrease:** Antall avganger (oppsigelser, naturlig avgang) det året

Nettoendringen er Increase - Decrease. Begge legges inn som positive tall.

### Hvorfor får jeg ikke samme tall som Excel-filen for 2027?
Appen overstyrer alle FC 2027-tall fra Excel og beregner dem på nytt ut fra Assumptions. Dette er bevisst – sånn sikrer vi at alle scenarioer er konsistente og beregnes med samme logikk.

### Hvordan fungerer kategori-justeringene?
Hvis du setter "-10% på Consultancy i 2028", betyr det at hele Consultancy-kategorien reduseres med 10% det året (etter at prisvekst er lagt på). Dette brukes typisk til å modellere reforhandlede priser eller generelle kostnadskutt.

### Hva skjer i Aggressive scenario med FTE-kutt på 10?
De 10 ansatte kuttes i det året du legger det inn (f.eks. 2027). I 2027 er full kostnad borte (forenklet modell), og det samme gjelder alle påfølgende år. Besparelsen akkumuleres altså over tid.

### Er valutakursen lik hele perioden?
Nei – du setter EUR/NOK-kurs per år. Dette lar deg modellere valutasensitivitet for nearshoring-kostnader.

### Hvor mye overlapper nearshoring med eksterne?
Når du erstatter en ekstern med en nearshoring-ressurs, har du 3 måneders overlapp med den eksterne (for kontinuitet og opplæring). Deretter er kun nearshoring-kost igjen.

---

## Besparelser

Besparelser vises på Dashboard nederst og beregnes som forskjellen mellom Steady State og valgt scenario. Tallene viser alltid netto-effekten av tiltakene.

For eksempel, når du konverterer en ekstern konsulent til en intern ansatt:

- Ekstern-kostnaden reduseres (f.eks. −3 MNOK)
- Intern-kostnaden øker (f.eks. +1,4 MNOK)
- Besparelsen vises som netto **+1,6 MNOK**, ikke som to separate poster

Tilsvarende for nearshoring: besparelsen fra å fjerne en ekstern konsulent minus nearshoring-kostnaden.

Dette gjør det enkelt å svare på spørsmålet: *"Hvor mye sparer vi totalt?"* uten å måtte regne sammen ulike komponenter.

**Merk:** I år hvor nye investeringer (Capex) eller oppstartskostnader (nearshoring-overlapp) er større enn besparelsene, kan netto-effekten være negativ i det enkelte året – selv om den er positiv over tid.
