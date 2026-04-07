import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { marketAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetMarketDataQueryParams,
  GetMarketDataResponse,
  GetMarketSummaryResponse,
  GetTopMoversResponse,
  GetAssetChartResponse,
} from "@workspace/api-zod";
import { refreshMarketDataIfStale } from "../lib/marketRefresh.js";

const router: IRouter = Router();

router.get("/market-data", async (req, res): Promise<void> => {
  refreshMarketDataIfStale().catch(() => {});

  const parsed = GetMarketDataQueryParams.safeParse(req.query);
  const category = parsed.success ? parsed.data.category : undefined;

  const assets = category
    ? await db.select().from(marketAssetsTable).where(eq(marketAssetsTable.category, category))
    : await db.select().from(marketAssetsTable);

  res.json(GetMarketDataResponse.parse(assets.map(a => ({
    ...a,
    lastUpdated: a.lastUpdated.toISOString(),
  }))));
});

router.get("/market-data/summary", async (_req, res): Promise<void> => {
  const assets = await db.select().from(marketAssetsTable);

  const fearGreedIndex = 42;
  const vixAsset = assets.find(a => a.symbol === "VIX");
  const goldAsset = assets.find(a => a.symbol === "XAUUSD");
  const oilAsset = assets.find(a => a.symbol === "USOIL");
  const dxyAsset = assets.find(a => a.symbol === "DXY");

  const gainers = assets.filter(a => a.changePercent > 0).length;
  const losers = assets.filter(a => a.changePercent < 0).length;

  let sentiment: string = "neutral";
  if (gainers > losers * 1.5) sentiment = "bullish";
  else if (losers > gainers * 1.5) sentiment = "bearish";
  else if (assets.some(a => Math.abs(a.changePercent) > 3)) sentiment = "volatile";

  const summary = {
    globalSentiment: sentiment,
    riskLevel: fearGreedIndex < 25 ? "extreme" : fearGreedIndex < 40 ? "high" : fearGreedIndex < 55 ? "moderate" : "low",
    activeConflicts: 7,
    majorEventCount: 12,
    dominantTrend: gainers >= losers ? "Risk-On: Equities advancing, safe havens retreating" : "Risk-Off: Capital rotating to safe havens",
    fearGreedIndex,
    vix: vixAsset?.price ?? 18.4,
    dollarIndex: dxyAsset?.price ?? 104.2,
    goldPrice: goldAsset?.price ?? 2340.5,
    oilPrice: oilAsset?.price ?? 82.3,
    updatedAt: new Date().toISOString(),
  };

  res.json(GetMarketSummaryResponse.parse(summary));
});

router.get("/market-data/movers", async (_req, res): Promise<void> => {
  const assets = await db.select().from(marketAssetsTable);

  const sorted = [...assets].sort((a, b) => b.changePercent - a.changePercent);
  const gainers = sorted.slice(0, 5).map(a => ({ ...a, lastUpdated: a.lastUpdated.toISOString() }));
  const losers = sorted.slice(-5).reverse().map(a => ({ ...a, lastUpdated: a.lastUpdated.toISOString() }));

  res.json(GetTopMoversResponse.parse({ gainers, losers }));
});

router.get("/market-data/chart/:symbol", async (req, res): Promise<void> => {
  const { symbol } = req.params;
  const range = (req.query.range as string) ?? "1mo";

  const intervalMap: Record<string, string> = {
    "1d": "5m",
    "5d": "15m",
    "1mo": "1d",
    "3mo": "1d",
  };
  const interval = intervalMap[range] ?? "1d";

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
        "Accept": "application/json",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });

    if (!response.ok) {
      res.status(502).json({ error: "Failed to fetch chart data" });
      return;
    }

    const data = await response.json() as any;
    const result = data?.chart?.result?.[0];

    if (!result) {
      res.status(404).json({ error: "No chart data found" });
      return;
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0] ?? {};
    const closes: number[] = quotes.close ?? [];
    const opens: number[] = quotes.open ?? [];
    const highs: number[] = quotes.high ?? [];
    const lows: number[] = quotes.low ?? [];
    const volumes: number[] = quotes.volume ?? [];

    const points = timestamps.map((ts, i) => ({
      timestamp: new Date(ts * 1000).toISOString(),
      open: opens[i] ?? null,
      high: highs[i] ?? null,
      low: lows[i] ?? null,
      close: closes[i] ?? 0,
      volume: volumes[i] ?? null,
    })).filter(p => p.close !== null && p.close !== 0);

    res.json(GetAssetChartResponse.parse({
      symbol,
      range,
      currency: result.meta?.currency ?? "USD",
      points,
      source: "Yahoo Finance",
    }));
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch chart data", details: String(err) });
  }
});

export default router;
