# Om LTP-modellen

Denne appen hjelper deg med å planlegge kostnader for de neste fem årene. Den viser hvordan kostnadene utvikler seg under tre ulike scenarioer, og gjør det enkelt å forstå *hva* som driver endringene.

---

## Hva er dette?

Kort fortalt: Du starter med dagens kostnader (FC 2026) og ser hvordan de endrer seg frem til 2031 – avhengig av hvilke valg som tas.

Appen gir deg tre versjoner av fremtiden:

- **Steady State** – Hva skjer hvis vi fortsetter som i dag?
- **Moderate Saving** – Hva om vi gjennomfører moderate tiltak? Noen FTE-reduksjoner, reforhandling av avtaler, og smartere bruk av ressurser.
- **Aggressive Saving** – Hva om vi tar alle grep? Betydelige kutt i bemanning, store reforhandlinger og minimale investeringer.

Alle tre scenarioene starter fra samme utgangspunkt (FC 2026), men har ulike forutsetninger for hva som skjer videre.

---

## Hvordan navigere i appen

### Dashboard
Hovedsiden. Her ser du alt på ett sted:

- **Stolpediagrammet** viser den totale kostnaden per år for hvert scenario. Du ser med én gang om kostnadene går opp eller ned.
- **Waterfallen** (kostnadsbriden) bryter ned *hvorfor* kostnadene endrer seg. Hver søyle representerer én driver – f.eks. lønnsvekst, FTE-endringer eller avskrivninger.
- **YoY-vekst** viser den årlige vekstprosenten som en linje, slik at du ser trenden.
- **Besparelser per år** viser hvor mye Moderate og Aggressive Saving sparer sammenlignet med Steady State.
- **Executive Summary** gir en AI-generert oppsummering av hvert scenario i 3–4 setninger.

**Tips:** Hold musepekeren over en søyle i waterfallen for å se detaljer og kommentarer.

### Scenarioer
Sammenligner de tre scenarioene side om side i en tabell. Du kan veksle mellom:
- **Absolute** – viser faktiske kostnader per kategori og år
- **Delta vs Steady** – viser forskjellen mellom hvert scenario og Steady State

### Assumptions
Her legger du inn forutsetningene som driver modellen. Alt du endrer her påvirker Dashboard og Scenarioer automatisk. Mer om dette under «Hva kan du justere?» nedenfor.

### Om modellen
Denne siden – forklarer hvordan alt henger sammen.

---

## Hva kan du justere?

Alle forutsetninger ligger på **Assumptions**-siden. Her er en oversikt over hva du kan endre:

### Lønnsvekst og prisvekst
- **Lønnsvekst %** – Hvor mye lønningene øker hvert år. Påvirker alle interne ansatte.
- **Prisvekst %** – Hvor mye prisene øker hvert år. Påvirker eksterne kostnader som konsulenter, IT, drift osv.

Begge er kumulative – 4 % i 2027 og 4 % i 2028 betyr at 2028-nivået er 8,16 % over 2026 (ikke bare 8 %).

### Sentrale kostnader
Noen kostnader faktureres fra morselskapet i EUR. For disse kan du justere:
- **Sentral prisvekst %** – EUR-prisøkning per år
- **Sentral reduksjon %** – Permanent rabatt gjennom reforhandling
- **Sentral reduksjon tNOK** – Fast beløp i NOK som trekkes fra
- **EUR/NOK-kurs** – Valutakursen per år

### Bemanning (FTE-endringer)
Du kan legge til eller fjerne ansatte på tre nivåer (Low, Medium, High) for:
- **Interne ansatte** – Fast ansatte med årslønn + sosiale avgifter
- **Eksterne konsulenter** – Månedskostnad × 11 arbeidsmåneder per år
- **Nearshoring** – Ressurser i utlandet, fakturert i EUR

### Konverteringer
- **Ekstern → Intern** – Erstatte en ekstern konsulent med en fast ansatt. Tre måneders overlapp der begge kostnader løper.
- **Intern → Nearshoring** – Erstatte en intern ansatt med nearshoring. Også tre måneders overlapp.

### Kategori-justeringer
For hver kostnadskategori (IT Costs, Consultancy, Operations osv.) kan du legge inn:
- **Prosentjustering** – F.eks. −5 % permanent prisreduksjon gjennom reforhandling
- **Beløpsjustering (tNOK)** – F.eks. +3 000 tNOK for et nytt prosjekt

Begge er permanente fra året de settes.

### Engangseffekter
Engangskostnader eller -besparelser som kun gjelder ett spesifikt år. F.eks. en ekstrakostnad for et migreringsprosjekt i 2028. Vokser ikke med prisvekst.

### Capex (investeringer)
Planlagte investeringer per år i Hardware, Software eller Prosjekt. Avskrivningstiden er:
- Hardware: 3 år
- Software: 5 år
- Prosjekt: 5 år

---

## Hvordan lese waterfallen

Waterfallen er den viktigste grafen i modellen. Den viser endringen fra FC 2026 til valgt sluttår, brutt ned på drivere:

| Søyle | Hva den viser |
|---|---|
| **FC 2026** | Utgangspunktet – dagens kostnader |
| **Lønnsvekst** | Effekten av årlig lønnsøkning på eksisterende ansatte |
| **Prisvekst** | Effekten av årlig prisøkning på eksterne kostnader |
| **FTE-endring** | Netto effekt av å ansette eller fjerne folk (interne, eksterne, nearshoring, konverteringer) |
| **Øvrige økninger** | Andre kostnadsøkninger (nye avtaler, prosjekter osv.) |
| **Øvrige besparelser** | Andre kostnadsreduksjoner (reforhandlinger, sentrale reduksjoner osv.) |
| **Valutaeffekt** | Effekten av endring i EUR/NOK-kurs |
| **Avskrivning / Capex** | Endring i avskrivninger (P&L) eller investeringer (Spend) |
| **FC 2031** | Sluttsummen – hva kostnadene ender på |

