import { useState } from "react";
import { useQuery } from "@tanstack/react-query";

import {
  Radio,
  Wifi,
  TrendingUp,
  TrendingDown,
  Minus,
  ExternalLink,
  RefreshCw,
  DollarSign,
  AlertTriangle,
  Zap,
} from "lucide-react";

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

const INFLUENCER_FILTERS = [
  { key: "all", label: "All", avatar: "🌐" },
  { key: "trump", label: "Trump", avatar: "🇺🇸" },
  { key: "musk", label: "Musk", avatar: "⚡" },
  { key: "powell", label: "Powell / Fed", avatar: "🏦" },
  { key: "yellen", label: "Yellen", avatar: "💵" },
  { key: "buffett", label: "Buffett", avatar: "💼" },
  { key: "saylor", label: "Saylor", avatar: "₿" },
  { key: "wood", label: "Cathie Wood", avatar: "🚀" },
  { key: "xi", label: "Xi Jinping", avatar: "🇨🇳" },
  { key: "lagarde", label: "Lagarde", avatar: "🇪🇺" },
  { key: "modi", label: "Modi", avatar: "🇮🇳" },
];

const SENTIMENT_COLORS: Record<string, string> = {
  bullish: "text-green-600",
  bearish: "text-red-600",
  neutral: "text-yellow-600",
};

const SENTIMENT_ICONS: Record<string, typeof TrendingUp> = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
};

const AVATAR_BG: Record<string, string> = {
  trump: "bg-red-50 border-red-200",
  musk: "bg-blue-50 border-blue-200",
  powell: "bg-amber-50 border-amber-200",
  yellen: "bg-green-50 border-green-200",
  buffett: "bg-purple-50 border-purple-200",
  saylor: "bg-orange-50 border-orange-200",
  wood: "bg-indigo-50 border-indigo-200",
  xi: "bg-red-50 border-red-200",
  lagarde: "bg-blue-50 border-blue-200",
  modi: "bg-orange-50 border-orange-200",
};

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  const hrs = Math.floor(mins / 60);
  const days = Math.floor(hrs / 24);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  if (hrs < 24) return `${hrs}h ago`;
  return `${days}d ago`;
}

