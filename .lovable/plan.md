## Problem

Detaljer-teksten for **Lønnsvekst**, **Prisvekst** og **Sentral prisvekst** i Kontroll-tabben viser bare verdien for 2031 (`X % per år …`). Det er misvisende når satsen varierer mellom årene – f.eks. 4 % i 2027 og 3 % deretter for lønnsvekst, eller 5 % alle år bortsett fra 7 % i 2029 for sentral prisvekst.

## Løsning

Erstatt en-tall-formuleringen med en kompakt oppsummering av faktiske årssatser. Bruk samme hjelpefunksjon for alle tre rader.

### Formateringsregler

For en serie `{2027: r1, 2028: r2, …, 2031: r5}`:

1. **Alle like** → `"3,0 % per år"` (uendret oppførsel, men prosenter formateres med komma og én desimal)
2. **Én avvikende verdi** → angi avviket først, så resten:
   - `"4,0 % i 2027, deretter 3,0 % per år"`
   - `"5,0 % per år, men 7,0 % i 2029"`
3. **Flere avvik / generelt fall-tilbake** → komma-separert liste per år:
   - `"2027: 4,0 %, 2028–2030: 3,0 %, 2031: 2,5 %"` (sammenslå tilstøtende like år)

### Tekstmaler (suffiks)

- Lønnsvekst: `"<rate-tekst> på eksisterende interne FTE fra FC 2026"`
- Prisvekst: `"<rate-tekst> på lokale ikke-FTE-kostnader"`
- Sentral prisvekst: `"<rate-tekst> (EUR-basis)"`

## Endringer

**`src/components/KontrollTab.tsx`**

1. Legg til en lokal hjelpefunksjon `formatYearlyRate(values: Array<{year:number, pct:number}>): string` som implementerer reglene over (komma som desimaltegn, én desimal).
2. Linje 190: bytt ut `${(Number(last?.salary_increase_pct ...))...} % per år på eksisterende interne FTE fra FC 2026` med `${formatYearlyRate(salarySeries)} på eksisterende interne FTE fra FC 2026`.
3. Linje 211: tilsvarende for `price_increase_pct` → `… på lokale ikke-FTE-kostnader`.
4. Linje 259: tilsvarende for `central_price_increase_pct` → `… (EUR-basis)`.

Ingen andre filer berøres. Ingen endringer i beregningslogikk.
