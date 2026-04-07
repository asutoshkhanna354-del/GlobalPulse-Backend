import { useState, useEffect } from "react";
import { useGetStocks, useGetStockMovers } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  ArrowDownRight,
  X,
  BarChart2,
  Search,
  Filter,
  TrendingUp,
  TrendingDown,
  Info,
  Rocket,
  Star,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from "lucide-react";
import { AssetChartPanel } from "@/components/AssetChartPanel";

type Market = "all" | "india" | "us";
type StocksTab = "screener" | "ipo";

const SECTORS_IN = ["All", "Banking", "Information Technology", "FMCG", "NBFC", "Infrastructure / Energy", "Automobile", "Metals & Mining", "Pharmaceuticals", "Utilities", "Energy", "Mining", "Paints & Coatings", "Cement"];
const SECTORS_US = ["All", "Technology", "Semiconductors", "Banking", "Investment Banking", "Healthcare", "Energy", "Fintech / Payments", "Retail", "Consumer Goods", "Enterprise Software", "Entertainment", "Automobile / EV", "Conglomerate", "E-Commerce / Cloud"];

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
  subscriptionQib: number | null;
  subscriptionHni: number | null;
  subscriptionRetail: number | null;
  subscriptionTotal: number | null;
  industry: string | null;
  revenue: string | null;
  profit: string | null;
  companyDescription: string | null;
  prosText: string | null;
  consText: string | null;
  recommendationListing: string | null;
  recommendationLongTerm: string | null;
  totalScore: number | null;
  listingPrice: number | null;
  listingGainPercent: number | null;
  currentPrice: number | null;
  sourceUrl: string | null;
  lastUpdated: string;
}

function fmt(n: number | null | undefined, dec = 2): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

function fmtBig(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e12) return `${(n / 1e12).toFixed(2)}T`;
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  return n.toFixed(0);
}

function fmtVol(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
}

