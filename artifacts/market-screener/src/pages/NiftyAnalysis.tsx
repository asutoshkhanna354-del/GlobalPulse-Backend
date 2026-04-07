import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { usePremium } from "@/contexts/PremiumContext";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Shield,
  Target,
  Clock,
  AlertTriangle,
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Crown,
  RefreshCw,
  Zap,
  Lock,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API = `${BASE}api`;

function toIST(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function toISTTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "—";
  return new Date(dateStr).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour12: true,
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ISTClock() {
  const [time, setTime] = useState("");
  useEffect(() => {
    const update = () => {
      setTime(new Date().toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata",
        hour12: true,
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        day: "2-digit",
        month: "short",
      }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="font-mono text-sm text-muted-foreground">{time} IST</span>;
}

function DirectionBadge({ direction, confidence }: { direction: string; confidence: number }) {
  const config: Record<string, { icon: typeof TrendingUp; color: string; bg: string }> = {
    BULLISH: { icon: TrendingUp, color: "text-green-700", bg: "bg-green-50 border-green-200" },
    BEARISH: { icon: TrendingDown, color: "text-red-700", bg: "bg-red-50 border-red-200" },
    NEUTRAL: { icon: Minus, color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" },
  };
  const c = config[direction] ?? config.NEUTRAL;
  const Icon = c.icon;
  return (
    <div className={`flex items-center gap-2 px-4 py-2 rounded-lg border ${c.bg}`}>
      <Icon className={`w-6 h-6 ${c.color}`} />
      <div>
        <div className={`text-lg font-bold ${c.color}`}>{direction}</div>
        <div className="text-xs text-muted-foreground">Confidence: {confidence}%</div>
      </div>
      <div className="ml-auto">
        <div className="w-16 h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full ${direction === "BULLISH" ? "bg-green-500" : direction === "BEARISH" ? "bg-red-500" : "bg-yellow-500"}`}
            style={{ width: `${confidence}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function ZoneList({ title, zones, color, icon: Icon }: { title: string; zones: string[]; color: string; icon: typeof Target }) {
  if (!zones.length) return null;
  return (
    <div>
      <div className={`flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-widest ${color}`}>
        <Icon className="w-3.5 h-3.5" />
        {title}
      </div>
      <div className="space-y-1">
        {zones.map((z, i) => (
          <div key={i} className={`text-sm px-3 py-1.5 rounded border ${
            color.includes("green") ? "bg-green-50 border-green-200 text-green-700" :
            color.includes("red") ? "bg-red-50 border-red-200 text-red-700" :
            color.includes("blue") ? "bg-blue-50 border-blue-200 text-blue-700" :
            "bg-orange-50 border-orange-200 text-orange-700"
          }`}>
            {z}
          </div>
        ))}
      </div>
    </div>
  );
}

function LevelsList({ title, levels, color }: { title: string; levels: string[]; color: string }) {
  if (!levels.length) return null;
  return (
    <div>
      <div className={`text-[11px] font-bold uppercase tracking-widest mb-2 ${color}`}>{title}</div>
      <div className="flex flex-wrap gap-2">
        {levels.map((l, i) => (
          <span key={i} className={`font-mono text-sm px-2.5 py-1 rounded border ${
            color.includes("green") ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
          }`}>
            {l}
          </span>
        ))}
      </div>
    </div>
  );
}

function ProGate({ children }: { children: React.ReactNode }) {
  const { isPremium, setShowActivation } = usePremium();
  if (isPremium) return <>{children}</>;
  return (
    <div className="relative">
      <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center rounded-xl">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-bold text-foreground mb-2">Pro Feature</h3>
          <p className="text-sm text-muted-foreground mb-4">
            Nifty 50 AI Analysis with Call/Put recommendations is available exclusively for Pro users.
          </p>
          <button
            onClick={() => setShowActivation(true)}
            className="px-6 py-2.5 bg-amber-500 text-white font-semibold rounded-lg hover:bg-amber-600 transition-colors flex items-center gap-2 mx-auto"
          >
            <Crown className="w-4 h-4" /> Unlock Pro
          </button>
        </div>
      </div>
      <div className="blur-[3px] pointer-events-none select-none">
        {children}
      </div>
    </div>
  );
}

export function NiftyAnalysis() {
  const { isPremium } = usePremium();

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["nifty-analysis"],
    queryFn: async () => {
      const res = await fetch(`${API}/nifty-analysis`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: isPremium ? 60000 : false,
  });

  const { data: history } = useQuery({
    queryKey: ["nifty-analysis-history"],
    queryFn: async () => {
      const res = await fetch(`${API}/nifty-analysis/history?type=candle_30m&limit=10`);
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    refetchInterval: isPremium ? 120000 : false,
    enabled: isPremium,
  });

  const comp = data?.comprehensive;
  const candle = data?.candle30m;

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">Nifty 50 AI Analysis</h1>
            <div className="flex items-center gap-1.5 bg-orange-50 border border-orange-200 rounded px-2 py-1">
              <Activity className="w-3 h-3 text-orange-600" />
              <span className="text-[10px] text-orange-600 font-bold uppercase tracking-wider">Pro Only</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            AI-powered comprehensive outlook + periodic 30-min demand-supply candle analysis for index options trading
          </p>
        </div>
        <div className="flex items-center gap-3">
          <ISTClock />
          {isPremium && (
            <button
              onClick={() => refetch()}
              disabled={isFetching}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-border rounded-lg hover:bg-muted transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
              Refresh
            </button>
          )}
        </div>
      </div>

      {isLoading && (
        <div className="text-center py-20 text-muted-foreground">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-3" />
          <p>Loading Nifty 50 analysis...</p>
        </div>
      )}

      {!isLoading && (
        <ProGate>
          <div className="space-y-6">
            {comp && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5 text-primary" />
                    <h2 className="text-base font-bold text-foreground">Comprehensive Outlook</h2>
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    Updated: {toIST(comp.createdAt)}
                  </div>
                </div>

                {comp.niftyPrice && (
                  <div className="flex items-center gap-4 flex-wrap">
                    <div className="text-2xl font-bold font-mono text-foreground">
                      ₹{comp.niftyPrice.toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </div>
                    <div className={`flex items-center gap-1 text-lg font-semibold ${(comp.niftyChange ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {(comp.niftyChange ?? 0) >= 0 ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownRight className="w-5 h-5" />}
                      {(comp.niftyChange ?? 0) > 0 ? "+" : ""}{(comp.niftyChange ?? 0).toFixed(2)}%
                    </div>
                  </div>
                )}

                <DirectionBadge direction={comp.direction} confidence={comp.confidence} />

                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">Summary</div>
                  <p className="text-sm text-foreground leading-relaxed">{comp.summary}</p>
                </div>

                {comp.outlook && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-widest text-blue-700">
                      <Target className="w-3.5 h-3.5" /> Detailed Outlook
                    </div>
                    <p className="text-sm text-blue-800 leading-relaxed whitespace-pre-line">{comp.outlook}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <LevelsList title="Support Levels" levels={comp.supportLevels ?? []} color="text-green-600" />
                  <LevelsList title="Resistance Levels" levels={comp.resistanceLevels ?? []} color="text-red-600" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ZoneList title="Demand Zones" zones={comp.demandZones ?? []} color="text-green-600" icon={ArrowUpRight} />
                  <ZoneList title="Supply Zones" zones={comp.supplyZones ?? []} color="text-red-600" icon={ArrowDownRight} />
                </div>

                {comp.callPutRecommendation && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-widest text-amber-700">
                      <Zap className="w-3.5 h-3.5" /> Call/Put Recommendation
                    </div>
                    <p className="text-sm text-amber-800 font-semibold">{comp.callPutRecommendation}</p>
                    <div className="flex gap-4 mt-2 text-xs text-amber-700">
                      {comp.targetPrice && <span>Target: ₹{comp.targetPrice.toLocaleString("en-IN")}</span>}
                      {comp.stopLoss && <span>Stop Loss: ₹{comp.stopLoss.toLocaleString("en-IN")}</span>}
                    </div>
                  </div>
                )}

                {comp.candlePattern && (
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg">
                      <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                      <span className="text-xs text-purple-700 font-medium">Pattern: {comp.candlePattern}</span>
                    </div>
                    {comp.trendStrength && (
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                        comp.trendStrength === "STRONG" ? "bg-green-50 border-green-200 text-green-700" :
                        comp.trendStrength === "WEAK" ? "bg-red-50 border-red-200 text-red-700" :
                        "bg-yellow-50 border-yellow-200 text-yellow-700"
                      }`}>
                        <Activity className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">Trend: {comp.trendStrength}</span>
                      </div>
                    )}
                  </div>
                )}

                {comp.keyFactors?.length > 0 && (
                  <div>
                    <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Key Factors</div>
                    <div className="space-y-1.5">
                      {comp.keyFactors.map((f: string, i: number) => (
                        <div key={i} className="flex items-start gap-2 text-sm text-foreground">
                          <span className="text-primary mt-0.5">•</span>
                          <span>{f}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {candle && (
              <div className="bg-card border border-border rounded-xl p-5 space-y-5">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />
                    <h2 className="text-base font-bold text-foreground">30-Min Candle Analysis</h2>
                    <span className="text-[10px] bg-orange-50 border border-orange-200 text-orange-600 rounded px-2 py-0.5 font-bold">
                      PERIODIC · EVERY 25 MIN
                    </span>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] text-muted-foreground">Generated: {toISTTime(candle.createdAt)}</div>
                    {candle.nextAnalysisAt && (
                      <div className="text-[11px] text-orange-600 font-medium">Next: {toISTTime(candle.nextAnalysisAt)}</div>
                    )}
                  </div>
                </div>

                <DirectionBadge direction={candle.direction} confidence={candle.confidence} />

                <div>
                  <div className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground mb-1">30m Candle Summary</div>
                  <p className="text-sm text-foreground leading-relaxed">{candle.summary}</p>
                </div>

                {candle.outlook && (
                  <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-widest text-orange-700">
                      <AlertTriangle className="w-3.5 h-3.5" /> Next 30-60 Min Outlook
                    </div>
                    <p className="text-sm text-orange-800 leading-relaxed">{candle.outlook}</p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <ZoneList title="Demand Zones" zones={candle.demandZones ?? []} color="text-green-600" icon={ArrowUpRight} />
                  <ZoneList title="Supply Zones" zones={candle.supplyZones ?? []} color="text-red-600" icon={ArrowDownRight} />
                </div>

                {candle.callPutRecommendation && (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                    <div className="flex items-center gap-1.5 mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-700">
                      <Zap className="w-3.5 h-3.5" /> Quick Trade Recommendation
                    </div>
                    <p className="text-sm text-emerald-800 font-semibold">{candle.callPutRecommendation}</p>
                    <div className="flex gap-4 mt-2 text-xs text-emerald-700">
                      {candle.targetPrice && <span>Target: ₹{candle.targetPrice.toLocaleString("en-IN")}</span>}
                      {candle.stopLoss && <span>SL: ₹{candle.stopLoss.toLocaleString("en-IN")}</span>}
                    </div>
                  </div>
                )}

                {candle.candlePattern && (
                  <div className="flex flex-wrap gap-3">
                    <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 rounded-lg">
                      <BarChart3 className="w-3.5 h-3.5 text-purple-600" />
                      <span className="text-xs text-purple-700 font-medium">{candle.candlePattern}</span>
                    </div>
                    {candle.trendStrength && (
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border ${
                        candle.trendStrength === "STRONG" ? "bg-green-50 border-green-200 text-green-700" :
                        candle.trendStrength === "WEAK" ? "bg-red-50 border-red-200 text-red-700" :
                        "bg-yellow-50 border-yellow-200 text-yellow-700"
                      }`}>
                        <Activity className="w-3.5 h-3.5" />
                        <span className="text-xs font-medium">{candle.trendStrength}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {isPremium && history?.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <Clock className="w-4 h-4 text-muted-foreground" />
                  <h3 className="text-sm font-bold text-foreground">Recent 30-Min Analysis History</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Time (IST)</th>
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Direction</th>
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Confidence</th>
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Price</th>
                        <th className="text-left px-3 py-2 text-[10px] uppercase tracking-widest text-muted-foreground">Recommendation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h: any) => (
                        <tr key={h.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{toISTTime(h.createdAt)}</td>
                          <td className="px-3 py-2">
                            <span className={`text-xs font-bold ${h.direction === "BULLISH" ? "text-green-600" : h.direction === "BEARISH" ? "text-red-600" : "text-yellow-600"}`}>
                              {h.direction}
                            </span>
                          </td>
                          <td className="px-3 py-2 font-mono text-xs">{h.confidence}%</td>
                          <td className="px-3 py-2 font-mono text-xs">₹{h.niftyPrice?.toLocaleString("en-IN") ?? "—"}</td>
                          <td className="px-3 py-2 text-xs text-muted-foreground truncate max-w-[200px]">{h.callPutRecommendation ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-muted/50 border border-border rounded-lg p-4 text-[11px] text-muted-foreground space-y-1">
              <div className="flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" />
                <span className="font-bold uppercase tracking-widest">Disclaimer</span>
              </div>
              <p>This analysis is AI-generated for educational purposes only. It does not constitute financial advice. Always do your own research and consult a certified financial advisor before trading. Past performance does not guarantee future results. Index options trading carries significant risk.</p>
              <p>Analysis refreshes: Comprehensive every 1 hour, 30-min candle analysis every 25 minutes (delivered ~5 min before next candle). All times in IST.</p>
            </div>
          </div>
        </ProGate>
      )}
    </div>
  );
}
