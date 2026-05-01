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

VIKTIG – ta hensyn til eksisterende endringer:
- Brukeren kan ALLEREDE ha gjort manuelle endringer i assumptions. Disse finnes i konteksten under "assumptions". Behandle disse som utgangspunkt – ikke som default.
- Hvis du foreslår å endre en verdi som allerede er satt, MÅ du være tydelig på "fra X → til Y" i description, og sette feltet "before_value" (gjeldende verdi) og "after_value" (foreslått ny verdi) i details.
- For FTE-endringer, conversions, nearshoring og capex (additive tabeller): "before_value" = eksisterende verdi i raden hvis den finnes, ellers 0. "after_value" = ny totalverdi etter din endring.
- For prosent-felter (salary, price, central, category_adjustment): before_value er nåværende prosent (0 hvis ikke satt), after_value er den nye prosenten du foreslår.

KONVENSJON for fortegn (KRITISK – må følges):
- central_reduction: Reduksjoner skrives som NEGATIVE tall. F.eks. -0.05 betyr 5% permanent rabatt. Aldri positiv verdi for reduksjon. Effekten er kumulativ over år (multiplikativ).
- category_adjustment: Negativ = reduksjon, positiv = økning. Også kumulativ/multiplikativ over år.
- internal_fte_change / external_fte_change: 'increase' er antall nyansatte (positivt heltall, lagres som positivt), 'decrease' er antall som slutter (positivt heltall, lagres som positivt – feltnavnet bærer fortegnet).
- conversion / nearshoring 'count': alltid positivt heltall.

Regler:
- Foreslå KUN realistiske endringer (ingen absurde kutt som -90% på lønn).
- Prioriter endringer som er vanlige i virkeligheten: FTE-konvertering til nearshoring, reforhandling av eksterne avtaler (5-15% reduksjon typisk), gradvise FTE-kutt over år.
- Ikke rør Central-drivere med mindre brukeren eksplisitt nevner allokering eller morselskap.
- Spre endringene over flere år (2027-2031) heller enn alt i ett år.
- Bruk kun kategorier som finnes i konteksten.
- Estimer impact i MNOK (negativ = kostnadskutt).
- Aldri overskriv en eksisterende endring stilltiende – beskriv den eksplisitt som "Endre X fra A til B".

KRITISK – "details"-objektet MÅ ALLTID inneholde de feltene som trengs for å anvende endringen. Tomt details-objekt er ALDRI tillatt. Påkrevde felt per type:
- salary_increase / price_increase: { pct: <decimal, fx 0.04>, before_value, after_value }
- central_price / central_volume / central_reduction: { pct: <decimal>, before_value, after_value }
- internal_fte_change / external_fte_change: { level: "Low"|"Medium"|"High", increase: <int>, decrease: <int>, before_value, after_value }
- conversion: { external_level: "Low"|"Medium"|"High", internal_level: "Low"|"Medium"|"High", count: <int>, overlap_months: <int, default 3>, before_value, after_value }
- nearshoring: { replaces_external_level: "Low"|"Medium"|"High", count: <int>, overlap_months: <int, default 3>, before_value, after_value }
- category_adjustment: { category: "<eksakt navn fra kontekst>", adjustment_pct: <decimal, negativ for reduksjon>, before_value, after_value }
- capex: { capex_type: "Hardware"|"Software"|...annet fra kontekst, amount: <tNOK>, description: "<kort tekst>", before_value, after_value }

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
              description: {
                type: "string",
                description:
                  "Menneskevennlig beskrivelse på norsk. Hvis du endrer en eksisterende verdi, skriv 'fra X til Y' eksplisitt.",
              },
              year: { type: "number" },
              details: {
                type: "object",
                description:
                  "Felter avhengig av type. ALLTID inkluder 'before_value' og 'after_value' (tall eller kort tekst som beskriver tilstand før/etter). Eksempler: { pct: 0.04, before_value: 0.03, after_value: 0.04 } for salary_increase; { level: 'Medium', increase: 0, decrease: 3, before_value: 0, after_value: 3 } for FTE-endring; { external_level: 'High', internal_level: 'Low', count: 3, overlap_months: 3, before_value: 0, after_value: 3 } for conversion; { category: 'Consultancy', adjustment_pct: -0.12, before_value: -0.05, after_value: -0.12 } for category_adjustment.",
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

    // Bygg en kort oversikt over GJELDENDE ikke-null endringer for å gjøre konteksten tydelig.
    const a = (context as any).assumptions ?? {};
    const summarizeExisting = (): string => {
      const lines: string[] = [];
      const global = Array.isArray(a.global) ? a.global : [];
      for (const g of global) {
        const parts: string[] = [];
        if (Number(g.salary_increase_pct) !== 0.04 && g.salary_increase_pct != null)
          parts.push(`salary=${g.salary_increase_pct}`);
        if (Number(g.price_increase_pct) !== 0.05 && g.price_increase_pct != null)
          parts.push(`price=${g.price_increase_pct}`);
        if (parts.length) lines.push(`- global ${g.year}: ${parts.join(", ")}`);
      }
      const central = Array.isArray(a.central) ? a.central : [];
      for (const c of central) {
        const parts: string[] = [];
        if (Number(c.central_reduction_pct) !== 0) parts.push(`reduction=${c.central_reduction_pct}`);
        if (parts.length) lines.push(`- central ${c.year}: ${parts.join(", ")}`);
      }
      for (const fte of (a.internal_fte_changes ?? [])) {
        if ((fte.increase ?? 0) || (fte.decrease ?? 0))
          lines.push(`- intern FTE ${fte.year} ${fte.level}: +${fte.increase ?? 0}/-${fte.decrease ?? 0}`);
      }
      for (const fte of (a.external_fte_changes ?? [])) {
        if ((fte.increase ?? 0) || (fte.decrease ?? 0))
          lines.push(`- ekstern FTE ${fte.year} ${fte.level}: +${fte.increase ?? 0}/-${fte.decrease ?? 0}`);
      }
      for (const conv of (a.conversions ?? [])) {
        if (conv.count) lines.push(`- konvertering ${conv.year}: ${conv.count} ${conv.external_level}→${conv.internal_level}`);
      }
      for (const ns of (a.nearshoring ?? [])) {
        if (ns.count) lines.push(`- nearshoring ${ns.year}: ${ns.count} (erstatter ${ns.replaces_external_level})`);
      }
      for (const cat of (a.category_adjustments ?? [])) {
        if (Number(cat.adjustment_pct) !== 0)
          lines.push(`- kategori ${cat.year} ${cat.category}: ${cat.adjustment_pct}`);
      }
      for (const cap of (a.capex_plan ?? [])) {
        if (Number(cap.amount) !== 0)
          lines.push(`- capex ${cap.year} ${cap.capex_type}: ${cap.amount} tNOK`);
      }
      return lines.length ? lines.join("\n") : "(ingen brukerendringer ennå – alt er på default)";
    };

    const existingSummary = summarizeExisting();

    const userMessage = `MÅL: ${goal}

GJELDENDE BRUKERENDRINGER (utgangspunkt – respekter disse):
${existingSummary}

FULL KONTEKST (JSON):
${JSON.stringify(context, null, 2)}`;

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
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
