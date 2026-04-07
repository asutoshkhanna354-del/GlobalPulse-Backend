import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  AlertTriangle,
  Globe,
  Shield,
  Plane,
  Activity,
  TrendingUp,
  Radio,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from "lucide-react";

const BASE = import.meta.env.BASE_URL ?? "/";
const API = `${BASE}api`;

interface GeoEvent {
  id: number;
  title: string;
  description: string;
  region: string;
  countries: string[];
  type: string;
  severity: string;
  marketImpact: string;
  marketConclusion: string;
  affectedMarkets: string[];
  affectedAssets: string[];
  sources: string[];
  startDate: string;
  status: string;
  casualtiesReported: boolean;
  economicLoss: string | null;
  lastUpdated: string;
}

interface SocialPost {
  id: number;
  influencer: string;
  handle: string;
  platform: string;
  content: string;
  source: string;
  sourceUrl: string | null;
  category: string;
  marketImpact: string;
  affectedAssets: string[];
  tradingConclusion: string;
  sentiment: string;
  usdImpact: string | null;
  isBreaking: boolean;
  publishedAt: string;
}

interface NewsItem {
  id: number;
  headline: string;
  summary: string;
  source: string;
  category: string;
  impact: string;
  sentiment: string;
  region: string | null;
  affectedAssets: string[];
  publishedAt: string;
  marketConclusion: string;
  isBreaking: boolean;
}

