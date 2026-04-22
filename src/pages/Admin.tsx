import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { importCostLinesFromCsv } from "@/lib/csvImport";
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
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

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

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    try {
      const res = await importCostLinesFromCsv(file);
      if (res.errors.length) {
        toast({
          title: `Importert ${res.inserted} rader med advarsler`,
          description: res.errors.slice(0, 3).join(" • "),
          variant: res.inserted === 0 ? "destructive" : "default",
        });
      } else {
        toast({
          title: "Import fullført",
          description: `${formatNumberNO(res.inserted)} rader lagt til i cost_lines.`,
        });
      }
      await loadCounts();
    } catch (err) {
      toast({
        title: "Import feilet",
        description: err instanceof Error ? err.message : String(err),
        variant: "destructive",
      });
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              LTP — Long-Term Plan
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Kostnadsstyring og scenarioplanlegging
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/debug">Debug beregning →</a>
          </Button>
        </div>
      </header>

      <main className="container py-8 space-y-6">
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
      </main>
    </div>
  );
};

export default Index;
