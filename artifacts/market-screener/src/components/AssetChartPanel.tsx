import { useState } from "react";
import { useGetAssetChart, useGetStockChart } from "@workspace/api-client-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { ExternalLink } from "lucide-react";
import type { GetAssetChartParams, GetStockChartParams } from "@workspace/api-zod";

const RANGES = ["1d", "5d", "1mo", "3mo"] as const;
type Range = typeof RANGES[number];

export const YAHOO_SYMBOL_MAP: Record<string, string> = {
  SPX: "^GSPC", NDX: "^NDX", DJI: "^DJI", DAX: "^GDAXI", FTSE: "^FTSE",
  N225: "^N225", HSI: "^HSI", SSEC: "000001.SS", CAC40: "^FCHI", VIX: "^VIX",
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "USDJPY=X", DXY: "DX-Y.NYB",
  USDCNY: "USDCNY=X", USDRUB: "USDRUB=X", USDTRY: "USDTRY=X",
  XAUUSD: "GC=F", XAGUSD: "SI=F", USOIL: "CL=F", BRENT: "BZ=F",
  NATGAS: "NG=F", COPPER: "HG=F", WHEAT: "ZW=F",
  BTCUSD: "BTC-USD", ETHUSD: "ETH-USD", SOLUSD: "SOL-USD", BNBUSD: "BNB-USD",
  US10Y: "^TNX", JP10Y: "^JGB", DE10Y: "^DE10YT=RR",
};

function formatDate(ts: string, range: Range): string {
  const d = new Date(ts);
  if (range === "1d") return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (range === "5d") return d.toLocaleDateString([], { month: "short", day: "numeric" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

interface ChartBodyProps {
  yahooSym: string;
  range: Range;
  isStock: boolean;
}

function ChartBody({ yahooSym, range, isStock }: ChartBodyProps) {
  const assetChartResult = useGetAssetChart(
    yahooSym,
    { range } as GetAssetChartParams,
    { query: { enabled: !isStock, refetchInterval: 60000 } }
  );

  const stockChartResult = useGetStockChart(
    yahooSym,
    { range } as GetStockChartParams,
    { query: { enabled: isStock, refetchInterval: 60000 } }
  );

  const { data: chartData, isLoading, isError } = isStock ? stockChartResult : assetChartResult;

  const points = chartData?.points ?? [];
  const firstClose = points[0]?.close ?? 0;
  const lastClose = points[points.length - 1]?.close ?? 0;
  const isUp = lastClose >= firstClose;

  const minPrice = points.length ? Math.min(...points.map(p => p.close)) : 0;
  const maxPrice = points.length ? Math.max(...points.map(p => p.close)) : 0;
  const domainPad = (maxPrice - minPrice) * 0.05;

  const formatted = points.map(p => ({
    time: formatDate(p.timestamp, range),
    price: p.close,
  }));

  const priceChange = lastClose - firstClose;
  const pctChange = firstClose ? (priceChange / firstClose) * 100 : 0;
  const isPositive = priceChange >= 0;

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex-1">
          <div className="text-xl font-mono font-bold text-foreground">
            {lastClose ? lastClose.toLocaleString(undefined, { maximumFractionDigits: 4 }) : "—"}
            {chartData?.currency && <span className="text-[11px] text-muted-foreground ml-1">{chartData.currency}</span>}
          </div>
          <div className={`text-[11px] font-mono ${isPositive ? "text-signal-up" : "text-signal-down"}`}>
            {isPositive ? "+" : ""}{priceChange.toFixed(4)} ({isPositive ? "+" : ""}{pctChange.toFixed(2)}%)
          </div>
        </div>
      </div>

      {isLoading && (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-[11px]">
          Loading chart data from Yahoo Finance...
        </div>
      )}

      {isError && (
        <div className="flex-1 flex items-center justify-center text-signal-down text-[11px]">
          Chart data unavailable. Check symbol mapping or try a different range.
        </div>
      )}

      {!isLoading && !isError && formatted.length > 0 && (
        <div className="flex-1 min-h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={formatted} margin={{ top: 5, right: 5, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id={`grad-${yahooSym.replace(/[^a-zA-Z0-9]/g, "")}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={isUp ? "#22c55e" : "#ef4444"} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis
                dataKey="time"
                tick={{ fontSize: 9, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: 9, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                domain={[minPrice - domainPad, maxPrice + domainPad]}
                tickFormatter={(v: number) => v >= 1000 ? v.toLocaleString(undefined, { maximumFractionDigits: 0 }) : v.toFixed(3)}
                width={60}
              />
              <Tooltip
                contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 4, fontSize: 10 }}
                labelStyle={{ color: "#94a3b8" }}
                itemStyle={{ color: isUp ? "#22c55e" : "#ef4444" }}
                formatter={(value: number) => [value.toLocaleString(undefined, { maximumFractionDigits: 4 }), "Price"]}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={isUp ? "#22c55e" : "#ef4444"}
                strokeWidth={1.5}
                fill={`url(#grad-${yahooSym.replace(/[^a-zA-Z0-9]/g, "")})`}
                dot={false}
                activeDot={{ r: 3, fill: isUp ? "#22c55e" : "#ef4444" }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      {chartData?.source && (
        <div className="flex items-center gap-1 text-[9px] text-muted-foreground mt-2">
          <ExternalLink className="w-2.5 h-2.5" />
          Data: {chartData.source} · Prices may be delayed up to 15 min
        </div>
      )}
    </>
  );
}

interface Props {
  symbol: string;
  name: string;
  isStock?: boolean;
  yahooSymbol?: string;
}

export function AssetChartPanel({ symbol, name, isStock = false, yahooSymbol }: Props) {
  const [range, setRange] = useState<Range>("1mo");

  const yahooSym = isStock
    ? (yahooSymbol ?? symbol)
    : (YAHOO_SYMBOL_MAP[symbol] ?? symbol);

  return (
    <div className="flex flex-col flex-1 overflow-auto p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-[11px] text-muted-foreground">{name}</div>
        <div className="flex gap-1">
          {RANGES.map(r => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-2 py-0.5 text-[10px] rounded border transition-colors ${
                range === r ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:text-foreground"
              }`}
            >
              {r.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      <ChartBody yahooSym={yahooSym} range={range} isStock={isStock} />
    </div>
  );
}
