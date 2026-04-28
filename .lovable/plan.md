# Kategori-filter som sjekkliste med "Velg alle"

## Problem
Dagens filter er en rad med klikkbare knapper – tar mye plass og mangler "Velg alle".

## Løsning
Erstatt knappe-raden i `src/pages/Dashboard.tsx` (rundt linje 255–278) med en kompakt `Popover`-knapp som åpner en avkrysningsliste.

### Knapp-tekst (dynamisk)
- Alle valgt → "Alle kategorier"
- Ingen valgt → "Ingen valgt"
- Ellers → "X av Y valgt"

### Popover-innhold
1. **"Velg alle"** øverst med Checkbox (tri-state: checked / indeterminate / unchecked).
   - Klikk når alle er valgt → fjern alle (`setExcludedCats(new Set(allCategories))`)
   - Klikk ellers → velg alle (`setExcludedCats(new Set())`)
2. `Separator`
3. Scrollbar liste (`max-h-72 overflow-y-auto`) med én rad per kategori: Checkbox + navn. Klikk toggler `excludedCats`.

### Komponenter som brukes
Eksisterende shadcn-komponenter: `Popover`, `Button`, `Checkbox`, `Separator` (legges til i imports).

Ingen endringer i filtrerings-state (`excludedCats: Set<string>`) eller datamodell – kun UI-bytte.
