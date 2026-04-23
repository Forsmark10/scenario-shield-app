// Edge function: AI Goal Seek
// Tar imot et naturlig språk-mål + scenario-kontekst, og returnerer
// strukturerte forslag til endringer i assumptions via Lovable AI Gateway.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const SYSTEM_PROMPT = `Du er en FP&A-ekspert som hjelper å justere forutsetninger i en langtidsplan. Brukeren gir deg et mål for total kostnad eller en kategori, og du foreslår konkrete endringer i assumptions som vil bidra til å nå målet.

Regler:
- Foreslå KUN realistiske endringer som er rimelige for et kostnadssenter (ingen absurde kutt som -90% på lønn)
- Prioriter endringer som er vanlige i virkeligheten: FTE-konvertering til nearshoring, reforhandling av eksterne avtaler (5-15% reduksjon typisk), gradvise FTE-kutt over år
- Ikke rør Central-drivere med mindre brukeren eksplisitt nevner allokering eller morselskap (de kan ikke forhandles enkelt)
- Spre endringene over flere år hvis mulig (2027-2031) heller enn alt i ett år
- Bruk kun kategorier som finnes i konteksten
- Estimer impact i MNOK (negativ = kostnadskutt)

Bruk det medfølgende verktøyet "propose_changes" for å returnere svaret.`;

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "propose_changes",
    description: "Returner forslag til endringer i assumptions for å nå brukerens mål.",
    parameters: {
      type: "object",
      properties: {
        reasoning: {
          type: "string",
          description: "Kort forklaring (maks 2 setninger) på norsk om hvorfor disse endringene er valgt.",
        },
        estimated_result: {
          type: "string",
          description:
            "Beskriv forventet effekt, f.eks. 'Total 2031 reduseres fra 578 MNOK til 505 MNOK'.",
        },
        changes: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string", description: "Unik id, f.eks. change-1" },
              type: {
                type: "string",
                enum: [
                  "salary_increase",
                  "price_increase",
                  "central_price",
                  "central_volume",
                  "central_reduction",
                  "internal_fte_change",
                  "external_fte_change",
                  "conversion",
                  "nearshoring",
                  "category_adjustment",
                  "capex",
                ],
              },
              description: { type: "string", description: "Menneskevennlig beskrivelse på norsk" },
              year: { type: "number" },
              details: {
                type: "object",
                description:
                  "Felter avhengig av type. Eksempler: { pct: 0.04 } for salary_increase; { level: 'Medium', increase: 0, decrease: 3 } for FTE-endring; { external_level: 'High', internal_level: 'Low', count: 3, overlap_months: 3 } for conversion; { replaces_external_level: 'High', count: 4, overlap_months: 3 } for nearshoring; { category: 'Consultancy', adjustment_pct: -0.12 } for category_adjustment; { capex_type: 'Hardware', amount: 1500, description: '...' } for capex.",
                additionalProperties: true,
              },
              estimated_impact_mnok: { type: "number" },
            },
            required: ["id", "type", "description", "year", "details", "estimated_impact_mnok"],
            additionalProperties: false,
          },
        },
      },
      required: ["reasoning", "estimated_result", "changes"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY er ikke konfigurert." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const body = await req.json();
    const { goal, context } = body ?? {};
    if (!goal || typeof goal !== "string" || goal.trim().length < 3) {
      return new Response(JSON.stringify({ error: "Mangler 'goal' (tekst)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!context || typeof context !== "object") {
      return new Response(JSON.stringify({ error: "Mangler 'context' (objekt)." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userMessage = `MÅL: ${goal}\n\nKONTEKST (JSON):\n${JSON.stringify(context, null, 2)}`;

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "propose_changes" } },
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
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    if (!argsRaw) {
      console.error("Missing tool call in AI response", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Kunne ikke tolke AI-svar (manglet verktøykall)." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    let parsed: unknown;
    try {
      parsed = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
    } catch (e) {
      console.error("JSON parse error", e, argsRaw);
      return new Response(
        JSON.stringify({ error: "Kunne ikke tolke AI-svar (ugyldig JSON)." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(JSON.stringify(parsed), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("goal-seek error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Ukjent feil" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
