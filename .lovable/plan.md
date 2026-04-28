# Forenkle "Lagre snapshot" – alltid alle scenarioer

## Endring i `src/components/SaveSnapshotDialog.tsx`

Fjern hele scenario-valget. En snapshot fryser alltid hele tilstanden (alle aktive scenarioer).

### UI
Behold kun:
- Navn (påkrevd)
- Beskrivelse (valgfri)
- Hjelpetekst: "Lagrer alle N scenarioer som ett snapshot."

### Lagring
DB-kolonnen `scenario_id` er NOT NULL, så vi lagrer **én rad per scenario** i `forecast_snapshots`, alle med samme `name` og `description` (gruppert visuelt i historikken via felles navn + tidsstempel).

```ts
const rows = scenarios.map(b => ({
  name: name.trim(),
  description: description.trim() || null,
  scenario_id: b.meta.id,
  data: { inputs: b.inputs, result: b.result, meta: b.meta, saved_at: new Date().toISOString() },
}));
const { error } = await supabase.from("forecast_snapshots").insert(rows);
```

Toast: `Snapshot lagret for {N} scenarioer`.

### State som fjernes
- `scenarioId`-state og tilhørende `Select`/`Label` blokk
- Validering for "Velg et scenario"

Ingen DB-endringer, ingen endringer i History/Restore.
