import { Outlet } from "react-router-dom";
import { Download, Upload } from "lucide-react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useToast } from "@/hooks/use-toast";

export default function AppLayout() {
  const settings = useAppSettings();
  const { toast } = useToast();

  const stub = (label: string) =>
    toast({ title: `${label} – kommer snart`, description: "Funksjonen er ikke aktivert i denne fasen." });

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card flex items-center justify-between px-4 gap-4 sticky top-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">
                  {settings?.cost_center_name ?? "Kostnadssenter"}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  Long-Term Plan · Kostnadsstyring
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => stub("Import")} disabled>
                <Upload className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Importer</span>
              </Button>
              <Button variant="outline" size="sm" onClick={() => stub("Excel-eksport")} disabled>
                <Download className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Eksport Excel</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