function SocialCard({ post }: { post: SocialPost }) {
  const [expanded, setExpanded] = useState(false);
  const SentimentIcon = SENTIMENT_ICONS[post.sentiment] ?? Minus;
  const avatarBg = AVATAR_BG[post.category] ?? "bg-muted border-border";
  const ageMs = Date.now() - new Date(post.publishedAt).getTime();
  const isFresh = ageMs < 60 * 60 * 1000;

  return (
    <div className={`bg-card border rounded-lg overflow-hidden transition-all ${post.isBreaking ? "border-red-200" : isFresh ? "border-yellow-200" : "border-border"}`}>
      {post.isBreaking && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-1.5 flex items-center gap-2">
          <Radio className="w-3 h-3 text-red-600 animate-pulse" />
          <span className="text-[11px] font-bold text-red-600 tracking-widest uppercase">Breaking · Social Signal</span>
          <span className="ml-auto text-[11px] text-red-600">{timeAgo(post.publishedAt)}</span>
        </div>
      )}

      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={`w-11 h-11 rounded-full border-2 flex items-center justify-center text-xl shrink-0 ${avatarBg}`}>
            {post.influencer === "Donald Trump" ? "🇺🇸" :
             post.influencer === "Elon Musk" ? "⚡" :
             post.influencer === "Jerome Powell" ? "🏦" :
             post.influencer === "Janet Yellen" ? "💵" :
             post.influencer === "Warren Buffett" ? "💼" :
             post.influencer === "Michael Saylor" ? "₿" :
             post.influencer === "Cathie Wood" ? "🚀" :
             post.influencer === "Xi Jinping" ? "🇨🇳" :
             post.influencer === "Christine Lagarde" ? "🇪🇺" :
             post.influencer === "Narendra Modi" ? "🇮🇳" : "👤"}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-semibold text-foreground">{post.influencer}</span>
              <span className="text-[11px] text-muted-foreground">{post.handle}</span>
              {isFresh && !post.isBreaking && (
                <span className="text-[10px] bg-yellow-50 text-yellow-600 border border-yellow-200 px-1.5 py-0.5 rounded">FRESH</span>
              )}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">{post.platform}</div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <SentimentIcon className={`w-4 h-4 ${SENTIMENT_COLORS[post.sentiment]}`} />
            <span className={`text-[11px] font-medium uppercase tracking-wider ${SENTIMENT_COLORS[post.sentiment]}`}>
              {post.sentiment}
            </span>
            {!post.isBreaking && (
              <span className="text-[11px] text-muted-foreground">{timeAgo(post.publishedAt)}</span>
            )}
          </div>
        </div>

        <div className="mt-3">
          <p className="text-sm text-foreground leading-relaxed font-medium">{post.content}</p>
          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-[11px] text-muted-foreground">via {post.source}</span>
            {post.sourceUrl && (
              <a href={post.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-[11px] text-primary hover:underline flex items-center gap-0.5">
                <ExternalLink className="w-3 h-3" /> Source
              </a>
            )}
          </div>
        </div>

        {post.affectedAssets.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {post.affectedAssets.map(asset => (
              <span key={asset} className="text-[10px] bg-muted px-2 py-0.5 rounded border border-border text-muted-foreground font-mono tracking-wider">
                {asset}
              </span>
            ))}
          </div>
        )}

        <div className="mt-3 space-y-2">
          <div className="bg-primary/10 border border-primary/30 rounded p-3">
            <div className="flex items-center gap-1.5 mb-1">
              <Zap className="w-3.5 h-3.5 text-primary" />
              <span className="text-[11px] font-bold text-primary uppercase tracking-wider">Trading Conclusion</span>
            </div>
            <p className="text-[13px] text-foreground leading-relaxed">{post.tradingConclusion}</p>
          </div>

          {post.usdImpact && (
            <div className="bg-green-50 border border-green-200 rounded p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <DollarSign className="w-3.5 h-3.5 text-green-600" />
                <span className="text-[11px] font-bold text-green-600 uppercase tracking-wider">USD Impact</span>
              </div>
              <p className="text-[12px] text-green-700 leading-relaxed">{post.usdImpact}</p>
            </div>
          )}

          <button
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
          >
            <span>{expanded ? "▲ Less" : "▼ Market Impact"}</span>
          </button>

          {expanded && (
            <div className="bg-amber-50 border border-amber-200 rounded p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">Market Areas Affected</span>
              </div>
              <p className="text-[12px] text-amber-700">{post.marketImpact}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function Social() {
  const [filter, setFilter] = useState("all");
  const [isRefreshing, setIsRefreshing] = useState(false);

  const { data: posts = [], isLoading, refetch } = useQuery<SocialPost[]>({
    queryKey: ["social", filter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filter !== "all") params.set("category", filter);
      params.set("limit", "50");
      const res = await fetch(`/api/social?${params}`);
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  const handleForceRefresh = async () => {
    setIsRefreshing(true);
    await fetch("/api/social/refresh", { method: "POST" });
    await refetch();
    setIsRefreshing(false);
  };

  const breaking = posts.filter(p => p.isBreaking);
  const trumpPosts = posts.filter(p => p.category === "trump");
  const fedPosts = posts.filter(p => p.category === "powell" || p.category === "yellen");

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-4 lg:p-6 space-y-4 lg:space-y-6">
      <div className="flex flex-col sm:flex-row items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-lg sm:text-xl font-semibold text-foreground">Social Intelligence</h1>
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded px-2 py-1">
              <Wifi className="w-3 h-3 text-blue-600" />
              <span className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">Live Feed</span>
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Tracking Trump, Musk, Powell, Buffett and all market-moving figures · Refreshes every 1 min
          </p>
        </div>
        <button
          onClick={handleForceRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-2 text-[12px] text-muted-foreground hover:text-foreground border border-border rounded px-3 py-1.5 transition-colors"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh Now"}
        </button>
      </div>

      {(breaking.length > 0 || trumpPosts.length > 0 || fedPosts.length > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <div className="text-[10px] text-red-600 uppercase tracking-widest font-bold mb-1 flex items-center gap-1">
              <Radio className="w-3 h-3 animate-pulse" /> Breaking Signals
            </div>
            <div className="text-2xl font-bold text-red-600">{breaking.length}</div>
            <div className="text-[11px] text-muted-foreground">High-impact within 2h</div>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">🇺🇸 Trump Signals</div>
            <div className="text-2xl font-bold text-foreground">{trumpPosts.length}</div>
            <div className="text-[11px] text-muted-foreground">Tariff / Trade / Policy</div>
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-bold mb-1">🏦 Fed Signals</div>
            <div className="text-2xl font-bold text-foreground">{fedPosts.length}</div>
            <div className="text-[11px] text-muted-foreground">Rates / USD / Bonds</div>
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 flex-wrap">
        {INFLUENCER_FILTERS.map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-[12px] font-medium transition-colors border ${
              filter === f.key
                ? "bg-primary text-primary-foreground border-primary"
                : "text-muted-foreground border-border hover:border-primary/50 hover:text-foreground"
            }`}
          >
            <span>{f.avatar}</span>
            <span>{f.label}</span>
            {f.key !== "all" && (
              <span className="text-[10px] opacity-60">
                ({posts.filter(p => p.category === f.key).length})
              </span>
            )}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-card border border-border rounded-lg p-4 animate-pulse">
              <div className="flex gap-3">
                <div className="w-11 h-11 rounded-full bg-muted" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-1/3" />
                  <div className="h-3 bg-muted rounded w-1/2" />
                  <div className="h-3 bg-muted rounded w-full" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="bg-card border border-border rounded-lg p-12 text-center">
          <Radio className="w-10 h-10 text-muted-foreground mx-auto mb-4 opacity-40" />
          <p className="text-muted-foreground">No social intelligence signals found for this filter.</p>
          <p className="text-sm text-muted-foreground mt-1">Try "All" or click Refresh Now to fetch latest signals.</p>
          <button
            onClick={handleForceRefresh}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded text-sm"
          >
            Fetch Signals Now
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="text-[11px] text-muted-foreground">
            {posts.length} signal{posts.length !== 1 ? "s" : ""} tracked ·{" "}
            {filter === "all" ? "All influencers" : INFLUENCER_FILTERS.find(f => f.key === filter)?.label}
          </div>
          {posts.map(post => (
            <SocialCard key={post.id} post={post} />
          ))}
        </div>
      )}
    </div>
  );
}
