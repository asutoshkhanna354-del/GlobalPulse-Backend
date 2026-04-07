import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, type IChartApi, type ISeriesApi, ColorType, CrosshairMode, LineStyle, CandlestickSeries, HistogramSeries, createSeriesMarkers } from "lightweight-charts";
import { usePremium } from "@/contexts/PremiumContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { Crown, TrendingUp, TrendingDown, Lock, AlertTriangle, Target, ShieldCheck, RefreshCw, Search, X, Zap, Radio, Bell, BellOff, Loader2 } from "lucide-react";

interface OHLCBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

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
  bars: OHLCBar[];
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
  lastBar: OHLCBar | null;
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
  { key: "1d", label: "1m", interval: "1m" },
  { key: "5d", label: "5m", interval: "5m" },
  { key: "1mo", label: "15m", interval: "15m" },
  { key: "1mo", label: "30m", interval: "30m" },
  { key: "3mo", label: "1H", interval: "1h" },
  { key: "6mo", label: "4H", interval: "1h" },
  { key: "1y", label: "1D", interval: "1d" },
  { key: "2y", label: "1W", interval: "1wk" },
];

function toUTCTimestamp(ts: number): number {
  return Math.floor(ts / 1000);
}

function formatPrice(price: number | null, _currency: string = "USD"): string {
  if (price == null) return "—";
  if (price >= 10000) return price.toFixed(2);
  if (price >= 100) return price.toFixed(2);
  if (price >= 1) return price.toFixed(4);
  return price.toFixed(6);
}

const TV_LIGHT = {
  background: "#FFFFFF",
  text: "#131722",
  grid: "rgba(0,0,0,0.04)",
  crosshair: "#9598A1",
  border: "#E0E3EB",
  upColor: "#26A69A",
  downColor: "#EF5350",
  upBorder: "#26A69A",
  downBorder: "#EF5350",
  upWick: "#26A69A",
  downWick: "#EF5350",
  volumeUp: "rgba(38,166,154,0.18)",
  volumeDown: "rgba(239,83,80,0.18)",
  labelBg: "#F0F3FA",
};