const REGION_LATLNG: Record<string, [number, number]> = {
  "Middle East": [31, 42],
  "Eastern Europe": [50, 30],
  "East Asia": [35, 120],
  "South Asia": [22, 78],
  "Southeast Asia": [5, 110],
  "Africa": [5, 20],
  "Latin America": [-15, -60],
  "Central Asia": [42, 65],
  "Europe": [48, 10],
  "North America": [40, -100],
  "Pacific": [-10, 160],
  "Global": [20, 0],
};

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string; text: string }> = {
  critical: { color: "#EF4444", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", text: "text-red-700" },
  high: { color: "#F97316", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500", text: "text-orange-700" },
  medium: { color: "#EAB308", bg: "bg-yellow-50", border: "border-yellow-200", dot: "bg-yellow-500", text: "text-yellow-700" },
  low: { color: "#22C55E", bg: "bg-green-50", border: "border-green-200", dot: "bg-green-500", text: "text-green-700" },
};

const CONTINENTS: [number, number][][] = [
  [[-35,-18],[-34,18],[-30,33],[-25,43],[-15,50],[-5,42],[5,35],[10,15],[5,1],[10,-15],[15,-17],[20,-16],[25,-15],[30,-10],[37,-10],[37,10],[35,35],[32,35],[31,32],[30,33],[27,34],[20,40],[15,43],[10,42],[5,50],[0,43],[-5,12],[-10,14],[-15,12],[-20,14],[-25,15],[-30,18],[-33,26],[-35,20],[-35,-18]],
  [[60,-10],[55,-7],[50,0],[48,3],[47,7],[45,10],[42,13],[40,26],[42,28],[42,45],[44,40],[48,38],[50,30],[52,25],[55,28],[56,25],[58,30],[60,28],[62,30],[65,30],[68,28],[70,30],[72,65],[68,70],[65,80],[64,100],[60,105],[55,110],[50,105],[48,90],[46,80],[45,70],[43,45],[40,30],[37,36],[36,35],[35,25],[38,22],[40,20],[42,15],[44,12],[48,2],[50,-5],[55,-8],[60,-10]],
  [[-6,-80],[-4,-80],[-2,-80],[0,-78],[5,-77],[10,-75],[12,-72],[10,-62],[12,-60],[10,-68],[8,-77],[5,-77],[10,-84],[5,-82],[0,-80],[-5,-78],[-10,-77],[-15,-75],[-20,-63],[-25,-55],[-30,-50],[-35,-58],[-40,-65],[-45,-70],[-50,-73],[-55,-70],[-55,-68],[-50,-75],[-45,-74],[-40,-73],[-35,-70],[-30,-72],[-25,-70],[-20,-70],[-15,-76],[-10,-78],[-6,-80]],
  [[25,-82],[30,-85],[35,-90],[38,-95],[40,-100],[42,-105],[45,-110],[48,-115],[50,-120],[55,-130],[58,-135],[60,-140],[62,-150],[63,-160],[65,-170],[68,-165],[70,-150],[72,-130],[70,-100],[68,-80],[65,-65],[60,-55],[55,-60],[50,-55],[48,-58],[47,-55],[45,-62],[42,-70],[40,-75],[37,-76],[35,-78],[30,-82],[28,-82],[25,-82]],
  [[-10,115],[-15,115],[-18,122],[-20,118],[-25,115],[-28,114],[-32,116],[-35,118],[-38,145],[-37,150],[-33,152],[-28,153],[-25,150],[-20,148],[-15,145],[-12,142],[-10,132],[-12,130],[-10,115]],
];

function orthProject(lat: number, lon: number, cLat: number, cLon: number, scale: number, cx: number, cy: number): [number, number, boolean] {
  const toRad = Math.PI / 180;
  const la = lat * toRad, lo = lon * toRad, cla = cLat * toRad, clo = cLon * toRad;
  const cosC = Math.sin(cla) * Math.sin(la) + Math.cos(cla) * Math.cos(la) * Math.cos(lo - clo);
  if (cosC < 0) return [0, 0, false];
  const x = cx + scale * Math.cos(la) * Math.sin(lo - clo);
  const y = cy - scale * (Math.cos(cla) * Math.sin(la) - Math.sin(cla) * Math.cos(la) * Math.cos(lo - clo));
  return [x, y, true];
}

function CanvasGlobe({ events }: { events: GeoEvent[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rotRef = useRef({ lat: 20, lon: 30 });
  const scaleRef = useRef(130);
  const dragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0, lat: 0, lon: 0 });
  const animRef = useRef<number>(0);
  const autoRotate = useRef(true);

  const markers = useMemo(() => {
    return events.filter(e => e.status !== "resolved").map(e => {
      const coords = REGION_LATLNG[e.region] ?? REGION_LATLNG["Global"];
      return { lat: coords[0], lon: coords[1], severity: e.severity, title: e.title };
    });
  }, [events]);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;
    const r = scaleRef.current;
    const cLat = rotRef.current.lat;
    const cLon = rotRef.current.lon;

    ctx.clearRect(0, 0, w, h);

    const oceanGrad = ctx.createRadialGradient(cx - r * 0.2, cy - r * 0.2, 0, cx, cy, r);
    oceanGrad.addColorStop(0, "#e8f4fd");
    oceanGrad.addColorStop(0.7, "#c9e4f5");
    oceanGrad.addColorStop(1, "#a8d4eb");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = oceanGrad;
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    for (const continent of CONTINENTS) {
      ctx.beginPath();
      let started = false;
      for (const [lat, lon] of continent) {
        const [px, py, visible] = orthProject(lat, lon, cLat, cLon, r, cx, cy);
        if (visible) {
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        }
      }
      if (started) {
        ctx.closePath();
        ctx.fillStyle = "#c8d8c4";
        ctx.fill();
        ctx.strokeStyle = "#a0b09a";
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }

    const gridAlpha = 0.08;
    ctx.strokeStyle = `rgba(100, 140, 180, ${gridAlpha})`;
    ctx.lineWidth = 0.5;
    for (let lat = -80; lat <= 80; lat += 20) {
      ctx.beginPath();
      let started = false;
      for (let lon = -180; lon <= 180; lon += 2) {
        const [px, py, vis] = orthProject(lat, lon, cLat, cLon, r, cx, cy);
        if (vis) {
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        } else {
          started = false;
        }
      }
      ctx.stroke();
    }
    for (let lon = -180; lon <= 180; lon += 30) {
      ctx.beginPath();
      let started = false;
      for (let lat = -90; lat <= 90; lat += 2) {
        const [px, py, vis] = orthProject(lat, lon, cLat, cLon, r, cx, cy);
        if (vis) {
          if (!started) { ctx.moveTo(px, py); started = true; }
          else ctx.lineTo(px, py);
        } else {
          started = false;
        }
      }
      ctx.stroke();
    }

    for (const m of markers) {
      const [px, py, vis] = orthProject(m.lat, m.lon, cLat, cLon, r, cx, cy);
      if (!vis) continue;
      const color = SEVERITY_CONFIG[m.severity]?.color ?? "#EAB308";
      const markerR = m.severity === "critical" ? 8 : m.severity === "high" ? 6 : 4;

      ctx.beginPath();
      ctx.arc(px, py, markerR + 4, 0, Math.PI * 2);
      ctx.fillStyle = color + "20";
      ctx.fill();

      ctx.beginPath();
      ctx.arc(px, py, markerR, 0, Math.PI * 2);
      ctx.fillStyle = color + "80";
      ctx.fill();
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
    }

    ctx.restore();

    const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.85, cx, cy, r);
    rimGrad.addColorStop(0, "rgba(0,0,0,0)");
    rimGrad.addColorStop(1, "rgba(100, 140, 200, 0.15)");
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = rimGrad;
    ctx.fill();

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100, 140, 200, 0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }, [markers]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = 600;
    canvas.height = 600;

    const animate = () => {
      if (autoRotate.current && !dragging.current) {
        rotRef.current.lon += 0.15;
        if (rotRef.current.lon > 180) rotRef.current.lon -= 360;
      }
      draw();
      animRef.current = requestAnimationFrame(animate);
    };
    animRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animRef.current);
  }, [draw]);

  const handlePointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    autoRotate.current = false;
    dragStart.current = { x: e.clientX, y: e.clientY, lat: rotRef.current.lat, lon: rotRef.current.lon };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    const dx = e.clientX - dragStart.current.x;
    const dy = e.clientY - dragStart.current.y;
    rotRef.current.lon = dragStart.current.lon - dx * 0.3;
    rotRef.current.lat = Math.max(-80, Math.min(80, dragStart.current.lat + dy * 0.3));
  };

  const handlePointerUp = () => {
    dragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -10 : 10;
    scaleRef.current = Math.max(60, Math.min(250, scaleRef.current + delta));
  };

  const handleZoom = (delta: number) => {
    scaleRef.current = Math.max(60, Math.min(250, scaleRef.current + delta));
  };

  const handleReset = () => {
    rotRef.current = { lat: 20, lon: 30 };
    scaleRef.current = 130;
    autoRotate.current = true;
  };

  return (
    <div className="relative flex items-center justify-center">
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        style={{ width: 300, height: 300, cursor: dragging.current ? "grabbing" : "grab", touchAction: "none" }}
      />
      <div className="absolute bottom-2 right-2 flex flex-col gap-1">
        <button onClick={() => handleZoom(15)} className="w-7 h-7 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors" title="Zoom In">
          <ZoomIn className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button onClick={() => handleZoom(-15)} className="w-7 h-7 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors" title="Zoom Out">
          <ZoomOut className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
        <button onClick={handleReset} className="w-7 h-7 rounded-lg border border-border bg-card flex items-center justify-center hover:bg-muted transition-colors" title="Reset">
          <RotateCcw className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function computeGlobalTension(events: GeoEvent[]): number {
  let tension = 0;
  for (const e of events) {
    if (e.status === "resolved") continue;
    const sevScore = e.severity === "critical" ? 25 : e.severity === "high" ? 15 : e.severity === "medium" ? 8 : 3;
    const statusMul = e.status === "escalating" ? 1.5 : e.status === "active" ? 1.0 : 0.6;
    const typeMul = e.type === "war" ? 2.0 : e.type === "conflict" ? 1.5 : e.type === "terrorism" ? 1.3 : 1.0;
    tension += sevScore * statusMul * typeMul;
  }
  return Math.min(100, Math.round(tension));
}

function getTensionLevel(t: number): { label: string; color: string; bg: string } {
  if (t >= 80) return { label: "SEVERE", color: "text-red-700", bg: "bg-red-50 border-red-200" };
  if (t >= 60) return { label: "HIGH", color: "text-orange-700", bg: "bg-orange-50 border-orange-200" };
  if (t >= 40) return { label: "ELEVATED", color: "text-yellow-700", bg: "bg-yellow-50 border-yellow-200" };
  if (t >= 20) return { label: "GUARDED", color: "text-blue-700", bg: "bg-blue-50 border-blue-200" };
  return { label: "LOW", color: "text-green-700", bg: "bg-green-50 border-green-200" };
}

type FeedTab = "feed" | "whale" | "flights";

export function Terminal() {
  const [activeTab, setActiveTab] = useState<FeedTab>("feed");
  const [severity, setSeverity] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [lastUpdate, setLastUpdate] = useState("0s");

  const { data: eventsData } = useQuery({
    queryKey: ["terminal-geopolitical"],
    queryFn: async () => {
      const res = await fetch(`${API}/geopolitical`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<GeoEvent[]>;
    },
    refetchInterval: 30000,
  });

  const { data: socialData } = useQuery({
    queryKey: ["terminal-social"],
    queryFn: async () => {
      const res = await fetch(`${API}/social?limit=100`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<SocialPost[]>;
    },
    refetchInterval: 30000,
  });

  const { data: newsData } = useQuery({
    queryKey: ["terminal-news"],
    queryFn: async () => {
      const res = await fetch(`${API}/news?limit=50`);
      if (!res.ok) throw new Error("Failed");
      return res.json() as Promise<NewsItem[]>;
    },
    refetchInterval: 30000,
  });

  const events = useMemo(() => eventsData ?? [], [eventsData]);
  const social = useMemo(() => socialData ?? [], [socialData]);
  const newsItems = useMemo(() => newsData ?? [], [newsData]);

  const activeEvents = useMemo(() => events.filter(e => e.status !== "resolved"), [events]);
  const tension = computeGlobalTension(events);
  const tensionInfo = getTensionLevel(tension);
  const activeSignals = activeEvents.length + social.filter(s => s.isBreaking).length;
  const flightCount = events.filter(e => (e.type === "war" || e.type === "conflict") && e.status !== "resolved").length;

  useEffect(() => {
    const id = setInterval(() => {
      setLastUpdate(prev => `${(parseInt(prev) || 0) + 1}s`);
    }, 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setLastUpdate("0s");
  }, [eventsData, socialData, newsData]);

  const feedItems = useMemo(() => {
    type FeedItem = { id: string; type: "social" | "news"; avatar: string; name: string; handle: string; tags: { label: string; style: string }[]; content: string; time: string; impactLevel: string; contentKey: string };
    const items: FeedItem[] = [];
    const seen = new Set<string>();

    for (const p of social) {
      const contentKey = p.content.trim().slice(0, 80).toLowerCase();
      if (seen.has(contentKey)) continue;
      seen.add(contentKey);

      const pass = severity === "all" ||
        (severity === "critical" && p.isBreaking) ||
        (severity === "high" && (p.marketImpact === "high" || p.isBreaking)) ||
        (severity === "low" && p.marketImpact === "low");
      if (!pass) continue;
      if (searchQuery && !p.content.toLowerCase().includes(searchQuery.toLowerCase()) && !p.influencer.toLowerCase().includes(searchQuery.toLowerCase())) continue;

      const tags: { label: string; style: string }[] = [];
      if (p.platform) tags.push({ label: `𝕏 ${p.platform.toUpperCase()}`, style: "bg-blue-50 text-blue-700 border-blue-200" });
      if (p.category) tags.push({ label: p.category.toUpperCase(), style: "bg-purple-50 text-purple-700 border-purple-200" });

      items.push({
        id: `s-${p.id}`, type: "social",
        avatar: p.influencer.charAt(0).toUpperCase(),
        name: p.influencer, handle: `@${p.handle}`,
        tags, content: p.content,
        time: timeAgo(p.publishedAt),
        impactLevel: p.marketImpact,
        contentKey,
      });
    }

    for (const n of newsItems) {
      const contentKey = n.headline.trim().slice(0, 80).toLowerCase();
      if (seen.has(contentKey)) continue;
      seen.add(contentKey);

      const pass = severity === "all" ||
        (severity === "critical" && n.isBreaking) ||
        (severity === "high" && n.impact === "high") ||
        (severity === "low" && n.impact === "low");
      if (!pass) continue;
      if (searchQuery && !n.headline.toLowerCase().includes(searchQuery.toLowerCase())) continue;

      const tags: { label: string; style: string }[] = [];
      tags.push({ label: `📰 NEWS`, style: "bg-cyan-50 text-cyan-700 border-cyan-200" });
      if (n.category) tags.push({ label: n.category.toUpperCase(), style: "bg-indigo-50 text-indigo-700 border-indigo-200" });

      items.push({
        id: `n-${n.id}`, type: "news",
        avatar: n.source.charAt(0).toUpperCase(),
        name: n.source, handle: n.source,
        tags, content: `${n.headline}. ${n.summary.slice(0, 150)}`,
        time: timeAgo(n.publishedAt),
        impactLevel: n.impact,
        contentKey,
      });
    }

    return items.slice(0, 50);
  }, [social, newsItems, severity, searchQuery]);

  const whaleItems = useMemo(() => {
    const seen = new Set<string>();
    return social.filter(p => {
      const lc = p.content.toLowerCase();
      const key = lc.slice(0, 80);
      if (seen.has(key)) return false;
      seen.add(key);
      return lc.includes("whale") || lc.includes("bitcoin") || lc.includes("btc") || lc.includes("eth") || lc.includes("crypto") || lc.includes("million") || lc.includes("billion");
    }).slice(0, 20);
  }, [social]);

  return (
    <div className="flex-1 overflow-y-auto p-4 lg:p-6 space-y-5">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-[#131722]">Intelligence Terminal</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Last updated {new Date().toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-border bg-card">
            <div className="w-2 h-2 rounded-full bg-green-500 live-pulse" />
            <span className="text-[10px] font-bold text-green-600 tracking-wider">LIVE</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg border border-border bg-card text-center">
            <div className="text-sm font-bold text-[#131722] font-mono">{activeSignals}</div>
            <div className="text-[8px] text-muted-foreground font-bold tracking-widest">ACTIVE SIGNALS</div>
          </div>
          <div className="px-3 py-1.5 rounded-lg border border-border bg-card text-center">
            <div className="text-sm font-bold text-[#131722] font-mono">{lastUpdate} ago</div>
            <div className="text-[8px] text-muted-foreground font-bold tracking-widest">LAST UPDATE</div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Globe className="w-4 h-4 text-[#2962FF]" />
                <span className="text-sm font-bold text-[#131722]">Global Conflict Map</span>
              </div>
              <div className={`flex items-center gap-2 px-2.5 py-1 rounded-full border ${tensionInfo.bg}`}>
                <div className={`w-2 h-2 rounded-full ${tension >= 80 ? "bg-red-500" : tension >= 60 ? "bg-orange-500" : tension >= 40 ? "bg-yellow-500" : "bg-green-500"} live-pulse`} />
                <span className="text-[10px] font-bold tracking-wider">GLOBAL TENSION</span>
                <span className={`text-sm font-bold font-mono ${tensionInfo.color}`}>{tension}</span>
                <span className={`text-[9px] font-bold tracking-wider ${tensionInfo.color}`}>{tensionInfo.label}</span>
              </div>
            </div>
            <div className="p-4 flex items-center justify-center" style={{ minHeight: 320 }}>
              <CanvasGlobe events={events} />
            </div>
            <div className="px-4 pb-3 flex items-center gap-4 text-[10px] text-muted-foreground">
              <span>🖱️ Drag to rotate</span>
              <span>🔍 Scroll to zoom</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-red-500" /> Critical</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-orange-500" /> High</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-yellow-500" /> Medium</span>
              <span className="flex items-center gap-1"><span className="inline-block w-2 h-2 rounded-full bg-green-500" /> Low</span>
            </div>
          </div>

          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div className="flex items-center gap-2">
                <Shield className="w-4 h-4 text-red-500" />
                <span className="text-sm font-bold text-[#131722]">Conflict Events</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-[#131722] font-mono">{activeEvents.length}</span>
                <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 live-pulse" />
                  <span className="text-[9px] text-green-700 font-bold">LIVE</span>
                </div>
              </div>
            </div>
            <div className="max-h-[300px] overflow-y-auto divide-y divide-border">
              {activeEvents.map(e => {
                const cfg = SEVERITY_CONFIG[e.severity] ?? SEVERITY_CONFIG.low;
                return (
                  <div key={e.id} className="flex items-start gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${cfg.dot} live-pulse`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-bold border ${cfg.bg} ${cfg.border} ${cfg.text}`}>
                          {e.severity.toUpperCase()}
                        </span>
                        <span className="text-[9px] text-muted-foreground font-mono border border-border px-1.5 py-0.5 rounded-full">
                          {e.type.toUpperCase().replace("-", " ")}
                        </span>
                        <span className="text-[9px] text-muted-foreground">{e.region}</span>
                        <span className="ml-auto text-[9px] text-muted-foreground font-mono">{timeAgo(e.lastUpdated)}</span>
                      </div>
                      <h4 className="text-xs font-semibold text-[#131722] mb-0.5">{e.title}</h4>
                      <p className="text-[11px] text-muted-foreground line-clamp-2">{e.description}</p>
                    </div>
                  </div>
                );
              })}
              {activeEvents.length === 0 && (
                <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">No active conflict events</div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-5">
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="flex border-b border-border">
              {([
                { key: "feed" as FeedTab, label: "FEED", icon: Radio },
                { key: "whale" as FeedTab, label: "WHALE TRACKER", icon: TrendingUp },
                { key: "flights" as FeedTab, label: `FLIGHTS (${flightCount})`, icon: Plane },
              ]).map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-2 py-2.5 text-[10px] font-bold tracking-wider transition-colors ${
                    activeTab === tab.key ? "text-[#2962FF] border-b-2 border-[#2962FF]" : "text-muted-foreground hover:text-[#131722]"
                  }`}>
                  <tab.icon className="w-3 h-3" />
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === "feed" && (
              <>
                <div className="flex items-center gap-2 px-3 py-2 border-b border-border flex-wrap">
                  {[
                    { key: "all", label: "All" },
                    { key: "critical", label: "Critical" },
                    { key: "high", label: "High" },
                    { key: "low", label: "Low" },
                  ].map(f => (
                    <button key={f.key} onClick={() => setSeverity(f.key)}
                      className={`px-2.5 py-1 text-[10px] font-bold rounded-full border transition-colors ${
                        severity === f.key ? "text-[#2962FF] bg-blue-50 border-blue-200" : "text-muted-foreground border-border hover:text-[#131722] hover:border-[#131722]/20"
                      }`}>
                      {f.label}
                    </button>
                  ))}
                </div>
                <div className="px-3 py-2 border-b border-border">
                  <div className="relative">
                    <Search className="w-3 h-3 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search signals..."
                      className="w-full pl-7 pr-3 py-1.5 text-[11px] rounded-lg border border-border bg-background text-[#131722] placeholder-muted-foreground focus:outline-none focus:ring-1 focus:ring-[#2962FF]" />
                  </div>
                </div>
                <div className="max-h-[500px] overflow-y-auto divide-y divide-border">
                  {feedItems.map(item => (
                    <div key={item.id} className="px-3 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2962FF] to-[#7C3AED] flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                          {item.avatar}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-bold text-[#131722]">{item.name}</span>
                            <span className="text-[10px] text-muted-foreground">{item.handle}</span>
                            <span className="ml-auto text-[9px] text-muted-foreground">{item.time}</span>
                          </div>
                          <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                            {item.tags.map((tag, ti) => (
                              <span key={ti} className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold border ${tag.style}`}>{tag.label}</span>
                            ))}
                            <span className={`text-[8px] px-1.5 py-0.5 rounded-full font-bold border ${
                              item.impactLevel === "high" ? "bg-red-50 text-red-700 border-red-200" :
                              item.impactLevel === "medium" ? "bg-yellow-50 text-yellow-700 border-yellow-200" :
                              "bg-green-50 text-green-700 border-green-200"
                            }`}>{(item.impactLevel || "low").toUpperCase()}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-3">{item.content}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                  {feedItems.length === 0 && (
                    <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">No signals matching filters</div>
                  )}
                </div>
              </>
            )}

            {activeTab === "whale" && (
              <div className="max-h-[500px] overflow-y-auto divide-y divide-border">
                {whaleItems.length === 0 && (
                  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                    <Activity className="w-6 h-6 mb-2" />
                    <span className="text-sm font-medium">Monitoring whale movements...</span>
                    <span className="text-[10px] mt-1">Crypto whale alerts will appear here</span>
                  </div>
                )}
                {whaleItems.map(p => (
                  <div key={p.id} className="px-3 py-3 hover:bg-muted/30 transition-colors">
                    <div className="flex items-start gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-blue-50 border border-blue-200 flex items-center justify-center text-sm shrink-0">🐋</div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-[#131722]">{p.influencer}</span>
                          <span className="text-[10px] text-muted-foreground">{timeAgo(p.publishedAt)}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{p.content}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === "flights" && (
              <div className="max-h-[500px] overflow-y-auto divide-y divide-border">
                <div className="px-3 py-2">
                  <span className="text-[10px] text-muted-foreground font-bold tracking-wider">ACTIVE MILITARY OPERATIONS</span>
                </div>
                {events.filter(e => (e.type === "war" || e.type === "conflict") && e.status !== "resolved").map(e => {
                  const cfg = SEVERITY_CONFIG[e.severity] ?? SEVERITY_CONFIG.low;
                  return (
                    <div key={e.id} className="px-3 py-2.5 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-2 mb-1">
                        <div className={`w-2 h-2 rounded-full ${cfg.dot} live-pulse`} />
                        <span className="text-xs font-bold text-[#131722]">{e.title}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground ml-4">
                        <span>{e.region}</span>
                        <span>·</span>
                        <span>{e.countries.join(", ")}</span>
                        <span>·</span>
                        <span className={e.status === "escalating" ? "text-red-600 font-bold" : e.status === "active" ? "text-orange-600 font-bold" : "text-yellow-600"}>
                          {e.status.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  );
                })}
                {flightCount === 0 && (
                  <div className="flex items-center justify-center py-8 text-muted-foreground text-sm">No active operations</div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
