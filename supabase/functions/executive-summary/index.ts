// Edge function: Generate AI executive summary for a scenario.
// Input: { scenario_name, baseline_name, is_baseline, comments[], totals_by_year, baseline_totals_by_year, top_category_deltas[] }
// Output: { summary: string }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT =
  `Du er CFO-rådgiver. Skriv en knivskarp executive summary på norsk for en toppledergruppe.

KRAV:
- Maks 3-4 setninger. Direkte, konkret, datadrevet.
- Start med nøkkeltallet: total endring i MNOK og %.
- Trekk ut 2-3 største drivere med tall i MNOK.
- Bruk tegnene "−" for reduksjon og "+" for økning. Tall med komma som desimal (norsk).
- Skriv som en finansrapport, ikke som AI. Aktiv stemme.

FORBUDTE ORD/FRASER: "demonstrerer", "primært gjennom", "forventes å levere", "viser at", "indikerer", "i lys av", "det er verdt å merke seg", "betydelig", "vesentlig" (med mindre helt nødvendig).

EKSEMPEL PÅ ØNSKET STIL:
"Moderate Saving gir en netto reduksjon på 19,4 MNOK (−3,9 %) i 2027, økende til −65,1 MNOK (−10,6 %) i 2031. Største drivere er ansettelsesstopp og nearshoring (−32 MNOK), reforhandling av eksterne avtaler (−18 MNOK) og IT-prisreduksjoner (−8 MNOK). Capex reduseres med 40 % gjennom utfasing av EOL-hardware."`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY mangler");

    const body = await req.json();
    const {
      scenario_name,
      baseline_name = "Steady State",
      is_baseline = false,
      comments = [],
      totals_by_year = {},
      baseline_totals_by_year = {},
      top_category_deltas = [],
    } = body ?? {};

    if (!scenario_name) {
      return new Response(JSON.stringify({ error: "scenario_name mangler" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fmt = (n: number) =>
      `${(n / 1000).toLocaleString("nb-NO", { maximumFractionDigits: 1 })} MNOK`;

    const years = Object.keys(totals_by_year).map(Number).sort();

    let trendBlock = "";
    if (is_baseline) {
      // Baseline: show trajectory year-over-year vs first year
      const firstYear = years[0];
      const firstVal = Number(totals_by_year[firstYear] ?? 0);
      trendBlock = years
        .map((y) => {
          const a = Number(totals_by_year[y] ?? 0);
          const d = a - firstVal;
          const pct = firstVal ? (d / firstVal) * 100 : 0;
          return `  ${y}: ${fmt(a)} (vs ${firstYear}: ${d >= 0 ? "+" : ""}${fmt(d)} / ${pct.toFixed(1)}%)`;
        })
        .join("\n");
    } else {
      trendBlock = years
        .map((y) => {
          const a = Number(totals_by_year[y] ?? 0);
          const b = Number(baseline_totals_by_year[y] ?? 0);
          const d = a - b;
          const pct = b ? (d / b) * 100 : 0;
          return `  ${y}: ${fmt(a)} (vs baseline ${fmt(b)}, Δ ${d >= 0 ? "+" : ""}${fmt(d)} / ${pct.toFixed(1)}%)`;
        })
        .join("\n");
    }

    const catHeader = is_baseline
      ? "STØRSTE KOSTNADSKATEGORIER (siste år):"
      : "STØRSTE KATEGORI-AVVIK (vs baseline):";

    const catLines = (top_category_deltas as any[])
      .slice(0, 5)
      .map(
        (c) =>
          `  ${c.category}: ${Number(c.delta) >= 0 ? "+" : ""}${fmt(Number(c.delta))} i ${c.year}`,
      )
      .join("\n") || "  (ingen data)";

    const commentLines =
      (comments as any[])
        .slice(0, 30)
        .map((c) => `  - [${c.section}] ${c.label}: ${c.comment}`)
        .join("\n") || "  (ingen kommentarer registrert)";

    const userMsg = is_baseline
      ? `SCENARIO (BASELINE): ${scenario_name}

UTVIKLING PER ÅR:
${trendBlock || "  (ingen tall tilgjengelig)"}

${catHeader}
${catLines}

KOMMENTARER LAGT INN AV BRUKEREN:
${commentLines}

Skriv en knivskarp executive summary (3-4 setninger) som beskriver baseline-utviklingen: nivå, vekst og største kostnadskategorier. Følg eksempel-stilen i system-prompten.`
      : `SCENARIO: ${scenario_name}
BASELINE: ${baseline_name}

TOTAL PER ÅR (vs baseline):
${trendBlock || "  (ingen tall tilgjengelig)"}

${catHeader}
${catLines}

KOMMENTARER LAGT INN AV BRUKEREN:
${commentLines}

Skriv en knivskarp executive summary (3-4 setninger) som forklarer hvordan dette scenarioet skiller seg fra baseline. Følg eksempel-stilen i system-prompten.`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMsg },
        ],
      }),
    });

    if (aiResp.status === 429) {
      return new Response(
        JSON.stringify({ error: "For mange forespørsler – vent litt og prøv igjen." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (aiResp.status === 402) {
      return new Response(
        JSON.stringify({ error: "AI-kreditt brukt opp. Legg til kreditt i Lovable-arbeidsområdet." }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    if (!aiResp.ok) {
      const t = await aiResp.text();
      console.error("AI gateway error", aiResp.status, t);
      return new Response(JSON.stringify({ error: "AI-tjenesten svarte med feil." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await aiResp.json();
    const summary = data?.choices?.[0]?.message?.content?.trim?.() ?? "";
    if (!summary) {
      return new Response(JSON.stringify({ error: "Tomt AI-svar" }), {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ summary }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("executive-summary error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Ukjent feil" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
