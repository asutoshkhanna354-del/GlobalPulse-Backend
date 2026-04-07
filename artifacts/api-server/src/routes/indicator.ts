import { Router } from "express";
import { computeSignals, fetchOHLC } from "../lib/indicator.js";
import { openai } from "@workspace/integrations-openai-ai-server";

const router = Router();

const YAHOO_MAP: Record<string, string> = {
  SPX: "^GSPC", NDX: "^NDX", DJI: "^DJI", DAX: "^GDAXI", FTSE: "^FTSE",
  N225: "^N225", HSI: "^HSI", SSEC: "000001.SS", CAC40: "^FCHI", VIX: "^VIX",
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "USDJPY=X", DXY: "DX-Y.NYB",
  USDCNY: "USDCNY=X",
  XAUUSD: "GC=F",
  XAGUSD: "SI=F",
  USOIL: "CL=F",
  BRENT: "BZ=F", NATGAS: "NG=F", COPPER: "HG=F",
  BTCUSD: "BTC-USD", ETHUSD: "ETH-USD", SOLUSD: "SOL-USD", BNBUSD: "BNB-USD",
  NIFTY50: "^NSEI", SENSEX: "^BSESN",
};

// For live quotes, use spot symbols instead of futures where possible
const SPOT_QUOTE_MAP: Record<string, string> = {
  XAUUSD: "GC=F",   // Yahoo spot XAUUSD=X has auth issues; use futures for quote too
  XAGUSD: "GC=F",
};

// Futures that should be spot-adjusted when returning chart bars
const FUTURES_SPOT_MAP: Record<string, string> = {
  "GC=F": "XAUUSD=X",
  "SI=F": "XAGUSD=X",
};

function resolveSymbol(raw: string): string {
  const upper = raw.toUpperCase();
  return YAHOO_MAP[upper] || raw;
}

const YAHOO_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" };

async function fetchSpotPrice(spotSymbol: string): Promise<number | null> {
  // For gold spot: use goldprice.org free endpoint (widely used, no auth required)
  if (spotSymbol === "XAUUSD=X") {
    try {
      const resp = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://goldprice.org" },
        signal: AbortSignal.timeout(4000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const price = data.items?.[0]?.xauPrice;
        if (price != null && price > 1000) return price;
      }
    } catch {}
  }
  if (spotSymbol === "XAGUSD=X") {
    try {
      const resp = await fetch("https://data-asg.goldprice.org/dbXRates/USD", {
        headers: { "User-Agent": "Mozilla/5.0", "Referer": "https://goldprice.org" },
        signal: AbortSignal.timeout(4000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const price = data.items?.[0]?.xagPrice;
        if (price != null && price > 5) return price;
      }
    } catch {}
  }
  // Yahoo Finance v7 quote (fallback)
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(spotSymbol)}`;
    const resp = await fetch(url, { headers: YAHOO_HEADERS, signal: AbortSignal.timeout(4000) });
    if (resp.ok) {
      const data = await resp.json();
      const price = data.quoteResponse?.result?.[0]?.regularMarketPrice;
      if (price != null) return price;
    }
  } catch {}
  return null;
}

async function getAISignalAnalysis(
  symbol: string,
  marketMode: string,
  strength: number,
  lastSignalType: string | null,
  lastConfidence: number | null,
  lastPrice: number | null,
  stopLoss: number | null,
  takeProfit: number | null
): Promise<string> {
  try {
    const prompt = `You are a professional trading analyst. Analyze this signal concisely (max 12 words):
Symbol: ${symbol}
Market mode: ${marketMode}
Momentum strength: ${strength.toFixed(1)}%
${lastSignalType ? `Latest signal: ${lastSignalType.toUpperCase()} at ${lastPrice?.toFixed(2)} (confidence: ${lastConfidence}%)` : "No recent signal"}
${stopLoss ? `SL: ${stopLoss.toFixed(2)}, TP: ${takeProfit?.toFixed(2)}` : ""}

Provide a single short insight sentence (max 12 words, no punctuation at end, professional tone).`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-nano",
      max_completion_tokens: 40,
      messages: [{ role: "user", content: prompt }],
    });

    return response.choices[0]?.message?.content?.trim() || "";
  } catch {
    return "";
  }
}

router.get("/search", async (req, res) => {
  try {
    const q = (req.query.q as string) || "";
    if (q.length < 1) return res.json([]);
    const url = `https://query1.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=12&newsCount=0&listsCount=0`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return res.json([]);
    const data = await resp.json();
    const quotes = (data.quotes || []).map((q: any) => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || q.symbol,
      type: q.quoteType || "EQUITY",
      exchange: q.exchDisp || q.exchange || "",
    }));
    res.json(quotes);
  } catch {
    res.json([]);
  }
});

