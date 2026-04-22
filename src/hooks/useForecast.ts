import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateForecast } from "@/lib/forecast/engine";
import type {
  CostLineRow,
  ForecastInputs,
  ForecastResult,
} from "@/lib/forecast/types";

export interface UseForecastState {
  loading: boolean;
  error: string | null;
  inputs: ForecastInputs | null;
  result: ForecastResult | null;
  reload: () => void;
}

export function useForecast(scenarioId: string | null): UseForecastState {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inputs, setInputs] = useState<ForecastInputs | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!scenarioId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          cl,
          ga,
          ca,
          ic,
          ec,
          conv,
          ns,
          adj,
          cap,
          dr,
          intRates,
          extRates,
          nsBase,
        ] = await Promise.all([
          supabase.from("cost_lines").select("*"),
          supabase.from("global_assumptions").select("*").eq("scenario_id", scenarioId),
          supabase.from("central_assumptions").select("*").eq("scenario_id", scenarioId),
          supabase.from("internal_fte_changes").select("*").eq("scenario_id", scenarioId),
          supabase.from("external_fte_changes").select("*").eq("scenario_id", scenarioId),
          supabase.from("conversions").select("*").eq("scenario_id", scenarioId),
          supabase.from("nearshoring_additions").select("*").eq("scenario_id", scenarioId),
          supabase.from("category_adjustments").select("*").eq("scenario_id", scenarioId),
          supabase.from("capex_plan").select("*").eq("scenario_id", scenarioId),
          supabase.from("depreciation_rules").select("*"),
          supabase.from("internal_fte_base_rates").select("*"),
          supabase.from("external_fte_base_rates").select("*"),
          supabase.from("nearshoring_base").select("*").limit(1).maybeSingle(),
        ]);

        const errs = [cl, ga, ca, ic, ec, conv, ns, adj, cap, dr, intRates, extRates, nsBase]
          .map((r) => r.error)
          .filter(Boolean);
        if (errs.length) throw new Error(errs.map((e) => e!.message).join("; "));

        const built: ForecastInputs = {
          scenario_id: scenarioId,
          cost_lines: (cl.data ?? []) as unknown as CostLineRow[],
          global_assumptions: ga.data ?? [],
          central_assumptions: ca.data ?? [],
          internal_fte_changes: (ic.data ?? []) as ForecastInputs["internal_fte_changes"],
          external_fte_changes: (ec.data ?? []) as ForecastInputs["external_fte_changes"],
          conversions: (conv.data ?? []) as ForecastInputs["conversions"],
          nearshoring_additions: (ns.data ?? []) as ForecastInputs["nearshoring_additions"],
          category_adjustments: adj.data ?? [],
          capex_plan: (cap.data ?? []) as ForecastInputs["capex_plan"],
          depreciation_rules: (dr.data ?? []) as ForecastInputs["depreciation_rules"],
          internal_fte_base_rates: (intRates.data ?? []) as ForecastInputs["internal_fte_base_rates"],
          external_fte_base_rates: (extRates.data ?? []) as ForecastInputs["external_fte_base_rates"],
          nearshoring_base:
            (nsBase.data as ForecastInputs["nearshoring_base"]) ?? {
              base_annual_cost_eur: 75000,
              working_months: 12,
            },
        };
        if (!cancelled) setInputs(built);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [scenarioId, reloadKey]);

  const result = useMemo(
    () => (inputs ? calculateForecast(inputs) : null),
    [inputs]
  );

  return {
    loading,
    error,
    inputs,
    result,
    reload: () => setReloadKey((k) => k + 1),
  };
}
