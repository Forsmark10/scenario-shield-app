import { useCallback, useEffect, useState } from "react";

/**
 * Lite session-persistent store for det aktivt valgte scenarioet.
 * Brukes på Assumptions, Scenario, Scenario Comparison osv. slik at brukerens
 * valg huskes på tvers av sider innenfor samme session.
 *
 * - Lagres i sessionStorage (resettes ved app-restart, det er ønsket).
 * - Cross-component sync via en intern Set av subscribere.
 */

const STORAGE_KEY = "ltp.activeScenarioId";
const subscribers = new Set<(value: string | null) => void>();

function read(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function write(value: string | null) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.sessionStorage.setItem(STORAGE_KEY, value);
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
  subscribers.forEach((fn) => fn(value));
}

export function useActiveScenario() {
  const [value, setValue] = useState<string | null>(() => read());

  useEffect(() => {
    const fn = (v: string | null) => setValue(v);
    subscribers.add(fn);
    return () => {
      subscribers.delete(fn);
    };
  }, []);

  const set = useCallback((v: string | null) => {
    write(v);
  }, []);

  return [value, set] as const;
}
