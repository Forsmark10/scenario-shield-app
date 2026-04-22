import { Card, CardContent } from "@/components/ui/card";
import { FileText } from "lucide-react";

export default function OmModellen() {
  return (
    <div className="p-8 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">Om modellen</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Forklaringer av modellen, scenarioene og beregningene.
        </p>
      </div>

      <Card>
        <CardContent className="py-12 flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <FileText className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-lg font-medium">Innhold venter på leveranse</div>
          <p className="text-sm text-muted-foreground max-w-md">
            Markdown-tekst for denne siden leveres separat. Når innholdet er klart blir det
            rendret her med seksjoner for: hva appen gjør, hvordan scenarioene fungerer,
            beregningslogikk, definisjoner (P&amp;L vs Spend, Capex vs Opex, Local vs Central),
            og en FAQ.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
