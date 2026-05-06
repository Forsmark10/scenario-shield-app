Fiks fargelogikken i snapshot-sammenligning (History → "Sammenlign med nåværende").

Tallene representerer kostnader, så lavere = bedre. I dag er det motsatt: positiv delta vises grønn og negativ rød.

**Endringer i `src/pages/History.tsx`:**

1. `DiffCell` (linje 641–656): bytt fargeklassene
   - `delta >= 0.5` → `text-destructive` (rød – økt kostnad)
   - `delta <= -0.5` → `text-[hsl(var(--positive))]` (grønn – lavere kostnad)

2. Dialog-beskrivelse (linje 586–587): endre til "Grønne tall viser at nåværende er lavere (besparelse); røde at den er høyere."

Ingen andre filer berøres.