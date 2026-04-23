import { useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureAssumptionsSnapshot, diffSummary, type AssumptionsSnapshot } from "@/lib/versioning";

const WINDOW_MS = 5 * 60 * 1000; // 5 minutter
const DEBOUNCE_MS = 1500; // vent litt etter siste endring før vi tar snapshot

/**
 * Lager en automatisk versjon ved hver assumptions-endring.
 * Hvis forrige versjon (samme scenario) er <5 min gammel, oppdateres den
 * i stedet for å lage en ny rad. Kjører opportunistisk opprydning av
 * versjoner > 30 dager.
 */
export function useAutoVersion() {
  // Per scenario: siste lokale snapshot + id på den åpne (<5 min) versjonen.
  const lastByScenario = useRef<
    Record<string, { id: string | null; takenAt: number; snapshot: AssumptionsSnapshot | null }>
  >({});
  const debouncers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const inFlight = useRef<Record<string, boolean>>({});
  const prunedRef = useRef(false);

  const trigger = useCallback((scenarioId: string) => {
    if (!scenarioId) return;
    if (debouncers.current[scenarioId]) clearTimeout(debouncers.current[scenarioId]);
    debouncers.current[scenarioId] = setTimeout(async () => {
      if (inFlight.current[scenarioId]) {
        // Re-trigger litt senere så vi ikke mister siste endring.
        debouncers.current[scenarioId] = setTimeout(() => trigger(scenarioId), DEBOUNCE_MS);
        return;
      }
      inFlight.current[scenarioId] = true;
      try {
        const snapshot = await captureAssumptionsSnapshot(scenarioId);
        const prev = lastByScenario.current[scenarioId];
        const summary = diffSummary(prev?.snapshot ?? null, snapshot);
        if (summary === "Ingen endringer") return;
        const now = Date.now();
        const within = prev && prev.id && now - prev.takenAt < WINDOW_MS;
        if (within && prev?.id) {
          const { error } = await supabase
            .from("auto_versions")
            .update({ data: snapshot as any, summary, updated_at: new Date().toISOString() })
            .eq("id", prev.id);
          if (error) throw error;
          lastByScenario.current[scenarioId] = { id: prev.id, takenAt: prev.takenAt, snapshot };
        } else {
          const { data: inserted, error } = await supabase
            .from("auto_versions")
            .insert({ scenario_id: scenarioId, data: snapshot as any, summary } as any)
            .select("id")
            .single();
          if (error) throw error;
          lastByScenario.current[scenarioId] = { id: inserted.id, takenAt: now, snapshot };
        }
        if (!prunedRef.current) {
          prunedRef.current = true;
          // Best-effort opprydning av gamle versjoner (>30d).
          supabase.rpc("prune_old_auto_versions" as any).then(() => {});
        }
      } catch (err) {
        // Versjonering skal aldri blokkere brukerens flyt.
        // eslint-disable-next-line no-console
        console.warn("auto-version failed", err);
      } finally {
        inFlight.current[scenarioId] = false;
      }
    }, DEBOUNCE_MS);
  }, []);

  /** Tving siste endring inn umiddelbart (uten debounce). */
  const flush = useCallback(
    async (scenarioId: string) => {
      if (debouncers.current[scenarioId]) {
        clearTimeout(debouncers.current[scenarioId]);
        delete debouncers.current[scenarioId];
      }
      // Kjør syklusen synkront ved å nullstille debounce og kalle trigger,
      // men vent litt så pågående DB-skriv rekker å bli ferdig.
      await new Promise((r) => setTimeout(r, 50));
      trigger(scenarioId);
    },
    [trigger],
  );

  /** Ny baseline etter restore – hindrer at restore selv slås sammen i forrige vindu. */
  const resetWindow = useCallback((scenarioId: string) => {
    delete lastByScenario.current[scenarioId];
  }, []);

  return { trigger, flush, resetWindow };
}
