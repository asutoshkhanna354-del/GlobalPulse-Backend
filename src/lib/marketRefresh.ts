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
// Pre-seeded with the same static baseline as the DB seed so the cache is
// NEVER empty even if the DB is slow/unreachable.  Live prices overwrite these
// values on the first TradingView/Yahoo fetch (within ~60 s of startup).
const STATIC_SEED: any[] = [
  // Indices
  { id:1,  symbol:"SPX",    name:"S&P 500",              category:"indices",     price:5123.41, change:28.4,    changePercent:0.56,   volume:"3.2B",  currency:"USD", country:"United States", flag:"🇺🇸", marketCap:null, lastUpdated:new Date() },
  { id:2,  symbol:"NDX",    name:"NASDAQ 100",            category:"indices",     price:18043.2, change:124.6,   changePercent:0.70,   volume:"1.8B",  currency:"USD", country:"United States", flag:"🇺🇸", marketCap:null, lastUpdated:new Date() },
  { id:3,  symbol:"DJI",    name:"Dow Jones",             category:"indices",     price:38742.1, change:-45.2,   changePercent:-0.12,  volume:"420M",  currency:"USD", country:"United States", flag:"🇺🇸", marketCap:null, lastUpdated:new Date() },
  { id:4,  symbol:"DAX",    name:"DAX 40",                category:"indices",     price:18281.4, change:-112.3,  changePercent:-0.61,  volume:"89M",   currency:"EUR", country:"Germany",       flag:"🇩🇪", marketCap:null, lastUpdated:new Date() },
  { id:5,  symbol:"FTSE",   name:"FTSE 100",              category:"indices",     price:8023.7,  change:34.2,    changePercent:0.43,   volume:"760M",  currency:"GBP", country:"United Kingdom",flag:"🇬🇧", marketCap:null, lastUpdated:new Date() },
  { id:6,  symbol:"N225",   name:"Nikkei 225",            category:"indices",     price:38947.0, change:673.2,   changePercent:1.76,   volume:"2.1B",  currency:"JPY", country:"Japan",         flag:"🇯🇵", marketCap:null, lastUpdated:new Date() },
  { id:7,  symbol:"HSI",    name:"Hang Seng",             category:"indices",     price:17284.5, change:-234.1,  changePercent:-1.34,  volume:"1.4B",  currency:"HKD", country:"China",         flag:"🇭🇰", marketCap:null, lastUpdated:new Date() },
  { id:8,  symbol:"SSEC",   name:"Shanghai Composite",    category:"indices",     price:3041.2,  change:-18.7,   changePercent:-0.61,  volume:"980M",  currency:"CNY", country:"China",         flag:"🇨🇳", marketCap:null, lastUpdated:new Date() },
  { id:9,  symbol:"CAC40",  name:"CAC 40",                category:"indices",     price:7963.4,  change:45.8,    changePercent:0.58,   volume:"110M",  currency:"EUR", country:"France",        flag:"🇫🇷", marketCap:null, lastUpdated:new Date() },
  { id:10, symbol:"VIX",    name:"CBOE Volatility Index", category:"indices",     price:18.42,   change:-0.87,   changePercent:-4.51,  volume:null,    currency:"USD", country:"United States", flag:"🇺🇸", marketCap:null, lastUpdated:new Date() },
  // Currencies
  { id:11, symbol:"EURUSD", name:"EUR/USD",               category:"currencies",  price:1.0847,  change:0.0012,  changePercent:0.11,   volume:"82B",   currency:"USD", country:"Eurozone",      flag:"🇪🇺", marketCap:null, lastUpdated:new Date() },
  { id:12, symbol:"GBPUSD", name:"GBP/USD",               category:"currencies",  price:1.2612,  change:-0.0034, changePercent:-0.27,  volume:"45B",   currency:"USD", country:"United Kingdom",flag:"🇬🇧", marketCap:null, lastUpdated:new Date() },
  { id:13, symbol:"USDJPY", name:"USD/JPY",               category:"currencies",  price:152.87,  change:0.43,    changePercent:0.28,   volume:"68B",   currency:"JPY", country:"Japan",         flag:"🇯🇵", marketCap:null, lastUpdated:new Date() },
  { id:14, symbol:"DXY",    name:"US Dollar Index",        category:"currencies",  price:104.23,  change:-0.18,   changePercent:-0.17,  volume:null,    currency:"USD", country:"United States", flag:"🇺🇸", marketCap:null, lastUpdated:new Date() },
  { id:15, symbol:"USDCNY", name:"USD/CNY",               category:"currencies",  price:7.2381,  change:0.0156,  changePercent:0.22,   volume:"32B",   currency:"CNY", country:"China",         flag:"🇨🇳", marketCap:null, lastUpdated:new Date() },
  { id:16, symbol:"USDRUB", name:"USD/RUB",               category:"currencies",  price:91.43,   change:1.23,    changePercent:1.36,   volume:"8B",    currency:"RUB", country:"Russia",        flag:"🇷🇺", marketCap:null, lastUpdated:new Date() },
  { id:17, symbol:"USDTRY", name:"USD/TRY",               category:"currencies",  price:32.14,   change:0.22,    changePercent:0.69,   volume:"12B",   currency:"TRY", country:"Turkey",        flag:"🇹🇷", marketCap:null, lastUpdated:new Date() },
  // Commodities
  { id:18, symbol:"XAUUSD", name:"Gold",                  category:"commodities", price:2341.5,  change:12.3,    changePercent:0.53,   volume:"180B",  currency:"USD", country:null, flag:null, marketCap:null, lastUpdated:new Date() },
  { id:19, symbol:"XAGUSD", name:"Silver",                category:"commodities", price:27.42,   change:-0.31,   changePercent:-1.12,  volume:"12B",   currency:"USD", country:null, flag:null, marketCap:null, lastUpdated:new Date() },
  { id:20, symbol:"USOIL",  name:"WTI Crude Oil",         category:"commodities", price:82.34,   change:-1.23,   changePercent:-1.47,  volume:"980M",  currency:"USD", country:null, flag:null, marketCap:null, lastUpdated:new Date() },
  { id:21, symbol:"BRENT",  name:"Brent Crude Oil",       category:"commodities", price:87.12,   change:-1.45,   changePercent:-1.64,  volume:"1.2B",  currency:"USD", country:null, flag:null, marketCap:null, lastUpdated:new Date() },
  { id:22, symbol:"NATGAS", name:"Natural Gas",           category:"commodities", price:1.834,   change:0.043,   changePercent:2.40,   volume:"420M",  currency:"USD", country:null, flag:null, marketCap:null, lastUpdated:new Date() },
  { id:23, symbol:"COPPER", name:"Copper",                category:"commodities", price:4.432,   change:0.087,   changePercent:2.00,   volume:"32B",   currency:"USD", country:null, flag:null, marketCap:null, lastUpdated:new Date() },
  { id:24, symbol:"WHEAT",  name:"Wheat",                 category:"commodities", price:583.25,  change:-8.75,   changePercent:-1.48,  volume:"320M",  currency:"USD", country:null, flag:null, marketCap:null, lastUpdated:new Date() },
  // Crypto
  { id:25, symbol:"BTCUSD", name:"Bitcoin",               category:"crypto",      price:67234.0, change:1423.0,  changePercent:2.16,   volume:"28B",   currency:"USD", country:null, flag:null, marketCap:"1.32T", lastUpdated:new Date() },
  { id:26, symbol:"ETHUSD", name:"Ethereum",              category:"crypto",      price:3512.4,  change:-78.3,   changePercent:-2.18,  volume:"12B",   currency:"USD", country:null, flag:null, marketCap:"421B",  lastUpdated:new Date() },
  { id:27, symbol:"SOLUSD", name:"Solana",                category:"crypto",      price:178.23,  change:8.42,    changePercent:4.96,   volume:"3.2B",  currency:"USD", country:null, flag:null, marketCap:"79B",   lastUpdated:new Date() },
  { id:28, symbol:"BNBUSD", name:"BNB",                   category:"crypto",      price:582.1,   change:-12.4,   changePercent:-2.09,  volume:"1.8B",  currency:"USD", country:null, flag:null, marketCap:"86B",   lastUpdated:new Date() },
  // Bonds
  { id:29, symbol:"US10Y",  name:"US 10-Year Treasury",   category:"bonds",       price:4.487,   change:0.043,   changePercent:0.97,   volume:null,    currency:"USD", country:"United States", flag:"🇺🇸", marketCap:null, lastUpdated:new Date() },
  { id:30, symbol:"US2Y",   name:"US 2-Year Treasury",    category:"bonds",       price:4.823,   change:0.012,   changePercent:0.25,   volume:null,    currency:"USD", country:"United States", flag:"🇺🇸", marketCap:null, lastUpdated:new Date() },
  { id:31, symbol:"DE10Y",  name:"German 10-Year Bund",   category:"bonds",       price:2.413,   change:-0.021,  changePercent:-0.86,  volume:null,    currency:"EUR", country:"Germany",       flag:"🇩🇪", marketCap:null, lastUpdated:new Date() },
  { id:32, symbol:"JP10Y",  name:"Japan 10-Year JGB",     category:"bonds",       price:0.743,   change:0.008,   changePercent:1.09,   volume:null,    currency:"JPY", country:"Japan",         flag:"🇯🇵", marketCap:null, lastUpdated:new Date() },
  // Indian (Yahoo only — not in original DB seed but needed for summary)
  { id:33, symbol:"NIFTY50",name:"Nifty 50",              category:"indices",     price:22500.0, change:120.0,   changePercent:0.54,   volume:"3.1B",  currency:"INR", country:"India",         flag:"🇮🇳", marketCap:null, lastUpdated:new Date() },
  { id:34, symbol:"SENSEX", name:"BSE Sensex",            category:"indices",     price:74100.0, change:350.0,   changePercent:0.47,   volume:"2.3B",  currency:"INR", country:"India",         flag:"🇮🇳", marketCap:null, lastUpdated:new Date() },
  { id:35, symbol:"USDINR", name:"USD/INR",               category:"currencies",  price:83.45,   change:0.12,    changePercent:0.14,   volume:"18B",   currency:"INR", country:"India",         flag:"🇮🇳", marketCap:null, lastUpdated:new Date() },
];

