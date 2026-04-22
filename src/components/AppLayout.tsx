import { useState } from "react";
import { Outlet } from "react-router-dom";
import { Download, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAllScenarios } from "@/hooks/useAllScenarios";
import { ImportDialog } from "@/components/ImportDialog";
import { exportWorkbook } from "@/lib/excelExport";

export default function AppLayout() {
  const settings = useAppSettings();
  const { scenarios, loading } = useAllScenarios();
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const costCenter = settings?.cost_center_name ?? "Kostnadssenter";

  const handleExport = async () => {
    if (loading || !scenarios.length) {
      toast.error("Eksport ikke tilgjengelig", {
        description: "Beregningene er ikke ferdig lastet ennå.",
      });
      return;
    }
    setExporting(true);
    try {
      // Bygg på neste tick for å la spinner rendre
      await new Promise((r) => setTimeout(r, 30));
      exportWorkbook({ scenarios, costCenterName: costCenter });
      toast.success("Excel-fil lastet ned");
    } catch (e: any) {
      toast.error("Eksport feilet", { description: e?.message ?? String(e) });
    } finally {
      setExporting(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card flex items-center justify-between px-4 gap-4 sticky top-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{costCenter}</div>
                <div className="text-xs text-muted-foreground truncate">
                  Long-Term Plan · Kostnadsstyring
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setImportOpen(true)}
              >
                <Upload className="h-4 w-4 mr-1.5" />
                <span className="hidden sm:inline">Importer</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || loading}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 mr-1.5" />
                )}
                <span className="hidden sm:inline">Eksport Excel</span>
              </Button>
            </div>
          </header>
          <main className="flex-1 overflow-auto" key={reloadKey}>
            <Outlet />
          </main>
        </div>
      </div>

      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onImported={() => setReloadKey((k) => k + 1)}
      />
    </SidebarProvider>
  );
}
