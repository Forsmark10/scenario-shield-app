import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ImportDialog } from "@/components/ImportDialog";
import { formatNumberNO } from "@/lib/format";

const TABLES = [
  "cost_lines",
  "scenarios",
  "global_assumptions",
  "central_assumptions",
  "internal_fte_base_rates",
  "external_fte_base_rates",
  "nearshoring_base",
  "internal_fte_changes",
  "external_fte_changes",
  "conversions",
  "nearshoring_additions",
  "category_adjustments",
  "capex_plan",
  "depreciation_rules",
] as const;

type TableName = (typeof TABLES)[number];

const Index = () => {
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [loading, setLoading] = useState(true);
  const [importOpen, setImportOpen] = useState(false);

  const loadCounts = async () => {
    setLoading(true);
    const result: Record<string, number | null> = {};
    await Promise.all(
      TABLES.map(async (t) => {
        const { count, error } = await supabase
          .from(t as TableName)
          .select("*", { count: "exact", head: true });
        result[t] = error ? null : count ?? 0;
      })
    );
    setCounts(result);
    setLoading(false);
  };

  useEffect(() => {
    loadCounts();
  }, []);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Health & Import</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Kontroller tabellrader og importer cost_lines fra CSV.
          </p>
        </div>
        <Button variant="outline" asChild>
          <a href="/debug">Åpne beregnings-debug →</a>
        </Button>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle>Import av cost_lines</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Last opp <code>ltp_import.csv</code>. Eksisterende rader slettes
                før import.
              </p>
            </div>
            <div className="flex gap-2">
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                onChange={handleImport}
                className="hidden"
              />
              <Button
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                {importing ? "Importerer…" : "Velg CSV-fil"}
              </Button>
              <Button
                variant="outline"
                onClick={loadCounts}
                disabled={loading || importing}
              >
                Oppdater
              </Button>
            </div>
          </CardHeader>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Health check — tabellrader</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {TABLES.map((t) => {
                const c = counts[t];
                const ok = c !== null && c !== undefined;
                return (
                  <div
                    key={t}
                    className="flex items-center justify-between rounded-md border bg-card px-4 py-3"
                  >
                    <div>
                      <div className="font-mono text-sm">{t}</div>
                      <div className="text-xs text-muted-foreground">
                        {ok ? "Tilkoblet" : "Feil"}
                      </div>
                    </div>
                    <Badge variant={ok ? "secondary" : "destructive"}>
                      {loading
                        ? "…"
                        : ok
                          ? formatNumberNO(c as number)
                          : "—"}
                    </Badge>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default Index;

