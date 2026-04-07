import { useState } from "react";
import { useGetGeopoliticalEvents, useGetGeopoliticalHeatmap } from "@workspace/api-client-react";
import { AlertTriangle, Globe, Map, Activity, ChevronDown, ChevronUp, ExternalLink, Target, TrendingDown } from "lucide-react";

type Severity = "critical" | "high" | "medium" | "low";

const SEVERITY_CONFIG: Record<string, { color: string; bg: string; border: string; dot: string; badge: string }> = {
  critical: { color: "text-red-700", bg: "bg-red-50", border: "border-red-200", dot: "bg-red-500", badge: "bg-red-50 text-red-700 border-red-200" },
  high: { color: "text-orange-700", bg: "bg-orange-50", border: "border-orange-200", dot: "bg-orange-500", badge: "bg-orange-50 text-orange-700 border-orange-200" },
  medium: { color: "text-yellow-700", bg: "bg-yellow-50", border: "border-yellow-200", dot: "bg-yellow-500", badge: "bg-yellow-50 text-yellow-700 border-yellow-200" },
  low: { color: "text-green-700", bg: "bg-green-50", border: "border-green-200", dot: "bg-green-500", badge: "bg-green-50 text-green-700 border-green-200" },
};

const STATUS_COLORS: Record<string, string> = {
  active: "text-red-600",
  escalating: "text-orange-600",
  "de-escalating": "text-yellow-600",
  resolved: "text-green-600",
};

const TYPE_LABELS: Record<string, string> = {
  war: "WAR",
  conflict: "CONFLICT",
  sanctions: "SANCTIONS",
  "trade-dispute": "TRADE DISPUTE",
  "political-crisis": "POLITICAL CRISIS",
  terrorism: "TERRORISM",
  protest: "PROTEST",
};

const RISK_COLORS: Record<string, string> = {
  extreme: "bg-red-700",
  high: "bg-orange-600",
  elevated: "bg-yellow-600",
  moderate: "bg-blue-700",
  low: "bg-green-700",
};