export function TradingChart() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartApiRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<typeof CandlestickSeries> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<typeof HistogramSeries> | null>(null);
  const chartDisposedRef = useRef(false);
  const { isPremium, setShowActivation } = usePremium();
  const { isSubscribed, toggleSubscription, loadingSymbol: notifLoadingSymbol, isSupported: notifSupported, setShowManager: setShowNotifManager } = useNotifications();

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
  const [liveCurrency, setLiveCurrency] = useState("USD");
  const [liveState, setLiveState] = useState("REGULAR");
  const [isLiveTicking, setIsLiveTicking] = useState(false);
  const liveIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const signalRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastBarDataRef = useRef<{ time: number; open: number; high: number; low: number; close: number } | null>(null);
  const latestPriceRef = useRef<number | null>(null);

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const range = RANGES[rangeIdx];

  useEffect(() => {
    if (!searchOpen) return;
    if (searchQuery.length < 1) {
      setSearchResults([]);
      return;
    }
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
    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      controller.abort();
    };
  }, [searchQuery, searchOpen]);

  useEffect(() => {
    if (searchOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
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
    setLivePrice(null);

    fetch(`${baseUrl}/api/indicator/signals/${encodeURIComponent(symbol)}?range=${range.key}&interval=${range.interval}`, { signal: controller.signal })
      .then(r => r.json())
      .then(d => {
        if (!controller.signal.aborted) {
          setData(d);
          setLoading(false);
          if (d.bars?.length) {
            const lastBar = d.bars[d.bars.length - 1];
            setLivePrice(lastBar.close);
            latestPriceRef.current = lastBar.close;
          }
        }
      })
      .catch(e => {
        if (!controller.signal.aborted) {
          setError(e.message);
          setLoading(false);
        }
      });

    return () => { controller.abort(); };
  }, [symbol, rangeIdx, refreshKey]);

  useEffect(() => {
    if (!chartRef.current || !data?.bars?.length) return;

    chartDisposedRef.current = true;
    if (chartApiRef.current) {
      try { chartApiRef.current.remove(); } catch {}
      chartApiRef.current = null;
    }
    candleSeriesRef.current = null;
    volumeSeriesRef.current = null;
    chartDisposedRef.current = false;

    const chart = createChart(chartRef.current, {
      width: chartRef.current.clientWidth,
      height: chartRef.current.clientHeight,
      layout: {
        background: { type: ColorType.Solid, color: TV_LIGHT.background },
        textColor: TV_LIGHT.text,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: TV_LIGHT.grid },
        horzLines: { color: TV_LIGHT.grid },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: TV_LIGHT.crosshair, style: LineStyle.Dashed, width: 1, labelBackgroundColor: TV_LIGHT.labelBg },
        horzLine: { color: TV_LIGHT.crosshair, style: LineStyle.Dashed, width: 1, labelBackgroundColor: TV_LIGHT.labelBg },
      },
      timeScale: {
        borderColor: TV_LIGHT.border,
        timeVisible: true,
        secondsVisible: range.interval === "1m",
        barSpacing: 8,
        minBarSpacing: 4,
      },
      rightPriceScale: {
        borderColor: TV_LIGHT.border,
      },
    });

    chartApiRef.current = chart;

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: TV_LIGHT.upColor,
      downColor: TV_LIGHT.downColor,
      borderUpColor: TV_LIGHT.upBorder,
      borderDownColor: TV_LIGHT.downBorder,
      wickUpColor: TV_LIGHT.upWick,
      wickDownColor: TV_LIGHT.downWick,
    });
    candleSeriesRef.current = candleSeries;

    const volumeSeries = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "volume",
    });
    volumeSeriesRef.current = volumeSeries;

    chart.priceScale("volume").applyOptions({
      scaleMargins: { top: 0.85, bottom: 0 },
    });

    const seen = new Set<number>();
    const dedupedBars = data.bars.filter(b => {
      const t = toUTCTimestamp(b.timestamp);
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    }).sort((a, b) => a.timestamp - b.timestamp);

    const candleData = dedupedBars.map(b => ({
      time: toUTCTimestamp(b.timestamp) as any,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
    }));

    const volumeData = dedupedBars.map(b => ({
      time: toUTCTimestamp(b.timestamp) as any,
      value: b.volume,
      color: b.close >= b.open ? TV_LIGHT.volumeUp : TV_LIGHT.volumeDown,
    }));

    try { candleSeries.setData(candleData); } catch {}
    try { volumeSeries.setData(volumeData); } catch {}

    if (candleData.length > 0) {
      const last = candleData[candleData.length - 1];
      lastBarDataRef.current = { time: last.time, open: last.open, high: last.high, low: last.low, close: last.close };
    }

    if (isPremium && data.signals?.length) {
      const markers = data.signals.map(s => ({
        time: toUTCTimestamp(s.timestamp) as any,
        position: s.type === "buy" ? "belowBar" as const : "aboveBar" as const,
        color: s.type === "buy" ? TV_LIGHT.upColor : TV_LIGHT.downColor,
        shape: s.type === "buy" ? "arrowUp" as const : "arrowDown" as const,
        text: `${s.confidence}%`,
      }));
      try {
        createSeriesMarkers(candleSeries, markers);
      } catch {
        try { (candleSeries as any).setMarkers(markers); } catch {}
      }
    }

    const visibleBars = Math.min(dedupedBars.length, 80);
    if (dedupedBars.length > visibleBars) {
      const from = candleData[dedupedBars.length - visibleBars].time;
      const to = candleData[dedupedBars.length - 1].time;
      try { chart.timeScale().setVisibleRange({ from, to } as any); } catch {}
    } else {
      try { chart.timeScale().fitContent(); } catch {}
    }

    const handleResize = () => {
      if (chartRef.current && chartApiRef.current && !chartDisposedRef.current) {
        try {
          chart.applyOptions({
            width: chartRef.current.clientWidth,
            height: chartRef.current.clientHeight,
          });
        } catch {}
      }
    };

    const observer = new ResizeObserver(handleResize);
    observer.observe(chartRef.current);

    return () => {
      chartDisposedRef.current = true;
      observer.disconnect();
      try { chart.remove(); } catch {}
      if (chartApiRef.current === chart) {
        chartApiRef.current = null;
      }
      candleSeriesRef.current = null;
      volumeSeriesRef.current = null;
    };
  }, [data]);

  useEffect(() => {
    if (!data?.bars?.length) {
      setIsLiveTicking(false);
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
      return;
    }

    setIsLiveTicking(true);
    let disposed = false;

    const applyPriceUpdate = (price: number) => {
      if (disposed || chartDisposedRef.current || !candleSeriesRef.current || !lastBarDataRef.current) return;
      try {
        const lastBar = lastBarDataRef.current;
        const updatedBar = {
          time: lastBar.time as any,
          open: lastBar.open,
          high: Math.max(lastBar.high, price),
          low: Math.min(lastBar.low, price),
          close: price,
        };
        lastBarDataRef.current = { ...updatedBar };
        candleSeriesRef.current.update(updatedBar);
      } catch {}
    };

    const fetchTick = async () => {
      if (disposed || chartDisposedRef.current) return;
      try {
        const resp = await fetch(`${baseUrl}/api/indicator/quote/${encodeURIComponent(symbol)}`);
        if (!resp.ok || disposed) return;
        const quote: QuoteData = await resp.json();
        if (quote.price == null || disposed) return;

        latestPriceRef.current = quote.price;
        setLivePrice(quote.price);
        setLiveChange(quote.change);
        setLiveChangePercent(quote.changePercent);
        setLiveCurrency(quote.currency);
        setLiveState(quote.marketState);

        applyPriceUpdate(quote.price);
      } catch {}
    };

    fetchTick();
    liveIntervalRef.current = setInterval(fetchTick, 1500);

    return () => {
      disposed = true;
      if (liveIntervalRef.current) {
        clearInterval(liveIntervalRef.current);
        liveIntervalRef.current = null;
      }
    };
  }, [symbol, data]);

  useEffect(() => {
    if (signalRefreshRef.current) {
      clearInterval(signalRefreshRef.current);
      signalRefreshRef.current = null;
    }

    if (!isPremium) return;
    signalRefreshRef.current = setInterval(() => {
      setRefreshKey(k => k + 1);
    }, 2 * 60 * 1000);

    return () => {
      if (signalRefreshRef.current) {
        clearInterval(signalRefreshRef.current);
        signalRefreshRef.current = null;
      }
    };
  }, [symbol, rangeIdx]);

  const lastSignal = data?.signals?.length ? data.signals[data.signals.length - 1] : null;

  const handleRefresh = () => {
    setRefreshKey(k => k + 1);
  };

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
              <span className="text-[#131722] font-mono text-sm font-bold tabular-nums shrink-0">{formatPrice(livePrice, liveCurrency)}</span>
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
              title="Refresh chart data"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} />
            </button>

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

            {isPremium && notifSupported && (
              <button
                onClick={() => toggleSubscription(symbol, symbolLabel)}
                disabled={notifLoadingSymbol === symbol}
                title={isSubscribed(symbol) ? "Unsubscribe from signal notifications" : "Subscribe to signal notifications"}
                className={`flex items-center gap-1 rounded-lg px-2 py-1.5 transition-all border ${
                  isSubscribed(symbol)
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
            )}
          </div>
        </div>

        <div className="flex px-3 pb-2 overflow-x-auto scrollbar-hide">
          <div className="flex gap-1 bg-[#F0F3FA] rounded-lg p-0.5 min-w-0">
            {RANGES.map((r, idx) => (
              <button
                key={`${r.label}-${idx}`}
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
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
            <div className="flex flex-col items-center gap-3">
              <div className="w-8 h-8 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin" />
              <span className="text-[#9598A1] text-xs">Loading {symbolLabel}...</span>
            </div>
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center bg-white z-10">
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
        <div ref={chartRef} className="w-full h-full" />

        {!isPremium && !loading && (
          <div className="absolute bottom-3 left-3 right-3 lg:left-auto lg:right-3 lg:w-72">
            <div className="bg-white/95 backdrop-blur-xl border border-[#FFB300]/30 rounded-2xl p-3 shadow-lg">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#FFB300] to-[#FF8F00] flex items-center justify-center">
                  <Lock className="w-3 h-3 text-white" />
                </div>
                <span className="text-[11px] font-bold text-[#FF8F00]">GlobalPulse Pro</span>
              </div>
              <p className="text-[9px] text-[#9598A1] mb-2">
                Real-time live ticking + AI signals with multi-indicator confirmation
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
              <span className={`text-[10px] font-bold ${lastSignal.confidence >= 80 ? "text-[#26A69A]" : lastSignal.confidence >= 70 ? "text-[#FF9800]" : "text-[#9598A1]"}`}>
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
