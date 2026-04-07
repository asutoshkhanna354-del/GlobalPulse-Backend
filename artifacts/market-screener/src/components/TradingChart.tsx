import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart, type IChartApi, type ISeriesApi,
  ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, HistogramSeries, createSeriesMarkers,
} from "lightweight-charts";
import { usePremium } from "@/contexts/PremiumContext";
import { useNotifications } from "@/contexts/NotificationContext";
import {
  Crown, TrendingUp, TrendingDown, Lock, AlertTriangle,
  ShieldCheck, RefreshCw, Search, X, Zap, Radio,
  Bell, BellOff, Loader2, ExternalLink,
} from "lucide-react";

interface OHLCBar {
  timestamp: number; open: number; high: number; low: number; close: number; volume: number;
}
interface Signal {
  timestamp: number; type: "buy" | "sell"; price: number;
  confidence: number; stopLoss: number; takeProfit: number; riskReward: number;
}
interface IndicatorData {
  bars: OHLCBar[]; signals: Signal[]; marketMode: string;
  strength: number; drsi: number[]; signalLine: number[]; aiAnalysis?: string;
}
interface SearchResult { symbol: string; name: string; type: string; exchange: string; }
interface QuoteData {
  price: number | null; prevClose: number | null;
  change: number | null; changePercent: number | null;
  currency: string; marketState: string; name: string;
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
  { label: "1m",  tvInterval: "1",   yahooRange: "1d",  yahooInterval: "1m",  barMs: 60_000 },
  { label: "5m",  tvInterval: "5",   yahooRange: "5d",  yahooInterval: "5m",  barMs: 300_000 },
  { label: "15m", tvInterval: "15",  yahooRange: "1mo", yahooInterval: "15m", barMs: 900_000 },
  { label: "30m", tvInterval: "30",  yahooRange: "1mo", yahooInterval: "30m", barMs: 1_800_000 },
  { label: "1H",  tvInterval: "60",  yahooRange: "3mo", yahooInterval: "1h",  barMs: 3_600_000 },
  { label: "4H",  tvInterval: "240", yahooRange: "6mo", yahooInterval: "1h",  barMs: 14_400_000 },
  { label: "1D",  tvInterval: "D",   yahooRange: "1y",  yahooInterval: "1d",  barMs: 86_400_000 },
  { label: "1W",  tvInterval: "W",   yahooRange: "2y",  yahooInterval: "1wk", barMs: 604_800_000 },
];

const TV_SYMBOL_MAP: Record<string, string> = {
  XAUUSD: "OANDA:XAUUSD", XAGUSD: "OANDA:XAGUSD",
  EURUSD: "OANDA:EURUSD", GBPUSD: "OANDA:GBPUSD",
  USDJPY: "OANDA:USDJPY", USOIL: "NYMEX:CL1!", BRENT: "NYMEX:BB1!",
  BTCUSD: "COINBASE:BTCUSD", ETHUSD: "COINBASE:ETHUSD",
  SOLUSD: "COINBASE:SOLUSD", BNBUSD: "BINANCE:BNBUSDT",
  SPX: "SP:SPX", NDX: "NASDAQ:NDX", DJI: "DJ:DJI",
  DAX: "XETR:DAX", FTSE: "LSE:UKX", N225: "TSE:NI225",
  NIFTY50: "NSE:NIFTY50", SENSEX: "BSE:SENSEX", BANKNIFTY: "NSE:BANKNIFTY",
  DXY: "TVC:DXY", VIX: "CBOE:VIX",
};

function toTVSymbol(sym: string): string {
  const u = sym.toUpperCase();
  if (TV_SYMBOL_MAP[u]) return TV_SYMBOL_MAP[u];
  if (sym === "^GSPC") return "SP:SPX";
  if (sym === "^NSEI") return "NSE:NIFTY50";
  if (sym === "^BSESN") return "BSE:SENSEX";
  if (sym.startsWith("^")) return sym.slice(1);
  if (sym.endsWith("=X")) return `FX:${sym.replace("=X", "")}`;
  if (sym.endsWith("-USD")) return `COINBASE:${sym.replace("-", "")}`;
  // NSE/BSE stocks from Yahoo Finance format (PVRINOX.NS → NSE:PVRINOX)
  if (sym.endsWith(".NS")) return `NSE:${sym.replace(".NS", "")}`;
  if (sym.endsWith(".BO")) return `BSE:${sym.replace(".BO", "")}`;
  return sym;
}

