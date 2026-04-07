import { useState } from "react";
import {
  useGetDashboardOverview,
  useGetMarketSummary,
  useGetTopMovers,
  useGetBreakingNews,
} from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  TrendingUp,
  TrendingDown,
  Shield,
  Globe,
  Newspaper,
  ArrowUpRight,
  ArrowDownRight,
  DollarSign,
  Clock,
  Rocket,
  ChevronRight,
  RefreshCw,
  Zap,
  BarChart2,
  Crown,
  CandlestickChart,
} from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { GlobalMarketMap } from "@/components/GlobalMarketMap";
import { usePremium } from "@/contexts/PremiumContext";

interface UsdSignal {
  direction: string;
  confidence: number;
  summary: string;
  factors: string[];
  dxyValue: number | null;
  goldPrice: number | null;
  oilPrice: number | null;
  vixValue: number | null;
  fedSignal: string;
  geopoliticalRisk: string;
  nextUpdate: string | null;
  createdAt: string;
}

interface IpoListing {
  id: number;
  companyName: string;
  symbol: string | null;
  market: string;
  exchange: string;
  issueSize: string | null;
  priceRange: string | null;
  openDate: string | null;
  closeDate: string | null;
  listingDate: string | null;
  lotSize: number | null;
  ipoType: string;
  status: string;
  gmp: number | null;
  subscriptionTotal: number | null;
  industry: string | null;
  recommendationListing: string | null;
  totalScore: number | null;
}

