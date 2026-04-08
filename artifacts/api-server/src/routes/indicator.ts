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

// TradingView symbol for each futures-spot pair
const TV_SPOT_SYMBOL: Record<string, string> = {
  "XAUUSD=X": "OANDA:XAUUSD",
  "XAGUSD=X": "TVC:SILVER",   // OANDA:XAGUSD blocked on scanner
};

async function fetchSpotPrice(spotSymbol: string): Promise<number | null> {
  const tvSymbol = TV_SPOT_SYMBOL[spotSymbol];
  if (tvSymbol) {
    try {
      // TradingView scanner API — returns real-time spot price, no auth needed
      const resp = await fetch("https://scanner.tradingview.com/global/scan", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Origin": "https://www.tradingview.com",
          "Referer": "https://www.tradingview.com/",
        },
        body: JSON.stringify({ columns: ["close"], symbols: { tickers: [tvSymbol] } }),
        signal: AbortSignal.timeout(5000),
      });
      if (resp.ok) {
        const data = await resp.json();
        const price = data.data?.[0]?.d?.[0];
        if (price != null && price > 0) return price;
      }
    } catch {}
  }
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

// ─── TradingView live quote map (all international / non-Indian symbols) ───────
// Confirmed working via scanner.tradingview.com/global/scan on 2025-04
type TVEntry = { tvSym: string; name: string; currency: string };
const TV_QUOTE_MAP: Record<string, TVEntry> = {
  // Gold / Silver (spot via OANDA — more accurate than futures)
  XAUUSD: { tvSym: "OANDA:XAUUSD",    name: "Gold Spot (XAU/USD)",     currency: "USD" },
  XAGUSD: { tvSym: "TVC:SILVER",       name: "Silver Spot (XAG/USD)",   currency: "USD" },
  // Commodities (futures continuations)
  USOIL:  { tvSym: "NYMEX:CL1!",      name: "Crude Oil WTI",           currency: "USD" },
  BRENT:  { tvSym: "ICEEUR:BRN1!",    name: "Brent Crude Oil",         currency: "USD" },
  NATGAS: { tvSym: "NYMEX:NG1!",      name: "Natural Gas",             currency: "USD" },
  COPPER: { tvSym: "COMEX:HG1!",      name: "Copper",                  currency: "USD" },
  // Forex
  EURUSD: { tvSym: "OANDA:EURUSD",    name: "EUR/USD",                 currency: "USD" },
  GBPUSD: { tvSym: "OANDA:GBPUSD",    name: "GBP/USD",                 currency: "USD" },
  USDJPY: { tvSym: "OANDA:USDJPY",    name: "USD/JPY",                 currency: "JPY" },
  DXY:    { tvSym: "TVC:DXY",         name: "US Dollar Index",         currency: "USD" },
  USDCNY: { tvSym: "FX_IDC:USDCNY",  name: "USD/CNY",                 currency: "CNY" },
  USDCNH: { tvSym: "OANDA:USDCNH",    name: "USD/CNH (Offshore)",      currency: "CNH" },
  // Crypto
  BTCUSD: { tvSym: "COINBASE:BTCUSD", name: "Bitcoin (BTC/USD)",       currency: "USD" },
  ETHUSD: { tvSym: "COINBASE:ETHUSD", name: "Ethereum (ETH/USD)",      currency: "USD" },
  SOLUSD: { tvSym: "COINBASE:SOLUSD", name: "Solana (SOL/USD)",        currency: "USD" },
  BNBUSD: { tvSym: "BINANCE:BNBUSDT", name: "BNB (BNB/USDT)",         currency: "USD" },
  // US Indices
  SPX:    { tvSym: "SP:SPX",          name: "S&P 500",                 currency: "USD" },
  NDX:    { tvSym: "NASDAQ:NDX",      name: "Nasdaq 100",              currency: "USD" },
  DJI:    { tvSym: "DJ:DJI",          name: "Dow Jones",               currency: "USD" },
  VIX:    { tvSym: "CBOE:VIX",        name: "CBOE VIX",                currency: "USD" },
  SPY:    { tvSym: "AMEX:SPY",        name: "SPDR S&P 500 ETF",        currency: "USD" },
  QQQ:    { tvSym: "NASDAQ:QQQ",      name: "Invesco QQQ ETF",         currency: "USD" },
  // Global Indices
  DAX:    { tvSym: "XETR:DAX",        name: "DAX 40",                  currency: "EUR" },
  FTSE:   { tvSym: "TVC:UKX",         name: "FTSE 100",                currency: "GBP" },
  N225:   { tvSym: "TVC:NI225",       name: "Nikkei 225",              currency: "JPY" },
  HSI:    { tvSym: "TVC:HSI",         name: "Hang Seng Index",         currency: "HKD" },
  SSEC:   { tvSym: "SSE:000001",      name: "Shanghai Composite",      currency: "CNY" },
  CAC40:  { tvSym: "EURONEXT:PX1",    name: "CAC 40",                  currency: "EUR" },
  // Popular US Stocks
  AAPL:   { tvSym: "NASDAQ:AAPL",     name: "Apple Inc",               currency: "USD" },
  MSFT:   { tvSym: "NASDAQ:MSFT",     name: "Microsoft Corp",          currency: "USD" },
  NVDA:   { tvSym: "NASDAQ:NVDA",     name: "NVIDIA Corp",             currency: "USD" },
  TSLA:   { tvSym: "NASDAQ:TSLA",     name: "Tesla Inc",               currency: "USD" },
  GOOGL:  { tvSym: "NASDAQ:GOOGL",    name: "Alphabet Inc",            currency: "USD" },
  AMZN:   { tvSym: "NASDAQ:AMZN",     name: "Amazon.com Inc",          currency: "USD" },
  META:   { tvSym: "NASDAQ:META",     name: "Meta Platforms",          currency: "USD" },
  JPM:    { tvSym: "NYSE:JPM",        name: "JPMorgan Chase",          currency: "USD" },
  GS:     { tvSym: "NYSE:GS",         name: "Goldman Sachs",           currency: "USD" },
  BAC:    { tvSym: "NYSE:BAC",        name: "Bank of America",         currency: "USD" },
  WMT:    { tvSym: "NYSE:WMT",        name: "Walmart Inc",             currency: "USD" },
  XOM:    { tvSym: "NYSE:XOM",        name: "ExxonMobil Corp",         currency: "USD" },
  BRK:    { tvSym: "NYSE:BRK.B",      name: "Berkshire Hathaway B",    currency: "USD" },
};

