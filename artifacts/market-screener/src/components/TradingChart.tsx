import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart, type IChartApi, type ISeriesApi,
  ColorType, CrosshairMode, LineStyle,
  CandlestickSeries, HistogramSeries, LineSeries, createSeriesMarkers,
} from "lightweight-charts";
import { usePremium } from "@/contexts/PremiumContext";
import { useNotifications } from "@/contexts/NotificationContext";
import { usePriceStream } from "@/hooks/usePriceStream";
import {
  Crown, TrendingUp, TrendingDown, Lock, AlertTriangle,
  ShieldCheck, RefreshCw, Search, X, Zap, Radio,
  Bell, BellOff, Loader2, ExternalLink, Minus, TrendingUp as TLIcon,
  Square, MousePointer, Trash2,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────
interface OHLCBar { timestamp: number; open: number; high: number; low: number; close: number; volume: number; }
interface Signal { timestamp: number; type: "buy" | "sell"; price: number; confidence: number; stopLoss: number; takeProfit: number; riskReward: number; }
interface IndicatorData { bars: OHLCBar[]; signals: Signal[]; marketMode: string; strength: number; drsi: number[]; signalLine: number[]; aiAnalysis?: string; }
interface SearchResult { symbol: string; name: string; type: string; exchange: string; }
interface QuoteData { price: number | null; prevClose: number | null; change: number | null; changePercent: number | null; currency: string; marketState: string; name: string; lastBar?: any; }

type DrawTool = "cursor" | "hline" | "trendline" | "rect";
interface HLineDrawing { id: string; kind: "hline"; price: number; color: string; }
interface TLDrawing    { id: string; kind: "trendline"; t1: number; p1: number; t2: number; p2: number; color: string; }
interface RectDrawing  { id: string; kind: "rect"; t1: number; p1: number; t2: number; p2: number; color: string; }
type Drawing = HLineDrawing | TLDrawing | RectDrawing;
interface InProg { t1: number; p1: number; cx1: number; cy1: number; t2?: number; p2?: number; cx2?: number; cy2?: number; }

// ─── Constants ───────────────────────────────────────────────────────────────
const POPULAR = [
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
  { label: "1m",  tvI: "1",   yRange: "1d",  yInt: "1m",  barMs: 60_000 },
  { label: "5m",  tvI: "5",   yRange: "5d",  yInt: "5m",  barMs: 300_000 },
  { label: "15m", tvI: "15",  yRange: "1mo", yInt: "15m", barMs: 900_000 },
  { label: "30m", tvI: "30",  yRange: "1mo", yInt: "30m", barMs: 1_800_000 },
  { label: "1H",  tvI: "60",  yRange: "3mo", yInt: "1h",  barMs: 3_600_000 },
  { label: "4H",  tvI: "240", yRange: "6mo", yInt: "1h",  barMs: 14_400_000 },
  { label: "1D",  tvI: "D",   yRange: "1y",  yInt: "1d",  barMs: 86_400_000 },
  { label: "1W",  tvI: "W",   yRange: "2y",  yInt: "1wk", barMs: 604_800_000 },
];

const TV_SYMBOL_MAP: Record<string, string> = {
  XAUUSD:"OANDA:XAUUSD", XAGUSD:"OANDA:XAGUSD", EURUSD:"OANDA:EURUSD", GBPUSD:"OANDA:GBPUSD",
  USDJPY:"OANDA:USDJPY", USOIL:"NYMEX:CL1!", BTCUSD:"COINBASE:BTCUSD", ETHUSD:"COINBASE:ETHUSD",
  SOLUSD:"COINBASE:SOLUSD", SPX:"SP:SPX", NDX:"NASDAQ:NDX", DJI:"DJ:DJI",
  DAX:"XETR:DAX", NIFTY50:"NSE:NIFTY50", SENSEX:"BSE:SENSEX", VIX:"CBOE:VIX",
};
function toTVLink(sym: string) {
  const u = sym.toUpperCase();
  const tv = TV_SYMBOL_MAP[u] ?? (sym.endsWith(".NS") ? `NSE:${sym.replace(".NS","")}` : sym.endsWith(".BO") ? `BSE:${sym.replace(".BO","")}` : sym);
  return `https://www.tradingview.com/chart/?symbol=${encodeURIComponent(tv)}`;
}

const C = {
  bg:"#FFFFFF", text:"#131722", grid:"rgba(0,0,0,0.04)", xhair:"#9598A1",
  border:"#E0E3EB", lbg:"#F0F3FA",
  up:"#26A69A", dn:"#EF5350", vUp:"rgba(38,166,154,0.18)", vDn:"rgba(239,83,80,0.18)",
};

// ─── Math helpers ─────────────────────────────────────────────────────────────
function calcEMA(vals: number[], p: number): (number|null)[] {
  if (vals.length < p) return vals.map(()=>null);
  const k = 2/(p+1), res: (number|null)[] = Array(p-1).fill(null);
  let ema = vals.slice(0,p).reduce((a,b)=>a+b)/p; res.push(ema);
  for (let i=p; i<vals.length; i++) { ema = vals[i]*k+ema*(1-k); res.push(ema); }
  return res;
}
function calcSMA(vals: number[], p: number): (number|null)[] {
  return vals.map((_,i)=>i<p-1?null:vals.slice(i-p+1,i+1).reduce((a,b)=>a+b)/p);
}
function calcRSI(vals: number[], p=14): (number|null)[] {
  if (vals.length<=p) return vals.map(()=>null);
  const res: (number|null)[] = Array(p).fill(null);
  let ag=0,al=0;
  for (let i=1;i<=p;i++){const d=vals[i]-vals[i-1];d>0?ag+=d:al-=d;}
  ag/=p;al/=p;
  res.push(al===0?100:100-100/(1+ag/al));
  for (let i=p+1;i<vals.length;i++){
    const d=vals[i]-vals[i-1],g=d>0?d:0,l=d<0?-d:0;
    ag=(ag*(p-1)+g)/p;al=(al*(p-1)+l)/p;
    res.push(al===0?100:100-100/(1+ag/al));
  }
  return res;
}

// ─── Formatters ───────────────────────────────────────────────────────────────
function fmtP(p:number|null, cur?:string):string {
  if (p==null)return"—";
  const px=cur==="INR"?"₹":"";
  return px+(p>=10000?p.toFixed(2):p>=100?p.toFixed(2):p>=1?p.toFixed(4):p.toFixed(6));
}
function fmtTime(ts:number):string {
  return new Date(ts).toLocaleString("en-IN",{timeZone:"Asia/Kolkata",day:"numeric",month:"short",hour:"2-digit",minute:"2-digit",hour12:false});
}
function uid():string { return Math.random().toString(36).slice(2,9); }
function s2ms(ts:number){ return Math.floor(ts/1000); }

// ─── Signal Popup ──────────────────────────────────────────────────────────────
function SignalPopup({signal,currency,onClose}:{signal:Signal;currency?:string;onClose:()=>void}) {
  const buy=signal.type==="buy";
  const pf=(v:number)=>fmtP(v,currency);
  return (
    <div className="absolute top-14 right-3 z-50 w-52 rounded-2xl shadow-2xl border border-white/50 overflow-hidden bg-white"
      style={{boxShadow:"0 8px 40px rgba(0,0,0,0.22)"}}>
      <div className={`flex items-center justify-between px-3 py-2.5 ${buy?"bg-emerald-500":"bg-red-500"}`}>
        <div className="flex items-center gap-1.5 text-white font-bold text-[12px]">
          {buy?<TrendingUp className="w-4 h-4"/>:<TrendingDown className="w-4 h-4"/>}
          {buy?"BUY Signal":"SELL Signal"}
        </div>
        <button onClick={onClose} className="text-white/80 hover:text-white"><X className="w-3.5 h-3.5"/></button>
      </div>
      <div className="px-3 py-3 flex flex-col gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex justify-between items-center">
            <span className="text-[10px] text-[#9598A1]">Confidence</span>
            <span className={`text-[13px] font-bold ${signal.confidence>=85?"text-emerald-600":signal.confidence>=72?"text-amber-500":"text-slate-500"}`}>{signal.confidence}%</span>
          </div>
          <div className="w-full bg-[#F0F3FA] rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${signal.confidence>=85?"bg-emerald-500":signal.confidence>=72?"bg-amber-400":"bg-slate-400"}`} style={{width:`${signal.confidence}%`}}/>
          </div>
        </div>
        <div className="flex flex-col gap-1.5 pt-1 border-t border-[#F0F3FA]">
          <div className="flex justify-between text-[11px]"><span className="text-[#9598A1]">Entry</span><span className="font-mono font-bold text-[#131722]">{pf(signal.price)}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-[#EF5350]">Stop Loss</span><span className="font-mono font-bold text-[#EF5350]">{pf(signal.stopLoss)}</span></div>
          <div className="flex justify-between text-[11px]"><span className="text-[#26A69A]">Take Profit</span><span className="font-mono font-bold text-[#26A69A]">{pf(signal.takeProfit)}</span></div>
          <div className="flex justify-between items-center text-[11px] pt-1.5 border-t border-[#F0F3FA]">
            <span className="text-[#FF9800] font-bold">RR 1:{signal.riskReward.toFixed(1)}</span>
            <span className="text-[#9598A1] text-[9px] font-mono">{fmtTime(signal.timestamp)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────
export function TradingChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const rsiContainerRef   = useRef<HTMLDivElement>(null);
  const drawCanvasRef     = useRef<HTMLCanvasElement>(null);
  const overlayRef        = useRef<HTMLDivElement>(null);

  const chartApiRef    = useRef<IChartApi|null>(null);
  const rsiChartRef    = useRef<IChartApi|null>(null);
  const candleRef      = useRef<ISeriesApi<"Candlestick">|null>(null);
  const lastBarRef     = useRef<{time:number;open:number;high:number;low:number;close:number}|null>(null);
  const chartDisposed  = useRef(false);

  const [chartInstance, setChartInstance] = useState<IChartApi|null>(null);

  // ── WebSocket live price stream ────────────────────────────────────────────
  const { prices: streamPrices, subscribe: streamSubscribe } = usePriceStream();

  const { isPremium, setShowActivation } = usePremium();
  const { isSubscribed, toggleSubscription, loadingSymbol: notifLoading, isSupported: notifOk, isInIframe: notifFrame, errorMessage: notifErr } = useNotifications();
  const [notifErrVis, setNotifErrVis] = useState(false);
  const notifErrTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  useEffect(()=>{ if(!notifErr)return; setNotifErrVis(true); if(notifErrTimer.current)clearTimeout(notifErrTimer.current); notifErrTimer.current=setTimeout(()=>setNotifErrVis(false),5000); },[notifErr]);

  const [symbol,      setSymbol]      = useState("XAUUSD");
  const [symLabel,    setSymLabel]    = useState("Gold (XAU/USD)");
  const [currency,    setCurrency]    = useState<string|undefined>();
  const [rangeIdx,    setRangeIdx]    = useState(4);
  const [data,        setData]        = useState<IndicatorData|null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState("");
  const [refreshKey,  setRefreshKey]  = useState(0);
  const [selSignal,   setSelSignal]   = useState<Signal|null>(null);

  const [livePrice,   setLivePrice]   = useState<number|null>(null);
  const [liveChange,  setLiveChange]  = useState<number|null>(null);
  const [livePct,     setLivePct]     = useState<number|null>(null);
  const [liveTicking, setLiveTicking] = useState(false);
  const liveRef       = useRef<ReturnType<typeof setInterval>|null>(null);
  const sigRef        = useRef<ReturnType<typeof setInterval>|null>(null);
  // Animation refs — decoupled from API polling
  const targetPriceRef  = useRef<number|null>(null);  // latest price from API
  const displayPriceRef = useRef<number|null>(null);  // current interpolated price shown on chart
  const animIntervalRef = useRef<ReturnType<typeof setInterval>|null>(null);
  const lastTickSrcRef  = useRef<{source:string;ts:number}>({source:"rest",ts:0}); // for adaptive lerp

  // Indicators
  const [showEMA,    setShowEMA]    = useState(false);
  const [showMA,     setShowMA]     = useState(false);
  const [showRSI,    setShowRSI]    = useState(false);
  const [showVol,    setShowVol]    = useState(true);

  // Drawing tools
  const [activeTool,  setActiveTool]  = useState<DrawTool>("cursor");
  const [drawings,    setDrawings]    = useState<Drawing[]>([]);
  const [inProg,      setInProg]      = useState<InProg|null>(null);
  const drawingsRef = useRef<Drawing[]>([]);
  const inProgRef   = useRef<InProg|null>(null);
  useEffect(()=>{ drawingsRef.current=drawings; },[drawings]);
  useEffect(()=>{ inProgRef.current=inProg; },[inProg]);

  // Search
  const [searchOpen,   setSearchOpen]   = useState(false);
  const [searchQ,      setSearchQ]      = useState("");
  const [searchRes,    setSearchRes]    = useState<SearchResult[]>([]);
  const [searchLoading,setSearchLoading]= useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchTimer    = useRef<ReturnType<typeof setTimeout>|null>(null);

  const baseUrl = import.meta.env.BASE_URL.replace(/\/$/, "");
  const range = RANGES[rangeIdx];

  // ── Select symbol ──────────────────────────────────────────────────────────
  const selectSymbol = useCallback((sym:string,label:string)=>{
    setSymbol(sym); setSymLabel(label); setSearchOpen(false); setSearchQ(""); setSearchRes([]);
    setSelSignal(null); setData(null); setDrawings([]);
  },[]);

  // ── Search ─────────────────────────────────────────────────────────────────
  useEffect(()=>{
    if(!searchOpen||searchQ.length<1){setSearchRes([]);return;}
    if(searchTimer.current)clearTimeout(searchTimer.current);
    const ctrl=new AbortController();
    searchTimer.current=setTimeout(async()=>{
      setSearchLoading(true);
      try{const r=await fetch(`${baseUrl}/api/indicator/search?q=${encodeURIComponent(searchQ)}`,{signal:ctrl.signal});setSearchRes(await r.json());}
      catch{if(!ctrl.signal.aborted)setSearchRes([]);}
      if(!ctrl.signal.aborted)setSearchLoading(false);
    },300);
    return()=>{if(searchTimer.current)clearTimeout(searchTimer.current);ctrl.abort();};
  },[searchQ,searchOpen]);
  useEffect(()=>{if(searchOpen&&searchInputRef.current)searchInputRef.current.focus();},[searchOpen]);

  // ── Fetch data ─────────────────────────────────────────────────────────────
  useEffect(()=>{
    const ctrl=new AbortController();
    setLoading(true);setError("");setLivePrice(null);setSelSignal(null);
    fetch(`${baseUrl}/api/indicator/signals/${encodeURIComponent(symbol)}?range=${range.yRange}&interval=${range.yInt}`,{signal:ctrl.signal})
      .then(r=>r.json()).then(d=>{if(!ctrl.signal.aborted){setData(d);setLoading(false);}})
      .catch(e=>{if(!ctrl.signal.aborted){setError(e.message);setLoading(false);}});
    return()=>ctrl.abort();
  },[symbol,rangeIdx,refreshKey]);

  // ── WebSocket tick — primary real-time feed (zero-latency) ─────────────────
  useEffect(()=>{
    if(!data?.bars?.length)return;
    // Subscribe this symbol on the price stream so the backend knows to forward it
    streamSubscribe(symbol);
    const live = streamPrices[symbol];
    if(!live||live.price==null)return;
    const p=live.price;
    if(lastBarRef.current){
      lastBarRef.current={
        ...lastBarRef.current,
        high:Math.max(lastBarRef.current.high,p),
        low:Math.min(lastBarRef.current.low,p),
        close:p,
      };
    }
    targetPriceRef.current=p;
    if(displayPriceRef.current===null) displayPriceRef.current=p;
    lastTickSrcRef.current={source:live.source,ts:Date.now()};
    setLiveTicking(true);
  },[streamPrices,symbol,data,streamSubscribe]);

  // ── REST poll every 2s — fallback + prevClose/change data ─────────────────
  // (Reduced from 500ms since WebSocket already provides tick-level updates)
  useEffect(()=>{
    if(!data?.bars?.length){setLiveTicking(false);return;}
    setLiveTicking(true);
    let disposed=false;
    const tick=async()=>{
      if(disposed)return;
      try{
        const r=await fetch(`${baseUrl}/api/indicator/quote/${encodeURIComponent(symbol)}`);
        if(!r.ok||disposed)return;
        const q:QuoteData=await r.json();
        if(q.price==null||disposed)return;
        // Always update change/pct from REST (WS doesn't carry those)
        setLiveChange(q.change);setLivePct(q.changePercent);
        if(q.currency)setCurrency(q.currency);
        // Only update price target if WebSocket hasn't sent a more recent tick
        const streamTick=streamPrices[symbol];
        const wsIsRecent=streamTick&&(Date.now()-streamTick.timestamp)<3000;
        if(!wsIsRecent){
          if(lastBarRef.current){
            lastBarRef.current={
              ...lastBarRef.current,
              high:Math.max(lastBarRef.current.high,q.price),
              low:Math.min(lastBarRef.current.low,q.price),
              close:q.price,
            };
          }
          targetPriceRef.current=q.price;
          if(displayPriceRef.current===null) displayPriceRef.current=q.price;
          setLivePrice(q.price);
        }
      }catch{}
    };
    tick();
    liveRef.current=setInterval(tick,2000); // 2s fallback poll
    return()=>{
      disposed=true;
      if(liveRef.current)clearInterval(liveRef.current);
      targetPriceRef.current=null;
      displayPriceRef.current=null;
    };
  },[symbol,data]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── 10ms animation loop — adaptive lerp based on tick source ───────────────
  // Binance / NSE real-time feeds: k=0.45  → snaps to price in ~20ms (2 frames)
  // REST / Finnhub / TradingView:  k=0.08  → smooth 570ms glide for slower feeds
  useEffect(()=>{
    if(!data?.bars?.length)return;
    let frameCount=0;
    const loop=()=>{
      const target=targetPriceRef.current;
      const lb=lastBarRef.current;
      const series=candleRef.current;
      if(target===null||lb===null||series===null||chartDisposed.current)return;

      let display=displayPriceRef.current??target;
      const diff=target-display;

      // Adaptive lerp: fast for exchange-speed sources, smooth for slow polls
      const src=lastTickSrcRef.current;
      const isRealtime=
        (src.source==="binance"||src.source==="nse") &&
        Date.now()-src.ts<5000;
      const k=isRealtime?0.45:0.08;

      if(Math.abs(diff)>0.00001){
        display=display+diff*k;
        displayPriceRef.current=display;
      } else {
        display=target;
        displayPriceRef.current=target;
      }

      // Update the candle with interpolated close, preserving real high/low
      try{
        series.update({
          time:lb.time as any,
          open:lb.open,
          high:Math.max(lb.high,display),
          low:Math.min(lb.low,display),
          close:display,
        });
      }catch{}

      // Every 3 frames (~30ms) nudge the header price display for silky UI
      frameCount++;
      if(frameCount%3===0) setLivePrice(Math.round(display*10000)/10000);
    };

    animIntervalRef.current=setInterval(loop,10); // ~100fps
    return()=>{
      if(animIntervalRef.current)clearInterval(animIntervalRef.current);
    };
  },[data,symbol]);

  // ── Signal refresh (2min) ──────────────────────────────────────────────────
  useEffect(()=>{
    if(sigRef.current)clearInterval(sigRef.current);
    if(!isPremium)return;
    sigRef.current=setInterval(()=>setRefreshKey(k=>k+1),2*60*1000);
    return()=>{if(sigRef.current)clearInterval(sigRef.current);};
  },[symbol,rangeIdx]);

  // ── Canvas redraw ──────────────────────────────────────────────────────────
  const redrawCanvas = useCallback(()=>{
    const canvas=drawCanvasRef.current;
    const chart=chartApiRef.current;
    const series=candleRef.current;
    if(!canvas||!chart||!series)return;
    const ctx=canvas.getContext("2d");
    if(!ctx)return;
    ctx.clearRect(0,0,canvas.width,canvas.height);

    const drawsToRender=[...drawingsRef.current];
    const ip=inProgRef.current;

    for(const d of drawsToRender){
      if(d.kind==="hline"){
        const y=series.priceToCoordinate(d.price);
        if(y==null)continue;
        ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(canvas.width,y);
        ctx.strokeStyle=d.color;ctx.setLineDash([6,4]);ctx.lineWidth=1.5;ctx.stroke();
        ctx.setLineDash([]);
        ctx.font="10px sans-serif";ctx.fillStyle=d.color;
        ctx.fillText(fmtP(d.price,undefined),canvas.width-60,y-4);
      } else if(d.kind==="trendline"){
        const x1=chart.timeScale().timeToCoordinate(d.t1 as any);
        const y1=series.priceToCoordinate(d.p1);
        const x2=chart.timeScale().timeToCoordinate(d.t2 as any);
        const y2=series.priceToCoordinate(d.p2);
        if(x1==null||y1==null||x2==null||y2==null)continue;
        ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);
        ctx.strokeStyle=d.color;ctx.setLineDash([]);ctx.lineWidth=1.5;ctx.stroke();
      } else if(d.kind==="rect"){
        const x1=chart.timeScale().timeToCoordinate(d.t1 as any);
        const y1=series.priceToCoordinate(d.p1);
        const x2=chart.timeScale().timeToCoordinate(d.t2 as any);
        const y2=series.priceToCoordinate(d.p2);
        if(x1==null||y1==null||x2==null||y2==null)continue;
        ctx.beginPath();ctx.rect(x1,y1,x2-x1,y2-y1);
        ctx.strokeStyle=d.color;ctx.setLineDash([]);ctx.lineWidth=1;ctx.stroke();
        ctx.fillStyle=d.color.replace("rgb(","rgba(").replace(")",",0.08)").replace("#","");
        // simple rgba fill
        const r=parseInt(d.color.slice(1,3)||"41",16),g=parseInt(d.color.slice(3,5)||"62",16),b=parseInt(d.color.slice(5,7)||"FF",16);
        ctx.fillStyle=`rgba(${r},${g},${b},0.08)`;
        ctx.fill();
      }
    }

    // In-progress drawing preview
    if(ip){
      const x1v=chart.timeScale().timeToCoordinate(ip.t1 as any);
      const y1v=series.priceToCoordinate(ip.p1);
      if(x1v!=null&&y1v!=null&&ip.cx2!=null&&ip.cy2!=null){
        ctx.beginPath();
        if(inProgRef.current){
          const tool=activeTool;
          if(tool==="trendline"){
            ctx.moveTo(x1v,y1v);ctx.lineTo(ip.cx2,ip.cy2);
            ctx.strokeStyle="#FF9800";ctx.setLineDash([4,3]);ctx.lineWidth=1.5;ctx.stroke();
          } else if(tool==="rect"){
            ctx.rect(x1v,y1v,ip.cx2-x1v,ip.cy2-y1v);
            ctx.strokeStyle="#2962FF";ctx.setLineDash([4,3]);ctx.lineWidth=1;ctx.stroke();
          }
        }
        ctx.setLineDash([]);
      }
    }
  },[activeTool]);

  // ── Main chart (recreates when data or isPremium changes) ──────────────────
  useEffect(()=>{
    if(!chartContainerRef.current||!data?.bars?.length)return;
    chartDisposed.current=true;
    if(chartApiRef.current){try{chartApiRef.current.remove();}catch{}}
    chartApiRef.current=null;candleRef.current=null;
    chartDisposed.current=false;

    const container=chartContainerRef.current;
    const chart=createChart(container,{
      width:container.clientWidth,height:container.clientHeight,
      layout:{background:{type:ColorType.Solid,color:C.bg},textColor:C.text,fontSize:11},
      grid:{vertLines:{color:C.grid},horzLines:{color:C.grid}},
      crosshair:{mode:CrosshairMode.Normal,
        vertLine:{color:C.xhair,style:LineStyle.Dashed,width:1,labelBackgroundColor:C.lbg},
        horzLine:{color:C.xhair,style:LineStyle.Dashed,width:1,labelBackgroundColor:C.lbg}},
      timeScale:{borderColor:C.border,timeVisible:true,secondsVisible:range.yInt==="1m",barSpacing:8,minBarSpacing:4},
      rightPriceScale:{borderColor:C.border},
    });
    chartApiRef.current=chart;

    const candle=chart.addSeries(CandlestickSeries,{upColor:C.up,downColor:C.dn,borderUpColor:C.up,borderDownColor:C.dn,wickUpColor:C.up,wickDownColor:C.dn});
    candleRef.current=candle;

    const seen=new Set<number>();
    const bars=data.bars.filter(b=>{const t=s2ms(b.timestamp);if(seen.has(t))return false;seen.add(t);return true;}).sort((a,b)=>a.timestamp-b.timestamp);
    const cd=bars.map(b=>({time:s2ms(b.timestamp) as any,open:b.open,high:b.high,low:b.low,close:b.close}));
    try{candle.setData(cd);}catch{}
    if(cd.length>0){const l=cd[cd.length-1];lastBarRef.current={time:l.time,open:l.open,high:l.high,low:l.low,close:l.close};}

    // Volume
    if(showVol){
      const vol=chart.addSeries(HistogramSeries,{priceFormat:{type:"volume"},priceScaleId:"volume"});
      chart.priceScale("volume").applyOptions({scaleMargins:{top:0.85,bottom:0}});
      try{vol.setData(bars.map(b=>({time:s2ms(b.timestamp) as any,value:b.volume,color:b.close>=b.open?C.vUp:C.vDn})));}catch{}
    }

    // EMA 20
    if(showEMA){
      const closes=bars.map(b=>b.close);
      const times=bars.map(b=>s2ms(b.timestamp));
      const ema=calcEMA(closes,20);
      const emaSeries=chart.addSeries(LineSeries,{color:"#2962FF",lineWidth:1,priceLineVisible:false,lastValueVisible:true,title:"EMA 20"});
      const emaData=ema.map((v,i)=>v!=null?{time:times[i] as any,value:v}:null).filter(Boolean) as any[];
      try{emaSeries.setData(emaData);}catch{}
    }

    // MA 50
    if(showMA){
      const closes=bars.map(b=>b.close);
      const times=bars.map(b=>s2ms(b.timestamp));
      const ma=calcSMA(closes,50);
      const maSeries=chart.addSeries(LineSeries,{color:"#FF9800",lineWidth:1,priceLineVisible:false,lastValueVisible:true,title:"MA 50"});
      const maData=ma.map((v,i)=>v!=null?{time:times[i] as any,value:v}:null).filter(Boolean) as any[];
      try{maSeries.setData(maData);}catch{}
    }

    // Signal markers
    if(isPremium&&data.signals?.length){
      const markers=data.signals.map(s=>({
        time:s2ms(s.timestamp) as any,
        position:s.type==="buy"?"belowBar" as const:"aboveBar" as const,
        color:s.type==="buy"?C.up:C.dn,
        shape:s.type==="buy"?"arrowUp" as const:"arrowDown" as const,
        text:`${s.confidence}%`,
      }));
      try{createSeriesMarkers(candle,markers);}catch{try{(candle as any).setMarkers(markers);}catch{}}

      chart.subscribeClick(params=>{
        if(!params.time){setSelSignal(null);return;}
        const ct=(params.time as number)*1000;
        let near:Signal|null=null,minD=Infinity;
        for(const s of data.signals){const d=Math.abs(s.timestamp-ct);if(d<minD){minD=d;near=s;}}
        if(near&&minD<range.barMs*4)setSelSignal(near);else setSelSignal(null);
      });
    }

    // Visible range
    const vb=Math.min(bars.length,80);
    if(bars.length>vb){try{chart.timeScale().setVisibleRange({from:cd[bars.length-vb].time,to:cd[bars.length-1].time} as any);}catch{try{chart.timeScale().fitContent();}catch{}}}
    else{try{chart.timeScale().fitContent();}catch{}}

    // Resize
    const obs=new ResizeObserver(()=>{
      if(container&&chartApiRef.current&&!chartDisposed.current){
        try{chart.applyOptions({width:container.clientWidth,height:container.clientHeight});}catch{}
        // Sync drawing canvas size
        if(drawCanvasRef.current){drawCanvasRef.current.width=container.clientWidth;drawCanvasRef.current.height=container.clientHeight;}
        redrawCanvas();
      }
    });
    obs.observe(container);

    // Sync canvas on pan/zoom
    chart.timeScale().subscribeVisibleLogicalRangeChange(redrawCanvas);
    chart.subscribeCrosshairMove(redrawCanvas);

    // Init canvas size
    if(drawCanvasRef.current){drawCanvasRef.current.width=container.clientWidth;drawCanvasRef.current.height=container.clientHeight;}

    setChartInstance(chart);

    return()=>{
      chartDisposed.current=true;
      obs.disconnect();
      try{chart.remove();}catch{}
      if(chartApiRef.current===chart){chartApiRef.current=null;}
      candleRef.current=null;
      setChartInstance(null);
    };
  },[data,isPremium,showEMA,showMA,showVol]);

  // ── RSI pane (separate chart, synced) ─────────────────────────────────────
  useEffect(()=>{
    if(!showRSI||!rsiContainerRef.current||!data?.bars?.length)return;
    const container=rsiContainerRef.current;
    const rsiChart=createChart(container,{
      width:container.clientWidth,height:container.clientHeight,
      layout:{background:{type:ColorType.Solid,color:C.bg},textColor:C.text,fontSize:10},
      grid:{vertLines:{color:C.grid},horzLines:{color:C.grid}},
      timeScale:{visible:false,borderColor:C.border},
      rightPriceScale:{borderColor:C.border,scaleMargins:{top:0.1,bottom:0.1}},
      crosshair:{mode:CrosshairMode.Normal,vertLine:{color:C.xhair,style:LineStyle.Dashed,width:1,labelBackgroundColor:C.lbg},horzLine:{color:C.xhair,style:LineStyle.Dashed,width:1,labelBackgroundColor:C.lbg}},
    });
    rsiChartRef.current=rsiChart;

    const rsiSeries=rsiChart.addSeries(LineSeries,{color:"#9C27B0",lineWidth:2,priceLineVisible:false,lastValueVisible:true,title:"RSI 14"});
    // Overbought/oversold lines
    const seen=new Set<number>();
    const bars=data.bars.filter(b=>{const t=s2ms(b.timestamp);if(seen.has(t))return false;seen.add(t);return true;}).sort((a,b)=>a.timestamp-b.timestamp);
    const times=bars.map(b=>s2ms(b.timestamp));
    const rsiVals=calcRSI(bars.map(b=>b.close),14);
    const rsiData=rsiVals.map((v,i)=>v!=null?{time:times[i] as any,value:v}:null).filter(Boolean) as any[];
    try{rsiSeries.setData(rsiData);}catch{}

    // 70/30 reference lines
    rsiSeries.createPriceLine({price:70,color:"#EF5350",lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:"OB"});
    rsiSeries.createPriceLine({price:30,color:"#26A69A",lineWidth:1,lineStyle:LineStyle.Dashed,axisLabelVisible:true,title:"OS"});
    rsiChart.priceScale("right").applyOptions({autoScale:false} as any);

    // Sync with main chart
    const syncMain=(r:any)=>{ if(r!==null&&chartApiRef.current){try{chartApiRef.current.timeScale().setVisibleLogicalRange(r);}catch{}} };
    const syncRSI=(r:any)=>{ if(r!==null&&rsiChartRef.current){try{rsiChartRef.current.timeScale().setVisibleLogicalRange(r);}catch{}} };
    rsiChart.timeScale().subscribeVisibleLogicalRangeChange(syncMain);
    if(chartApiRef.current)chartApiRef.current.timeScale().subscribeVisibleLogicalRangeChange(syncRSI);

    // Match initial range to main chart
    try{const r=chartApiRef.current?.timeScale().getVisibleLogicalRange();if(r)rsiChart.timeScale().setVisibleLogicalRange(r);}catch{}

    const obs=new ResizeObserver(()=>{
      if(container&&!chartDisposed.current)try{rsiChart.applyOptions({width:container.clientWidth,height:container.clientHeight});}catch{}
    });
    obs.observe(container);

    return()=>{obs.disconnect();try{rsiChart.remove();}catch{};rsiChartRef.current=null;};
  },[showRSI,data]);

  // ── Redraw canvas when drawings or tool changes ────────────────────────────
  useEffect(()=>{ redrawCanvas(); },[drawings,activeTool,redrawCanvas]);

  // ── Drawing tool mouse handlers ────────────────────────────────────────────
  const getChartCoords = useCallback((e:React.MouseEvent<HTMLDivElement>):{t:number;p:number;cx:number;cy:number}|null=>{
    const chart=chartApiRef.current;const series=candleRef.current;const el=overlayRef.current;
    if(!chart||!series||!el)return null;
    const rect=el.getBoundingClientRect();
    const cx=e.clientX-rect.left,cy=e.clientY-rect.top;
    const t=chart.timeScale().coordinateToTime(cx);
    const p=series.coordinateToPrice(cy);
    if(t==null||p==null)return null;
    return{t:t as number,p,cx,cy};
  },[]);

  const handleOverlayMouseDown=useCallback((e:React.MouseEvent<HTMLDivElement>)=>{
    if(activeTool==="cursor")return;
    const co=getChartCoords(e);if(!co)return;
    e.preventDefault();

    if(activeTool==="hline"){
      setDrawings(ds=>[...ds,{id:uid(),kind:"hline",price:co.p,color:"#2962FF"}]);
    } else if(activeTool==="trendline"){
      if(!inProgRef.current){
        setInProg({t1:co.t,p1:co.p,cx1:co.cx,cy1:co.cy});
      } else {
        const ip=inProgRef.current;
        setDrawings(ds=>[...ds,{id:uid(),kind:"trendline",t1:ip.t1,p1:ip.p1,t2:co.t,p2:co.p,color:"#FF9800"}]);
        setInProg(null);
      }
    } else if(activeTool==="rect"){
      setInProg({t1:co.t,p1:co.p,cx1:co.cx,cy1:co.cy});
    }
  },[activeTool,getChartCoords]);

  const handleOverlayMouseMove=useCallback((e:React.MouseEvent<HTMLDivElement>)=>{
    const ip=inProgRef.current;if(!ip||activeTool==="hline")return;
    const rect=overlayRef.current?.getBoundingClientRect();if(!rect)return;
    const cx=e.clientX-rect.left,cy=e.clientY-rect.top;
    setInProg(prev=>prev?{...prev,cx2:cx,cy2:cy}:null);
    redrawCanvas();
  },[activeTool,redrawCanvas]);

  const handleOverlayMouseUp=useCallback((e:React.MouseEvent<HTMLDivElement>)=>{
    if(activeTool!=="rect"||!inProgRef.current)return;
    const co=getChartCoords(e);const ip=inProgRef.current;
    if(co&&Math.abs(co.cx-ip.cx1)>5&&Math.abs(co.cy-ip.cy1)>5){
      setDrawings(ds=>[...ds,{id:uid(),kind:"rect",t1:ip.t1,p1:ip.p1,t2:co.t,p2:co.p,color:"#2962FF"}]);
    }
    setInProg(null);
  },[activeTool,getChartCoords]);

  // ─── Derived ────────────────────────────────────────────────────────────────
  const lastSignal=data?.signals?.length?data.signals[data.signals.length-1]:null;
  const handleRefresh=()=>{setRefreshKey(k=>k+1);setSelSignal(null);};

  const TOOLS:[DrawTool,React.ReactNode,string][]=[
    ["cursor",<MousePointer className="w-3.5 h-3.5"/>,"Select"],
    ["hline",<Minus className="w-3.5 h-3.5"/>,"Horizontal Line"],
    ["trendline",<TLIcon className="w-3.5 h-3.5"/>,"Trendline"],
    ["rect",<Square className="w-3.5 h-3.5"/>,"Rectangle"],
  ];

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Header ── */}
      <div className="flex flex-col border-b border-[#E0E3EB]">
        <div className="flex flex-wrap items-center px-3 py-2 gap-2">
          <button onClick={()=>setSearchOpen(true)}
            className="flex items-center gap-2 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-3 py-1.5 hover:bg-[#E8ECF6] hover:border-[#2962FF]/30 transition-all min-w-0 max-w-[200px] sm:max-w-[260px] shrink-0">
            <Search className="w-3 h-3 text-[#9598A1] shrink-0"/>
            <span className="text-[#131722] text-xs font-semibold truncate">{symLabel}</span>
          </button>

          {livePrice!=null&&(
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="text-[#131722] font-mono text-sm font-bold tabular-nums shrink-0">{fmtP(livePrice,currency)}</span>
              {liveChange!=null&&<span className={`text-[10px] font-mono font-bold shrink-0 ${liveChange>=0?"text-[#26A69A]":"text-[#EF5350]"}`}>{liveChange>=0?"+":""}{liveChange.toFixed(2)} ({livePct?.toFixed(2)}%)</span>}
            </div>
          )}

          <div className="flex items-center gap-1.5 ml-auto shrink-0 flex-wrap justify-end">
            {liveTicking&&<span className="hidden sm:flex items-center gap-0.5 text-[8px] text-[#2962FF]"><Radio className="w-2.5 h-2.5 animate-pulse"/>LIVE</span>}
            {data?.marketMode&&<div className="hidden sm:flex items-center gap-1 bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1"><span className="text-[9px] text-[#9598A1]">MODE</span><span className={`text-[9px] font-bold ${data.marketMode==="BULLISH"?"text-[#26A69A]":data.marketMode==="BEARISH"?"text-[#EF5350]":"text-[#FF9800]"}`}>{data.marketMode}</span></div>}
            <button onClick={handleRefresh} className="flex items-center bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1.5 text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6] transition-all" title="Refresh"><RefreshCw className={`w-3 h-3 ${loading?"animate-spin":""}`}/></button>
            <a href={toTVLink(symbol)} target="_blank" rel="noopener noreferrer" className="flex items-center bg-[#F0F3FA] border border-[#E0E3EB] rounded-lg px-2 py-1.5 text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6] transition-all" title="Open on TradingView"><ExternalLink className="w-3 h-3"/></a>
            {!isPremium&&<button onClick={()=>setShowActivation(true)} className="flex items-center gap-1 bg-[#FFF8E1] border border-[#FFB300]/30 rounded-lg px-2 py-1 text-[#FF8F00] hover:bg-[#FFE082]/40 transition-all"><Crown className="w-3 h-3"/><span className="text-[9px] font-bold">PRO</span></button>}
            {isPremium&&<div className="flex items-center gap-1 bg-[#FFF8E1] border border-[#FFB300]/30 rounded-lg px-2 py-1"><Crown className="w-3 h-3 text-[#FF8F00]"/><span className="text-[9px] font-bold text-[#FF8F00]">PRO</span></div>}
            {isPremium&&(notifOk||notifFrame)&&(
              <div className="relative">
                <button onClick={()=>toggleSubscription(symbol,symLabel)} disabled={notifLoading===symbol} title={notifFrame?"Open in new tab for notifications":isSubscribed(symbol)?"Unsubscribe":"Subscribe to signals"}
                  className={`flex items-center gap-1 rounded-lg px-2 py-1.5 transition-all border ${notifFrame?"bg-[#F0F3FA] border-[#E0E3EB] text-[#C9CBD4] cursor-not-allowed":isSubscribed(symbol)?"bg-[#E3F2FD] border-[#2962FF]/30 text-[#2962FF] hover:bg-[#BBDEFB]/50":"bg-[#F0F3FA] border-[#E0E3EB] text-[#9598A1] hover:text-[#131722] hover:bg-[#E8ECF6]"}`}>
                  {notifLoading===symbol?<Loader2 className="w-3 h-3 animate-spin"/>:isSubscribed(symbol)?<Bell className="w-3 h-3"/>:<BellOff className="w-3 h-3"/>}
                </button>
                {notifErrVis&&notifErr&&<div className="absolute right-0 top-full mt-1 z-50 w-64 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700 shadow-lg">{notifErr}</div>}
              </div>
            )}
          </div>
        </div>

        {/* Timeframe + Indicator toggles */}
        <div className="flex items-center px-3 pb-2 gap-2 flex-wrap">
          <div className="flex gap-1 bg-[#F0F3FA] rounded-lg p-0.5">
            {RANGES.map((r,i)=>(
              <button key={r.label} onClick={()=>setRangeIdx(i)}
                className={`px-2.5 sm:px-3 py-1.5 text-[10px] font-semibold rounded-md transition-all whitespace-nowrap ${rangeIdx===i?"bg-[#2962FF] text-white shadow-sm":"text-[#9598A1] hover:text-[#131722] hover:bg-white"}`}>
                {r.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 ml-auto">
            {([["RSI",showRSI,setShowRSI],["EMA",showEMA,setShowEMA],["MA",showMA,setShowMA],["VOL",showVol,setShowVol]] as const).map(([lbl,active,setter])=>(
              <button key={lbl} onClick={()=>(setter as any)((v:boolean)=>!v)}
                className={`px-2 py-1 text-[9px] font-bold rounded-md border transition-all ${active?"bg-[#2962FF] text-white border-[#2962FF]":"text-[#9598A1] border-[#E0E3EB] hover:bg-[#F0F3FA] hover:text-[#131722]"}`}>
                {lbl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Chart area ── */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 relative min-h-0 flex">
          {/* Drawing toolbar */}
          <div className="absolute left-2 top-2 z-30 flex flex-col gap-0.5 bg-white border border-[#E0E3EB] rounded-xl shadow-md p-1">
            {TOOLS.map(([tool,icon,title])=>(
              <button key={tool} onClick={()=>setActiveTool(tool)} title={title}
                className={`w-7 h-7 flex items-center justify-center rounded-lg transition-all ${activeTool===tool?"bg-[#2962FF] text-white":"text-[#9598A1] hover:bg-[#F0F3FA] hover:text-[#131722]"}`}>
                {icon}
              </button>
            ))}
            <div className="w-full h-px bg-[#E0E3EB] my-0.5"/>
            <button onClick={()=>{setDrawings([]);setInProg(null);redrawCanvas();}} title="Clear drawings"
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[#9598A1] hover:bg-red-50 hover:text-red-500 transition-all">
              <Trash2 className="w-3 h-3"/>
            </button>
          </div>

          {loading&&<div className="absolute inset-0 flex items-center justify-center bg-white z-10"><div className="flex flex-col items-center gap-3"><div className="w-8 h-8 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin"/><span className="text-[#9598A1] text-xs">Loading {symLabel}...</span></div></div>}
          {error&&!loading&&<div className="absolute inset-0 flex items-center justify-center bg-white z-10"><div className="flex flex-col items-center gap-3"><div className="flex items-center gap-2 text-[#EF5350] text-xs"><AlertTriangle className="w-4 h-4"/><span>{error}</span></div><button onClick={handleRefresh} className="text-[10px] text-[#9598A1] hover:text-[#131722] underline">Try again</button></div></div>}

          <div ref={chartContainerRef} className="flex-1 relative min-h-0">
            {/* Drawing canvas overlay */}
            <canvas ref={drawCanvasRef} className="absolute inset-0 z-20 pointer-events-none" style={{width:"100%",height:"100%"}}/>
            {/* Mouse event overlay */}
            <div ref={overlayRef}
              className="absolute inset-0 z-25"
              style={{pointerEvents:activeTool==="cursor"?"none":"all",cursor:activeTool==="cursor"?"default":activeTool==="hline"?"crosshair":"crosshair"}}
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
            />
          </div>

          {selSignal&&<SignalPopup signal={selSignal} currency={currency} onClose={()=>setSelSignal(null)}/>}

          {!isPremium&&!loading&&<div className="absolute bottom-3 right-3 z-10 w-64"><div className="bg-white/95 backdrop-blur-xl border border-[#FFB300]/30 rounded-2xl p-3 shadow-lg"><div className="flex items-center gap-2 mb-1.5"><div className="w-6 h-6 rounded-lg bg-gradient-to-br from-[#FFB300] to-[#FF8F00] flex items-center justify-center"><Lock className="w-3 h-3 text-white"/></div><span className="text-[11px] font-bold text-[#FF8F00]">GlobalPulse Pro</span></div><p className="text-[9px] text-[#9598A1] mb-2">AI signal arrows on every candle. Click any arrow for entry, stop loss, take profit & confidence score.</p><button onClick={()=>setShowActivation(true)} className="w-full bg-gradient-to-r from-[#FFB300] to-[#FF8F00] text-white text-[10px] font-bold py-1.5 rounded-lg hover:from-[#FFC107] hover:to-[#FF9800] transition-all">Activate Key</button></div></div>}
        </div>

        {/* RSI pane */}
        {showRSI&&<div ref={rsiContainerRef} className="border-t border-[#E0E3EB] shrink-0" style={{height:"120px"}}/>}
      </div>

      {/* ── Signal bar ── */}
      {isPremium&&lastSignal&&!loading&&(
        <div className="border-t border-[#E0E3EB] px-3 py-2 bg-[#F0F3FA]">
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide">
            <button onClick={()=>setSelSignal(p=>p?.timestamp===lastSignal.timestamp?null:lastSignal)}
              className={`flex items-center gap-1 shrink-0 px-2 py-0.5 rounded-lg border transition-all ${lastSignal.type==="buy"?"bg-emerald-50 border-emerald-200 hover:bg-emerald-100":"bg-red-50 border-red-200 hover:bg-red-100"}`}>
              {lastSignal.type==="buy"?<TrendingUp className="w-3.5 h-3.5 text-[#26A69A]"/>:<TrendingDown className="w-3.5 h-3.5 text-[#EF5350]"/>}
              <span className={`text-[11px] font-bold ${lastSignal.type==="buy"?"text-[#26A69A]":"text-[#EF5350]"}`}>{lastSignal.type.toUpperCase()}</span>
            </button>
            <span className="text-[10px] text-[#9598A1] shrink-0">@ {fmtP(lastSignal.price,currency)}</span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0"/>
            <div className="flex items-center gap-0.5 shrink-0"><ShieldCheck className="w-3 h-3 text-[#9598A1]"/><span className={`text-[10px] font-bold ${lastSignal.confidence>=85?"text-[#26A69A]":lastSignal.confidence>=72?"text-[#FF9800]":"text-[#9598A1]"}`}>{lastSignal.confidence}%</span></div>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0"/>
            <span className="text-[10px] text-[#9598A1] shrink-0">SL:<span className="text-[#EF5350] font-mono ml-1">{fmtP(lastSignal.stopLoss,currency)}</span></span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0"/>
            <span className="text-[10px] text-[#9598A1] shrink-0">TP:<span className="text-[#26A69A] font-mono ml-1">{fmtP(lastSignal.takeProfit,currency)}</span></span>
            <div className="w-px h-3 bg-[#E0E3EB] shrink-0"/>
            <span className="text-[10px] text-[#9598A1] shrink-0">RR:<span className="text-[#FF9800] font-mono ml-1">1:{lastSignal.riskReward.toFixed(1)}</span></span>
            {data?.aiAnalysis&&<><div className="w-px h-3 bg-[#E0E3EB] shrink-0"/><div className="flex items-center gap-1 shrink-0"><Zap className="w-3 h-3 text-[#2962FF]"/><span className="text-[9px] text-[#2962FF] font-medium max-w-[180px] truncate">{data.aiAnalysis}</span></div></>}
          </div>
        </div>
      )}

      {/* ── Search modal ── */}
      {searchOpen&&(
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]" onClick={()=>setSearchOpen(false)}>
          <div className="absolute inset-0 bg-[#131722]/40 backdrop-blur-sm"/>
          <div className="relative w-full max-w-lg mx-4 bg-white border border-[#E0E3EB] rounded-2xl shadow-2xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[#E0E3EB]">
              <Search className="w-4 h-4 text-[#9598A1] shrink-0"/>
              <input ref={searchInputRef} type="text" value={searchQ} onChange={e=>setSearchQ(e.target.value)}
                placeholder="Search symbol, e.g. AAPL, RELIANCE, NIFTY..." className="flex-1 bg-transparent text-[#131722] placeholder:text-[#9598A1] text-sm outline-none"/>
              {searchLoading&&<div className="w-4 h-4 border-2 border-[#2962FF] border-t-transparent rounded-full animate-spin shrink-0"/>}
              <button onClick={()=>setSearchOpen(false)} className="text-[#9598A1] hover:text-[#131722] shrink-0"><X className="w-4 h-4"/></button>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {searchQ.length===0&&<div className="p-3"><div className="text-[9px] text-[#9598A1] font-semibold mb-2 px-1 uppercase tracking-wider">Popular</div><div className="grid grid-cols-2 gap-1">{POPULAR.map(s=>(<button key={s.key} onClick={()=>selectSymbol(s.key,`${s.label} (${s.key})`)} className="flex items-center justify-between px-3 py-2 rounded-lg hover:bg-[#F0F3FA] transition-all text-left"><div><div className="text-[11px] font-semibold text-[#131722]">{s.label}</div><div className="text-[9px] text-[#9598A1]">{s.key}</div></div><span className="text-[8px] text-[#9598A1] bg-[#F0F3FA] px-1.5 py-0.5 rounded-full">{s.cat}</span></button>))}</div></div>}
              {searchRes.length>0&&<div className="p-2">{searchRes.map(r=>(<button key={r.symbol} onClick={()=>selectSymbol(r.symbol,`${r.name} (${r.symbol})`)} className="flex items-center justify-between w-full px-3 py-2 rounded-lg hover:bg-[#F0F3FA] transition-all text-left"><div className="min-w-0"><div className="text-[11px] font-semibold text-[#131722] truncate">{r.symbol}</div><div className="text-[9px] text-[#9598A1] truncate">{r.name}</div></div><div className="flex items-center gap-1 ml-2 shrink-0"><span className="text-[8px] text-[#9598A1]">{r.exchange}</span><span className="text-[8px] text-[#2962FF] bg-[#EEF2FF] px-1.5 py-0.5 rounded-full">{r.type}</span></div></button>))}</div>}
              {searchQ.length>0&&searchRes.length===0&&!searchLoading&&<div className="py-8 text-center text-[#9598A1] text-xs">No results for "{searchQ}"</div>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