function UsdSignalBox() {
  const { data: signal, isLoading } = useQuery<UsdSignal>({
    queryKey: ["usd-signal"],
    queryFn: async () => {
      const res = await fetch("/api/usd-signal");
      if (!res.ok) throw new Error("Failed to fetch USD signal");
      return res.json();
    },
    refetchInterval: 5 * 1000,
  });

  if (isLoading || !signal) {
    return (
      <div className="glass-card p-4 animate-pulse">
        <div className="h-24" />
      </div>
    );
  }

  const dirColor = signal.direction === "BULLISH" ? "text-emerald-600" : signal.direction === "BEARISH" ? "text-red-600" : "text-amber-600";
  const dirBg = signal.direction === "BULLISH" ? "glass-card border-emerald-400/20" : signal.direction === "BEARISH" ? "glass-card border-red-400/20" : "glass-card border-amber-400/20";
  const dirIcon = signal.direction === "BULLISH" ? ArrowUpRight : signal.direction === "BEARISH" ? ArrowDownRight : DollarSign;
  const DirIcon = dirIcon;

  return (
    <div className={`overflow-hidden ${dirBg}`}>
      <div className="px-4 py-2.5 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <DollarSign className={`w-4 h-4 ${dirColor}`} />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">USD Direction Signal</span>
        </div>
        <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 live-pulse" />
          Live · 5s refresh
        </div>
      </div>

      <div className="p-4">
        <div className="flex items-center gap-4 mb-3">
          <div className={`flex items-center gap-2 ${dirColor}`}>
            <DirIcon className="w-8 h-8" />
            <div>
              <div className="text-2xl font-bold font-mono">{signal.direction}</div>
              <div className="text-[10px] text-muted-foreground">Confidence: {signal.confidence}%</div>
            </div>
          </div>

          <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full transition-all duration-1000 ${signal.direction === "BULLISH" ? "bg-green-500" : signal.direction === "BEARISH" ? "bg-red-500" : "bg-yellow-500"}`}
              style={{ width: `${signal.confidence}%` }}
            />
          </div>
          <span className={`text-sm font-mono font-bold ${dirColor}`}>{signal.confidence}%</span>
        </div>

        <p className="text-[11px] text-foreground/80 leading-relaxed mb-3">{signal.summary}</p>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
          <div className="bg-muted rounded p-2 text-center">
            <div className="text-[9px] text-muted-foreground">DXY</div>
            <div className="text-xs font-mono font-bold text-foreground">{signal.dxyValue?.toFixed(2) ?? "—"}</div>
          </div>
          <div className="bg-muted rounded p-2 text-center">
            <div className="text-[9px] text-muted-foreground">Gold</div>
            <div className="text-xs font-mono font-bold text-amber-600">${signal.goldPrice?.toFixed(0) ?? "—"}</div>
          </div>
          <div className="bg-muted rounded p-2 text-center">
            <div className="text-[9px] text-muted-foreground">Oil</div>
            <div className="text-xs font-mono font-bold text-orange-600">${signal.oilPrice?.toFixed(2) ?? "—"}</div>
          </div>
          <div className="bg-muted rounded p-2 text-center">
            <div className="text-[9px] text-muted-foreground">VIX</div>
            <div className={`text-xs font-mono font-bold ${(signal.vixValue ?? 0) > 20 ? "text-red-600" : "text-green-600"}`}>{signal.vixValue?.toFixed(1) ?? "—"}</div>
          </div>
        </div>

        <div className="space-y-1">
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Key Factors</div>
          {signal.factors.slice(0, 4).map((f, i) => (
            <div key={i} className="flex items-start gap-2 text-[10px] text-foreground/70">
              <Zap className="w-3 h-3 text-primary shrink-0 mt-0.5" />
              <span>{f}</span>
            </div>
          ))}
        </div>

        <div className="mt-3 flex gap-3 text-[10px]">
          <span className="text-muted-foreground">Fed: <span className={signal.fedSignal === "hawkish" ? "text-green-600" : signal.fedSignal === "dovish" ? "text-red-600" : "text-yellow-600"}>{signal.fedSignal?.toUpperCase()}</span></span>
          <span className="text-muted-foreground">Geo Risk: <span className={signal.geopoliticalRisk === "extreme" || signal.geopoliticalRisk === "high" ? "text-red-600" : "text-yellow-600"}>{signal.geopoliticalRisk?.toUpperCase()}</span></span>
        </div>
      </div>
    </div>
  );
}

function IpoBox() {
  const [, setLocation] = useLocation();
  const { data: ipos = [], isLoading } = useQuery<IpoListing[]>({
    queryKey: ["ipo-listings"],
    queryFn: async () => {
      const res = await fetch("/api/ipo");
      if (!res.ok) throw new Error("Failed to fetch IPO data");
      return res.json();
    },
    refetchInterval: 10 * 1000,
  });

  if (isLoading) {
    return (
      <div className="glass-card p-4 animate-pulse">
        <div className="h-24" />
      </div>
    );
  }

  const active = ipos.filter(i => i.status === "upcoming" || i.status === "open" || i.status === "closed");
  const recentListed = ipos.filter(i => i.status === "listed");
  const displayIpos = [...active, ...recentListed].slice(0, 8);

  const getScoreColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 40) return "text-green-600";
    if (score >= 30) return "text-yellow-600";
    return "text-red-600";
  };

  const getRecColor = (rec: string | null) => {
    if (!rec) return "text-muted-foreground";
    if (rec === "STRONG APPLY" || rec === "APPLY") return "text-green-700 bg-green-50 border-green-200";
    if (rec === "WAIT") return "text-yellow-700 bg-yellow-50 border-yellow-200";
    if (rec === "RISKY") return "text-orange-700 bg-orange-50 border-orange-200";
    return "text-red-700 bg-red-50 border-red-200";
  };

  const getStatusBadge = (status: string) => {
    if (status === "open") return "bg-green-50 text-green-700 border-green-200";
    if (status === "upcoming") return "bg-blue-50 text-blue-700 border-blue-200";
    if (status === "closed") return "bg-yellow-50 text-yellow-700 border-yellow-200";
    if (status === "listed") return "bg-purple-50 text-purple-700 border-purple-200";
    return "bg-muted text-muted-foreground border-border";
  };

  return (
    <div className="bg-card border border-border rounded-lg overflow-hidden">
      <div className="px-4 py-2 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-primary" />
          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Upcoming IPOs · Global Markets</span>
        </div>
        <button
          onClick={() => setLocation("/stocks?tab=ipo")}
          className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
        >
          View All <ChevronRight className="w-3 h-3" />
        </button>
      </div>

      {displayIpos.length === 0 ? (
        <div className="p-6 text-center text-[11px] text-muted-foreground">
          No upcoming IPOs available at this time. Data refreshes automatically.
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {displayIpos.map(ipo => (
            <div
              key={ipo.id}
              className="px-4 py-2.5 hover:bg-muted/50 cursor-pointer transition-colors flex items-center gap-3"
              onClick={() => setLocation(`/stocks?tab=ipo&ipoId=${ipo.id}`)}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[10px]">{ipo.market === "us" ? "🇺🇸" : "🇮🇳"}</span>
                  <span className="text-xs font-semibold text-foreground truncate">{ipo.companyName}</span>
                  <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold ${getStatusBadge(ipo.status)}`}>
                    {ipo.status.toUpperCase()}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-muted-foreground">
                  {ipo.priceRange && <span>{(() => {
                    const cur = ipo.market === "us" ? "$" : "₹";
                    if (ipo.priceRange === "TBD") return "TBD";
                    const parts = ipo.priceRange.split("-");
                    const low = Number(parts[0]);
                    const high = Number(parts[1]);
                    if (low >= 100000) return `${cur}${(low/100000).toFixed(1)}L-${(high/100000).toFixed(1)}L`;
                    return `${cur}${ipo.priceRange}`;
                  })()}</span>}
                  {ipo.issueSize && <span>{ipo.issueSize}</span>}
                  {ipo.openDate && <span>{ipo.openDate}</span>}
                </div>
              </div>

              {ipo.gmp !== null && ipo.gmp !== undefined && (
                <div className={`text-right ${ipo.gmp > 0 ? "text-green-600" : ipo.gmp < 0 ? "text-red-600" : "text-muted-foreground"}`}>
                  <div className="text-[9px] text-muted-foreground">GMP</div>
                  <div className="text-xs font-mono font-bold">₹{ipo.gmp}</div>
                </div>
              )}

              {ipo.totalScore !== null && (
                <div className="text-right">
                  <div className="text-[9px] text-muted-foreground">Score</div>
                  <div className={`text-xs font-mono font-bold ${getScoreColor(ipo.totalScore)}`}>{ipo.totalScore}/50</div>
                </div>
              )}

              {ipo.recommendationListing && (
                <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold ${getRecColor(ipo.recommendationListing)}`}>
                  {ipo.recommendationListing}
                </span>
              )}

              <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Dashboard() {
  const { data: overview, isLoading: overviewLoading } = useGetDashboardOverview();
  const { data: summary } = useGetMarketSummary();
  const { data: movers } = useGetTopMovers();
  const { data: breaking } = useGetBreakingNews();
  const [, setLocation] = useLocation();
  const { isPremium, setShowActivation } = usePremium();

  if (overviewLoading) {
    return (
      <div className="flex-1 p-4 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-20 glass-card animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-5 space-y-4 sm:space-y-5 bg-transparent">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground tracking-tight">Global Intelligence</h1>
          <p className="text-[11px] text-muted-foreground">
            {overview?.updatedAt ? `Last updated ${new Date(overview.updatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })} IST` : "Live terminal"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setLocation("/chart")}
            className="flex items-center gap-2 bg-gradient-to-r from-violet-500/10 to-blue-500/10 border border-violet-400/20 text-violet-600 rounded-xl px-4 py-2 text-[11px] font-bold hover:from-violet-500/20 hover:to-blue-500/20 transition-all shadow-sm"
          >
            <CandlestickChart className="w-3.5 h-3.5" />
            Open Chart
          </button>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-emerald-500 live-pulse" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Live</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {summary && (
          <>
            <div className="glass-card p-4 glass-card-hover transition-all">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">VIX</div>
              <div className={`text-xl font-mono font-bold ${summary.vix > 20 ? "text-red-600" : summary.vix > 15 ? "text-amber-600" : "text-emerald-600"}`}>
                {summary.vix.toFixed(2)}
              </div>
              <div className="text-[10px] text-muted-foreground mt-1">Fear/Greed: {summary.fearGreedIndex}</div>
            </div>
            <div className="glass-card p-4 glass-card-hover transition-all">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">DXY</div>
              <div className="text-xl font-mono font-bold text-foreground/80">{summary.dollarIndex.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">US Dollar Index</div>
            </div>
            <div className="glass-card p-4 glass-card-hover transition-all relative overflow-hidden">
              <div className="absolute top-0 right-0 w-20 h-20 bg-amber-400 rounded-full filter blur-[50px] opacity-[0.1]" />
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">Gold</div>
              <div className="text-xl font-mono font-bold text-amber-600">${summary.goldPrice.toFixed(0)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Safe haven</div>
            </div>
            <div className="glass-card p-4 glass-card-hover transition-all">
              <div className="text-[10px] text-muted-foreground uppercase tracking-widest mb-1.5">Oil (WTI)</div>
              <div className="text-xl font-mono font-bold text-orange-600">${summary.oilPrice.toFixed(2)}</div>
              <div className="text-[10px] text-muted-foreground mt-1">Per barrel</div>
            </div>
          </>
        )}
      </div>

      {!isPremium && (
        <div className="glass-card p-5 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-40 h-40 bg-amber-400 rounded-full filter blur-[80px] opacity-[0.1]" />
          <div className="absolute bottom-0 right-0 w-32 h-32 bg-orange-400 rounded-full filter blur-[60px] opacity-[0.08]" />
          <div className="flex items-center justify-between flex-wrap gap-3 relative z-10">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Crown className="w-5 h-5 text-white" />
              </div>
              <div>
                <div className="text-sm font-bold text-amber-600">GlobalPulse Pro Signals</div>
                <div className="text-[11px] text-muted-foreground">Smart buy/sell signals with risk-reward zones on candlestick charts</div>
              </div>
            </div>
            <button
              onClick={() => setShowActivation(true)}
              className="bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 text-white text-[11px] font-bold px-5 py-2.5 rounded-xl transition-all shadow-lg shadow-amber-500/20"
            >
              Activate Premium
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <UsdSignalBox />
        <GlobalMarketMap />
      </div>

      <IpoBox />

      <div className="glass-card p-4">
        <div className="flex items-center gap-2 mb-2">
          <Shield className="w-3.5 h-3.5 text-violet-600" />
          <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Key Conclusion</span>
        </div>
        <p className="text-sm text-foreground/70 leading-relaxed">{overview?.keyConclusion}</p>
        <div className="mt-3 flex gap-4 text-[11px]">
          <span className="text-muted-foreground">Top Risk: <span className="text-red-600 font-medium">{overview?.topRiskRegion}</span></span>
          <span className="text-muted-foreground">Opportunity: <span className="text-emerald-600 font-medium">{overview?.topOpportunityRegion}</span></span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Top Gainers</span>
          </div>
          <div className="space-y-1">
            {movers?.gainers.slice(0, 5).map(a => (
              <div key={a.id} data-testid={`gainer-${a.symbol}`} className="flex items-center justify-between hover:bg-muted/60 px-3 py-2 rounded-xl transition-colors">
                <div>
                  <span className="text-xs font-mono font-semibold text-foreground">{a.symbol}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{a.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-foreground/70">{a.price.toLocaleString()}</div>
                  <div className="text-[11px] flex items-center gap-0.5 text-emerald-600 justify-end">
                    <ArrowUpRight className="w-2.5 h-2.5" />
                    +{a.changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <TrendingDown className="w-3.5 h-3.5 text-red-600" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Top Losers</span>
          </div>
          <div className="space-y-1">
            {movers?.losers.slice(0, 5).map(a => (
              <div key={a.id} data-testid={`loser-${a.symbol}`} className="flex items-center justify-between hover:bg-muted/60 px-3 py-2 rounded-xl transition-colors">
                <div>
                  <span className="text-xs font-mono font-semibold text-foreground">{a.symbol}</span>
                  <span className="text-[10px] text-muted-foreground ml-2">{a.name}</span>
                </div>
                <div className="text-right">
                  <div className="text-xs font-mono text-foreground/70">{a.price.toLocaleString()}</div>
                  <div className="text-[11px] flex items-center gap-0.5 text-red-600 justify-end">
                    <ArrowDownRight className="w-2.5 h-2.5" />
                    {a.changePercent.toFixed(2)}%
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {breaking && breaking.length > 0 && (
        <div className="glass-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Newspaper className="w-3.5 h-3.5 text-red-600" />
            <span className="text-[10px] text-muted-foreground uppercase tracking-widest">Breaking News</span>
          </div>
          <div className="space-y-3">
            {breaking.slice(0, 3).map(n => (
              <div key={n.id} data-testid={`breaking-news-${n.id}`} className="border-l-2 border-red-500/30 pl-3">
                <div className="text-xs font-medium text-foreground/70 leading-snug">{n.headline}</div>
                <div className="text-[10px] text-muted-foreground mt-0.5">{n.source} · {new Date(n.publishedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: true })} IST</div>
                <div className="text-[10px] text-violet-600 mt-1">{n.marketConclusion}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