function EventCard({ event }: { event: any }) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[event.severity] ?? SEVERITY_CONFIG.low;

  return (
    <div className={`rounded border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <div className="p-3">
        <div className="flex items-start gap-2 mb-2">
          <div className={`w-2 h-2 rounded-full mt-1 shrink-0 ${cfg.dot} live-pulse`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-1">
              <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold border ${cfg.badge}`}>
                {event.severity.toUpperCase()}
              </span>
              <span className="text-[9px] text-muted-foreground font-mono border border-border px-1.5 py-0.5 rounded">
                {TYPE_LABELS[event.type] ?? event.type.toUpperCase()}
              </span>
              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                <Globe className="w-2.5 h-2.5" /> {event.region}
              </span>
              <span className={`ml-auto text-[9px] font-bold tracking-wide ${STATUS_COLORS[event.status] ?? "text-muted-foreground"}`}>
                {event.status.toUpperCase()}
              </span>
            </div>
            <h3 className={`text-sm font-semibold ${cfg.color} mb-1`}>{event.title}</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">{event.description}</p>
          </div>
        </div>

        <div className="ml-4 space-y-2">
          <div className="bg-muted rounded border border-border p-2">
            <div className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <AlertTriangle className="w-2.5 h-2.5" /> Market Impact
            </div>
            <p className="text-[11px] text-foreground/80 leading-relaxed">{event.marketImpact}</p>
          </div>

          {event.marketConclusion && (
            <div className="bg-primary/10 rounded border border-primary/30 p-2">
              <div className="text-[9px] uppercase tracking-wider text-primary mb-1 flex items-center gap-1">
                <Target className="w-2.5 h-2.5" /> Market Conclusion
              </div>
              <p className="text-[11px] text-foreground leading-relaxed font-medium">{event.marketConclusion}</p>
            </div>
          )}
        </div>

        <div className="ml-4 mt-2 flex items-center gap-3 flex-wrap">
          <div className="text-[10px] text-muted-foreground">
            Countries: <span className="text-foreground">{event.countries.join(", ")}</span>
          </div>
          <div className="text-[10px] text-muted-foreground">
            Since: <span className="text-foreground">{event.startDate}</span>
          </div>
          {event.economicLoss && (
            <div className="text-[10px] text-muted-foreground">
              Est. Loss: <span className="text-signal-down font-mono">{event.economicLoss}</span>
            </div>
          )}
          {event.casualtiesReported && (
            <span className="text-[9px] text-red-600 font-medium">Casualties reported</span>
          )}
        </div>

        {event.affectedMarkets && event.affectedMarkets.length > 0 && (
          <div className="ml-4 mt-2">
            <span className="text-[9px] text-muted-foreground mr-1">Affected Markets:</span>
            {event.affectedMarkets.map((m: string) => (
              <span key={m} className="inline-block text-[9px] bg-yellow-50 border border-yellow-200 text-yellow-700 rounded px-1.5 py-0.5 mr-1 mb-1">{m}</span>
            ))}
          </div>
        )}

        <div className="ml-4 mt-2">
          <span className="text-[9px] text-muted-foreground mr-1">Assets:</span>
          {event.affectedAssets.map((a: string) => (
            <span key={a} className="inline-block text-[9px] bg-card border border-border text-foreground rounded px-1.5 py-0.5 mr-1 mb-1 font-mono">{a}</span>
          ))}
        </div>

        {event.sources && event.sources.length > 0 && (
          <div className="ml-4 mt-2">
            <button
              onClick={() => setExpanded(v => !v)}
              className="flex items-center gap-1 text-[9px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <ExternalLink className="w-2.5 h-2.5" />
              Sources ({event.sources.length})
              {expanded ? <ChevronUp className="w-2.5 h-2.5" /> : <ChevronDown className="w-2.5 h-2.5" />}
            </button>
            {expanded && (
              <div className="mt-1.5 flex flex-wrap gap-1">
                {event.sources.map((s: string) => (
                  <span key={s} className="inline-flex items-center gap-0.5 text-[9px] bg-card border border-border text-cyan-600 rounded px-1.5 py-0.5">
                    <ExternalLink className="w-2 h-2" /> {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function Geopolitical() {
  const [view, setView] = useState<"events" | "heatmap">("events");
  const [severity, setSeverity] = useState<Severity | undefined>(undefined);

  const { data: events, isLoading } = useGetGeopoliticalEvents(
    severity ? { severity } : {},
    { query: { refetchInterval: 60000 } }
  );
  const { data: heatmap } = useGetGeopoliticalHeatmap();

  const SEVERITIES: { key: Severity | undefined; label: string }[] = [
    { key: undefined, label: "All" },
    { key: "critical", label: "Critical" },
    { key: "high", label: "High" },
    { key: "medium", label: "Medium" },
    { key: "low", label: "Low" },
  ];

  const sortedHeatmap = [...(heatmap ?? [])].sort((a, b) => b.riskScore - a.riskScore);

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-4 space-y-3">
      <div>
        <h1 className="text-base font-semibold text-foreground">Geopolitical Intelligence</h1>
        <p className="text-[11px] text-muted-foreground">Market-impacting conflicts, wars, trade disputes — with conclusions, sources, and affected markets</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          data-testid="view-events"
          onClick={() => setView("events")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded border transition-colors ${view === "events" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
        >
          <Activity className="w-3 h-3" /> Events
        </button>
        <button
          data-testid="view-heatmap"
          onClick={() => setView("heatmap")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded border transition-colors ${view === "heatmap" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
        >
          <Map className="w-3 h-3" /> Risk Heatmap
        </button>
      </div>

      {view === "events" && (
        <>
          <div className="flex gap-1.5 flex-wrap">
            {SEVERITIES.map(({ key, label }) => (
              <button
                key={label}
                data-testid={`severity-filter-${label.toLowerCase()}`}
                onClick={() => setSeverity(key)}
                className={`px-2.5 py-1 text-[10px] rounded border transition-colors ${severity === key ? "bg-secondary text-foreground border-border" : "text-muted-foreground border-transparent hover:border-border"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {isLoading && (
            <div className="text-center py-8 text-muted-foreground text-sm">Loading events...</div>
          )}

          <div className="space-y-3">
            {(events ?? []).map(event => (
              <EventCard key={event.id} event={event} />
            ))}
          </div>
        </>
      )}

      {view === "heatmap" && (
        <div className="space-y-2">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground flex-wrap">
            <span className="font-medium text-foreground">Country Risk Index</span>
            {["extreme", "high", "elevated", "moderate", "low"].map(level => (
              <div key={level} className="flex items-center gap-1">
                <div className={`w-2.5 h-2.5 rounded-sm ${RISK_COLORS[level]}`} />
                <span className="capitalize">{level}</span>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 gap-1.5">
            {sortedHeatmap.map(item => (
              <div key={item.countryCode} className="bg-card border border-border rounded flex items-center gap-3 px-3 py-2">
                <div className={`w-3 h-8 rounded-sm shrink-0 ${RISK_COLORS[item.riskLevel]}`} />
                <div className="w-8 text-[10px] font-mono text-muted-foreground">{item.countryCode}</div>
                <div className="flex-1">
                  <div className="text-[11px] font-medium text-foreground">{item.country}</div>
                  <div className="text-[9px] text-muted-foreground capitalize">{item.primaryRisk?.replace("-", " ")}</div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] font-mono font-bold text-foreground">{item.riskScore}</div>
                  <div className={`text-[9px] capitalize font-medium ${
                    item.riskLevel === "extreme" ? "text-red-600" :
                    item.riskLevel === "high" ? "text-orange-600" :
                    item.riskLevel === "elevated" ? "text-yellow-600" :
                    item.riskLevel === "moderate" ? "text-blue-600" : "text-green-600"
                  }`}>{item.riskLevel}</div>
                </div>
                <div className="w-28">
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${RISK_COLORS[item.riskLevel]}`}
                      style={{ width: `${item.riskScore}%` }}
                    />
                  </div>
                </div>
                {item.hasActiveConflict && (
                  <span className="text-[9px] text-red-600 font-medium shrink-0">⚔ CONFLICT</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
