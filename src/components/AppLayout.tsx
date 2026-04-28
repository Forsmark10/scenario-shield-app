import { useEffect, useState } from "react";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import { Download, Loader2, HelpCircle, Save } from "lucide-react";
import { toast } from "sonner";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ShortcutsDialog } from "@/components/ShortcutsDialog";
import { SaveSnapshotDialog } from "@/components/SaveSnapshotDialog";
import { useAppSettings } from "@/hooks/useAppSettings";
import { useAllScenarios } from "@/hooks/useAllScenarios";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { ImportDialog } from "@/components/ImportDialog";
import { exportWorkbook } from "@/lib/excelExport";

export default function AppLayout() {
  const settings = useAppSettings();
  const { scenarios, loading } = useAllScenarios();
  const location = useLocation();
  const navigate = useNavigate();
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);
  const [snapshotOpen, setSnapshotOpen] = useState(false);

  const costCenter = settings?.cost_center_name ?? "Kostnadssenter";

  // Pages where "Save snapshot" makes sense
  const snapshotEnabled =
    location.pathname === "/" || location.pathname === "/comparison";

  useKeyboardShortcuts({
    onShowHelp: () => setHelpOpen(true),
    onSaveSnapshot: () => {
      if (snapshotEnabled) setSnapshotOpen(true);
      else navigate("/");
    },
  });

  const handleExport = async () => {
    if (loading || !scenarios.length) {
      toast.error("Eksport ikke tilgjengelig", {
        description: "Beregningene er ikke ferdig lastet ennå.",
      });
      return;
    }
    setExporting(true);
    try {
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
          <header className="h-14 border-b bg-card flex items-center justify-between px-3 sm:px-4 gap-2 sm:gap-4 sticky top-0 z-30">
            <div className="flex items-center gap-3 min-w-0">
              <SidebarTrigger />
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{costCenter}</div>
                <div className="text-xs text-muted-foreground truncate hidden sm:block">
                  Long-Term Plan · Kostnadsstyring
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              {snapshotEnabled && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSnapshotOpen(true)}
                  title="Lagre snapshot (⌘/Ctrl + S)"
                >
                  <Save className="h-4 w-4 sm:mr-1.5" />
                  <span className="hidden md:inline">Lagre snapshot</span>
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={handleExport}
                disabled={exporting || loading}
              >
                {exporting ? (
                  <Loader2 className="h-4 w-4 sm:mr-1.5 animate-spin" />
                ) : (
                  <Download className="h-4 w-4 sm:mr-1.5" />
                )}
                <span className="hidden md:inline">Eksport Excel</span>
              </Button>
              <ThemeToggle />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setHelpOpen(true)}
                title="Hurtigtaster (?)"
                aria-label="Hurtigtaster"
              >
                <HelpCircle className="h-4 w-4" />
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
      <ShortcutsDialog open={helpOpen} onOpenChange={setHelpOpen} />
      <SaveSnapshotDialog
        open={snapshotOpen}
        onOpenChange={setSnapshotOpen}
        scenarios={scenarios}
      />
    </SidebarProvider>
  );
}