**Rød søyle** = kostnadsøkning. **Grønn søyle** = kostnadsreduksjon.

---

## P&L vs. Spend – hva er forskjellen?

Appen har to visningsmodus som du kan veksle mellom:

- **P&L (resultatregnskap)** – Viser kostnader slik de treffer resultatet. Investeringer vises som avskrivninger fordelt over levetiden (f.eks. en server til 300 tNOK avskrives med 100 tNOK/år i 3 år).
- **Spend (kontantstrøm)** – Viser faktisk pengebruk. Investeringen på 300 tNOK vises i sin helhet det året du kjøper den.

Begge er riktige – de viser bare ulike perspektiver. P&L er standard for rapportering, Spend er nyttig for budsjettering.

---

## Kontroll-tabben

Nederst på Assumptions-siden finner du **Kontroll**-tabben. Den viser den isolerte effekten av *hver enkelt forutsetning* du har lagt inn – altså hva akkurat den ene endringen bidrar med.

Dette er nyttig for å:
- Verifisere at en endring gir den effekten du forventer
- Forstå hvilke tiltak som har størst effekt
- Sjekke at modellen oppfører seg logisk

**Merk:** Naturlig utfasing av historiske avskrivninger vises ikke her – kun nye forutsetninger du har lagt inn. Utfasingseffekten vises i waterfallens Avskrivning-søyle.

---

## Snapshots og historikk

Du kan lagre snapshots av hele modellens tilstand – inkludert alle forutsetninger, kommentarer og beregnede resultater for alle tre scenarioer.

- **Lagre snapshot** – Fryser nåværende tilstand med et navn og dato
- **Vis** – Åpner de lagrede resultatene i lesemodus
- **Sammenlign** – Sammenligner et snapshot mot nåværende tall for å se hva som er endret
- **Gjenopprett** – Tilbakestiller alle forutsetninger til snapshotets tilstand
- **Slett** – Fjerner snapshotet

I tillegg lagres auto-versjoner automatisk ved endringer som kan gjenopprettes via Historikk.

---

## Viktige prinsipper i modellen

### Økninger vokser, besparelser er konstante

Når du legger til en ny ansatt, øker kostnaden hvert år med lønnsveksten – fordi personen får lønnsøkning. Men når du fjerner en ansatt, er besparelsen konstant – fordi du sammenligner mot utgangspunktet (FC 2026) som ikke endrer seg.

**Eksempel:** Du fjerner 1 Medium intern FTE i 2029 (årslønn 1 000 tNOK + sosiale avgifter). Besparelsen er den samme i 2029, 2030 og 2031 – den vokser ikke.

**Eksempel:** Du ansetter 1 Medium intern FTE i 2027. Kostnaden i 2027 er 1 040 tNOK (1 000 × 1,04). I 2028 er den 1 082 tNOK (1 000 × 1,04²). Den vokser fordi personen får lønnsøkning.

### Konverteringer har krympende besparelse

Når du konverterer en ekstern konsulent til en intern ansatt, sparer du konsulent­kostnaden (konstant) men den interne kostnaden øker med lønnsvekst hvert år. Netto besparelse krymper derfor over tid.

### Stolpediagram vs. waterfall

- **Stolpediagrammet** viser den totale kostnaden per år. Hvis du legger til en person i 2027, ser du hele kostnaden i 2027-søylen. I 2028 ser du bare den lille økningen (lønnsveksten).
- **Waterfallen** viser total endring fra FC 2026. Den nye personen viser hele sin årskostnad i alle år – fordi den ikke fantes i utgangspunktet.

---

## AI-funksjoner

### AI-oppsummering
Trykk «Generer på nytt» i Executive Summary for å få en kort, datadrevet oppsummering av scenarioet. Den trekker inn faktiske tall, FTE-endringer og kommentarer du har lagt inn.

### AI-assistert forutsetning
Skriv et mål i vanlig språk under Assumptions, f.eks.:
- *«Total kostnad i 2031 skal være lik FC 2026»*
- *«Kutt 15 % av kostnadene innen 2031»*

AI-en foreslår konkrete endringer som kan oppnå målet. Du velger selv hvilke forslag du vil bruke – ingenting endres uten din bekreftelse.

---

## Teknisk detalj: Modellteknisk differanse

Waterfallen har en liten innebygd differanse på ca. 4 MNOK som er skjult. Den skyldes at FC 2026 bruker faktiske regnskapstall, mens modellen fra FC 2027 beregner med standardiserte prosentsatser for sosiale avgifter (arbeidsgiveravgift 14,1 %, feriepenger 12 %, AGA på feriepenger 1,69 %, pensjon 5 %). Denne forenklingen treffer ikke nøyaktig, og differansen er en teknisk artefakt – ikke en reell kostnadsendring.

---

## Teknisk oversikt

| Element | Detalj |
|---|---|
| Scenarioer | 3 (Steady State, Moderate Saving, Aggressive Saving) |
| Tidshorisont | AC 2025 → BU 2026 → FC 2026 (baseline) → FC 2027–2031 |
| Interne FTE-rater | Low 650 / Medium 1 000 / High 1 300 tNOK/år |
| Eksterne FTE-rater | Low 240 / Medium 270 / High 300 tNOK/mnd × 11 mnd |
| Nearshoring | 75 000 EUR/år |
| Sosiale avgifter | AGA 14,1 %, Feriepenger 12 %, AGA på feriepenger 1,69 %, Pensjon 5 % |
| Avskrivningstider | Hardware 3 år, Software 5 år, Prosjekt 5 år |
