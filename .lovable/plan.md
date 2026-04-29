## Problem

I bildet ser AC 2025-baren (537) i Steady State visuelt mye lavere ut enn BU 2026 (531) — selv om verdien er høyere. Samtidig ser samme AC 2025-bar (537) forskjellig ut på tvers av de tre scenariene (Steady/Moderate/Aggressive), selv om verdien er identisk.

## Årsak

Hver `ScenarioSection` lar Recharts auto-skalere sin egen y-akse uavhengig. Resultat:

- **Steady State** har høyeste verdi 600 → y-aksen går ~0–600
- **Moderate** har høyeste verdi 541 → y-aksen går ~0–541
- **Aggressive** har høyeste verdi 537 → y-aksen går ~0–537

Identiske verdier får derfor forskjellige bar-høyder i hvert scenario, noe som gjør sammenligning forvirrende. I tillegg kan auto-skala bli "skjev" når top-marginen er stor (32px) og høyeste verdi er nær toppen — Recharts kan da gi maks-baren proporsjonalt mindre plass enn ventet, slik at AC 2025 (537) i Steady State (max 600) ser kortere ut enn BU 2026 (531) selv om den er høyere.

## Løsning

Beregn ett felles y-akse-domain på Dashboard-nivå (over alle scenarier, alle år) og send det inn som prop til hver `ScenarioSection`. Sett eksplisitt `YAxis domain={[0, sharedBarMax]}` i begge `BarChart`-variantene (Total + Stacked).

Resultat:
- Alle tre scenarier deler samme skala — identiske AC 2025/BU 2026-verdier får identisk bar-høyde.
- Forskjeller mellom scenarier (f.eks. lavere FC 2031 i Aggressive) blir visuelt meningsfulle.
- Bar-proporsjoner blir korrekte (537 > 531 vises riktig).

## Endringer i `src/pages/Dashboard.tsx`

### 1. Beregn felles maks ved scenario-mapping (linje ~349–362)

Wrap `scenarios.map(...)` i en IIFE som først beregner `sharedBarMax`:

```tsx
{chartMode === "bars" &&
  (() => {
    let sharedMax = 0;
    for (const b of scenarios) {
      const t = computeYearTotals(b, view, typeFilter, excludedCats);
      const vals = [t.ac, t.bu, t.fc26, ...Object.values(t.fc)].map(toM);
      for (const v of vals) if (v > sharedMax) sharedMax = v;
    }
    // 8% headroom så verditall over høyeste bar får luft
    const sharedBarMax = sharedMax > 0 ? sharedMax * 1.08 : 1;
    return scenarios.map((bundle, i) => (
      <ScenarioSection
        ...
        sharedBarMax={sharedBarMax}
      />
    ));
  })()}
```

### 2. Utvid `ScenarioSection`-props (linje ~424–432)

Legg til `sharedBarMax: number` i prop-typen og destrukturering.

### 3. Bruk delt domain i begge BarChart (linje ~570 og ~587)

Endre `<YAxis hide />` til:
```tsx
<YAxis hide domain={[0, sharedBarMax]} />
```

(For Stacked-varianten brukes samme `sharedBarMax` — siden total-stack-høyden = same total som i Total-modus, holder dette.)

## Det som **IKKE** endres

- Ingen endringer i beregninger, farger, tooltip, layout eller Waterfall.
- YoY-grafen forblir uendret (prosenter er allerede sammenlignbare i seg selv).
- Filter-rad, Executive Summary, Comparison, Savings, Detaljtabell — uberørt.

## Verifisering

1. AC 2025-baren (537) skal være visuelt identisk i alle tre scenariene.
2. I Steady State skal AC 2025 (537) være litt høyere enn BU 2026 (531) — ikke lavere.
3. Forskjellen mellom Steady (FC 2031 = 600) og Aggressive (FC 2031 = 509) skal være tydelig synlig som lavere bar i Aggressive.
4. Verditallene over barene skal fortsatt få plass (8% headroom).