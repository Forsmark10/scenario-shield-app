import { Card, CardContent } from "@/components/ui/card";
import { Construction } from "lucide-react";

interface ComingSoonProps {
  title: string;
  description?: string;
}

export default function ComingSoon({ title, description }: ComingSoonProps) {
  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      </div>
      <Card>
        <CardContent className="py-16 flex flex-col items-center text-center gap-3">
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
            <Construction className="h-6 w-6 text-muted-foreground" />
          </div>
          <div className="text-lg font-medium">Kommer i neste fase</div>
          <p className="text-sm text-muted-foreground max-w-md">
            {description ?? "Denne siden er planlagt, men ikke bygget ennå. Den blir tilgjengelig i en senere fase av prosjektet."}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
