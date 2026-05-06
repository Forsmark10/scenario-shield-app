import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { calculateForecast } from "@/lib/forecast/engine";
import type { CostLineRow, ForecastInputs, ForecastResult } from "@/lib/forecast/types";

export interface ScenarioMeta {
  id: string;
  name: string;
  sort_order: number;
}

export interface ScenarioBundle {
  meta: ScenarioMeta;
  inputs: ForecastInputs;
  result: ForecastResult;
}

export interface UseAllScenariosState {
  loading: boolean;
  error: string | null;
  scenarios: ScenarioBundle[];
}

/**
 * Loads all active scenarios + shared base data once and computes a forecast for each.
 * Used by Dashboard and Comparison.
 */
export function useAllScenarios(reloadKey = 0): UseAllScenariosState {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioBundle[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const [
          scenarioRes,
          clRes,
          gaRes,
          caRes,
          icRes,
          ecRes,
          convRes,
          nsRes,
          ncRes,
          adjRes,
          capRes,
          drRes,
          intRes,
          extRes,
          nsBaseRes,
          i2nRes,
          ooRes,
          dpRes,
        ] = await Promise.all([
          supabase.from("scenarios").select("id, name, sort_order").eq("is_active", true).order("sort_order"),
          supabase.from("cost_lines").select("*"),
          supabase.from("global_assumptions").select("*"),
          supabase.from("central_assumptions").select("*"),
          supabase.from("internal_fte_changes").select("*"),
          supabase.from("external_fte_changes").select("*"),
          supabase.from("conversions").select("*"),
          supabase.from("nearshoring_additions").select("*"),
          supabase.from("nearshoring_changes").select("*"),
          supabase.from("category_adjustments").select("*"),
          supabase.from("capex_plan").select("*"),
          supabase.from("depreciation_rules").select("*"),
          supabase.from("internal_fte_base_rates").select("*"),
          supabase.from("external_fte_base_rates").select("*"),
          supabase.from("nearshoring_base").select("*").limit(1).maybeSingle(),
          supabase.from("internal_to_nearshoring_conversions").select("*"),
          supabase.from("one_off_effects").select("*"),
          supabase.from("depreciation_phaseout").select("*"),
        ]);

        const errs = [
          scenarioRes,
          clRes,
          gaRes,
          caRes,
          icRes,
          ecRes,
          convRes,
          nsRes,
          ncRes,
          adjRes,
          capRes,
          drRes,
          intRes,
          extRes,
          nsBaseRes,
        ]
          .map((r) => r.error)
          .filter(Boolean);
        if (errs.length) throw new Error(errs.map((e) => e!.message).join("; "));

        const cost_lines = (clRes.data ?? []) as unknown as CostLineRow[];
        const bundles: ScenarioBundle[] = (scenarioRes.data ?? []).map((s) => {
          const inputs: ForecastInputs = {
            scenario_id: s.id,
            cost_lines,
            global_assumptions: (gaRes.data ?? []).filter((r: any) => r.scenario_id === s.id),
            central_assumptions: (caRes.data ?? []).filter((r: any) => r.scenario_id === s.id),
            internal_fte_changes: (icRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as ForecastInputs["internal_fte_changes"],
            external_fte_changes: (ecRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as ForecastInputs["external_fte_changes"],
            conversions: (convRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as ForecastInputs["conversions"],
            nearshoring_additions: (nsRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as ForecastInputs["nearshoring_additions"],
            nearshoring_changes: (ncRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as ForecastInputs["nearshoring_changes"],
            category_adjustments: (adjRes.data ?? []).filter((r: any) => r.scenario_id === s.id),
            capex_plan: (capRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as ForecastInputs["capex_plan"],
            internal_to_nearshoring_conversions: (i2nRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as any,
            one_off_effects: (ooRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as any,
            depreciation_phaseout: (dpRes.data ?? []).filter((r: any) => r.scenario_id === s.id) as any,
            depreciation_rules: (drRes.data ?? []) as ForecastInputs["depreciation_rules"],
            internal_fte_base_rates: (intRes.data ?? []) as ForecastInputs["internal_fte_base_rates"],
            external_fte_base_rates: (extRes.data ?? []) as ForecastInputs["external_fte_base_rates"],
            nearshoring_base: (nsBaseRes.data as ForecastInputs["nearshoring_base"]) ?? {
              base_annual_cost_eur: 75000,
              working_months: 12,
            },
          };
          return { meta: s, inputs, result: calculateForecast(inputs) };
        });

        if (!cancelled) setScenarios(bundles);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  return { loading, error, scenarios };
}
