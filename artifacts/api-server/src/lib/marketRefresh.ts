import { db } from "@workspace/db";
import { marketAssetsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

const YAHOO_SYMBOL_MAP: Record<string, string> = {
  SPX:    "^GSPC",
  NDX:    "^NDX",
  DJI:    "^DJI",
  DAX:    "^GDAXI",
  FTSE:   "^FTSE",
  CAC40:  "^FCHI",
  N225:   "^N225",
  SSEC:   "000001.SS",
  HSI:    "^HSI",
  NIFTY50:"^NSEI",
  SENSEX: "^BSESN",
  XAUUSD: "GC=F",
  USOIL:  "CL=F",
  BRENT:  "BZ=F",
  NATGAS: "NG=F",
  COPPER: "HG=F",
  WHEAT:  "ZW=F",
  SILVER: "SI=F",
  EURUSD: "EURUSD=X",
  USDJPY: "JPY=X",
  GBPUSD: "GBPUSD=X",
  USDINR: "INR=X",
  USDCNY: "CNY=X",
  USDRUB: "RUB=X",
  USDTRY: "TRY=X",
  BTCUSD: "BTC-USD",
  ETHUSD: "ETH-USD",
  SOLUSD: "SOL-USD",
  BNBUSD: "BNB-USD",
  VIX:    "^VIX",
  DXY:    "DX-Y.NYB",
  US10Y:  "^TNX",
  US2Y:   "^IRX",
};

const COINGECKO_MAP: Record<string, string> = {
  BTCUSD: "bitcoin",
  ETHUSD: "ethereum",
  SOLUSD: "solana",
  BNBUSD: "binancecoin",
};

async function fetchSparkBatch(yahooSymbols: string[]): Promise<Record<string, any>> {
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${yahooSymbols.join(",")}&range=1d&interval=1d`;
  const resp = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(12000) });
  if (!resp.ok) throw new Error(`Yahoo spark ${resp.status}`);
  const data = await resp.json() as any;
  const result: Record<string, any> = {};
  for (const item of (data?.spark?.result ?? [])) {
    const meta = item?.response?.[0]?.meta;
    if (meta && item.symbol) result[item.symbol] = meta;
  }
  return result;
}

async function fetchCoinGeckoPrices(): Promise<Record<string, { price: number; change24h: number }>> {
  const ids = Object.values(COINGECKO_MAP).join(",");
  const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!resp.ok) return {};
    const data = await resp.json() as any;
    const result: Record<string, { price: number; change24h: number }> = {};
    for (const [dbSymbol, geckoId] of Object.entries(COINGECKO_MAP)) {
      const row = data[geckoId];
      if (row) result[dbSymbol] = { price: row.usd, change24h: row.usd_24h_change ?? 0 };
    }
    return result;
  } catch {
    return {};
  }
}

let lastRefresh = 0;
const REFRESH_INTERVAL_MS = 60 * 1000;

export async function refreshMarketDataIfStale(force = false): Promise<{ refreshed: boolean }> {
  if (!force && Date.now() - lastRefresh < REFRESH_INTERVAL_MS) {
    return { refreshed: false };
  }
  lastRefresh = Date.now();

  try {
    const dbSymbols = Object.keys(YAHOO_SYMBOL_MAP);
    const yahooSymbols = dbSymbols.map(s => YAHOO_SYMBOL_MAP[s]);

    const BATCH_SIZE = 20;
    const batches: string[][] = [];
    for (let i = 0; i < yahooSymbols.length; i += BATCH_SIZE) {
      batches.push(yahooSymbols.slice(i, i + BATCH_SIZE));
    }

    const [batchResults, cgPrices] = await Promise.allSettled([
      Promise.allSettled(batches.map(b => fetchSparkBatch(b))),
      fetchCoinGeckoPrices(),
    ]) as [PromiseSettledResult<PromiseSettledResult<Record<string, any>>[]>, PromiseSettledResult<Record<string, { price: number; change24h: number }>>];

    const quotes: Record<string, any> = {};
    if (batchResults.status === "fulfilled") {
      for (const r of batchResults.value) {
        if (r.status === "fulfilled") Object.assign(quotes, r.value);
      }
    }

    const cgData = cgPrices.status === "fulfilled" ? cgPrices.value : {};

    const now = new Date();
    const updates = dbSymbols.map(async (dbSym) => {
      try {
        if (COINGECKO_MAP[dbSym] && cgData[dbSym]) {
          const { price, change24h } = cgData[dbSym];
          const prevClose = price / (1 + change24h / 100);
          const change = price - prevClose;
          await db.update(marketAssetsTable)
            .set({ price, change, changePercent: change24h, lastUpdated: now })
            .where(eq(marketAssetsTable.symbol, dbSym));
          return;
        }

        const yahooSym = YAHOO_SYMBOL_MAP[dbSym];
        const quote = quotes[yahooSym];
        if (!quote) return;

        const price: number = quote.regularMarketPrice ?? 0;
        if (!price) return;
        const prevClose: number = quote.chartPreviousClose ?? price;
        const change = price - prevClose;
        const changePercent = prevClose ? (change / prevClose) * 100 : 0;
        const volume = quote.regularMarketVolume ? String(quote.regularMarketVolume) : null;

        await db.update(marketAssetsTable)
          .set({ price, change, changePercent, volume, lastUpdated: now })
          .where(eq(marketAssetsTable.symbol, dbSym));
      } catch {
      }
    });

    await Promise.allSettled(updates);
    return { refreshed: true };
  } catch (err) {
    console.error("[marketRefresh] Error:", err);
    return { refreshed: false };
  }
}
