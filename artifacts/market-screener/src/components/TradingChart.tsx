import { useEffect, useRef, useState, useCallback } from "react";
import { usePremium } from "@/contexts/PremiumContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { Crown, TrendingUp, TrendingDown, Lock, AlertTriangle, Target, ShieldCheck, RefreshCw, Search, X, Zap, Radio, Bell, BellOff, Loader2, ExternalLink } from "lucide-react";

interface Signal {
  timestamp: number;
  type: "buy" | "sell";
  price: number;
  confidence: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
}

interface IndicatorData {
  bars: { timestamp: number; open: number; high: number; low: number; close: number; volume: number }[];
  signals: Signal[];
  marketMode: string;
  strength: number;
  drsi: number[];
  signalLine: number[];
  aiAnalysis?: string;
}

interface SearchResult {
  symbol: string;
  name: string;
  type: string;
  exchange: string;
}

interface QuoteData {
  price: number | null;
  prevClose: number | null;
  change: number | null;
  changePercent: number | null;
  currency: string;
  marketState: string;
  name: string;
}

const POPULAR_SYMBOLS = [
  { key: "XAUUSD", label: "Gold", cat: "Commodity" },
  { key: "BTCUSD", label: "Bitcoin", cat: "Crypto" },
  { key: "ETHUSD", label: "Ethereum", cat: "Crypto" },
  { key: "SPX", label: "S&P 500", cat: "Index" },
  { key: "NDX", label: "Nasdaq 100", cat: "Index" },
  { key: "DJI", label: "Dow Jones", cat: "Index" },
  { key: "EURUSD", label: "EUR/USD", cat: "Forex" },
  { key: "GBPUSD", label: "GBP/USD", cat: "Forex" },
  { key: "USDJPY", label: "USD/JPY", cat: "Forex" },
  { key: "USOIL", label: "Crude Oil", cat: "Commodity" },
  { key: "NIFTY50", label: "Nifty 50", cat: "Index" },
  { key: "SENSEX", label: "Sensex", cat: "Index" },
  { key: "SOLUSD", label: "Solana", cat: "Crypto" },
  { key: "XAGUSD", label: "Silver", cat: "Commodity" },
  { key: "DAX", label: "DAX 40", cat: "Index" },
];

const RANGES = [
  { label: "1m", tvInterval: "1", yahooRange: "1d", yahooInterval: "1m" },
  { label: "5m", tvInterval: "5", yahooRange: "5d", yahooInterval: "5m" },
  { label: "15m", tvInterval: "15", yahooRange: "1mo", yahooInterval: "15m" },
  { label: "30m", tvInterval: "30", yahooRange: "1mo", yahooInterval: "30m" },
  { label: "1H", tvInterval: "60", yahooRange: "3mo", yahooInterval: "1h" },
  { label: "4H", tvInterval: "240", yahooRange: "6mo", yahooInterval: "1h" },
  { label: "1D", tvInterval: "D", yahooRange: "1y", yahooInterval: "1d" },
  { label: "1W", tvInterval: "W", yahooRange: "2y", yahooInterval: "1wk" },
];

const TV_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD",
  XAGUSD: "OANDA:XAGUSD",
  EURUSD: "OANDA:EURUSD",
  GBPUSD: "OANDA:GBPUSD",
  USDJPY: "OANDA:USDJPY",
  USDCNY: "FX:USDCNY",
  USDCHF: "OANDA:USDCHF",
  DXY: "TVC:DXY",
  USOIL: "NYMEX:CL1!",
  BRENT: "NYMEX:BB1!",
  NATGAS: "NYMEX:NG1!",
  COPPER: "COMEX:HG1!",
  BTCUSD: "COINBASE:BTCUSD",
  ETHUSD: "COINBASE:ETHUSD",
  SOLUSD: "COINBASE:SOLUSD",
  BNBUSD: "BINANCE:BNBUSDT",
  NIFTY50: "NSE:NIFTY",
  SENSEX: "BSE:SENSEX",
  BANKNIFTY: "NSE:BANKNIFTY",
  SPX: "SP:SPX",
  NDX: "NASDAQ:NDX",
  DJI: "DJ:DJI",
  DAX: "XETR:DAX",
  FTSE: "LSE:UKX",
  N225: "TSE:NI225",
  HSI: "HKEX:HSI",
  SSEC: "SSE:000001",
  CAC40: "EURONEXT:PX1",
  VIX: "CBOE:VIX",
};

function toTVSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();
  if (TV_SYMBOL_MAP[upper]) return TV_SYMBOL_MAP[upper];
  if (symbol === "^GSPC") return "SP:SPX";
  if (symbol === "^NSEI") return "NSE:NIFTY";
  if (symbol === "^BSESN") return "BSE:SENSEX";
  if (symbol.startsWith("^")) return symbol.slice(1);
  if (symbol.endsWith("=X")) return `FX:${symbol.replace("=X", "")}`;
  if (symbol.endsWith("-USD")) return `COINBASE:${symbol.replace("-", "")}`;
  return symbol;
}

function formatPrice(price: number | null): string {
  if (price == null) return "—";
  if (price >= 10000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

function formatSignalTime(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

declare global {
  interface Window {
    TradingView: any;
  }
}

let tvScriptPromise: Promise<void> | null = null;
function loadTVScript(): Promise<void> {
  if (tvScriptPromise) return tvScriptPromise;
  tvScriptPromise = new Promise((resolve) => {
    if (window.TradingView) { resolve(); return; }
    const script = document.createElement("script");
    script.id = "gp-tv-script";
    script.src = "https://s3.tradingview.com/tv.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => resolve();
    document.body.appendChild(script);
  });
  return tvScriptPromise;
}

export function TradingChart() {
  const tvContainerRef = useRef<HTMLDivElement>(null);
  const { isPremium, setShowActivation } = usePremium();
  const { isSubscribed, toggleSubscription, loadingSymbol: notifLoadingSymbol, isSupported: notifSupported, isInIframe: notifInIframe, errorMessage: notifError, setShowManager: setShowNotifManager } = useNotifications();
  const [notifErrorVisible, setNotifErrorVisible] = useState(false);
  const notifErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!notifError) return;
    setNotifErrorVisible(true);
    if (notifErrorTimerRef.current) clearTimeout(notifErrorTimerRef.current);
    notifErrorTimerRef.current = setTimeout(() => setNotifErrorVisible(false), 5000);
  }, [notifError]);

  const [symbol, setSymbol] = useState("XAUUSD");
  const [symbolLabel, setSymbolLabel] = useState("Gold (XAU/USD)");
  const [rangeIdx, setRangeIdx] = useState(4);
  const [data, setData] = useState<IndicatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveChange, setLiveChange] = useState<number | null>(null);
  const [liveChangePercent, setLiveChangePercent] = useState<number | null>(null);
  const [liveState, setLiveState] = useState("REGULAR");
  const [isLiveTicking, setIsLiveTicking] = useState(false);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const range = RANGES[rangeIdx];

  useEffect(() => {
    if (!tvContainerRef.current) return;
    const tvSymbol = toTVSymbol(symbol);
    const containerId = `gp_tv_${Math.random().toString(36).slice(2)}`;
    const containerEl = document.createElement("div");
    containerEl.id = containerId;
    containerEl.style.cssText = "width:100%;height:100%";
    tvContainerRef.current.innerHTML = "";
    tvContainerRef.current.appendChild(containerEl);

    loadTVScript().then(() => {
      if (!window.TradingView || !document.getElementById(containerId)) return;
      new window.TradingView.widget({
        container_id: containerId,
        symbol: tvSymbol,
        interval: range.tvInterval,
        theme: "light",
        locale: "en",
        timezone: "Asia/Kolkata",
        autosize: true,
        hide_top_toolbar: true,
        hide_legend: false,
        hide_side_toolbar: true,
        allow_symbol_change: false,
        enable_publishing: false,
        save_image: false,
        toolbar_bg: "#F0F3FA",
        withdateranges: false,
      });
    });

    return () => {
      if (tvContainerRef.current) tvContainerRef.current.innerHTML = "";
    };
  }, [symbol, rangeIdx]);

  useEffect(() => {
    if (!searchOpen) return;
    if (searchQuery.length < 1) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const controller = new AbortController();
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const resp = await fetch(`${baseUrl}/api/indicator/search?q=${encodeURIComponent(searchQuery)}`, { signal: controller.signal });
        const results = await resp.json();
        setSearchResults(results);
      } catch {
        if (!controller.signal.aborted) setSearchResults([]);
      }
      if (!controller.signal.aborted) setSearchLoading(false);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); controller.abort(); };
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) searchInputRef.current.focus();
  }, [searchOpen]);

  const selectSymbol = useCallback((sym: string, label: string) => {
    setSymbol(sym);
    setSymbolLabel(label);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    fetch(`${baseUrl}/api/indicator/signals/${encodeURIComponent(symbol)}?range=${range.yahooRange}&interval=${range.yahooInterval}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        if (!controller.signal.aborted) { setData(d); setLoading(false); }
      })
      .catch(e => { if (!controller.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => controller.abort();
  }, [symbol, rangeIdx, refreshKey]);

  useEffect(() => {
    if (!data?.bars?.length) { setIsLiveTicking(false); return; }
    setIsLiveTicking(true);
    let disposed = false;

    const fetchTick = async () => {
      if (disposed) return;
      try {
        const resp = await fetch(`${baseUrl}/api/indicator/quote/${encodeURIComponent(symbol)}`);
        if (!resp.ok || disposed) return;
        const quote: QuoteData = await resp.json();
        if (quote.price == null || disposed) return;
        setLivePrice(quote.price);
        setLiveChange(quote.change);
        setLiveChangePercent(quote.changePercent);
        setLiveState(quote.marketState);
      } catch {}
    };

    fetchTick();
    liveIntervalRef.current = setInterval(fetchTick, 3000);
    return () => { disposed = true; if (liveIntervalRef.current) clearInterval(liveIntervalRef.current); };
  }, [symbol, data]);

  useEffect(() => {
    if (signalRefreshRef.current) clearInterval(signalRefreshRef.current);
    if (!isPremium) return;
    signalRefreshRef.current = setInterval(() => setRefreshKey(k => k + 1), 2 * 60 * 1000);
    return () => { if (signalRefreshRef.current) clearInterval(signalRefreshRef.current); };
  }, [symbol, rangeIdx]);

  const lastSignal = data?.signals?.length ? data.signals[data.signals.length - 1] : null;
  const recentSignals = data?.signals?.slice(-5).reverse() ?? [];
  const handleRefresh = () => setRefreshKey(k => k + 1);

  const tvUrl = `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(toTVSymbol(symbol))}`;

  return (
    <div className="flex flex-col h-full bg-white">
      <div className="flex flex-col border-b border-[#E0E3EB]">
        <div className="flex flex-wrap items-center px-3 py-2 gap-2">
          <button
            onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-3 py-1.5 hover:bg-[#E8ECF6] hover:border-[#2962FF]/30 transition-all cursor-pointer min-w-0 max-w-[200px] sm:max-w-[260px] shrink-0"
          >
            <Search className="w-3 h-3 text-[#9598A1] shrink-0" />
            <span className="text-[#131722] text-xs font-semibold truncate">{symbolLabel}</span>
          </button>

          {livePrice != null && (
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              <span className="text-[#131722] font-mono text-sm font-bold tabular-nums shrink-0">{formatPrice(livePrice)}</span>
              {liveChange != null && (
                <span className={`text-[10px] font-mono font-bold shrink-0 ${liveChange >= 0 ? "text-[#26A69A]" : "text-[#EF5350]"}`}>
                  {liveChange >= 0 ? "+" : ""}{liveChange.toFixed(2)} ({liveChangePercent?.toFixed(2)}%)
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {isLiveTicking && (
              <span className="flex items-center gap-0.5 text-[8px] text-[#2962FF]">
                <Radio className="w-2.5 h-2.5 animate-pulse" />
                LIVE
              </span>
            )}

            <button
              onClick={handleRefresh}
              className="flex items-center gap-1 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1.5 text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6] transition-all"
              title="Refresh signals"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>

            <a
              href={tvUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1.5 text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6] transition-all"
              title="Open on TradingView.com"
            >
              <ExternalLink className="w-3 h-3" />
            </a>

            {data?.marketMode && (
              <div className="hidden sm:flex items-center gap-1.5 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1">
                <span className="text-[9px] text-[#9598A1]">MODE</span>
                <span className={`text-[9px] font-bold ${
                  data.marketMode === "BULLISH" ? "text-[#26A69A]" :
                  data.marketMode === "BEARISH" ? "text-[#EF5350]" :
                  "text-[#FF9800]"
                }`}>
                  {data.marketMode}
                </span>
              </div>
            )}

            {!isPremium && (
              <button
                onClick={() => setShowActivation(true)}
                className="flex items-center gap-1 bg-[#FFF8E1] border border-[#FFB300]/30 rounded-lg px-2 py-1 text-[#FF8F00] hover:bg-[#FFE082]/40 transition-all"
              >
                <Crown className="w-3 h-3" />
                <span className="text-[9px] font-bold">PRO</span>
              </button>
            )}

            {isPremium && (
              <div className="flex items-center gap-1 bg-[#FFF8E1] border border-[#FFB300]/30 rounded-lg px-2 py-1">
                <Crown className="w-3 h-3 text-[#FF8F00]" />
                <span className="text-[9px] font-bold text-[#FF8F00]">PRO</span>
              </div>
            )}

            {isPremium && (notifSupported || notifInIframe) && (
              <div className="relative">
                <button
                  onClick={() => toggleSubscription(symbol, symbolLabel)}
                  disabled={notifLoadingSymbol === symbol}
                  title={
                    notifInIframe
                      ? "Open in a new tab to enable push notifications"
                      : isSubscribed(symbol)
                        ? "Unsubscribe from signal notifications"
                        : "Subscribe to signal notifications"
                  }
                  className={`flex items-center gap-1 rounded-lg px-2 py-1.5 transition-all border ${
                    notifInIframe
                      ? "bg-[#F0F3FA] border-[#E0E3EB] text-[#C9CBD4] cursor-not-allowed"
                      : isSubscribed(symbol)
                        ? "bg-[#E3F2FD] border-[#2962FF]/30 text-[#2962FF] hover:bg-[#BBDEFB]/50"
                        : "bg-[#F0F3FA] border-[#E0E3EB] text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6]"
                  }`}
                >
                  {notifLoadingSymbol === symbol ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : isSubscribed(symbol) ? (
                    <Bell className="w-3 h-3" />
                  ) : (
                    <BellOff className="w-3 h-3" />
                  )}
                </button>
                {notifErrorVisible && notifError && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 shadow-lg">
                    {notifError}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex px-3 pb-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 bg-[#F0F3FA] rounded-lg p-0.5 min-w-0">
            {RANGES.map((r, idx) => (
              <button
                key={r.label}
                onClick={() => setRangeIdx(idx)}
                className={`px-2.5 sm:px-3 py-1.5 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap shrink-0 ${
                  rangeIdx === idx
                    ? "bg-[#2962FF] text-white shadow-sm"
                    : "text-[#9598A1] hover:text-[#131722] hover:bg-white"
                }`}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/80 z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin" />
              <span className="text-[#9598A1] text-xs">Loading {symbolLabel}...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-20">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-[#EF5350] text-xs">
                <AlertTriangle className="w-4 h-4" />
                <span>{error}</span>
              </div>
              <button onClick={handleRefresh} className="text-[10px] text-[#9598A1] hover:text-[#131722] underline">
                Try again
              </button>
            </div>
          </div>
        )}

        <div ref={tvContainerRef} className="w-full h-full" />

        {isPremium && recentSignals.length > 0 && (
          <div className="absolute top-2 left-2 z-10 flex flex-col gap-1 max-w-[170px]">
            {recentSignals.map((s, idx) => (
              <div
                key={`${s.timestamp}-${idx}`}
                className={`flex items-center gap-1.5 rounded-lg px-2 py-1 text-[10px] font-semibold shadow-sm border backdrop-blur-md ${
                  s.type === "buy"
                    ? "bg-emerald-50/95 border-emerald-200/80 text-emerald-700"
                    : "bg-red-50/95 border-red-200/80 text-red-700"
                }`}
              >
                {s.type === "buy" ? (
                  <TrendingUp className="w-3 h-3 shrink-0" />
                ) : (
                  <TrendingDown className="w-3 h-3 shrink-0" />
                )}
                <span>{s.type.toUpperCase()}</span>
                <span className={`font-bold ${
                  s.confidence >= 85 ? "text-emerald-600" :
                  s.confidence >= 75 ? "text-amber-600" :
                  "opacity-80"
                }`}>{s.confidence}%</span>
                <span className="opacity-60 text-[9px] font-mono shrink-0">{formatSignalTime(s.timestamp)}</span>
              </div>
            ))}
          </div>
        )}

        {!isPremium && !loading && (
          <div className="absolute bottom-3 left-3 right-3 lg:left-auto lg:right-3 lg:w-72 z-10">
            <div className="bg-white/95 backdrop-blur-xl border border-[#FFB300]/30 rounded-2xl p-3 shadow-lg">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#FFB300] to-[#FF8F00] flex items-center justify-center">
                  <Lock className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-bold text-[#FF8F00]">GlobalPulse Pro</span>
              </div>
              <p className="text-[9px] text-[#9598A1] mb-2">
                Real-time AI signals with multi-indicator confirmation — directly on the TradingView chart
              </p>
              <button
                onClick={() => setShowActivation(true)}
                className="w-full bg-gradient-to-r from-[#FFB300] to-[#FF8F00] text-white text-[10px] font-bold py-1.5 rounded-lg hover:from-[#FFC107] hover:to-[#FF9800] transition-all"
              >
                Activate Key
              </button>
            </div>
          </div>
        )}
      </div>

      {isPremium && lastSignal && (
        <div className="border-t border-[#E0E3EB] px-3 py-2 bg-[#F0F3FA]">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <div className="flex items-center gap-1 shrink-0">
              {lastSignal.type === "buy" ? (
                <TrendingUp className="w-3.5 h-3.5 text-[#26A69A]" />
              ) : (
                <TrendingDown className="w-3.5 h-3.5 text-[#EF5350]" />
              )}
              <span className={`text-[11px] font-bold ${lastSignal.type === "buy" ? "text-[#26A69A]" : "text-[#EF5350]"}`}>
                {lastSignal.type.toUpperCase()}
              </span>
            </div>
            <span className="text-[10px] text-[#9598A1] shrink-0">@ {lastSignal.price.toFixed(2)}</span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
            <div className="flex items-center gap-0.5 shrink-0">
              <ShieldCheck className="w-3 h-3 text-[#9598A1]" />
              <span className={`text-[10px] font-bold ${lastSignal.confidence >= 85 ? "text-[#26A69A]" : lastSignal.confidence >= 72 ? "text-[#FF9800]" : "text-[#9598A1]"}`}>
                {lastSignal.confidence}%
              </span>
            </div>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
            <span className="text-[10px] text-[#9598A1] shrink-0">SL: <span className="text-[#EF5350] font-mono">{lastSignal.stopLoss.toFixed(2)}</span></span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
            <span className="text-[10px] text-[#9598A1] shrink-0">TP: <span className="text-[#26A69A] font-mono">{lastSignal.takeProfit.toFixed(2)}</span></span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
            <span className="text-[10px] text-[#9598A1] shrink-0">RR: <span className="text-[#FF9800] font-mono">1:{lastSignal.riskReward.toFixed(1)}</span></span>
            {data?.aiAnalysis && (
              <>
                <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
                <div className="flex items-center gap-1 shrink-0">
                  <Zap className="w-3 h-3 text-[#2962FF]" />
                  <span className="text-[9px] text-[#2962FF] font-medium max-w-[180px] truncate">{data.aiAnalysis}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={() => setSearchOpen(false)}>
          <div className="absolute inset-0 bg-[#131722]/40 backdrop-blur-sm" />
          <div
            className="relative w-full max-w-lg mx-4 bg-white border border-[#E0E3EB] rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0E3EB]">
              <Search className="w-4 h-4 text-[#9598A1] shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search symbol, e.g. AAPL, BTC, EURUSD..."
                className="flex-1 bg-transparent text-[#131722] placeholder:text-[#9598A1] text-sm outline-none"
              />
              {searchLoading && <div className="w-4 h-4 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin shrink-0" />}
              <button onClick={() => setSearchOpen(false)} className="text-[#9598A1] hover:text-[#131722] shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="max-h-80 overflow-y-auto">
              {searchQuery.length === 0 && (
                <div className="p-3">
                  <div className="text-[9px] text-[#9598A1] font-semibold mb-2 px-1 uppercase tracking-wider">Popular</div>
                  <div className="grid grid-cols-2 gap-1">
                    {POPULAR_SYMBOLS.map(s => (
                      <button
                        key={s.key}
                        onClick={() => selectSymbol(s.key, `${s.label} (${s.key})`)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#F0F3FA] transition-all text-left"
                      >
                        <div>
                          <div className="text-[11px] font-semibold text-[#131722]">{s.label}</div>
                          <div className="text-[9px] text-[#9598A1]">{s.key}</div>
                        </div>
                        <span className="text-[8px] text-[#9598A1] bg-[#F0F3FA] px-1.5 py-0.5 rounded-full">{s.cat}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {searchResults.length > 0 && (
                <div className="p-2">
                  {searchResults.map(r => (
                    <button
                      key={r.symbol}
                      onClick={() => selectSymbol(r.symbol, `${r.name} (${r.symbol})`)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-[#F0F3FA] transition-all text-left"
                    >
                      <div className="min-w-0">
                        <div className="text-[11px] font-semibold text-[#131722] truncate">{r.symbol}</div>
                        <div className="text-[9px] text-[#9598A1] truncate">{r.name}</div>
                      </div>
                      <div className="flex items-center gap-1 ml-2 shrink-0">
                        <span className="text-[8px] text-[#9598A1]">{r.exchange}</span>
                        <span className="text-[8px] text-[#2962FF] bg-[#EEF2FF] px-1.5 py-0.5 rounded-full">{r.type}</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {searchQuery.length > 0 && searchResults.length === 0 && !searchLoading && (
                <div className="py-8 text-center text-[#9598A1] text-xs">
                  No results for "{searchQuery}"
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
