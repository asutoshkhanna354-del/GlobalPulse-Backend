import { useState } from "react";
import { useGetEconomicIndicators, useGetEconomicCalendar } from "@workspace/api-client-react";
import { TrendingUp, TrendingDown, Minus, Calendar, BarChart3, Clock } from "lucide-react";

type IndicatorType = "gdp" | "inflation" | "unemployment" | "interest-rate" | "trade-balance" | "debt-to-gdp";

const INDICATORS: { key: IndicatorType | undefined; label: string }[] = [
  { key: undefined, label: "All" },
  { key: "gdp", label: "GDP" },
  { key: "inflation", label: "Inflation" },
  { key: "unemployment", label: "Unemployment" },
  { key: "interest-rate", label: "Interest Rates" },
];

const IMPACT_COLORS: Record<string, string> = {
  high: "text-red-600 border-red-200 bg-red-50",
  medium: "text-yellow-600 border-yellow-200 bg-yellow-50",
  low: "text-green-600 border-green-200 bg-green-50",
};

const TREND_ICONS: Record<string, React.ElementType> = {
  improving: TrendingUp,
  deteriorating: TrendingDown,
  stable: Minus,
};

const TREND_COLORS: Record<string, string> = {
  improving: "text-green-600",
  deteriorating: "text-red-600",
  stable: "text-muted-foreground",
};

export function Economics() {
  const [view, setView] = useState<"indicators" | "calendar">("indicators");
  const [indicator, setIndicator] = useState<IndicatorType | undefined>(undefined);

  const { data: indicators, isLoading: indLoading } = useGetEconomicIndicators(
    indicator ? { indicator } : {},
  );
  const { data: calendar, isLoading: calLoading } = useGetEconomicCalendar();

  return (
    <div className="flex-1 overflow-auto p-3 sm:p-4 space-y-3">
      <div>
        <h1 className="text-base font-semibold text-foreground">Economic Indicators</h1>
        <p className="text-[11px] text-muted-foreground">Key economic data by country — GDP, inflation, rates, employment</p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <button
          data-testid="view-indicators"
          onClick={() => setView("indicators")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded border transition-colors ${view === "indicators" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
        >
          <BarChart3 className="w-3 h-3" /> Indicators
        </button>
        <button
          data-testid="view-calendar"
          onClick={() => setView("calendar")}
          className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] rounded border transition-colors ${view === "calendar" ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"}`}
        >
          <Calendar className="w-3 h-3" /> Economic Calendar
        </button>

        {view === "indicators" && (
          <div className="flex gap-1.5 ml-2">
            {INDICATORS.map(({ key, label }) => (
              <button
                key={label}
                data-testid={`indicator-filter-${label.toLowerCase().replace(" ", "-")}`}
                onClick={() => setIndicator(key)}
                className={`px-2.5 py-1 text-[10px] rounded border transition-colors ${indicator === key ? "bg-secondary text-foreground border-border" : "text-muted-foreground border-transparent hover:border-border"}`}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </div>

      {view === "indicators" && (
        <div className="bg-card border border-border rounded overflow-x-auto">
          <table className="w-full text-[11px] min-w-[700px]">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="text-left px-3 py-2 text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Country</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Indicator</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Value</th>
                <th className="text-right px-3 py-2 text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Prev</th>
                <th className="text-left px-3 py-2 text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Period</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Trend</th>
                <th className="text-center px-3 py-2 text-muted-foreground font-medium uppercase tracking-widest text-[10px]">Impact</th>
              </tr>
            </thead>
            <tbody>
              {indLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border/40">
                    <td colSpan={7} className="px-3 py-2.5">
                      <div className="h-3 bg-muted rounded animate-pulse" />
                    </td>
                  </tr>
                ))
              ) : (indicators ?? []).length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">No data found.</td></tr>
              ) : (
                (indicators ?? []).map(ind => {
                  const TrendIcon = TREND_ICONS[ind.trend] ?? Minus;
                  const trendColor = TREND_COLORS[ind.trend] ?? "text-muted-foreground";
                  return (
                    <tr
                      key={ind.id}
                      data-testid={`indicator-row-${ind.countryCode}-${ind.indicator}`}
                      className="border-b border-border/40 hover:bg-muted/20 transition-colors"
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{ind.flag}</span>
                          <span className="text-foreground">{ind.country}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground text-[10px] uppercase">{ind.indicator}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono font-semibold text-foreground">
                        {ind.value.toFixed(1)}<span className="text-muted-foreground text-[10px] ml-0.5">{ind.unit}</span>
                      </td>
                      <td className="px-3 py-2 text-right font-mono text-muted-foreground">
                        {ind.previousValue != null ? ind.previousValue.toFixed(1) : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{ind.period}</td>
                      <td className="px-3 py-2 text-center">
                        <div className={`flex items-center justify-center gap-0.5 ${trendColor}`}>
                          <TrendIcon className="w-3 h-3" />
                          <span className="capitalize text-[10px]">{ind.trend}</span>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <span className={`px-1.5 py-0.5 rounded border text-[10px] capitalize ${ind.impact === "positive" ? "text-green-600 border-green-200 bg-green-50" : ind.impact === "negative" ? "text-red-600 border-red-200 bg-red-50" : "text-muted-foreground border-border bg-muted/30"}`}>
                          {ind.impact}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {view === "calendar" && (
        <div className="space-y-2">
          {calLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-16 bg-card rounded border border-border animate-pulse" />
            ))
          ) : (calendar ?? []).length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No calendar events found.</div>
          ) : (
            (calendar ?? []).map(ev => {
              const scheduled = new Date(ev.scheduledAt);
              const isPast = ev.released;
              return (
                <div
                  key={ev.id}
                  data-testid={`calendar-event-${ev.id}`}
                  className={`bg-card border rounded p-3 transition-colors ${isPast ? "border-border/50 opacity-60" : "border-border hover:border-border"}`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      <div className="text-center min-w-[48px]">
                        <div className="text-[10px] text-muted-foreground">{scheduled.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", month: "short", day: "numeric" })}</div>
                        <div className="text-[10px] text-muted-foreground flex items-center gap-0.5 justify-center">
                          <Clock className="w-2.5 h-2.5" />{scheduled.toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST
                        </div>
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{ev.flag}</span>
                          <span className="text-xs font-medium text-foreground">{ev.title}</span>
                          {isPast && <span className="text-[10px] text-muted-foreground">(Released)</span>}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">{ev.country} · {ev.indicator}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 text-right shrink-0">
                      {ev.forecast != null && (
                        <div>
                          <div className="text-[10px] text-muted-foreground">Forecast</div>
                          <div className="text-xs font-mono text-foreground">{ev.forecast}{ev.unit}</div>
                        </div>
                      )}
                      {ev.previous != null && (
                        <div>
                          <div className="text-[10px] text-muted-foreground">Previous</div>
                          <div className="text-xs font-mono text-muted-foreground">{ev.previous}{ev.unit}</div>
                        </div>
                      )}
                      {ev.actual != null && (
                        <div>
                          <div className="text-[10px] text-muted-foreground">Actual</div>
                          <div className={`text-xs font-mono font-bold ${ev.actual > (ev.forecast ?? ev.previous ?? 0) ? "text-green-600" : "text-red-600"}`}>{ev.actual}{ev.unit}</div>
                        </div>
                      )}
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] uppercase ${IMPACT_COLORS[ev.impact]}`}>{ev.impact}</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