router.get("/quote/:symbol", async (req, res) => {
  try {
    const yahooSymbol = resolveSymbol(req.params.symbol);
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?range=1d&interval=1m&includePrePost=false`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const data = await resp.json();
    const result = data.chart?.result?.[0];
    if (!result) throw new Error("No data");
    const meta = result.meta || {};
    const timestamps = result.timestamp ?? [];
    const quote = result.indicators?.quote?.[0] ?? {};
    const lastIdx = timestamps.length - 1;
    const prevClose = meta.chartPreviousClose ?? meta.previousClose ?? null;
    const price = meta.regularMarketPrice ?? quote.close?.[lastIdx] ?? null;
    const open = quote.open?.[lastIdx] ?? null;
    const high = quote.high?.[lastIdx] ?? null;
    const low = quote.low?.[lastIdx] ?? null;
    const close = quote.close?.[lastIdx] ?? null;
    const volume = quote.volume?.[lastIdx] ?? 0;
    const ts = timestamps[lastIdx] ? timestamps[lastIdx] * 1000 : Date.now();

    res.json({
      symbol: yahooSymbol,
      price,
      prevClose,
      change: price && prevClose ? price - prevClose : null,
      changePercent: price && prevClose ? ((price - prevClose) / prevClose) * 100 : null,
      lastBar: { timestamp: ts, open, high, low, close, volume },
      currency: meta.currency || "USD",
      marketState: meta.marketState || "REGULAR",
      name: meta.shortName || meta.longName || yahooSymbol,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get("/signals/:symbol", async (req, res) => {
  try {
    const rawSymbol = req.params.symbol;
    const yahooSymbol = resolveSymbol(rawSymbol);
    const range = (req.query.range as string) || "3mo";
    const interval = (req.query.interval as string) || "1h";

    const bars = await fetchOHLC(yahooSymbol, range, interval);
    if (bars.length === 0) {
      return res.json({ bars: [], signals: [], marketMode: "NO DATA", strength: 0, drsi: [], signalLine: [], aiAnalysis: "" });
    }

    // Spot-adjust gold/silver bars so chart prices match real spot price
    const spotSymbol = FUTURES_SPOT_MAP[yahooSymbol];
    if (spotSymbol && bars.length > 0) {
      const spotPrice = await fetchSpotPrice(spotSymbol);
      if (spotPrice !== null) {
        const offset = bars[bars.length - 1].close - spotPrice;
        if (Math.abs(offset) > 0.5 && Math.abs(offset) < 200) {
          for (const bar of bars) {
            bar.open  = Math.max(0.01, bar.open  - offset);
            bar.high  = Math.max(0.01, bar.high  - offset);
            bar.low   = Math.max(0.01, bar.low   - offset);
            bar.close = Math.max(0.01, bar.close - offset);
          }
        }
      }
    }

    const result = computeSignals(bars);

    const lastSignal = result.signals.length > 0 ? result.signals[result.signals.length - 1] : null;
    const lastBar = bars[bars.length - 1];

    const aiAnalysis = await getAISignalAnalysis(
      rawSymbol,
      result.marketMode,
      result.strength,
      lastSignal?.type ?? null,
      lastSignal?.confidence ?? null,
      lastBar?.close ?? null,
      lastSignal?.stopLoss ?? null,
      lastSignal?.takeProfit ?? null
    );

    res.json({
      bars,
      ...result,
      aiAnalysis,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to compute signals" });
  }
});

router.get("/ohlc/:symbol", async (req, res) => {
  try {
    const yahooSymbol = resolveSymbol(req.params.symbol);
    const range = (req.query.range as string) || "1mo";
    const interval = (req.query.interval as string) || "1d";

    const bars = await fetchOHLC(yahooSymbol, range, interval);
    res.json({ bars });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to fetch OHLC" });
  }
});

export default router;
