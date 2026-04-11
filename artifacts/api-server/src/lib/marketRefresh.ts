import { db } from "@workspace/db";
import { marketAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

// ─── TradingView scanner symbol map (non-Indian international symbols) ────────
// Confirmed working via scanner.tradingview.com/global/scan
const TV_SYMBOL_MAP: Record<string, string> = {
  // US Indices
  SPX:    "SP:SPX",
  NDX:    "NASDAQ:NDX",
  DJI:    "DJ:DJI",
  VIX:    "CBOE:VIX",
  DXY:    "TVC:DXY",
  // Global Indices
  DAX:    "XETR:DAX",
  FTSE:   "TVC:UKX",
  CAC40:  "EURONEXT:PX1",
  N225:   "TVC:NI225",
  SSEC:   "SSE:000001",
  HSI:    "TVC:HSI",
  // Commodities (spot / continuous futures)
  XAUUSD: "OANDA:XAUUSD",
  XAGUSD: "TVC:SILVER",    // OANDA:XAGUSD blocked on scanner; TVC:SILVER works
  USOIL:  "NYMEX:CL1!",
  BRENT:  "ICEEUR:BRN1!",
  NATGAS: "NYMEX:NG1!",
  COPPER: "COMEX:HG1!",
  WHEAT:  "CBOT:ZW1!",
  // Forex
  EURUSD: "OANDA:EURUSD",
  GBPUSD: "OANDA:GBPUSD",
  USDJPY: "OANDA:USDJPY",
  USDCNY: "FX_IDC:USDCNY",
  USDRUB: "FX_IDC:USDRUB",
  USDTRY: "FX_IDC:USDTRY",
  // Crypto
  BTCUSD: "COINBASE:BTCUSD",
  ETHUSD: "COINBASE:ETHUSD",
  SOLUSD: "COINBASE:SOLUSD",
  BNBUSD: "BINANCE:BNBUSDT",
  // US & Global Bonds
  US10Y:  "TVC:US10Y",
  US2Y:   "TVC:US02Y",
  DE10Y:  "TVC:DE10Y",
  JP10Y:  "TVC:JP10Y",
};

// Indian symbols — keep Yahoo Finance (no TradingView equivalent)
const YAHOO_SYMBOL_MAP: Record<string, string> = {
  NIFTY50: "^NSEI",
  SENSEX:  "^BSESN",
  USDINR:  "INR=X",
};

const YAHOO_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

const TV_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Origin": "https://www.tradingview.com",
  "Referer": "https://www.tradingview.com/",
};

