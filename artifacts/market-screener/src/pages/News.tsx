import { useState } from "react";
import { useGetNews } from "@workspace/api-client-react";
import { useQuery } from "@tanstack/react-query";
import {
  Zap, TrendingUp, TrendingDown, Minus, Newspaper, Calendar,
  Clock, Globe, ArrowUpRight, ArrowDownRight, AlertTriangle, Eye
} from "lucide-react";

type NewsTab = "global" | "forex";
type Category = "all" | "macro" | "geopolitical" | "earnings" | "central-banks" | "commodities" | "crypto";
type Impact = "high" | "medium" | "low";

const CATEGORIES: { key: Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "macro", label: "Macro" },
  { key: "geopolitical", label: "Geopolitical" },
  { key: "earnings", label: "Earnings" },
  { key: "central-banks", label: "Central Banks" },
  { key: "commodities", label: "Commodities" },
  { key: "crypto", label: "Crypto" },
];

const IMPACT_CONFIG: Record<string, { color: string; bg: string; border: string }> = {
  high: { color: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  medium: { color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200" },
  low: { color: "text-green-700", bg: "bg-green-50", border: "border-green-200" },
};

const SENTIMENT_ICONS: Record<string, React.ElementType> = {
  bullish: TrendingUp,
  bearish: TrendingDown,
  neutral: Minus,
};

const SENTIMENT_COLORS: Record<string, string> = {
  bullish: "text-green-600",
  bearish: "text-red-600",
  neutral: "text-muted-foreground",
};

const CURRENCY_FLAGS: Record<string, string> = {
  USD: "🇺🇸", EUR: "🇪🇺", GBP: "🇬🇧", JPY: "🇯🇵", AUD: "🇦🇺",
  CAD: "🇨🇦", CHF: "🇨🇭", NZD: "🇳🇿", CNY: "🇨🇳",
};

const DIRECTION_CONFIG: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  strengthen: { icon: ArrowUpRight, color: "text-green-600", label: "STRENGTHEN" },
  weaken: { icon: ArrowDownRight, color: "text-red-600", label: "WEAKEN" },
  volatile: { icon: AlertTriangle, color: "text-yellow-600", label: "VOLATILE" },
  watch: { icon: Eye, color: "text-blue-600", label: "WATCH" },
  neutral: { icon: Minus, color: "text-muted-foreground", label: "NEUTRAL" },
};

interface ForexEvent {
  id: number;
  title: string;
  currency: string;
  impact: string;
  eventDate: string;
  actual: string | null;
  forecast: string | null;
  previous: string | null;
  affectedPairs: string[] | null;
  conclusion: string | null;
  directionSignal: string | null;
  sourceUrl: string | null;
}

function GlobalNewsTab() {
  const [category, setCategory] = useState<Category>("all");
  const [impact, setImpact] = useState<Impact | undefined>(undefined);

  const { data: news, isLoading } = useGetNews({
    category: category === "all" ? undefined : category,
    impact: impact,
    limit: 30,
  });

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {CATEGORIES.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setCategory(key)}
            className={`px-2.5 py-1 text-[11px] rounded border transition-colors ${
              category === key
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
        <div className="ml-auto flex gap-1.5">
          {(["high", "medium", "low"] as Impact[]).map(i => (
            <button
              key={i}
              onClick={() => setImpact(impact === i ? undefined : i)}
              className={`px-2 py-0.5 text-[10px] rounded border uppercase tracking-wide transition-colors ${
                impact === i ? IMPACT_CONFIG[i].color + " " + IMPACT_CONFIG[i].bg + " " + IMPACT_CONFIG[i].border :
                "text-muted-foreground border-transparent hover:border-border"
              }`}
            >
              {i}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-28 bg-card rounded border border-border animate-pulse" />
          ))
        ) : (news ?? []).length === 0 ? (
          <div className="text-center py-10 text-muted-foreground">No news found for selected filters.</div>
        ) : (
          (news ?? []).map(n => {
            const impactCfg = IMPACT_CONFIG[n.impact] ?? IMPACT_CONFIG.low;
            const SentimentIcon = SENTIMENT_ICONS[n.sentiment] ?? Minus;
            const sentimentColor = SENTIMENT_COLORS[n.sentiment] ?? "text-muted-foreground";

            return (
              <div key={n.id} className="bg-card border border-border rounded p-3 hover:bg-card/80 transition-colors">
                <div className="flex items-start gap-2 mb-1.5 flex-wrap">
                  {n.isBreaking && (
                    <div className="flex items-center gap-1 px-1.5 py-0.5 bg-red-50 border border-red-200 rounded">
                      <Zap className="w-2.5 h-2.5 text-red-600" />
                      <span className="text-[10px] text-red-600 font-bold uppercase tracking-widest">Breaking</span>
                    </div>
                  )}
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wide font-medium ${impactCfg.color} ${impactCfg.bg} ${impactCfg.border}`}>
                    {n.impact} impact
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase tracking-wide">
                    {n.category}
                  </span>
                  <div className={`flex items-center gap-0.5 text-[10px] ${sentimentColor} ml-auto`}>
                    <SentimentIcon className="w-3 h-3" />
                    <span className="capitalize">{n.sentiment}</span>
                  </div>
                </div>

                <h3 className="text-[13px] font-semibold text-foreground leading-snug mb-1">{n.headline}</h3>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{n.summary}</p>

                <div className="bg-primary/5 border border-primary/20 rounded p-2 mb-2">
                  <span className="text-[10px] text-primary uppercase tracking-widest font-medium">Market Verdict: </span>
                  <span className="text-[11px] text-foreground">{n.marketConclusion}</span>
                </div>

                <div className="flex items-center gap-3 flex-wrap text-[10px]">
                  <span className="text-muted-foreground font-medium">{n.source}</span>
                  <span className="text-muted-foreground">{new Date(n.publishedAt).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit", hour12: true })} IST</span>
                  {n.region && <span className="text-muted-foreground">{n.region}</span>}
                  {n.affectedAssets.length > 0 && (
                    <div className="flex gap-1 ml-auto">
                      {n.affectedAssets.slice(0, 4).map(a => (
                        <span key={a} className="px-1.5 py-0.5 bg-muted/50 rounded font-mono text-muted-foreground">{a}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </>
  );
}

function ForexNewsTab() {
  const [currencyFilter, setCurrencyFilter] = useState<string>("all");
  const [impactFilter, setImpactFilter] = useState<string>("all");

  const { data: events = [], isLoading } = useQuery<ForexEvent[]>({
    queryKey: ["forex-calendar"],
    queryFn: async () => {
      const res = await fetch("/api/forex-calendar");
      if (!res.ok) throw new Error("Failed to fetch forex calendar");
      return res.json();
    },
    refetchInterval: 60 * 1000,
  });

  const currencies = ["all", "USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];

  const filtered = events.filter(e => {
    if (currencyFilter !== "all" && e.currency !== currencyFilter) return false;
    if (impactFilter !== "all" && e.impact !== impactFilter) return false;
    return true;
  });

  const now = new Date();
  const upcoming = filtered.filter(e => new Date(e.eventDate) >= now);
  const past = filtered.filter(e => new Date(e.eventDate) < now);

  const groupByDate = (items: ForexEvent[]) => {
    const groups: Record<string, ForexEvent[]> = {};
    for (const item of items) {
      const dateKey = new Date(item.eventDate).toLocaleDateString("en-IN", {
        timeZone: "Asia/Kolkata",
        weekday: "long",
        month: "short",
        day: "numeric",
        year: "numeric",
      });
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(item);
    }
    return groups;
  };

  const upcomingGroups = groupByDate(upcoming);
  const pastGroups = groupByDate(past);

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {currencies.map(c => (
          <button
            key={c}
            onClick={() => setCurrencyFilter(c)}
            className={`px-2.5 py-1 text-[11px] rounded border transition-colors flex items-center gap-1 ${
              currencyFilter === c
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-muted-foreground border-border hover:text-foreground"
            }`}
          >
            {c !== "all" && <span className="text-xs">{CURRENCY_FLAGS[c] ?? ""}</span>}
            {c === "all" ? "All Currencies" : c}
          </button>
        ))}
        <div className="ml-auto flex gap-1.5">
          {["all", "high", "medium", "low"].map(i => (
            <button
              key={i}
              onClick={() => setImpactFilter(i)}
              className={`px-2 py-0.5 text-[10px] rounded border uppercase tracking-wide transition-colors ${
                impactFilter === i
                  ? (i === "all" ? "bg-primary text-primary-foreground border-primary" : (IMPACT_CONFIG[i]?.color ?? "") + " " + (IMPACT_CONFIG[i]?.bg ?? "") + " " + (IMPACT_CONFIG[i]?.border ?? ""))
                  : "text-muted-foreground border-transparent hover:border-border"
              }`}
            >
              {i === "all" ? "All" : i}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-20 bg-card rounded border border-border animate-pulse" />
        ))
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground">No forex events found for selected filters.</div>
      ) : (
        <div className="space-y-4">
          {upcoming.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-green-600">Upcoming Events</span>
                <span className="text-[10px] text-muted-foreground">({upcoming.length})</span>
              </div>
              {Object.entries(upcomingGroups).map(([date, items]) => (
                <div key={date} className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <Calendar className="w-3 h-3 text-muted-foreground" />
                    <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wide">{date}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map(event => (
                      <ForexEventCard key={event.id} event={event} isUpcoming />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {past.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">Past Events</span>
                <span className="text-[10px] text-muted-foreground">({past.length})</span>
              </div>
              {Object.entries(pastGroups).map(([date, items]) => (
                <div key={date} className="mb-3">
                  <div className="flex items-center gap-2 mb-1.5 px-1">
                    <Calendar className="w-3 h-3 text-muted-foreground/50" />
                    <span className="text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wide">{date}</span>
                  </div>
                  <div className="space-y-1.5">
                    {items.map(event => (
                      <ForexEventCard key={event.id} event={event} isUpcoming={false} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function ForexEventCard({ event, isUpcoming }: { event: ForexEvent; isUpcoming: boolean }) {
  const impactCfg = IMPACT_CONFIG[event.impact] ?? IMPACT_CONFIG.low;
  const direction = DIRECTION_CONFIG[event.directionSignal ?? "watch"] ?? DIRECTION_CONFIG.watch;
  const DirectionIcon = direction.icon;
  const eventTime = new Date(event.eventDate);

  const timeStr = eventTime.toLocaleTimeString("en-IN", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }) + " IST";

  const nowIST = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const eventIST = new Date(eventTime.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
  const isToday = nowIST.toDateString() === eventIST.toDateString();
  const isPast = eventTime < new Date();
  const isSoon = isUpcoming && eventTime.getTime() - Date.now() < 2 * 60 * 60 * 1000;

  return (
    <div className={`bg-card border rounded p-3 transition-colors ${
      isSoon ? "border-yellow-200 bg-yellow-50/50" :
      isPast ? "border-border/50 opacity-75" :
      "border-border hover:border-border"
    }`}>
      <div className="flex items-start gap-3">
        <div className="flex flex-col items-center min-w-[52px] pt-0.5">
          <span className={`text-[11px] font-mono font-bold ${isSoon ? "text-yellow-600" : isToday ? "text-primary" : "text-muted-foreground"}`}>
            {timeStr}
          </span>
          {isSoon && (
            <span className="text-[9px] text-yellow-600 uppercase font-bold mt-0.5 animate-pulse">SOON</span>
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm">{CURRENCY_FLAGS[event.currency] ?? "🏳️"}</span>
            <span className="text-[11px] font-bold text-foreground">{event.currency}</span>

            <span className={`px-1.5 py-0.5 rounded border text-[9px] uppercase tracking-wide font-bold ${impactCfg.color} ${impactCfg.bg} ${impactCfg.border}`}>
              {event.impact}
            </span>

            <div className={`flex items-center gap-0.5 ml-auto ${direction.color}`}>
              <DirectionIcon className="w-3.5 h-3.5" />
              <span className="text-[10px] font-bold uppercase tracking-wide">{direction.label}</span>
            </div>
          </div>

          <h4 className="text-[12px] font-semibold text-foreground leading-snug mb-1.5">{event.title}</h4>

          <div className="flex items-center gap-4 mb-2 text-[10px]">
            {event.forecast && (
              <div>
                <span className="text-muted-foreground">Forecast: </span>
                <span className="text-foreground font-mono font-semibold">{event.forecast}</span>
              </div>
            )}
            {event.previous && (
              <div>
                <span className="text-muted-foreground">Previous: </span>
                <span className="text-foreground font-mono font-semibold">{event.previous}</span>
              </div>
            )}
            {event.actual && (
              <div>
                <span className="text-muted-foreground">Actual: </span>
                <span className={`font-mono font-bold ${
                  event.directionSignal === "strengthen" ? "text-green-600" :
                  event.directionSignal === "weaken" ? "text-red-600" : "text-foreground"
                }`}>{event.actual}</span>
              </div>
            )}
          </div>

          {event.conclusion && (
            <div className={`rounded p-2 mb-1.5 ${
              event.directionSignal === "strengthen" ? "bg-green-50 border border-green-200" :
              event.directionSignal === "weaken" ? "bg-red-50 border border-red-200" :
              event.directionSignal === "volatile" ? "bg-yellow-50 border border-yellow-200" :
              "bg-primary/5 border border-primary/20"
            }`}>
              <span className="text-[10px] uppercase tracking-widest font-bold text-muted-foreground">Forex Conclusion: </span>
              <span className="text-[11px] text-foreground leading-relaxed">{event.conclusion}</span>
            </div>
          )}

          {event.affectedPairs && event.affectedPairs.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <Globe className="w-3 h-3 text-muted-foreground" />
              {event.affectedPairs.map(pair => (
                <span key={pair} className="px-1.5 py-0.5 bg-muted/50 rounded text-[10px] font-mono text-muted-foreground">{pair}</span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function News() {
  const [activeTab, setActiveTab] = useState<NewsTab>("global");

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-4 space-y-3">
      <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
        <button
          onClick={() => setActiveTab("global")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
            activeTab === "global"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground border border-border hover:text-foreground"
          }`}
        >
          <Newspaper className="w-4 h-4" />
          Global Financial News
        </button>
        <button
          onClick={() => setActiveTab("forex")}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg text-[12px] font-semibold transition-colors ${
            activeTab === "forex"
              ? "bg-primary text-primary-foreground"
              : "bg-card text-muted-foreground border border-border hover:text-foreground"
          }`}
        >
          <Calendar className="w-4 h-4" />
          Forex News
        </button>
      </div>

      {activeTab === "global" ? (
        <>
          <div>
            <h1 className="text-base font-semibold text-foreground">Global Financial News</h1>
            <p className="text-[11px] text-muted-foreground">Breaking news with market impact analysis and trading conclusions</p>
          </div>
          <GlobalNewsTab />
        </>
      ) : (
        <>
          <div>
            <h1 className="text-base font-semibold text-foreground flex items-center gap-2">
              <span>Forex Economic Calendar</span>
              <div className="flex items-center gap-1.5 text-[9px] text-muted-foreground bg-card border border-border rounded px-2 py-1 ml-auto">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                LIVE DATA
              </div>
            </h1>
            <p className="text-[11px] text-muted-foreground">
              Upcoming economic events with forex pair impact analysis · Source: ForexFactory · Refreshes every 1hr
            </p>
          </div>
          <ForexNewsTab />
        </>
      )}
    </div>
  );
}