// Indian market guard — keep Yahoo Finance for these
function isIndianSymbol(raw: string): boolean {
  const u = raw.toUpperCase();
  return u.endsWith(".NS") || u.endsWith(".BO") ||
    ["NIFTY50","SENSEX","^NSEI","^BSESN","NIFTYBANK","NIFTYMID50"].includes(u);
}

// Shared TradingView scanner fetch helper
const TV_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://www.tradingview.com",
  "Referer": "https://www.tradingview.com/",
};

async function fetchTVQuote(tvSym: string): Promise<{
  price: number; changeAbs: number; open: number; high: number; low: number; volume: number;
} | null> {
  try {
    const resp = await fetch("https://scanner.tradingview.com/global/scan", {
      method: "POST",
      headers: TV_HEADERS,
      body: JSON.stringify({ columns: ["close","change_abs","open","high","low","volume"], symbols: { tickers: [tvSym] } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const d = data.data?.[0]?.d;
    if (!d || d[0] == null) return null;
    return { price: d[0], changeAbs: d[1] ?? 0, open: d[2] ?? d[0], high: d[3] ?? d[0], low: d[4] ?? d[0], volume: d[5] ?? 0 };
  } catch { return null; }
}

// Auto-discover TradingView symbol for unknown tickers by trying common US exchanges
async function autoTVQuote(ticker: string): Promise<{ q: Awaited<ReturnType<typeof fetchTVQuote>>; tvSym: string } | null> {
  const candidates = [`NASDAQ:${ticker}`, `NYSE:${ticker}`, `AMEX:${ticker}`];
  try {
    const resp = await fetch("https://scanner.tradingview.com/global/scan", {
      method: "POST",
      headers: TV_HEADERS,
      body: JSON.stringify({ columns: ["close","change_abs","open","high","low","volume"], symbols: { tickers: candidates } }),
      signal: AbortSignal.timeout(5000),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    for (const item of data.data ?? []) {
      if (item.d?.[0] != null) {
        const d = item.d;
        return { tvSym: item.s, q: { price: d[0], changeAbs: d[1] ?? 0, open: d[2] ?? d[0], high: d[3] ?? d[0], low: d[4] ?? d[0], volume: d[5] ?? 0 } };
      }
    }
  } catch {}
  return null;
}

router.get("/quote/:symbol", async (req, res) => {
  try {
    const rawUpper = req.params.symbol.toUpperCase();

    // ── Indian symbols → always use Yahoo Finance (unchanged behaviour) ─────
    if (!isIndianSymbol(rawUpper)) {

      // 1) Check the predefined TradingView map
      const tvEntry = TV_QUOTE_MAP[rawUpper];
      if (tvEntry) {
        const q = await fetchTVQuote(tvEntry.tvSym);
        if (q) {
          const prevClose = q.price - q.changeAbs;
          return res.json({
            symbol: tvEntry.tvSym,
            price: q.price,
            prevClose,
            change: q.changeAbs,
            changePercent: prevClose > 0 ? (q.changeAbs / prevClose) * 100 : null,
            lastBar: { timestamp: Date.now(), open: q.open, high: q.high, low: q.low, close: q.price, volume: q.volume },
            currency: tvEntry.currency,
            marketState: "REGULAR",
            name: tvEntry.name,
          });
        }
      }

      // 2) Unknown clean ticker (no dots/carets/hyphens) → try US exchanges on TradingView
      const isCleanTicker = /^[A-Z]{1,6}$/.test(rawUpper);
      if (isCleanTicker) {
        const result = await autoTVQuote(rawUpper);
        if (result) {
          const { q, tvSym } = result;
          const prevClose = q.price - q.changeAbs;
          return res.json({
            symbol: tvSym,
            price: q.price,
            prevClose,
            change: q.changeAbs,
            changePercent: prevClose > 0 ? (q.changeAbs / prevClose) * 100 : null,
            lastBar: { timestamp: Date.now(), open: q.open, high: q.high, low: q.low, close: q.price, volume: q.volume },
            currency: "USD",
            marketState: "REGULAR",
            name: rawUpper,
          });
        }
      }
      // 3) Fall through to Yahoo Finance for anything TradingView couldn't resolve
    }

    // ── Yahoo Finance fallback (Indian + unresolved symbols) ─────────────────
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
