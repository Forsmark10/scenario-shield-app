import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useForecast } from "@/hooks/useForecast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { formatNumberNO } from "@/lib/format";
import { Link } from "react-router-dom";
import { YEARS } from "@/lib/forecast/types";

interface ScenarioRow {
  id: string;
  name: string;
  sort_order: number;
}

const Debug = () => {
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [scenarioId, setScenarioId] = useState<string | null>(null);
  const [selectedLineId, setSelectedLineId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("scenarios")
        .select("id,name,sort_order")
        .order("sort_order");
      if (data) {
        setScenarios(data);
        if (!scenarioId && data[0]) setScenarioId(data[0].id);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { loading, error, result, reload } = useForecast(scenarioId);

  const sortedLines = useMemo(() => {
    if (!result) return [];
    return [...result.lines].sort((a, b) => {
      if (a.category !== b.category) return a.category.localeCompare(b.category);
      return (a.account ?? 0) - (b.account ?? 0) || a.project.localeCompare(b.project);
    });
  }, [result]);

  const selectedLine = useMemo(
    () => result?.lines.find((l) => l.line_id === selectedLineId) ?? null,
    [result, selectedLineId]
  );

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b bg-card">
        <div className="container py-6 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Debug — Beregningsmotor
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Inspiser hvordan hver kostnadslinje beregnes per år.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link to="/">← Health check</Link>
          </Button>
        </div>
      </header>

      <main className="container py-8 space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Velg scenario og kostnadslinje</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-[280px_1fr_auto]">
            <Select
              value={scenarioId ?? undefined}
              onValueChange={(v) => {
                setScenarioId(v);
                setSelectedLineId(null);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Scenario" />
              </SelectTrigger>
              <SelectContent>
                {scenarios.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select
              value={selectedLineId ?? undefined}
              onValueChange={setSelectedLineId}
              disabled={!result}
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg kostnadslinje…" />
              </SelectTrigger>
              <SelectContent className="max-h-[400px]">
                {sortedLines.map((l) => (
                  <SelectItem key={l.line_id} value={l.line_id}>
                    [{l.category}] {l.account ? `${l.account} ` : ""}
                    {l.account_name} — {l.project}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Button variant="outline" onClick={reload} disabled={loading}>
              Oppdater
            </Button>
          </CardContent>
        </Card>

        {error && (
          <Card>
            <CardContent className="pt-6 text-destructive">Feil: {error}</CardContent>
          </Card>
        )}

        {result && (
          <Card>
            <CardHeader>
              <CardTitle>Totaler — scenario</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4">Kategori</th>
                      <th className="text-right py-2 px-3">2026 base</th>
                      {YEARS.map((y) => (
                        <th key={y} className="text-right py-2 px-3">
                          {y}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(result.totals.by_category)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([cat, ys]) => (
                        <tr key={cat} className="border-b">
                          <td className="py-2 pr-4">{cat}</td>
                          <td className="text-right px-3 text-muted-foreground">—</td>
                          {YEARS.map((y) => (
                            <td
                              key={y}
                              className={`text-right px-3 ${ys[y] < 0 ? "text-destructive" : ""}`}
                            >
                              {formatNumberNO(ys[y])}
                            </td>
                          ))}
                        </tr>
                      ))}
                    <tr className="border-t-2 font-semibold">
                      <td className="py-2 pr-4">Total (P&L)</td>
                      <td className="text-right px-3">
                        {formatNumberNO(result.totals.base_2026_total)}
                      </td>
                      {YEARS.map((y) => (
                        <td key={y} className="text-right px-3">
                          {formatNumberNO(result.totals.by_year[y])}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
                <div className="mt-3 text-sm">
                  CAGR 2026–2031:{" "}
                  <Badge variant="secondary">
                    {(result.totals.cagr_2026_2031 * 100).toFixed(2)} %
                  </Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {selectedLine && (
          <Card>
            <CardHeader>
              <CardTitle>
                {selectedLine.account ? `${selectedLine.account} ` : ""}
                {selectedLine.account_name}
              </CardTitle>
              <div className="flex gap-2 flex-wrap text-xs text-muted-foreground mt-2">
                <Badge variant="outline">{selectedLine.category}</Badge>
                <Badge variant="outline">{selectedLine.project}</Badge>
                <Badge variant="outline">{selectedLine.cost_type}</Badge>
                <Badge variant="outline">Kilde: {selectedLine.source}</Badge>
                {selectedLine.is_depreciation && <Badge>Depreciation</Badge>}
                {selectedLine.is_capex && <Badge>Capex</Badge>}
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <div className="text-sm text-muted-foreground mb-2">
                  Base 2026 (sum av fc_2026_monthly)
                </div>
                <div className="font-mono text-lg">
                  {formatNumberNO(selectedLine.base_2026, 2)}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm font-mono">
                  <thead>
                    <tr className="border-b">
                      {YEARS.map((y) => (
                        <th key={y} className="text-right py-2 px-3">
                          {y}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr>
                      {YEARS.map((y) => (
                        <td
                          key={y}
                          className={`text-right py-2 px-3 ${selectedLine.amounts[y] < 0 ? "text-destructive" : ""}`}
                        >
                          {formatNumberNO(selectedLine.amounts[y], 2)}
                        </td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">
                  Månedlig fordeling 2027 (basert på fc_2026-mønster)
                </div>
                <div className="grid grid-cols-6 gap-2 text-xs font-mono">
                  {selectedLine.monthly_2027.map((v, i) => (
                    <div key={i} className="rounded border bg-muted/30 px-2 py-1">
                      <div className="text-muted-foreground">M{i + 1}</div>
                      <div className={v < 0 ? "text-destructive" : ""}>
                        {formatNumberNO(v, 2)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-semibold mb-2">
                  Beregningsforklaring per år
                </div>
                <div className="space-y-3">
                  {YEARS.map((y) => (
                    <div key={y} className="rounded border bg-muted/20 p-3">
                      <div className="flex justify-between mb-2">
                        <span className="font-semibold">{y}</span>
                        <span className="font-mono">
                          = {formatNumberNO(selectedLine.amounts[y], 2)}
                        </span>
                      </div>
                      <pre className="text-xs whitespace-pre-wrap font-mono text-muted-foreground">
                        {selectedLine.breakdown_source[y]}
                      </pre>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  );
};

export default Debug;
