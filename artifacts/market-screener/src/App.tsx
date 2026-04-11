import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { PremiumProvider } from "@/contexts/PremiumContext";
import { NotificationProvider } from "@/contexts/NotificationContext";
import { PremiumModal } from "@/components/PremiumModal";
import { NotificationModal } from "@/components/NotificationModal";
import { Sidebar } from "@/components/Sidebar";
import { BreakingTicker } from "@/components/BreakingTicker";
import { Dashboard } from "@/pages/Dashboard";
import { Markets } from "@/pages/Markets";
import { Economics } from "@/pages/Economics";
import { Geopolitical } from "@/pages/Geopolitical";
import { News } from "@/pages/News";
import { Watchlist } from "@/pages/Watchlist";
import { Stocks } from "@/pages/Stocks";
import { Social } from "@/pages/Social";
import { ChartPage } from "@/pages/ChartPage";
import { NiftyAnalysis } from "@/pages/NiftyAnalysis";
import { BitcoinAnalysis } from "@/pages/BitcoinAnalysis";
import { Terminal } from "@/pages/Terminal";
import { AutoPilotBot } from "@/pages/AutoPilotBot";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 5000,
      refetchInterval: 5000,
    },
  },
});

function AppLayout() {
  return (
    <div className="flex h-[100dvh] bg-background overflow-hidden relative">
      <div className="glow-blob" style={{ width: 260, height: 260, background: '#7C3AED', top: -40, right: '15%', animationDelay: '0s' }} />
      <div className="glow-blob" style={{ width: 220, height: 220, background: '#2962FF', bottom: '10%', left: '5%', animationDelay: '-5s' }} />
      <div className="glow-blob" style={{ width: 200, height: 200, background: '#26A69A', top: '40%', right: '25%', animationDelay: '-10s' }} />
      <div className="glow-blob-sm" style={{ width: 180, height: 180, background: '#EF5350', bottom: '20%', right: '10%', animationDelay: '-3s' }} />
      <div className="glow-blob-sm" style={{ width: 160, height: 160, background: '#FF9800', top: '20%', left: '30%', animationDelay: '-8s' }} />
      <div className="glow-blob-sm" style={{ width: 140, height: 140, background: '#EC407A', top: '60%', left: '50%', animationDelay: '-12s' }} />
      <div className="glow-blob" style={{ width: 190, height: 190, background: '#42A5F5', bottom: '5%', right: '40%', animationDelay: '-7s' }} />
      <div className="glow-blob-sm" style={{ width: 130, height: 130, background: '#AB47BC', top: '10%', left: '60%', animationDelay: '-15s' }} />
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0 overflow-hidden relative">
        <BreakingTicker />
        <main className="flex flex-1 overflow-hidden">
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/chart" component={ChartPage} />
            <Route path="/markets" component={Markets} />
            <Route path="/stocks" component={Stocks} />
            <Route path="/economics" component={Economics} />
            <Route path="/geopolitical" component={Geopolitical} />
            <Route path="/news" component={News} />
            <Route path="/social" component={Social} />
            <Route path="/nifty" component={NiftyAnalysis} />
            <Route path="/bitcoin" component={BitcoinAnalysis} />
            <Route path="/watchlist" component={Watchlist} />
            <Route path="/terminal" component={Terminal} />
            <Route path="/bot" component={AutoPilotBot} />
            <Route component={NotFound} />
          </Switch>
        </main>
      </div>
      <PremiumModal />
      <NotificationModal />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <PremiumProvider>
        <NotificationProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppLayout />
            <Toaster />
          </WouterRouter>
        </NotificationProvider>
      </PremiumProvider>
    </QueryClientProvider>
  );
}

export default App;
