import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import AppLayout from "@/components/AppLayout";
import Dashboard from "./pages/Dashboard";
import Scenario from "./pages/Scenario";
import Assumptions from "./pages/Assumptions";
import ScenarioComparison from "./pages/ScenarioComparison";
import OmModellen from "./pages/OmModellen";
import Admin from "./pages/Admin";
import Debug from "./pages/Debug.tsx";
import NotFound from "./pages/NotFound.tsx";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route element={<AppLayout />}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/scenario" element={<Scenario />} />
            <Route path="/assumptions" element={<Assumptions />} />
            <Route path="/comparison" element={<ScenarioComparison />} />
            <Route path="/om-modellen" element={<OmModellen />} />
            <Route path="/admin" element={<Admin />} />
            <Route path="/debug" element={<Debug />} />
          </Route>
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