function MoversBar({ market }: { market: "india" | "us" }) {
  const { data } = useGetStockMovers({ market }, { query: { refetchInterval: 30000 } });

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-card border border-border rounded p-2">
        <div className="flex items-center gap-1 text-[10px] text-signal-up mb-2 font-semibold">
          <TrendingUp className="w-3 h-3" /> TOP GAINERS
        </div>
        {(data?.gainers ?? []).map(s => (
          <div key={s.symbol} className="flex justify-between items-center py-0.5">
            <span className="text-[11px] font-mono text-foreground">{s.symbol}</span>
            <span className="text-[11px] text-signal-up font-mono">+{s.changePercent.toFixed(2)}%</span>
          </div>
        ))}
      </div>
      <div className="bg-card border border-border rounded p-2">
        <div className="flex items-center gap-1 text-[10px] text-signal-down mb-2 font-semibold">
          <TrendingDown className="w-3 h-3" /> TOP LOSERS
        </div>
        {(data?.losers ?? []).map(s => (
          <div key={s.symbol} className="flex justify-between items-center py-0.5">
            <span className="text-[11px] font-mono text-foreground">{s.symbol}</span>
            <span className="text-[11px] text-signal-down font-mono">{s.changePercent.toFixed(2)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ScoreBar({ score, max = 50 }: { score: number; max?: number }) {
  const pct = (score / max) * 100;
  const color = score >= 40 ? "bg-green-500" : score >= 30 ? "bg-yellow-500" : score >= 20 ? "bg-orange-500" : "bg-red-500";
  const label = score >= 40 ? "Excellent" : score >= 30 ? "Good" : score >= 20 ? "Risky" : "Avoid";

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className="text-muted-foreground">IPO Score</span>
        <span className={`font-bold ${score >= 40 ? "text-green-600" : score >= 30 ? "text-yellow-600" : score >= 20 ? "text-orange-600" : "text-red-600"}`}>
          {score}/{max} · {label}
        </span>
      </div>
      <div className="h-2 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function IpoDetailPanel({ ipo, onClose }: { ipo: IpoListing; onClose: () => void }) {
  const getRecBadge = (rec: string | null) => {
    if (!rec) return null;
    const colors: Record<string, string> = {
      "STRONG APPLY": "bg-emerald-50 text-emerald-700 border-emerald-200",
      "APPLY": "bg-green-50 text-green-700 border-green-200",
      "INVEST": "bg-green-50 text-green-700 border-green-200",
      "WAIT": "bg-yellow-50 text-yellow-700 border-yellow-200",
      "NEUTRAL": "bg-yellow-50 text-yellow-700 border-yellow-200",
      "RISKY": "bg-orange-50 text-orange-700 border-orange-200",
      "AVOID": "bg-red-50 text-red-700 border-red-200",
    };
    return (
      <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${colors[rec] ?? "bg-muted text-muted-foreground border-border"}`}>
        {rec}
      </span>
    );
  };

  return (
    <div className="hidden lg:flex flex-col border-l border-border w-[45%] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
        <div className="flex items-center gap-2">
          <Rocket className="w-4 h-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">{ipo.companyName}</span>
        </div>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-[9px] px-2 py-0.5 rounded border font-bold ${ipo.status === "open" ? "bg-green-50 text-green-700 border-green-200" : ipo.status === "upcoming" ? "bg-blue-50 text-blue-700 border-blue-200" : "bg-muted text-muted-foreground border-border"}`}>
            {ipo.status.toUpperCase()}
          </span>
          <span className="text-[9px] px-2 py-0.5 rounded border bg-muted text-muted-foreground border-border">
            {ipo.ipoType.toUpperCase()}
          </span>
          {ipo.exchange && (
            <span className="text-[9px] px-2 py-0.5 rounded border bg-muted text-muted-foreground border-border">
              {ipo.exchange}
            </span>
          )}
        </div>

        {ipo.totalScore !== null && <ScoreBar score={ipo.totalScore} />}

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="bg-muted rounded p-2">
            <div className="text-[9px] text-muted-foreground">Price Range</div>
            <div className="font-mono font-semibold text-foreground">{ipo.priceRange ? (() => {
              const cur = ipo.market === "us" ? "$" : "₹";
              if (ipo.priceRange === "TBD") return "TBD";
              const parts = ipo.priceRange.split("-");
              const low = Number(parts[0]);
              const high = Number(parts[1]);
              if (low >= 100000) return `${cur}${(low/100000).toFixed(1)}L-${(high/100000).toFixed(1)}L`;
              return `${cur}${ipo.priceRange}`;
            })() : "—"}</div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="text-[9px] text-muted-foreground">Issue Size</div>
            <div className="font-mono font-semibold text-foreground">{ipo.issueSize ?? "—"}</div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="text-[9px] text-muted-foreground">Lot Size</div>
            <div className="font-mono font-semibold text-foreground">{ipo.lotSize ?? "—"}</div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="text-[9px] text-muted-foreground">GMP</div>
            <div className={`font-mono font-semibold ${ipo.gmp !== null ? (ipo.gmp > 0 ? "text-green-600" : ipo.gmp < 0 ? "text-red-600" : "text-foreground") : "text-foreground"}`}>
              {ipo.gmp !== null ? `${ipo.market === "us" ? "$" : "₹"}${ipo.gmp}` : "—"}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 text-[11px]">
          <div className="bg-muted rounded p-2">
            <div className="text-[9px] text-muted-foreground">Open</div>
            <div className="font-mono text-foreground">{ipo.openDate ?? "—"}</div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="text-[9px] text-muted-foreground">Close</div>
            <div className="font-mono text-foreground">{ipo.closeDate ?? "—"}</div>
          </div>
          <div className="bg-muted rounded p-2">
            <div className="text-[9px] text-muted-foreground">Listing</div>
            <div className="font-mono text-foreground">{ipo.listingDate ?? "TBD"}</div>
          </div>
        </div>

        {(ipo.subscriptionQib !== null || ipo.subscriptionHni !== null || ipo.subscriptionRetail !== null) && (
          <div className="space-y-1">
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Subscription Data</div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "QIB", value: ipo.subscriptionQib },
                { label: "HNI", value: ipo.subscriptionHni },
                { label: "Retail", value: ipo.subscriptionRetail },
                { label: "Total", value: ipo.subscriptionTotal },
              ].map(({ label, value }) => (
                <div key={label} className="bg-muted rounded p-2 text-center">
                  <div className="text-[9px] text-muted-foreground">{label}</div>
                  <div className={`text-xs font-mono font-bold ${value !== null && value !== undefined && value > 1 ? "text-green-600" : "text-foreground"}`}>
                    {value !== null && value !== undefined ? `${value.toFixed(1)}x` : "—"}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {ipo.industry && (
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Industry</div>
            <span className="text-[10px] text-cyan-600 bg-cyan-50 border border-cyan-200 rounded px-2 py-0.5">{ipo.industry}</span>
          </div>
        )}

        {ipo.companyDescription && (
          <div>
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">About</div>
            <p className="text-[11px] text-foreground/70 leading-relaxed">{ipo.companyDescription}</p>
          </div>
        )}

        {(ipo.revenue || ipo.profit) && (
          <div className="grid grid-cols-2 gap-2">
            {ipo.revenue && (
              <div className="bg-muted rounded p-2">
                <div className="text-[9px] text-muted-foreground">Revenue</div>
                <div className="text-xs font-mono text-foreground">{ipo.revenue}</div>
              </div>
            )}
            {ipo.profit && (
              <div className="bg-muted rounded p-2">
                <div className="text-[9px] text-muted-foreground">Profit</div>
                <div className={`text-xs font-mono ${ipo.profit.includes("-") ? "text-red-600" : "text-green-600"}`}>{ipo.profit}</div>
              </div>
            )}
          </div>
        )}

        <div className="space-y-2">
          <div className="text-[9px] text-muted-foreground uppercase tracking-widest">Verdict</div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Listing:</span>
              {getRecBadge(ipo.recommendationListing)}
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">Long-Term:</span>
              {getRecBadge(ipo.recommendationLongTerm)}
            </div>
          </div>
        </div>

        {ipo.prosText && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <CheckCircle className="w-3 h-3 text-green-600" />
              <span className="text-[9px] text-green-600 uppercase tracking-widest font-bold">Key Positives</span>
            </div>
            <div className="space-y-1">
              {ipo.prosText.split(" | ").map((p, i) => (
                <div key={i} className="text-[10px] text-foreground/70 flex items-start gap-1.5">
                  <span className="text-green-600 shrink-0">+</span>
                  <span>{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {ipo.consText && (
          <div>
            <div className="flex items-center gap-1.5 mb-1">
              <XCircle className="w-3 h-3 text-red-600" />
              <span className="text-[9px] text-red-600 uppercase tracking-widest font-bold">Key Risks</span>
            </div>
            <div className="space-y-1">
              {ipo.consText.split(" | ").map((c, i) => (
                <div key={i} className="text-[10px] text-foreground/70 flex items-start gap-1.5">
                  <span className="text-red-600 shrink-0">−</span>
                  <span>{c}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {ipo.listingPrice !== null && (
          <div className="bg-muted rounded p-3">
            <div className="text-[9px] text-muted-foreground uppercase tracking-widest mb-1">Listing Performance</div>
            <div className="flex items-center gap-4">
              <div>
                <div className="text-[9px] text-muted-foreground">Listing Price</div>
                <div className="text-sm font-mono font-bold text-foreground">₹{ipo.listingPrice.toFixed(2)}</div>
              </div>
              {ipo.listingGainPercent !== null && (
                <div>
                  <div className="text-[9px] text-muted-foreground">Listing Gain</div>
                  <div className={`text-sm font-mono font-bold ${ipo.listingGainPercent > 0 ? "text-green-600" : "text-red-600"}`}>
                    {ipo.listingGainPercent > 0 ? "+" : ""}{ipo.listingGainPercent.toFixed(2)}%
                  </div>
                </div>
              )}
              {ipo.currentPrice !== null && (
                <div>
                  <div className="text-[9px] text-muted-foreground">Current</div>
                  <div className="text-sm font-mono font-bold text-foreground">₹{ipo.currentPrice.toFixed(2)}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {ipo.sourceUrl && (
          <a
            href={ipo.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-[10px] text-primary hover:text-primary/80 transition-colors"
          >
            <ExternalLink className="w-3 h-3" /> View Source
          </a>
        )}
      </div>
    </div>
  );
}

function IpoTab() {
  const ipoIdParam = new URLSearchParams(window.location.search).get("ipoId");

  const { data: ipos = [], isLoading } = useQuery<IpoListing[]>({
    queryKey: ["ipo-listings-full"],
    queryFn: async () => {
      const res = await fetch("/api/ipo");
      if (!res.ok) throw new Error("Failed to fetch IPO data");
      return res.json();
    },
    refetchInterval: 15 * 1000,
  });

  const [selectedIpo, setSelectedIpo] = useState<IpoListing | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [marketFilter, setMarketFilter] = useState<string>("all");

  useEffect(() => {
    if (ipoIdParam && ipos.length > 0) {
      const found = ipos.find(i => i.id === parseInt(ipoIdParam));
      if (found) setSelectedIpo(found);
    }
  }, [ipoIdParam, ipos]);

  const byMarket = marketFilter === "all" ? ipos : ipos.filter(i => i.market === marketFilter);
  const filtered = statusFilter === "all" ? byMarket : byMarket.filter(i => i.status === statusFilter);

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      "open": "bg-green-50 text-green-600 border-green-200",
      "upcoming": "bg-blue-50 text-blue-600 border-blue-200",
      "listed": "bg-purple-50 text-purple-600 border-purple-200",
      "closed": "bg-muted text-muted-foreground border-border",
    };
    return colors[status] ?? "bg-muted text-muted-foreground border-border";
  };

  const getScoreColor = (score: number | null) => {
    if (!score) return "text-muted-foreground";
    if (score >= 40) return "text-green-600";
    if (score >= 30) return "text-yellow-600";
    if (score >= 20) return "text-orange-600";
    return "text-red-600";
  };

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className={`flex flex-col overflow-hidden transition-all duration-300 ${selectedIpo ? "w-full lg:w-[55%]" : "w-full"}`}>
        <div className="p-3 sm:p-4 space-y-3 flex-1 overflow-auto">
          <div className="flex items-start justify-between flex-wrap gap-2">
            <div>
              <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
                <Rocket className="w-4 h-4 text-primary" />
                Newcomers (IPO) · {marketFilter === "india" ? "Indian Markets" : marketFilter === "us" ? "US Markets" : "Global Markets"}
              </h1>
              <p className="text-[11px] text-muted-foreground">Live IPO analysis with GMP, subscription data, and pro scoring · Real-time curated data</p>
            </div>
            <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground bg-card border border-border rounded px-2 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500 live-pulse" />
              LIVE DATA
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {(["all", "india", "us"] as const).map(m => (
              <button
                key={m}
                onClick={() => { setMarketFilter(m); setStatusFilter("all"); }}
                className={`px-3 py-1.5 text-[11px] rounded border transition-colors flex items-center gap-1.5 ${
                  marketFilter === m ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {m === "india" ? "🇮🇳" : m === "us" ? "🇺🇸" : "🌐"}
                {m === "india" ? "Indian IPOs" : m === "us" ? "US IPOs" : "All Markets"}
              </button>
            ))}
          </div>

          <div className="flex gap-1.5 flex-wrap">
            {["all", "open", "upcoming", "closed", "listed"].map(s => (
              <button
                key={s}
                onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 text-[11px] rounded border transition-colors ${
                  statusFilter === s ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
                }`}
              >
                {s === "all" ? "All IPOs" : s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading IPO data...</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No IPOs found for this filter.</div>
          ) : (
            <div className="bg-card border border-border rounded overflow-x-auto">
              <table className="w-full text-[11px] min-w-[800px]">
                <thead>
                  <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-3 py-2">#</th>
                    <th className="text-left px-3 py-2">Company</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-right px-3 py-2">Price Range</th>
                    <th className="text-right px-3 py-2">Issue Size</th>
                    <th className="text-right px-3 py-2">GMP</th>
                    <th className="text-right px-3 py-2">Sub. Total</th>
                    <th className="text-right px-3 py-2">Score</th>
                    <th className="text-center px-3 py-2">Listing</th>
                    <th className="text-center px-3 py-2">Long-Term</th>
                    <th className="text-left px-3 py-2">Dates</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((ipo, i) => {
                    const isSelected = selectedIpo?.id === ipo.id;
                    return (
                      <tr
                        key={ipo.id}
                        className={`border-b border-border/50 cursor-pointer transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-card/80"}`}
                        onClick={() => setSelectedIpo(isSelected ? null : ipo)}
                      >
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">{ipo.market === "us" ? "🇺🇸" : "🇮🇳"}</span>
                            <span className="font-semibold text-foreground">{ipo.companyName}</span>
                          </div>
                          {ipo.industry && <div className="text-[9px] text-cyan-600 mt-0.5">{ipo.industry}</div>}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold ${getStatusBadge(ipo.status)}`}>
                            {ipo.status.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-foreground">{ipo.priceRange ? (() => {
                          const cur = ipo.market === "us" ? "$" : "₹";
                          if (ipo.priceRange === "TBD") return "TBD";
                          const parts = ipo.priceRange.split("-");
                          const low = Number(parts[0]);
                          const high = Number(parts[1]);
                          if (low >= 100000) return `${cur}${(low/100000).toFixed(1)}L-${(high/100000).toFixed(1)}L`;
                          return `${cur}${ipo.priceRange}`;
                        })() : "—"}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{ipo.issueSize ?? "—"}</td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${ipo.gmp !== null ? (ipo.gmp > 0 ? "text-green-600" : ipo.gmp < 0 ? "text-red-600" : "text-muted-foreground") : "text-muted-foreground"}`}>
                          {ipo.gmp !== null ? `${ipo.market === "us" ? "$" : "₹"}${ipo.gmp}` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono ${ipo.subscriptionTotal && ipo.subscriptionTotal > 1 ? "text-green-600 font-bold" : "text-muted-foreground"}`}>
                          {ipo.subscriptionTotal ? `${ipo.subscriptionTotal.toFixed(1)}x` : "—"}
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${getScoreColor(ipo.totalScore)}`}>
                          {ipo.totalScore !== null ? `${ipo.totalScore}/50` : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {ipo.recommendationListing ? (
                            <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold ${
                              ipo.recommendationListing === "STRONG APPLY" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                              ipo.recommendationListing === "APPLY" ? "bg-green-50 text-green-600 border-green-200" :
                              ipo.recommendationListing === "WAIT" ? "bg-yellow-50 text-yellow-600 border-yellow-200" :
                              ipo.recommendationListing === "RISKY" ? "bg-orange-50 text-orange-600 border-orange-200" :
                              "bg-red-50 text-red-600 border-red-200"
                            }`}>
                              {ipo.recommendationListing}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-center">
                          {ipo.recommendationLongTerm ? (
                            <span className={`text-[8px] px-1.5 py-0.5 rounded border font-bold ${
                              ipo.recommendationLongTerm === "INVEST" ? "bg-green-50 text-green-600 border-green-200" :
                              ipo.recommendationLongTerm === "WAIT" ? "bg-yellow-50 text-yellow-600 border-yellow-200" :
                              "bg-red-50 text-red-600 border-red-200"
                            }`}>
                              {ipo.recommendationLongTerm}
                            </span>
                          ) : "—"}
                        </td>
                        <td className="px-3 py-2 text-[10px] text-muted-foreground">
                          {ipo.openDate && <div>Open: {ipo.openDate}</div>}
                          {ipo.closeDate && <div>Close: {ipo.closeDate}</div>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
            <Info className="w-2.5 h-2.5" />
            IPO data curated from public market sources. GMP values are indicative. Always verify before investing. Not investment advice.
          </div>
        </div>
      </div>

      {selectedIpo && <IpoDetailPanel ipo={selectedIpo} onClose={() => setSelectedIpo(null)} />}
    </div>
  );
}

export function Stocks() {
  const [activeTab, setActiveTab] = useState<StocksTab>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("tab") === "ipo" ? "ipo" : "screener";
  });
  const [market, setMarket] = useState<Market>("india");
  const [sector, setSector] = useState<string>("All");
  const [search, setSearch] = useState("");
  const [selectedStock, setSelectedStock] = useState<any | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tab") === "ipo") setActiveTab("ipo");
  }, []);

  const { data: stocks, isLoading, isError } = useGetStocks(
    {
      market: market === "all" ? "all" : market,
      ...(sector !== "All" ? { sector } : {}),
    },
    { query: { refetchInterval: 30000, enabled: activeTab === "screener" } }
  );

  const sectors = market === "us" ? SECTORS_US : market === "india" ? SECTORS_IN : ["All"];

  const filtered = (stocks ?? []).filter(s =>
    s.symbol.toLowerCase().includes(search.toLowerCase()) ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.sector.toLowerCase().includes(search.toLowerCase())
  );

  const sorted = [...filtered].sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent));

  if (activeTab === "ipo") {
    return (
      <div className="flex flex-col flex-1 overflow-hidden">
        <div className="px-4 pt-3 pb-0 flex gap-1.5">
          <button
            onClick={() => setActiveTab("screener")}
            className="px-4 py-1.5 text-[11px] rounded-t border border-b-0 transition-colors bg-card text-muted-foreground border-border hover:text-foreground"
          >
            <BarChart2 className="w-3 h-3 inline mr-1.5" />
            Stock Screener
          </button>
          <button
            onClick={() => setActiveTab("ipo")}
            className="px-4 py-1.5 text-[11px] rounded-t border border-b-0 transition-colors bg-primary text-primary-foreground border-primary"
          >
            <Rocket className="w-3 h-3 inline mr-1.5" />
            Newcomers (IPO)
          </button>
        </div>
        <IpoTab />
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden min-w-0">
      <div className="px-3 sm:px-4 pt-3 pb-0 flex gap-1.5">
        <button
          onClick={() => setActiveTab("screener")}
          className="px-4 py-1.5 text-[11px] rounded-t border border-b-0 transition-colors bg-primary text-primary-foreground border-primary"
        >
          <BarChart2 className="w-3 h-3 inline mr-1.5" />
          Stock Screener
        </button>
        <button
          onClick={() => setActiveTab("ipo")}
          className="px-4 py-1.5 text-[11px] rounded-t border border-b-0 transition-colors bg-card text-muted-foreground border-border hover:text-foreground"
        >
          <Rocket className="w-3 h-3 inline mr-1.5" />
          Newcomers (IPO)
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex flex-col overflow-hidden transition-all duration-300 ${selectedStock ? "w-full lg:w-[55%]" : "w-full"}`}>
          <div className="p-3 sm:p-4 space-y-3 flex-1 overflow-auto">
            <div className="flex items-start justify-between flex-wrap gap-2">
              <div>
                <h1 className="text-base font-semibold text-foreground">Stock Screener</h1>
                <p className="text-[11px] text-muted-foreground">Live Indian (NSE) and US stock data · Source: Yahoo Finance · Refreshes every 30s</p>
              </div>
              <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground bg-card border border-border rounded px-2 py-1">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 live-pulse" />
                LIVE DATA
              </div>
            </div>

            <div className="flex gap-1.5 flex-wrap">
              {(["india", "us", "all"] as const).map(m => (
                <button
                  key={m}
                  data-testid={`market-tab-${m}`}
                  onClick={() => { setMarket(m); setSector("All"); }}
                  className={`px-3 py-1.5 text-[11px] rounded border transition-colors flex items-center gap-1.5 ${
                    market === m ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
                  }`}
                >
                  {m === "india" ? "🇮🇳" : m === "us" ? "🇺🇸" : "🌐"}
                  {m === "india" ? "Indian Markets (NSE)" : m === "us" ? "US Markets" : "All Markets"}
                </button>
              ))}
            </div>

            {market !== "all" && (
              <div className="flex gap-1 flex-wrap">
                {sectors.map(s => (
                  <button
                    key={s}
                    onClick={() => setSector(s)}
                    className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                      sector === s ? "bg-secondary text-foreground border-border" : "text-muted-foreground border-transparent hover:border-border"
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            )}

            {market !== "all" && (
              <MoversBar market={market === "india" ? "india" : "us"} />
            )}

            <div className="flex items-center gap-2 bg-card border border-border rounded px-2 w-full">
              <Search className="w-3 h-3 text-muted-foreground shrink-0" />
              <input
                className="bg-transparent text-[11px] text-foreground outline-none placeholder:text-muted-foreground w-full py-1.5"
                placeholder="Search by symbol, name, or sector..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {isError && (
              <div className="bg-signal-down/10 border border-signal-down/30 rounded p-3 text-[11px] text-signal-down">
                Failed to fetch live stock data. Yahoo Finance API may be temporarily unavailable.
              </div>
            )}

            <div className="bg-card border border-border rounded overflow-x-auto">
              <table className="w-full text-[11px] min-w-[900px]">
                <thead>
                  <tr className="border-b border-border text-[10px] text-muted-foreground uppercase tracking-wide">
                    <th className="text-left px-3 py-2 w-8">#</th>
                    <th className="text-left px-3 py-2">Symbol</th>
                    <th className="text-left px-3 py-2">Name</th>
                    <th className="text-left px-3 py-2">Sector</th>
                    <th className="text-right px-3 py-2">Price</th>
                    <th className="text-right px-3 py-2">Chg%</th>
                    <th className="text-right px-3 py-2">Open</th>
                    <th className="text-right px-3 py-2">High</th>
                    <th className="text-right px-3 py-2">Low</th>
                    <th className="text-right px-3 py-2">52W H</th>
                    <th className="text-right px-3 py-2">52W L</th>
                    <th className="text-right px-3 py-2">Mkt Cap</th>
                    <th className="text-right px-3 py-2">P/E</th>
                    <th className="text-right px-3 py-2">Volume</th>
                    <th className="text-left px-3 py-2">Exch</th>
                  </tr>
                </thead>
                <tbody>
                  {isLoading && (
                    <tr>
                      <td colSpan={15} className="text-center py-8 text-muted-foreground">
                        Fetching live stock data from Yahoo Finance...
                      </td>
                    </tr>
                  )}
                  {!isLoading && sorted.map((stock, i) => {
                    const up = stock.changePercent >= 0;
                    const isSelected = selectedStock?.symbol === stock.symbol;
                    return (
                      <tr
                        key={stock.symbol}
                        className={`border-b border-border/50 cursor-pointer transition-colors ${isSelected ? "bg-primary/10" : "hover:bg-card/80"}`}
                        onClick={() => {
                          setSelectedStock(isSelected ? null : stock);
                        }}
                      >
                        <td className="px-3 py-2 text-muted-foreground">{i + 1}</td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1">
                            <span>{stock.flag}</span>
                            <span className="font-mono font-bold text-foreground">{stock.symbol}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground max-w-[140px] truncate">{stock.name}</td>
                        <td className="px-3 py-2">
                          <span className="text-[9px] text-cyan-600 bg-cyan-50 border border-cyan-200 rounded px-1.5 py-0.5 whitespace-nowrap">{stock.sector}</span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                          {fmt(stock.price, stock.price > 100 ? 2 : 4)}
                          <span className="text-[9px] text-muted-foreground ml-0.5">{stock.currency}</span>
                        </td>
                        <td className={`px-3 py-2 text-right font-mono font-bold ${up ? "text-signal-up" : "text-signal-down"}`}>
                          <div className="flex items-center justify-end gap-0.5">
                            {up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                            {up ? "+" : ""}{stock.changePercent.toFixed(2)}%
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(stock.open, 2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-signal-up">{fmt(stock.high, 2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-signal-down">{fmt(stock.low, 2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(stock.weekHigh52, 2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(stock.weekLow52, 2)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmtBig(stock.marketCap)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmt(stock.peRatio, 1)}</td>
                        <td className="px-3 py-2 text-right font-mono text-muted-foreground">{fmtVol(stock.volume)}</td>
                        <td className="px-3 py-2">
                          <span className="text-[9px] text-muted-foreground">{stock.exchange}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {!isLoading && !isError && sorted.length === 0 && (
              <div className="text-center py-8 text-muted-foreground text-sm">No stocks found matching your filters.</div>
            )}

            <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
              <Info className="w-2.5 h-2.5" />
              Data sourced from Yahoo Finance via real-time API. Prices may have a 15-minute delay depending on exchange.
            </div>
          </div>
        </div>

        {selectedStock && (
          <div className="hidden lg:flex flex-col border-l border-border w-[45%] overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border bg-card">
              <div className="flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                <span className="text-sm font-semibold text-foreground">{selectedStock.symbol}</span>
                <span className="text-[11px] text-muted-foreground truncate max-w-[160px]">{selectedStock.name}</span>
              </div>
              <button onClick={() => setSelectedStock(null)} className="text-muted-foreground hover:text-foreground transition-colors ml-2">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-4 py-2 border-b border-border grid grid-cols-3 gap-2 bg-card/50">
              {[
                { label: "P/E Ratio", value: fmt(selectedStock.peRatio, 1) },
                { label: "Div. Yield", value: selectedStock.dividendYield != null ? `${fmt(selectedStock.dividendYield, 2)}%` : "—" },
                { label: "EPS (TTM)", value: fmt(selectedStock.eps, 2) },
                { label: "52W High", value: fmt(selectedStock.weekHigh52, 2) },
                { label: "52W Low", value: fmt(selectedStock.weekLow52, 2) },
                { label: "Market Cap", value: fmtBig(selectedStock.marketCap) },
              ].map(({ label, value }) => (
                <div key={label} className="text-center">
                  <div className="text-[9px] text-muted-foreground">{label}</div>
                  <div className="text-[11px] font-mono font-semibold text-foreground">{value}</div>
                </div>
              ))}
            </div>

            <AssetChartPanel
              symbol={selectedStock.symbol}
              name={selectedStock.name}
              isStock={true}
              yahooSymbol={selectedStock.yahooSymbol}
            />
          </div>
        )}
      </div>
    </div>
  );
}