let _marketCache: any[] = STATIC_SEED.map(a => ({ ...a }));  // start with static data immediately

export function getMarketCache(): any[] { return _marketCache; }

async function loadCacheFromDb(): Promise<void> {
  try {
    const timer = new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timeout")), 15_000));
    const rows = await Promise.race([db.select().from(marketAssetsTable), timer]) as any[];
    if (rows.length > 0) {
      // Merge DB rows into cache (DB has authoritative id/name/category/flags)
      for (const row of rows) {
        const idx = _marketCache.findIndex((a: any) => a.symbol === row.symbol);
        if (idx >= 0) _marketCache[idx] = { ..._marketCache[idx], ...row };
        else _marketCache.push(row);
      }
      console.log(`[marketRefresh] In-memory cache merged with DB: ${rows.length} assets`);
    }
  } catch {
    console.log("[marketRefresh] DB cache load skipped (DB slow) — using static seed prices until first TV/Yahoo refresh");
  }
}

let lastRefresh = 0;
const REFRESH_INTERVAL_MS = 60 * 1000;

export async function refreshMarketDataIfStale(force = false): Promise<{ refreshed: boolean }> {
  if (!force && Date.now() - lastRefresh < REFRESH_INTERVAL_MS) {
    return { refreshed: false };
  }
  lastRefresh = Date.now();

  // DB merge runs at startup (module-level); no need to retry here

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

// Kick off DB merge in background immediately when module loads.
// Cache already has static seed prices so routes can serve immediately.
loadCacheFromDb().catch(() => {});
