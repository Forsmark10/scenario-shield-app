import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { lazy, Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/ThemeProvider";
import { PasswordGate } from "@/components/PasswordGate";
import AppLayout from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Assumptions from "./pages/Assumptions";
import ScenarioComparison from "./pages/ScenarioComparison";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound.tsx";

const OmModellen = lazy(() => import("./pages/OmModellen"));
const Debug = lazy(() => import("./pages/Debug.tsx"));
const History = lazy(() => import("./pages/History"));

const queryClient = new QueryClient();

const PageFallback = () => (
  <div className="p-8 text-sm text-muted-foreground">Laster…</div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <TooltipProvider>
        <PasswordGate>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route element={<AppLayout />}>
                <Route path="/" element={<Dashboard />} />
                <Route path="/assumptions" element={<Assumptions />} />
                <Route path="/comparison" element={<ScenarioComparison />} />
                <Route
                  path="/om-modellen"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <OmModellen />
                    </Suspense>
                  }
                />
                <Route path="/admin" element={<Admin />} />
                <Route
                  path="/history"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <History />
                    </Suspense>
                  }
                />
                <Route
                  path="/debug"
                  element={
                    <Suspense fallback={<PageFallback />}>
                      <Debug />
                    </Suspense>
                  }
                />
              </Route>
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </PasswordGate>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