function toTVLink(sym: string): string {
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(toTVSymbol(sym))}`;
}

const TV_THEME = {
  bg: "#FFFFFF", text: "#131722", grid: "rgba(0,0,0,0.04)",
  crosshair: "#9598A1", border: "#E0E3EB", labelBg: "#F0F3FA",
  upColor: "#26A69A", downColor: "#EF5350",
  upBorder: "#26A69A", downBorder: "#EF5350",
  upWick: "#26A69A", downWick: "#EF5350",
  volumeUp: "rgba(38,166,154,0.18)", volumeDown: "rgba(239,83,80,0.18)",
};

function formatPrice(p: number | null, currency?: string): string {
  if (p == null) return "—";
  const prefix = currency === "INR" ? "₹" : "";
  if (p >= 10000) return prefix + p.toFixed(2);
  if (p >= 100) return prefix + p.toFixed(2);
  if (p >= 1) return prefix + p.toFixed(4);
  return prefix + p.toFixed(6);
}

function formatSignalTime(ts: number): string {
  return new Date(ts).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", day: "numeric", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
}

function toUTCSec(ts: number) { return Math.floor(ts / 1000); }

function SignalPopup({ signal, currency, onClose }: { signal: Signal; currency?: string; onClose: () => void }) {
  const isBuy = signal.type === "buy";
  const pf = (v: number) => formatPrice(v, currency);
  return (
    <div className="absolute top-4 right-4 z-50 w-52 rounded-2xl shadow-2xl border border-white/50 overflow-hidden bg-white"
      style={{ boxShadow: "0 8px 40px rgba(0,0,0,0.22)" }}>
      <div className={`flex items-center justify-between px-3 py-2.5 ${isBuy ? "bg-emerald-500" : "bg-red-500"}`}>
        <div className={`flex items-center gap-1.5 text-white font-bold text-[12px]`}>
          {isBuy ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
          {isBuy ? "BUY Signal" : "SELL Signal"}
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-3 py-3 flex flex-col gap-2.5">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-[#9598A1]">Confidence</span>
            <span className={`text-[13px] font-bold ${signal.confidence >= 85 ? "text-emerald-600" : signal.confidence >= 72 ? "text-amber-500" : "text-slate-500"}`}>
              {signal.confidence}%
            </span>
          </div>
          <div className="w-full bg-[#F0F3FA] rounded-full h-1.5">
            <div className={`h-1.5 rounded-full transition-all ${signal.confidence >= 85 ? "bg-emerald-500" : signal.confidence >= 72 ? "bg-amber-400" : "bg-slate-400"}`}
              style={{ width: `${signal.confidence}%` }} />
          </div>
        </div>
        <div className="flex flex-col gap-1.5 pt-1 border-t border-[#F0F3FA]">
          <div className="flex justify-between text-[11px]">
            <span className="text-[#9598A1]">Entry</span>
            <span className="font-mono font-bold text-[#131722]">{pf(signal.price)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#EF5350]">Stop Loss</span>
            <span className="font-mono font-bold text-[#EF5350]">{pf(signal.stopLoss)}</span>
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-[#26A69A]">Take Profit</span>
            <span className="font-mono font-bold text-[#26A69A]">{pf(signal.takeProfit)}</span>
          </div>
          <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-[#F0F3FA]">
            <span className="text-[#FF9800] font-bold">RR 1:{signal.riskReward.toFixed(1)}</span>
            <span className="text-[#9598A1] text-[9px] font-mono">{formatSignalTime(signal.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const chartDisposedRef = useRef(false);
  const lastBarRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);

  const { isPremium, setShowActivation } = usePremium();
  const {
    isSubscribed, toggleSubscription, loadingSymbol: notifLoadingSymbol,
    isSupported: notifSupported, isInIframe: notifInIframe, errorMessage: notifError,
  } = useNotifications();

  const [notifErrorVisible, setNotifErrorVisible] = useState(false);
  const notifErrTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!notifError) return;
    setNotifErrorVisible(true);
    if (notifErrTimerRef.current) clearTimeout(notifErrTimerRef.current);
    notifErrTimerRef.current = setTimeout(() => setNotifErrorVisible(false), 5000);
  }, [notifError]);

  const [symbol, setSymbol] = useState("XAUUSD");
  const [symbolLabel, setSymbolLabel] = useState("Gold (XAU/USD)");
  const [currency, setCurrency] = useState<string | undefined>(undefined);
  const [rangeIdx, setRangeIdx] = useState(4);
  const [data, setData] = useState<IndicatorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedSignal, setSelectedSignal] = useState<Signal | null>(null);

  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [liveChange, setLiveChange] = useState<number | null>(null);
  const [liveChangePercent, setLiveChangePercent] = useState<number | null>(null);
  const [isLiveTicking, setIsLiveTicking] = useState(false);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const range = RANGES[rangeIdx];

  const selectSymbol = useCallback((sym: string, label: string) => {
    setSymbol(sym);
    setSymbolLabel(label);
    setSearchOpen(false);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedSignal(null);
    setData(null);
  }, []);

  useEffect(() => {
    if (!searchOpen) return;
    if (searchQuery.length < 1) { setSearchResults([]); return; }
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    const ctrl = new AbortController();
    searchTimerRef.current = setTimeout(async () => {
      setSearchLoading(true);
      try {
        const r = await fetch(`${baseUrl}/api/indicator/search?q=${encodeURIComponent(searchQuery)}`, { signal: ctrl.signal });
        setSearchResults(await r.json());
      } catch { if (!ctrl.signal.aborted) setSearchResults([]); }
      if (!ctrl.signal.aborted) setSearchLoading(false);
    }, 300);
    return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); ctrl.abort(); };
  }, [searchQuery, searchOpen]);

  useEffect(() => { if (searchOpen && searchInputRef.current) searchInputRef.current.focus(); }, [searchOpen]);

  useEffect(() => {
    const ctrl = new AbortController();
    setLoading(true); setError(""); setLivePrice(null); setSelectedSignal(null);
    fetch(`${baseUrl}/api/indicator/signals/${encodeURIComponent(symbol)}?range=${range.yahooRange}&interval=${range.yahooInterval}`, { signal: ctrl.signal })
      .then(r => r.json())
      .then(d => {
        if (!ctrl.signal.aborted) {
          setData(d);
          setLoading(false);
        }
      })
      .catch(e => { if (!ctrl.signal.aborted) { setError(e.message); setLoading(false); } });
    return () => ctrl.abort();
  }, [symbol, rangeIdx, refreshKey]);

  useEffect(() => {
    if (!data?.bars?.length) { setIsLiveTicking(false); return; }
    setIsLiveTicking(true);
    let disposed = false;
    const fetchTick = async () => {
      if (disposed) return;
      try {
        const r = await fetch(`${baseUrl}/api/indicator/quote/${encodeURIComponent(symbol)}`);
        if (!r.ok || disposed) return;
        const q: QuoteData = await r.json();
        if (q.price == null || disposed) return;
        setLivePrice(q.price);
        setLiveChange(q.change);
        setLiveChangePercent(q.changePercent);
        if (q.currency) setCurrency(q.currency);
        if (candleSeriesRef.current && lastBarRef.current && !chartDisposedRef.current) {
          try {
            const lb = lastBarRef.current;
            const upd = { time: lb.time as any, open: lb.open, high: Math.max(lb.high, q.price!), low: Math.min(lb.low, q.price!), close: q.price! };
            lastBarRef.current = { ...upd };
            candleSeriesRef.current.update(upd);
          } catch {}
        }
      } catch {}
    };
    fetchTick();
    liveIntervalRef.current = setInterval(fetchTick, 1500);
    return () => { disposed = true; if (liveIntervalRef.current) clearInterval(liveIntervalRef.current); };
  }, [symbol, data]);

  useEffect(() => {
    if (signalRefreshRef.current) clearInterval(signalRefreshRef.current);
    if (!isPremium) return;
    signalRefreshRef.current = setInterval(() => setRefreshKey(k => k + 1), 2 * 60 * 1000);
    return () => { if (signalRefreshRef.current) clearInterval(signalRefreshRef.current); };
  }, [symbol, rangeIdx]);

  // Build lightweight-chart whenever data changes
  useEffect(() => {
    if (!chartContainerRef.current || !data?.bars?.length) return;

    chartDisposedRef.current = true;
    if (chartApiRef.current) { try { chartApiRef.current.remove(); } catch {} chartApiRef.current = null; }
    candleSeriesRef.current = null;
    chartDisposedRef.current = false;

    const container = chartContainerRef.current;
    const chart = createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: { background: { type: ColorType.Solid, color: TV_THEME.bg }, textColor: TV_THEME.text, fontSize: 11 },
      grid: { vertLines: { color: TV_THEME.grid }, horzLines: { color: TV_THEME.grid } },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_THEME.crosshair, style: LineStyle.Dashed, width: 1, labelBackgroundColor: TV_THEME.labelBg },
        horzLine: { color: TV_THEME.crosshair, style: LineStyle.Dashed, width: 1, labelBackgroundColor: TV_THEME.labelBg },
      },
      timeScale: {
        borderColor: TV_THEME.border, timeVisible: true,
        secondsVisible: range.yahooInterval === "1m", barSpacing: 8, minBarSpacing: 4,
      },
      rightPriceScale: { borderColor: TV_THEME.border },
    });
    chartApiRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: TV_THEME.upColor, downColor: TV_THEME.downColor,
      borderUpColor: TV_THEME.upBorder, borderDownColor: TV_THEME.downBorder,
      wickUpColor: TV_THEME.upWick, wickDownColor: TV_THEME.downWick,
    });
    candleSeriesRef.current = candleSeries;

    const volSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" }, priceScaleId: "volume",
    });
    chart.priceScale("volume").applyOptions({ scaleMargins: { top: 0.85, bottom: 0 } });

    // Deduplicate and sort bars
    const seen = new Set<number>();
    const bars = data.bars
      .filter(b => { const t = toUTCSec(b.timestamp); if (seen.has(t)) return false; seen.add(t); return true; })
      .sort((a, b) => a.timestamp - b.timestamp);

    const candleData = bars.map(b => ({ time: toUTCSec(b.timestamp) as any, open: b.open, high: b.high, low: b.low, close: b.close }));
    const volData = bars.map(b => ({ time: toUTCSec(b.timestamp) as any, value: b.volume, color: b.close >= b.open ? TV_THEME.volumeUp : TV_THEME.volumeDown }));

    try { candleSeries.setData(candleData); } catch {}
    try { volSeries.setData(volData); } catch {}

    if (candleData.length > 0) {
      const last = candleData[candleData.length - 1];
      lastBarRef.current = { time: last.time, open: last.open, high: last.high, low: last.low, close: last.close };
    }

    // Signal arrows on candles
    if (isPremium && data.signals?.length) {
      const markers = data.signals.map(s => ({
        time: toUTCSec(s.timestamp) as any,
        position: s.type === "buy" ? "belowBar" as const : "aboveBar" as const,
        color: s.type === "buy" ? TV_THEME.upColor : TV_THEME.downColor,
        shape: s.type === "buy" ? "arrowUp" as const : "arrowDown" as const,
        text: `${s.confidence}%`,
      }));
      try { createSeriesMarkers(candleSeries, markers); } catch {
        try { (candleSeries as any).setMarkers(markers); } catch {}
      }

      // Click anywhere on chart → find nearest signal → show popup
      chart.subscribeClick(params => {
        if (!params.time) { setSelectedSignal(null); return; }
        const clickTs = (params.time as number) * 1000;
        let nearest: Signal | null = null;
        let minDist = Infinity;
        for (const s of data.signals) {
          const d = Math.abs(s.timestamp - clickTs);
          if (d < minDist) { minDist = d; nearest = s; }
        }
        const threshold = range.barMs * 4;
        if (nearest && minDist < threshold) setSelectedSignal(nearest);
        else setSelectedSignal(null);
      });
    }

    // Show last 80 bars by default
    const visibleBars = Math.min(bars.length, 80);
    if (bars.length > visibleBars) {
      try {
        chart.timeScale().setVisibleRange({
          from: candleData[bars.length - visibleBars].time,
          to: candleData[bars.length - 1].time,
        } as any);
      } catch { try { chart.timeScale().fitContent(); } catch {} }
    } else {
      try { chart.timeScale().fitContent(); } catch {}
    }

    const observer = new ResizeObserver(() => {
      if (container && chartApiRef.current && !chartDisposedRef.current) {
        try { chart.applyOptions({ width: container.clientWidth, height: container.clientHeight }); } catch {}
      }
    });
    observer.observe(container);

    return () => {
      chartDisposedRef.current = true;
      observer.disconnect();
      try { chart.remove(); } catch {}
      if (chartApiRef.current === chart) chartApiRef.current = null;
      candleSeriesRef.current = null;
    };
  }, [data, isPremium]);

  const lastSignal = data?.signals?.length ? data.signals[data.signals.length - 1] : null;
  const handleRefresh = () => { setRefreshKey(k => k + 1); setSelectedSignal(null); };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Header */}
      <div className="flex flex-col border-b border-[#E0E3EB]">
        <div className="flex flex-wrap items-center px-3 py-2 gap-2">
          {/* Symbol selector */}
          <button onClick={() => setSearchOpen(true)}
            className="flex items-center gap-2 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-3 py-1.5 hover:bg-[#E8ECF6] hover:border-[#2962FF]/30 transition-all cursor-pointer min-w-0 max-w-[200px] sm:max-w-[260px] shrink-0">
            <Search className="w-3 h-3 text-[#9598A1] shrink-0" />
            <span className="text-[#131722] text-xs font-semibold truncate">{symbolLabel}</span>
          </button>

          {/* Live price */}
          {livePrice != null && (
            <div className="flex items-center gap-1.5 min-w-0 overflow-hidden">
              <span className="text-[#131722] font-mono text-sm font-bold tabular-nums shrink-0">
                {formatPrice(livePrice, currency ?? undefined)}
              </span>
              {liveChange != null && (
                <span className={`text-[10px] font-mono font-bold shrink-0 ${liveChange >= 0 ? "text-[#26A69A]" : "text-[#EF5350]"}`}>
                  {liveChange >= 0 ? "+" : ""}{liveChange.toFixed(2)} ({liveChangePercent?.toFixed(2)}%)
                </span>
              )}
            </div>
          )}

          {/* Right side controls */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0">
            {isLiveTicking && (
              <span className="hidden sm:flex items-center gap-0.5 text-[8px] text-[#2962FF]">
                <Radio className="w-2.5 h-2.5 animate-pulse" /> LIVE
              </span>
            )}

            {data?.marketMode && (
              <div className="hidden sm:flex items-center gap-1 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1">
                <span className="text-[9px] text-[#9598A1]">MODE</span>
                <span className={`text-[9px] font-bold ${data.marketMode === "BULLISH" ? "text-[#26A69A]" : data.marketMode === "BEARISH" ? "text-[#EF5350]" : "text-[#FF9800]"}`}>
                  {data.marketMode}
                </span>
              </div>
            )}

            <button onClick={handleRefresh}
              className="flex items-center gap-1 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1.5 text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6] transition-all" title="Refresh">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>

            <a href={toTVLink(symbol)} target="_blank" rel="noopener noreferrer"
              className="flex items-center gap-1 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1.5 text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6] transition-all" title="Open on TradingView">
              <ExternalLink className="w-3 h-3" />
            </a>

            {!isPremium && (
              <button onClick={() => setShowActivation(true)}
                className="flex items-center gap-1 bg-[#FFF8E1] border border-[#FFB300]/30 rounded-lg px-2 py-1 text-[#FF8F00] hover:bg-[#FFE082]/40 transition-all">
                <Crown className="w-3 h-3" /><span className="text-[9px] font-bold">PRO</span>
              </button>
            )}
            {isPremium && (
              <div className="flex items-center gap-1 bg-[#FFF8E1] border border-[#FFB300]/30 rounded-lg px-2 py-1">
                <Crown className="w-3 h-3 text-[#FF8F00]" /><span className="text-[9px] font-bold text-[#FF8F00]">PRO</span>
              </div>
            )}

            {isPremium && (notifSupported || notifInIframe) && (
              <div className="relative">
                <button
                  onClick={() => toggleSubscription(symbol, symbolLabel)}
                  disabled={notifLoadingSymbol === symbol}
                  title={notifInIframe ? "Open in new tab for push notifications" : isSubscribed(symbol) ? "Unsubscribe from signals" : "Subscribe to push signals"}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1.5 transition-all border ${
                    notifInIframe ? "bg-[#F0F3FA] border-[#E0E3EB] text-[#C9CBD4] cursor-not-allowed"
                    : isSubscribed(symbol) ? "bg-[#E3F2FD] border-[#2962FF]/30 text-[#2962FF] hover:bg-[#BBDEFB]/50"
                    : "bg-[#F0F3FA] border-[#E0E3EB] text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6]"
                  }`}>
                  {notifLoadingSymbol === symbol ? <Loader2 className="w-3 h-3 animate-spin" /> : isSubscribed(symbol) ? <Bell className="w-3 h-3" /> : <BellOff className="w-3 h-3" />}
                </button>
                {notifErrorVisible && notifError && (
                  <div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 shadow-lg">{notifError}</div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Timeframe tabs */}
        <div className="flex px-3 pb-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 bg-[#F0F3FA] rounded-lg p-0.5">
            {RANGES.map((r, idx) => (
              <button key={r.label} onClick={() => setRangeIdx(idx)}
                className={`px-2.5 sm:px-3 py-1.5 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${
                  rangeIdx === idx ? "bg-[#2962FF] text-white shadow-sm" : "text-[#9598A1] hover:text-[#131722] hover:bg-white"
                }`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart area */}
      <div className="flex-1 relative min-h-0">
        {loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin" />
              <span className="text-[#9598A1] text-xs">Loading {symbolLabel}...</span>
            </div>
          </div>
        )}
        {error && !loading && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 text-[#EF5350] text-xs">
                <AlertTriangle className="w-4 h-4" /><span>{error}</span>
              </div>
              <button onClick={handleRefresh} className="text-[10px] text-[#9598A1] hover:text-[#131722] underline">Try again</button>
            </div>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full h-full" />

        {selectedSignal && (
          <SignalPopup signal={selectedSignal} currency={currency ?? undefined} onClose={() => setSelectedSignal(null)} />
        )}

        {!isPremium && !loading && (
          <div className="absolute bottom-3 right-3 z-10 w-64">
            <div className="bg-white/95 backdrop-blur-xl border border-[#FFB300]/30 rounded-2xl p-3 shadow-lg">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#FFB300] to-[#FF8F00] flex items-center justify-center">
                  <Lock className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-bold text-[#FF8F00]">GlobalPulse Pro</span>
              </div>
              <p className="text-[9px] text-[#9598A1] mb-2">
                AI signal arrows directly on candles — click any arrow for entry, stop loss, take profit & confidence.
              </p>
              <button onClick={() => setShowActivation(true)}
                className="w-full bg-gradient-to-r from-[#FFB300] to-[#FF8F00] text-white text-[10px] font-bold py-1.5 rounded-lg hover:from-[#FFC107] hover:to-[#FF9800] transition-all">
                Activate Key
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Signal summary bar */}
      {isPremium && lastSignal && !loading && (
        <div className="border-t border-[#E0E3EB] px-3 py-2 bg-[#F0F3FA]">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setSelectedSignal(prev => prev?.timestamp === lastSignal.timestamp ? null : lastSignal)}
              className={`flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-lg border transition-all ${
                lastSignal.type === "buy"
                  ? "bg-emerald-50 border-emerald-200 hover:bg-emerald-100"
                  : "bg-red-50 border-red-200 hover:bg-red-100"
              }`}
            >
              {lastSignal.type === "buy" ? <TrendingUp className="w-3.5 h-3.5 text-[#26A69A]" /> : <TrendingDown className="w-3.5 h-3.5 text-[#EF5350]" />}
              <span className={`text-[11px] font-bold ${lastSignal.type === "buy" ? "text-[#26A69A]" : "text-[#EF5350]"}`}>
                {lastSignal.type.toUpperCase()}
              </span>
            </button>
            <span className="text-[10px] text-[#9598A1] shrink-0">@ {formatPrice(lastSignal.price, currency ?? undefined)}</span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
            <div className="flex items-center gap-0.5 shrink-0">
              <ShieldCheck className="w-3 h-3 text-[#9598A1]" />
              <span className={`text-[10px] font-bold ${lastSignal.confidence >= 85 ? "text-[#26A69A]" : lastSignal.confidence >= 72 ? "text-[#FF9800]" : "text-[#9598A1]"}`}>
                {lastSignal.confidence}%
              </span>
            </div>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
            <span className="text-[10px] text-[#9598A1] shrink-0">SL: <span className="text-[#EF5350] font-mono">{formatPrice(lastSignal.stopLoss, currency ?? undefined)}</span></span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
            <span className="text-[10px] text-[#9598A1] shrink-0">TP: <span className="text-[#26A69A] font-mono">{formatPrice(lastSignal.takeProfit, currency ?? undefined)}</span></span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
            <span className="text-[10px] text-[#9598A1] shrink-0">RR: <span className="text-[#FF9800] font-mono">1:{lastSignal.riskReward.toFixed(1)}</span></span>
            {data?.aiAnalysis && (
              <><div className="w-px h-3 bg-[#E0E3EB] shrink-0" />
              <div className="flex items-center gap-1 shrink-0">
                <Zap className="w-3 h-3 text-[#2962FF]" />
                <span className="text-[9px] text-[#2962FF] font-medium max-w-[180px] truncate">{data.aiAnalysis}</span>
              </div></>
            )}
          </div>
        </div>
      )}

      {/* Search modal */}
      {searchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={() => setSearchOpen(false)}>
          <div className="absolute inset-0 bg-[#131722]/40 backdrop-blur-sm" />
          <div className="relative w-full max-w-lg mx-4 bg-white border border-[#E0E3EB] rounded-2xl shadow-2xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0E3EB]">
              <Search className="w-4 h-4 text-[#9598A1] shrink-0" />
              <input ref={searchInputRef} type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search symbol, e.g. AAPL, RELIANCE, NIFTY..."
                className="flex-1 bg-transparent text-[#131722] placeholder:text-[#9598A1] text-sm outline-none" />
              {searchLoading && <div className="w-4 h-4 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin shrink-0" />}
              <button onClick={() => setSearchOpen(false)} className="text-[#9598A1] hover:text-[#131722] shrink-0"><X className="w-4 h-4" /></button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {searchQuery.length === 0 && (
                <div className="p-3">
                  <div className="text-[9px] text-[#9598A1] font-semibold mb-2 px-1 uppercase tracking-wider">Popular</div>
                  <div className="grid grid-cols-2 gap-1">
                    {POPULAR_SYMBOLS.map(s => (
                      <button key={s.key} onClick={() => selectSymbol(s.key, `${s.label} (${s.key})`)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#F0F3FA] transition-all text-left">
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
                    <button key={r.symbol} onClick={() => selectSymbol(r.symbol, `${r.name} (${r.symbol})`)}
                      className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-[#F0F3FA] transition-all text-left">
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
                <div className="py-8 text-center text-[#9598A1] text-xs">No results for "{searchQuery}"</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
