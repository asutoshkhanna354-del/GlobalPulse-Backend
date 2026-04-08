import { useEffect, useRef, useState, useCallback } from "react";
import {
  TrendingUp, TrendingDown, ShieldCheck, X,
  ChevronLeft, Zap, Crown, Lock, GripHorizontal,
} from "lucide-react";
import { usePremium } from "@/contexts/PremiumContext";

// ─── Shared types ─────────────────────────────────────────────────────────────
interface HoldingTerm { label: "SCALP"|"INTRADAY"|"SWING"|"POSITION"; timeRange: string; description: string; }
interface Signal { timestamp: number; type: "buy"|"sell"; price: number; confidence: number; stopLoss: number; takeProfit: number; riskReward: number; holdingTerm?: HoldingTerm; }
interface IndicatorData { bars: any[]; signals: Signal[]; marketMode: string; strength: number; drsi: number[]; signalLine: number[]; aiAnalysis?: string; }

// ─── Constants ────────────────────────────────────────────────────────────────
export const FOREX_SYMBOLS = new Set([
  "XAUUSD","XAGUSD","EURUSD","GBPUSD","USDJPY",
  "USDCHF","AUDUSD","USDCAD","NZDUSD","EURJPY",
  "EURGBP","GBPJPY","EURAUD","EURCAD","EURCHF",
  "GBPAUD","GBPCAD","GBPCHF","AUDCAD","AUDCHF",
  "AUDJPY","AUDNZD","CADJPY","CHFJPY","NZDJPY",
]);

const FOREX_TV_MAP: Record<string,string> = {
  XAUUSD:"OANDA:XAUUSD", XAGUSD:"OANDA:XAGUSD",
  EURUSD:"OANDA:EURUSD", GBPUSD:"OANDA:GBPUSD",
  USDJPY:"OANDA:USDJPY", USDCHF:"OANDA:USDCHF",
  AUDUSD:"OANDA:AUDUSD", USDCAD:"OANDA:USDCAD",
  NZDUSD:"OANDA:NZDUSD", EURJPY:"OANDA:EURJPY",
  EURGBP:"OANDA:EURGBP", GBPJPY:"OANDA:GBPJPY",
  EURAUD:"OANDA:EURAUD", EURCAD:"OANDA:EURCAD",
  EURCHF:"OANDA:EURCHF", GBPAUD:"OANDA:GBPAUD",
  GBPCAD:"OANDA:GBPCAD", GBPCHF:"OANDA:GBPCHF",
  AUDCAD:"OANDA:AUDCAD", AUDCHF:"OANDA:AUDCHF",
  AUDJPY:"OANDA:AUDJPY", AUDNZD:"OANDA:AUDNZD",
  CADJPY:"OANDA:CADJPY", CHFJPY:"OANDA:CHFJPY",
  NZDJPY:"OANDA:NZDJPY",
};

const TERM_STYLE: Record<string,{bg:string;text:string;dot:string;border:string}> = {
  SCALP:    { bg:"bg-purple-50",  text:"text-purple-700",  dot:"bg-purple-400",  border:"border-purple-200" },
  INTRADAY: { bg:"bg-amber-50",   text:"text-amber-700",   dot:"bg-amber-400",   border:"border-amber-200"  },
  SWING:    { bg:"bg-blue-50",    text:"text-blue-700",    dot:"bg-blue-400",    border:"border-blue-200"   },
  POSITION: { bg:"bg-teal-50",    text:"text-teal-700",    dot:"bg-teal-500",    border:"border-teal-200"   },
};

function uid() { return Math.random().toString(36).slice(2,9); }
function fmtP(p: number|null, cur?: string): string {
  if (p==null) return "—";
  const px = cur==="INR" ? "₹" : "";
  return px + (p>=10000?p.toFixed(2):p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toFixed(6));
}
function fmtTime(ts: number): string {
  return new Date(ts).toLocaleString("en-IN",{
    timeZone:"Asia/Kolkata", day:"numeric", month:"short",
    hour:"2-digit", minute:"2-digit", hour12: false,
  });
}
function fmtTimeFull(ts: number): string {
  return new Date(ts).toLocaleString("en-IN",{
    timeZone:"Asia/Kolkata", day:"numeric", month:"short", year:"numeric",
    hour:"2-digit", minute:"2-digit", hour12: false,
  });
}

