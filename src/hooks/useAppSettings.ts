import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Unit } from "@/lib/format";

export interface AppSettings {
  id: string;
  cost_center_name: string;
  default_unit: Unit;
}

let cache: AppSettings | null = null;
const listeners: Set<(s: AppSettings) => void> = new Set();

async function fetchSettings(): Promise<AppSettings | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("id, cost_center_name, default_unit")
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  const s: AppSettings = {
    id: data.id,
    cost_center_name: data.cost_center_name,
    default_unit: (data.default_unit as Unit) ?? "tNOK",
  };
  cache = s;
  listeners.forEach((cb) => cb(s));
  return s;
}

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings | null>(cache);

  useEffect(() => {
    if (!cache) {
      fetchSettings().then((s) => s && setSettings(s));
    }
    const cb = (s: AppSettings) => setSettings(s);
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  }, []);

  return settings;
}
