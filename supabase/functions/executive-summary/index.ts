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

GENERELLE KRAV (gjelder ALLE scenarioer):
- Maks 3-4 setninger. Direkte, konkret, datadrevet. Skriv på norsk.
- ALDRI start med å gjenta totaltall (totalkostnad, total endring i MNOK/%) – brukeren ser disse i dashboardet.
- ALDRI bruk ordet "baseline" om Steady State – det er forvirrende fordi FC 2026 allerede kalles Baseline i dashboardet. Skriv "Steady State" når du refererer til videreført drift.
- Fokuser på de underliggende DRIVERNE og FORUTSETNINGENE – ikke bare beløpene. Hva skaper endringen? Hvilke beslutninger ligger bak?
- Trekk inn kommentarer fra assumptions der de finnes – de forklarer HVORFOR en justering er gjort.
- Bruk antall (FTE-er, konverteringer, antall avtaler) i tillegg til MNOK-effekt.
- Bruk "−" for reduksjon, "+" for økning. Komma som desimal (norsk).
- Skriv som en CFO-presentasjon, ikke som AI. Aktiv stemme.

FORBUDTE ORD/FRASER: "demonstrerer", "primært gjennom", "forventes å levere", "viser at", "indikerer", "i lys av", "det er verdt å merke seg", "betydelig", "vesentlig", "bidrar til en betydelig innstramming", "sammenlignet med baseline".

REGLER FOR STEADY STATE (videreføring uten aktive tiltak):
- Fokuser på hva som driver kostnadsveksten: lønnsvekst-%, prisvekst-%, FTE-økninger (hvor mange, hvilket nivå), kategori-justeringer med kommentarer, avskrivninger.
- IKKE sammenlign med andre scenarioer.
- Eksempel på ønsket stil: "Kostnadsveksten drives av 4 % årlig lønnsvekst og 3 % prisvekst på lokale kostnader, kombinert med en netto økning på 11 interne FTE (Medium) og 3 nearshore-ressurser over perioden. IT-kostnader holdes flate gjennom en 2 % reforhandling av Dynamics-avtalen. Avskrivninger faller med 31,5 MNOK grunnet utfasing av eksisterende HW/SW uten full reinvestering."

REGLER FOR MODERATE SAVING / AGGRESSIVE SAVING:
- Sammenlign ALLTID eksplisitt mot Steady State (skriv "Steady State", ikke "baseline").
- Fokuser på TILTAK og BESLUTNINGER: hvor mange FTE-er reduseres, hvor mange konverteres fra ekstern til intern, hvilke avtaler reforhandles, hvilke kommentarer er lagt inn.
- Vis effekten i både antall og MNOK.
- Eksempel på ønsket stil: "Sammenlignet med Steady State reduseres arbeidsstyrken med 4 interne og 3 eksterne FTE, og 6 eksterne konverteres til interne over 2027–2029. Reforhandling av IT-avtaler gir 5 % prisreduksjon fra 2027. Netto besparelse versus Steady State er 65 MNOK i 2031, der FTE-tiltak utgjør 40 MNOK og prisreduksjoner 15 MNOK."`;

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