// Fetch a batch of symbols from TradingView scanner in one request
async function fetchTVBatch(
  tickers: string[]
): Promise<Record<string, { price: number; changeAbs: number; prevClose: number }>> {
  try {
    const resp = await fetch("https://scanner.tradingview.com/global/scan", {
      method: "POST",
      headers: TV_HEADERS,
      body: JSON.stringify({
        columns: ["close", "change_abs"],
        symbols: { tickers },
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return {};
    const data = await resp.json() as any;
    const result: Record<string, { price: number; changeAbs: number; prevClose: number }> = {};
    for (const item of data.data ?? []) {
      const [price, changeAbs] = item.d ?? [];
      if (price != null) {
        result[item.s] = {
          price,
          changeAbs: changeAbs ?? 0,
          prevClose: price - (changeAbs ?? 0),
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

// Fetch a batch of Indian symbols from Yahoo Finance spark API
async function fetchYahooBatch(
  symbols: string[]
): Promise<Record<string, { price: number; prevClose: number }>> {
  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.join(",")}&range=1d&interval=1d`;
    const resp = await fetch(url, {
      headers: YAHOO_HEADERS,
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) return {};
    const data = await resp.json() as any;
    const result: Record<string, { price: number; prevClose: number }> = {};
    for (const item of data?.spark?.result ?? []) {
      const meta = item?.response?.[0]?.meta;
      if (meta?.regularMarketPrice && item.symbol) {
        result[item.symbol] = {
          price: meta.regularMarketPrice,
          prevClose: meta.chartPreviousClose ?? meta.regularMarketPrice,
        };
      }
    }
    return result;
  } catch {
    return {};
  }
}

// ── In-memory cache — routes read this directly, no DB round-trip needed ──────
let _marketCache: any[] = [];
let _cacheLoaded = false;

export function getMarketCache(): any[] { return _marketCache; }
export function isMarketCacheLoaded(): boolean { return _cacheLoaded; }

async function loadCacheFromDb(): Promise<void> {
  if (_cacheLoaded) return;
  try {
    const timer = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15_000));
    const rows = await Promise.race([db.select().from(marketAssetsTable), timer]) as any[];
    if (rows.length > 0) {
      _marketCache = rows;
      _cacheLoaded = true;
      console.log(`[marketRefresh] In-memory cache loaded: ${rows.length} assets`);
    }
  } catch {
    console.log("[marketRefresh] DB cache load skipped (DB unavailable) — will retry on next refresh");
  }
}

let lastRefresh = 0;
const REFRESH_INTERVAL_MS = 60 * 1000;

export async function refreshMarketDataIfStale(force = false): Promise<{ refreshed: boolean }> {
  if (!force && Date.now() - lastRefresh < REFRESH_INTERVAL_MS) {
    return { refreshed: false };
  }
  lastRefresh = Date.now();

  // Ensure cache is seeded from DB on first run
  if (!_cacheLoaded) await loadCacheFromDb();

  try {
    // Build TradingView tickers list (batched into chunks of 40)
    const tvSymbols = Object.keys(TV_SYMBOL_MAP);
    const tvTickers = tvSymbols.map(s => TV_SYMBOL_MAP[s]);
    const BATCH_SIZE = 40;
    const tvBatches: string[][] = [];
    for (let i = 0; i < tvTickers.length; i += BATCH_SIZE) {
      tvBatches.push(tvTickers.slice(i, i + BATCH_SIZE));
    }

    // Fetch TradingView + Yahoo in parallel
    const [tvBatchResults, yahooData] = await Promise.allSettled([
      Promise.all(tvBatches.map(b => fetchTVBatch(b))),
      fetchYahooBatch(Object.values(YAHOO_SYMBOL_MAP)),
    ]);

    // Merge all TradingView batch results
    const tvQuotes: Record<string, { price: number; changeAbs: number; prevClose: number }> = {};
    if (tvBatchResults.status === "fulfilled") {
      for (const batchResult of tvBatchResults.value) {
        Object.assign(tvQuotes, batchResult);
      }
    }

    const yahooQuotes = yahooData.status === "fulfilled" ? yahooData.value : {};

    const now = new Date();

    // Update in-memory cache + DB (DB is fire-and-forget)
    const applyUpdate = (dbSym: string, price: number, change: number, prevClose: number) => {
      const changePercent = prevClose > 0 ? (change / prevClose) * 100 : 0;
      // Update cache
      const idx = _marketCache.findIndex((a: any) => a.symbol === dbSym);
      if (idx >= 0) {
        _marketCache[idx] = { ..._marketCache[idx], price, change, changePercent, lastUpdated: now };
      }
      // Fire-and-forget DB update
      db.update(marketAssetsTable)
        .set({ price, change, changePercent, lastUpdated: now })
        .where(eq(marketAssetsTable.symbol, dbSym))
        .catch(() => {});
    };

    // Update all TV symbols
    for (const dbSym of tvSymbols) {
      const tvSym = TV_SYMBOL_MAP[dbSym];
      const q = tvQuotes[tvSym];
      if (!q || !q.price) continue;
      applyUpdate(dbSym, q.price, q.changeAbs, q.prevClose);
    }

    // Update Indian / Yahoo symbols
    for (const dbSym of Object.keys(YAHOO_SYMBOL_MAP)) {
      const yahoSym = YAHOO_SYMBOL_MAP[dbSym];
      const q = yahooQuotes[yahoSym];
      if (!q || !q.price) continue;
      applyUpdate(dbSym, q.price, q.price - q.prevClose, q.prevClose);
    }

    return { refreshed: true };
  } catch (err) {
    console.error("[marketRefresh] Error:", err);
    return { refreshed: false };
  }
}