// ─── Signal Detail Card ───────────────────────────────────────────────────────
function SignalDetailCard({ signal, currency, onBack }: { signal: Signal; currency?: string; onBack?: () => void }) {
  const buy = signal.type === "buy";
  const pf  = (v: number) => fmtP(v, currency);
  const ht  = signal.holdingTerm;
  const ts  = ht ? TERM_STYLE[ht.label] ?? TERM_STYLE.SWING : null;

  return (
    <div className="flex flex-col">
      {/* back button */}
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 px-3 py-1.5 text-[10px] text-[#9598A1] hover:text-[#131722] border-b border-[#E0E3EB] transition-colors">
          <ChevronLeft className="w-3 h-3"/> Back to all signals
        </button>
      )}

      {/* header */}
      <div className={`flex items-center justify-between px-3 py-2.5 ${buy?"bg-emerald-500":"bg-red-500"}`}>
        <div className="flex items-center gap-1.5 text-white font-bold text-[11px]">
          {buy ? <TrendingUp className="w-3.5 h-3.5"/> : <TrendingDown className="w-3.5 h-3.5"/>}
          {buy ? "LONG Signal" : "SHORT Signal"}
        </div>
        <span className="text-white/80 text-[9px] font-mono">{fmtTimeFull(signal.timestamp)}</span>
      </div>

      <div className="px-3 py-3 flex flex-col gap-2.5">
        {/* confidence bar */}
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-[#9598A1]">Confidence</span>
            <span className={`text-[12px] font-bold ${signal.confidence>=85?"text-emerald-600":signal.confidence>=72?"text-amber-500":"text-slate-500"}`}>
              {signal.confidence}%
            </span>
          </div>
          <div className="w-full bg-[#F0F3FA] rounded-full h-1.5">
            <div className={`h-1.5 rounded-full transition-all ${signal.confidence>=85?"bg-emerald-500":signal.confidence>=72?"bg-amber-400":"bg-slate-400"}`}
              style={{width:`${signal.confidence}%`}}/>
          </div>
        </div>

        {/* holding term */}
        {ht && ts && (
          <div className={`rounded-xl px-2.5 py-2 ${ts.bg} border ${ts.border} flex flex-col gap-1`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className={`w-2 h-2 rounded-full ${ts.dot}`}/>
                <span className={`text-[11px] font-extrabold tracking-wide ${ts.text}`}>{ht.label}</span>
              </div>
              <span className={`text-[10px] font-mono font-bold ${ts.text} opacity-80`}>{ht.timeRange}</span>
            </div>
            <p className={`text-[9.5px] leading-[1.45] ${ts.text} opacity-75`}>{ht.description}</p>
          </div>
        )}

        {/* price levels */}
        <div className="flex flex-col gap-1.5 pt-0.5 border-t border-[#F0F3FA]">
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
        </div>

        {/* direction summary */}
        <div className={`rounded-lg px-2.5 py-2 text-[9.5px] leading-snug ${buy?"bg-emerald-50 text-emerald-700":"bg-red-50 text-red-700"}`}>
          {buy
            ? `Go LONG at ${pf(signal.price)}. Exit if price closes below ${pf(signal.stopLoss)}. Target ${pf(signal.takeProfit)}.`
            : `Go SHORT at ${pf(signal.price)}. Exit if price closes above ${pf(signal.stopLoss)}. Target ${pf(signal.takeProfit)}.`}
        </div>

        {/* footer */}
        <div className="flex justify-between items-center pt-0.5 border-t border-[#F0F3FA]">
          <span className="text-[#FF9800] text-[10px] font-bold">Risk:Reward 1:{signal.riskReward.toFixed(1)}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Signal List Item ─────────────────────────────────────────────────────────
function SignalListItem({ signal, currency, onClick, isSelected }: {
  signal: Signal; currency?: string; onClick: () => void; isSelected: boolean;
}) {
  const buy = signal.type === "buy";
  const ht  = signal.holdingTerm;
  const ts  = ht ? TERM_STYLE[ht.label] ?? TERM_STYLE.SWING : null;

  return (
    <button onClick={onClick}
      className={`w-full text-left px-3 py-2.5 border-b border-[#F0F3FA] transition-all hover:bg-[#F8F9FC] ${isSelected?"bg-[#EEF2FF] border-l-2 border-l-[#2962FF]":"border-l-2 border-l-transparent"}`}>
      <div className="flex items-center justify-between mb-1">
        <div className={`flex items-center gap-1 text-[10px] font-extrabold ${buy?"text-emerald-600":"text-red-500"}`}>
          {buy ? <TrendingUp className="w-3 h-3"/> : <TrendingDown className="w-3 h-3"/>}
          {buy ? "LONG" : "SHORT"}
        </div>
        <div className="flex items-center gap-0.5">
          <ShieldCheck className="w-2.5 h-2.5 text-[#9598A1]"/>
          <span className={`text-[10px] font-bold ${signal.confidence>=85?"text-emerald-600":signal.confidence>=72?"text-amber-500":"text-slate-400"}`}>
            {signal.confidence}%
          </span>
        </div>
      </div>

      {ht && ts && (
        <div className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-bold mb-1 ${ts.bg} ${ts.text}`}>
          <div className={`w-1.5 h-1.5 rounded-full ${ts.dot}`}/>
          {ht.label} · {ht.timeRange}
        </div>
      )}

      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] font-bold text-[#131722]">{fmtP(signal.price, currency)}</span>
        <span className="text-[9px] text-[#9598A1]">{fmtTime(signal.timestamp)}</span>
      </div>
    </button>
  );
}

// ─── ForexTVPanel ─────────────────────────────────────────────────────────────
interface Props {
  symbol: string;
  symLabel: string;
  rangeIdx: number;
  ranges: Array<{ label: string; tvI: string; yRange: string; yInt: string; barMs: number; }>;
  currency?: string;
  baseUrl: string;
  aiAnalysis?: string;
}

const SNAP_COLLAPSED = 52;
const SNAP_HALF      = 240;
const snapFull = () => Math.round(window.innerHeight * 0.68);

export function ForexTVPanel({ symbol, symLabel, rangeIdx, ranges, currency, baseUrl, aiAnalysis }: Props) {
  const { isPremium, setShowActivation } = usePremium();

  const tvRef  = useRef<HTMLDivElement>(null);
  const uidRef = useRef<string>(uid());

  const [signals,    setSignals]    = useState<Signal[]>([]);
  const [sigLoading, setSigLoading] = useState(false);
  const [sigView,    setSigView]    = useState<"latest"|"all">("latest");
  const [selSig,     setSelSig]     = useState<Signal|null>(null);
  const [panelOpen,  setPanelOpen]  = useState(false);

  // Mobile bottom-sheet state
  const [isMobile,    setIsMobile]    = useState(false);
  const [sheetHeight, setSheetHeight] = useState(SNAP_COLLAPSED);
  const dragStartY  = useRef<number|null>(null);
  const dragStartH  = useRef<number>(SNAP_COLLAPSED);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const snapSheet = useCallback((h: number) => {
    const full = snapFull();
    const snaps = [SNAP_COLLAPSED, SNAP_HALF, full];
    const closest = snaps.reduce((a,b) => Math.abs(a-h) < Math.abs(b-h) ? a : b);
    setSheetHeight(closest);
    if (closest > SNAP_COLLAPSED) setPanelOpen(true);
    else setPanelOpen(false);
  }, []);

  const onHandleTouchStart = useCallback((e: React.TouchEvent) => {
    dragStartY.current  = e.touches[0].clientY;
    dragStartH.current  = sheetHeight;
  }, [sheetHeight]);

  const onHandleTouchMove = useCallback((e: React.TouchEvent) => {
    if (dragStartY.current === null) return;
    const dy = dragStartY.current - e.touches[0].clientY;
    const full = snapFull();
    const newH = Math.max(SNAP_COLLAPSED, Math.min(full, dragStartH.current + dy));
    setSheetHeight(newH);
    if (newH > SNAP_COLLAPSED) setPanelOpen(true);
  }, []);

  const onHandleTouchEnd = useCallback(() => {
    dragStartY.current = null;
    snapSheet(sheetHeight);
  }, [sheetHeight, snapSheet]);

  const hasFetchedRef = useRef(false);
  const range = ranges[rangeIdx];

  // ── Fetch signals (lazy — only when panel is opened) ─────────────────────────
  const fetchSignals = useCallback(async () => {
    if (!isPremium) return;
    hasFetchedRef.current = true;
    setSigLoading(true);
    try {
      const url = `${baseUrl}/api/indicator/signals/${encodeURIComponent(symbol)}?range=${range.yRange}&interval=${range.yInt}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("fetch failed");
      const d: IndicatorData = await res.json();
      const sigs = (d.signals ?? []).slice().reverse();
      setSignals(sigs);
      setSelSig(sigs.length ? sigs[0] : null);
    } catch { setSignals([]); } finally { setSigLoading(false); }
  }, [symbol, range.yRange, range.yInt, isPremium, baseUrl]);

  // Trigger fetch only when panel is first opened
  useEffect(() => {
    if (panelOpen && !hasFetchedRef.current) fetchSignals();
  }, [panelOpen, fetchSignals]);

  // Reset fetch flag when symbol or range changes so re-open refetches
  useEffect(() => {
    hasFetchedRef.current = false;
    setSignals([]);
    setSelSig(null);
    setSigView("latest");
  }, [symbol, rangeIdx]);

  // ── TradingView widget ───────────────────────────────────────────────────────
  useEffect(() => {
    const container = tvRef.current;
    if (!container) return;

    container.innerHTML = "";
    uidRef.current = uid();

    const chartDivId = `tv_${uidRef.current}`;
    const wrapper = document.createElement("div");
    wrapper.style.cssText = "height:100%;width:100%;";

    const chartDiv = document.createElement("div");
    chartDiv.id = chartDivId;
    chartDiv.style.cssText = "height:100%;width:100%;";
    wrapper.appendChild(chartDiv);
    container.appendChild(wrapper);

    const tvSym = FOREX_TV_MAP[symbol.toUpperCase()] ?? symbol;

    const mountWidget = () => {
      const TV = (window as any).TradingView;
      if (!TV) return;
      new TV.widget({
        autosize: true,
        symbol: tvSym,
        interval: range.tvI,
        container_id: chartDivId,
        library_path: "https://s3.tradingview.com/charting_library/",
        theme: "light",
        style: "1",
        locale: "en",
        toolbar_bg: "#F0F3FA",
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        withdateranges: true,
        allow_symbol_change: false,
        calendar: false,
        studies: [],
        show_popup_button: false,
        popup_width: "1000",
        popup_height: "650",
      });
    };

    if ((window as any).TradingView) {
      mountWidget();
    } else {
      const existing = document.getElementById("tv-script");
      if (!existing) {
        const script = document.createElement("script");
        script.id = "tv-script";
        script.src = "https://s3.tradingview.com/tv.js";
        script.async = true;
        script.onload = mountWidget;
        document.head.appendChild(script);
      } else {
        const poll = setInterval(() => {
          if ((window as any).TradingView) { clearInterval(poll); mountWidget(); }
        }, 100);
        return () => clearInterval(poll);
      }
    }

    return () => { container.innerHTML = ""; };
  }, [symbol, range.tvI]);

  // ── Render ───────────────────────────────────────────────────────────────────
  const latestSig = signals[0] ?? null;

  // ── Shared signals body (reused in both desktop panel and mobile sheet) ──────
  const SignalsBody = (
    <>
      {!isPremium ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-3 px-4 py-6 text-center">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FFB300] to-[#FF8F00] flex items-center justify-center shadow-md">
            <Crown className="w-5 h-5 text-white"/>
          </div>
          <p className="text-[10px] text-[#9598A1] leading-relaxed">
            AI-powered buy/sell signals with entry, stop loss, take profit and holding term guidance.
          </p>
          <button onClick={() => setShowActivation(true)}
            className="bg-gradient-to-r from-[#FFB300] to-[#FF8F00] text-white text-[10px] font-bold px-4 py-2 rounded-xl hover:from-[#FFC107] hover:to-[#FF9800] transition-all shadow-sm">
            Activate Pro
          </button>
        </div>
      ) : sigLoading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin"/>
            <span className="text-[10px] text-[#9598A1]">Loading signals...</span>
          </div>
        </div>
      ) : signals.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center px-4">
          <span className="text-2xl">📊</span>
          <p className="text-[10px] text-[#9598A1]">No signals for this timeframe yet.</p>
        </div>
      ) : sigView === "latest" ? (
        <div className="flex-1 overflow-y-auto">
          {latestSig && <SignalDetailCard signal={latestSig} currency={currency}/>}
          {aiAnalysis && (
            <div className="mx-3 mb-3 rounded-xl bg-[#EEF2FF] border border-[#2962FF]/20 px-3 py-2">
              <div className="flex items-center gap-1 mb-1">
                <Zap className="w-3 h-3 text-[#2962FF]"/>
                <span className="text-[9px] font-bold text-[#2962FF]">AI Analysis</span>
              </div>
              <p className="text-[9.5px] text-[#2962FF]/80 leading-relaxed">{aiAnalysis}</p>
            </div>
          )}
          {signals.length > 1 && (
            <button onClick={() => setSigView("all")}
              className="w-full py-2 text-[10px] text-[#2962FF] font-semibold hover:bg-[#EEF2FF] border-t border-[#F0F3FA] transition-all">
              View all {signals.length} signals →
            </button>
          )}
        </div>
      ) : (
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {selSig && (
            <div className="border-b border-[#E0E3EB] overflow-y-auto max-h-[55%]">
              <SignalDetailCard signal={selSig} currency={currency} onBack={() => setSelSig(null)}/>
            </div>
          )}
          <div className="flex-1 overflow-y-auto">
            {signals.map((sig) => (
              <SignalListItem
                key={sig.timestamp}
                signal={sig}
                currency={currency}
                isSelected={selSig?.timestamp === sig.timestamp}
                onClick={() => setSelSig(s => s?.timestamp === sig.timestamp ? null : sig)}
              />
            ))}
          </div>
        </div>
      )}
      {isPremium && !sigLoading && signals.length > 0 && sigView === "all" && aiAnalysis && (
        <div className="border-t border-[#E0E3EB] px-3 py-2 bg-[#F8F9FC]">
          <div className="flex items-center gap-1 mb-0.5">
            <Zap className="w-3 h-3 text-[#2962FF]"/>
            <span className="text-[9px] font-bold text-[#2962FF]">AI Analysis</span>
          </div>
          <p className="text-[9px] text-[#9598A1] leading-relaxed line-clamp-2">{aiAnalysis}</p>
        </div>
      )}
    </>
  );

  // ── Shared panel header ───────────────────────────────────────────────────────
  const PanelHeader = ({ onClose }: { onClose?: () => void }) => (
    <div className="flex items-center justify-between px-3 py-2 border-b border-[#E0E3EB] bg-[#F8F9FC]">
      <div className="flex items-center gap-1.5">
        <Zap className="w-3.5 h-3.5 text-[#2962FF]"/>
        <span className="text-[11px] font-bold text-[#131722]">AI Signals</span>
        {signals.length > 0 && (
          <span className="bg-[#2962FF] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
            {signals.length}
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {isPremium && (
          <div className="flex items-center bg-[#F0F3FA] rounded-lg p-0.5">
            <button onClick={() => setSigView("latest")}
              className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${sigView==="latest"?"bg-[#2962FF] text-white":"text-[#9598A1] hover:text-[#131722]"}`}>
              Latest
            </button>
            <button onClick={() => setSigView("all")}
              className={`px-2 py-1 text-[9px] font-bold rounded-md transition-all ${sigView==="all"?"bg-[#2962FF] text-white":"text-[#9598A1] hover:text-[#131722]"}`}>
              All
            </button>
          </div>
        )}
        {onClose && (
          <button onClick={onClose}
            className="text-[#9598A1] hover:text-[#131722] p-0.5 rounded transition-all" title="Hide panel">
            <X className="w-3.5 h-3.5"/>
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="flex-1 flex min-h-0 relative">
      {/* ── TradingView chart ── */}
      <div className="flex-1 relative min-h-0" style={isMobile && sheetHeight > SNAP_COLLAPSED ? {paddingBottom: sheetHeight} : undefined}>
        <div ref={tvRef} className="absolute inset-0"/>
        {!isPremium && !isMobile && (
          <div className="absolute bottom-3 left-3 z-10 w-64">
            <div className="bg-white/95 backdrop-blur-xl border border-[#FFB300]/30 rounded-2xl p-3 shadow-lg">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#FFB300] to-[#FF8F00] flex items-center justify-center">
                  <Lock className="w-3 h-3 text-white"/>
                </div>
                <span className="text-[11px] font-bold text-[#FF8F00]">GlobalPulse Pro</span>
              </div>
              <p className="text-[9px] text-[#9598A1] mb-2">
                Unlock AI signal analysis with entry, stop loss, take profit & holding guidance.
              </p>
              <button onClick={() => setShowActivation(true)}
                className="w-full bg-gradient-to-r from-[#FFB300] to-[#FF8F00] text-white text-[10px] font-bold py-1.5 rounded-lg hover:from-[#FFC107] hover:to-[#FF9800] transition-all">
                Activate Key
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ══ DESKTOP / TABLET — right-side slide-in panel ══ */}
      {!isMobile && (
        <>
          {!panelOpen && isPremium && (
            <button
              onClick={() => setPanelOpen(true)}
              className="absolute right-0 top-1/2 -translate-y-1/2 z-20 bg-white border border-[#E0E3EB] border-r-0 rounded-l-xl px-1.5 py-3 shadow-md hover:bg-[#F0F3FA] transition-all flex flex-col items-center gap-1"
              title="Show signals panel">
              <ChevronLeft className="w-3 h-3 text-[#2962FF] rotate-180"/>
              <span className="text-[8px] font-bold text-[#2962FF] [writing-mode:vertical-lr]">SIGNALS</span>
            </button>
          )}
          {panelOpen && (
            <div className="w-[260px] shrink-0 border-l border-[#E0E3EB] flex flex-col bg-white">
              <PanelHeader onClose={() => setPanelOpen(false)}/>
              <div className="flex flex-col flex-1 min-h-0 overflow-hidden">{SignalsBody}</div>
            </div>
          )}
        </>
      )}

      {/* ══ MOBILE — draggable bottom sheet ══ */}
      {isMobile && (
        <div
          className="absolute bottom-0 left-0 right-0 z-30 bg-white rounded-t-2xl shadow-2xl border-t border-[#E0E3EB] flex flex-col overflow-hidden"
          style={{ height: sheetHeight, transition: dragStartY.current !== null ? "none" : "height 0.3s cubic-bezier(0.32,0.72,0,1)" }}>

          {/* drag handle bar */}
          <div
            className="flex flex-col items-center pt-2 pb-1 cursor-grab active:cursor-grabbing shrink-0 select-none touch-none"
            onTouchStart={onHandleTouchStart}
            onTouchMove={onHandleTouchMove}
            onTouchEnd={onHandleTouchEnd}>
            <div className="w-9 h-1 bg-[#D1D4DC] rounded-full mb-1.5"/>
            <div className="flex items-center gap-1.5 w-full px-3 justify-between">
              <div className="flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5 text-[#2962FF]"/>
                <span className="text-[11px] font-bold text-[#131722]">AI Signals</span>
                {signals.length > 0 && (
                  <span className="bg-[#2962FF] text-white text-[8px] font-bold px-1.5 py-0.5 rounded-full">
                    {signals.length}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {isPremium && sheetHeight > SNAP_COLLAPSED + 10 && (
                  <div className="flex items-center bg-[#F0F3FA] rounded-lg p-0.5">
                    <button onClick={() => setSigView("latest")}
                      className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${sigView==="latest"?"bg-[#2962FF] text-white":"text-[#9598A1]"}`}>
                      Latest
                    </button>
                    <button onClick={() => setSigView("all")}
                      className={`px-2 py-0.5 text-[9px] font-bold rounded-md transition-all ${sigView==="all"?"bg-[#2962FF] text-white":"text-[#9598A1]"}`}>
                      All
                    </button>
                  </div>
                )}
                <GripHorizontal className="w-4 h-4 text-[#D1D4DC]"/>
              </div>
            </div>
          </div>

          {/* sheet content — only visible when expanded enough */}
          {sheetHeight > SNAP_COLLAPSED + 10 && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden border-t border-[#F0F3FA]">
              {SignalsBody}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
