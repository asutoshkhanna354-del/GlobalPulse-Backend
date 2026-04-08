/**
 * NSE Real-time Streaming Engine
 *
 * Uses the NSE unofficial API for near real-time Indian market data:
 * - NIFTY 50 equities via /api/equity-stockIndices?index=NIFTY%2050
 * - All indices (BANKNIFTY, FINNIFTY, MIDCAP, VIX) via /api/allIndices
 * - Polls every 300ms with session cookie reuse
 * - Builds OHLC candles (1s / 5s / 1m) in-memory
 * - Broadcasts ticks + candle updates through the shared WS system
 */

import * as https from "https";
import * as zlib from "zlib";
import type { IncomingMessage } from "http";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NseTick {
  symbol:    string;
  price:     number;
  open:      number;
  high:      number;
  low:       number;
  prevClose: number;
  change:    number;
  changePct: number;
  volume:    number;
  timestamp: number;
}

export type CandleTimeframe = "1s" | "5s" | "1m";

export interface OhlcCandle {
  symbol:    string;
  timeframe: CandleTimeframe;
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
  startTime: number;
  updatedAt: number;
}

// ─── Broadcast callback (injected by priceStream.ts) ─────────────────────────

type TickCallback   = (tick: NseTick)   => void;
type CandleCallback = (candle: OhlcCandle) => void;

let onTick:   TickCallback   | null = null;
let onCandle: CandleCallback | null = null;

export function setNseCallbacks(tickCb: TickCallback, candleCb: CandleCallback) {
  onTick   = tickCb;
  onCandle = candleCb;
}

// ─── In-memory candle store ───────────────────────────────────────────────────

const TIMEFRAMES: CandleTimeframe[] = ["1s", "5s", "1m"];

function bucketMs(tf: CandleTimeframe): number {
  if (tf === "1s") return 1000;
  if (tf === "5s") return 5000;
  return 60000;
}

// Map: symbol → timeframe → current open candle
const candleStore = new Map<string, Map<CandleTimeframe, OhlcCandle>>();

function updateCandle(symbol: string, price: number, volume: number, ts: number) {
  if (!candleStore.has(symbol)) candleStore.set(symbol, new Map());
  const symMap = candleStore.get(symbol)!;

  for (const tf of TIMEFRAMES) {
    const bucket  = bucketMs(tf);
    const bucketT = Math.floor(ts / bucket) * bucket;

    let candle = symMap.get(tf);

    if (!candle || candle.startTime !== bucketT) {
      // New candle period — open a fresh candle
      candle = {
        symbol,
        timeframe: tf,
        open:      price,
        high:      price,
        low:       price,
        close:     price,
        volume:    volume,
        startTime: bucketT,
        updatedAt: ts,
      };
    } else {
      candle.high      = Math.max(candle.high, price);
      candle.low       = Math.min(candle.low, price);
      candle.close     = price;
      candle.volume   += volume;
      candle.updatedAt = ts;
    }

    symMap.set(tf, candle);

    if (onCandle) {
      try { onCandle({ ...candle }); } catch {}
    }
  }
}

export function getCandles(symbol: string, timeframe: CandleTimeframe): OhlcCandle | undefined {
  return candleStore.get(symbol.toUpperCase())?.get(timeframe);
}

export function getAllCandles(): OhlcCandle[] {
  const result: OhlcCandle[] = [];
  for (const symMap of candleStore.values()) {
    for (const candle of symMap.values()) {
      result.push(candle);
    }
  }
  return result;
}

// ─── NSE session (cookie reuse) ───────────────────────────────────────────────

let nseCookies = "";
let sessionInitialised = false;
let sessionInitialising = false;

const NSE_HEADERS = {
  "User-Agent":      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Accept":          "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Referer":         "https://www.nseindia.com/",
  "Connection":      "keep-alive",
};

function extractCookies(headers: IncomingMessage["headers"]): string {
  const raw = headers["set-cookie"];
  if (!raw) return "";
  return raw.map(c => c.split(";")[0]).join("; ");
}

function nseGet(path: string, extraHeaders: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: "www.nseindia.com",
      path,
      method:   "GET",
      headers:  {
        ...NSE_HEADERS,
        ...extraHeaders,
        ...(nseCookies ? { Cookie: nseCookies } : {}),
      },
      timeout: 5000,
    };

    const req = https.request(options, (res: IncomingMessage) => {
      // Merge any new cookies
      const newCookies = extractCookies(res.headers);
      if (newCookies) {
        const existing = new Map<string, string>(
          nseCookies.split("; ").filter(Boolean).map(c => {
            const [k, v] = c.split("=");
            return [k, v] as [string, string];
          })
        );
        for (const pair of newCookies.split("; ")) {
          const [k, v] = pair.split("=");
          if (k) existing.set(k, v || "");
        }
        nseCookies = [...existing.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
      }

      // Handle gzip / deflate / br decompression
      const encoding = (res.headers["content-encoding"] || "").toLowerCase();
      let stream: NodeJS.ReadableStream = res;
      if (encoding === "gzip") {
        stream = res.pipe(zlib.createGunzip());
      } else if (encoding === "deflate") {
        stream = res.pipe(zlib.createInflate());
      } else if (encoding === "br") {
        stream = res.pipe(zlib.createBrotliDecompress());
      }

      const chunks: Buffer[] = [];
      stream.on("data", (c: any) => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
      stream.on("end",  () => {
        const raw = Buffer.concat(chunks).toString("utf8");
        try {
          resolve(JSON.parse(raw));
        } catch {
          reject(new Error(`NSE parse error for ${path}: ${raw.slice(0, 120)}`));
        }
      });
      stream.on("error", reject);
    });

    req.on("timeout", () => { req.destroy(); reject(new Error("NSE timeout")); });
    req.on("error",   (e) => reject(e));
    req.end();
  });
}

async function initSession() {
  if (sessionInitialised || sessionInitialising) return;
  sessionInitialising = true;
  try {
    // Warm up session — fetch homepage first to grab NSIT/nsit/nseappid cookies
    const warmupOptions = {
      hostname: "www.nseindia.com",
      path:     "/",
      method:   "GET",
      headers:  { ...NSE_HEADERS },
      timeout:  8000,
    };
    await new Promise<void>((resolve) => {
      const req = https.request(warmupOptions, (res) => {
        const newCookies = extractCookies(res.headers);
        if (newCookies) nseCookies = newCookies;
        res.resume();
        res.on("end", resolve);
      });
      req.on("error",   () => resolve());
      req.on("timeout", () => { req.destroy(); resolve(); });
      req.end();
    });

    // Try a known-working path that often sets additional cookies
    await nseGet("/api/marketStatus").catch(() => {});
    sessionInitialised = true;
    console.info("[nseStream] NSE session initialised, cookies:", nseCookies.slice(0, 80) + "…");
  } catch (e: any) {
    console.warn("[nseStream] Session init warning:", e.message);
    sessionInitialised = true; // proceed anyway — cookies optional
  } finally {
    sessionInitialising = false;
  }
}

// ─── Polling engine ───────────────────────────────────────────────────────────

let pollInterval:        ReturnType<typeof setInterval> | null = null;
let indexPollInterval:   ReturnType<typeof setInterval> | null = null;
let consecutiveErrors    = 0;
let backoffMs            = 0;
let lastPollTime         = 0;

// Symbols to track from NIFTY 50 equities
const EQUITY_SYMBOLS = new Set<string>([
  "NIFTY 50",
  "HDFCBANK", "RELIANCE", "ICICIBANK", "INFY", "LT", "TCS",
  "AXISBANK", "KOTAKBANK", "BHARTIARTL", "SBIN",
  "HINDUNILVR", "BAJFINANCE", "WIPRO", "TITAN", "ASIANPAINT",
  "SUNPHARMA", "NESTLEIND", "MARUTI", "ULTRACEMCO", "NTPC",
  "POWERGRID", "ONGC", "ADANIENT", "ADANIPORTS",
]);

// Maps NSE display symbol → our internal symbol key
const NSE_SYMBOL_MAP: Record<string, string> = {
  "NIFTY 50":        "NIFTY50",
  "NIFTY BANK":      "BANKNIFTY",
  "NIFTY FIN SERVICE": "FINNIFTY",
  "NIFTY MIDCAP 100": "NIFTYMIDCAP",
  "INDIA VIX":       "INDIAVIX",
  "NIFTY 100":       "NIFTY100",
  "NIFTY 200":       "NIFTY200",
  "NIFTY 500":       "NIFTY500",
  "NIFTY NEXT 50":   "NIFTYNEXT50",
  "NIFTY AUTO":      "NIFTYAUTO",
  "NIFTY IT":        "NIFTYIT",
  "NIFTY PHARMA":    "NIFTYPHARMA",
  "NIFTY REALTY":    "NIFTYREALTY",
  "NIFTY METAL":     "NIFTYMETAL",
  "NIFTY FMCG":      "NIFTYFMCG",
};

function mapSymbol(raw: string): string {
  return NSE_SYMBOL_MAP[raw] || raw.replace(/\s+/g, "_");
}

async function pollEquities() {
  if (!sessionInitialised) return;
  if (backoffMs > 0) {
    const now = Date.now();
    if (now - lastPollTime < backoffMs) return;
  }
  lastPollTime = Date.now();

  try {
    const data = await nseGet("/api/equity-stockIndices?index=NIFTY%2050");
    const rows: any[] = data?.data ?? [];

    consecutiveErrors = 0;
    backoffMs = 0;

    const ts = Date.now();
    for (const row of rows) {
      const rawSym = row.symbol as string;
      if (!rawSym) continue;
      // Only emit symbols we care about (or all of them)
      const sym   = mapSymbol(rawSym);
      const price = Number(row.lastPrice ?? row.last);
      if (!isFinite(price) || price <= 0) continue;

      const tick: NseTick = {
        symbol:    sym,
        price,
        open:      Number(row.open      ?? price),
        high:      Number(row.dayHigh   ?? price),
        low:       Number(row.dayLow    ?? price),
        prevClose: Number(row.previousClose ?? price),
        change:    Number(row.change    ?? 0),
        changePct: Number(row.pChange   ?? 0),
        volume:    Number(row.totalTradedVolume ?? row.totalTradedValue ?? 0),
        timestamp: ts,
      };

      updateCandle(sym, price, tick.volume, ts);
      if (onTick) {
        try { onTick(tick); } catch {}
      }
    }
  } catch (e: any) {
    consecutiveErrors++;
    // Exponential backoff: 1s → 2s → 4s → max 30s
    backoffMs = Math.min(30000, 1000 * Math.pow(2, consecutiveErrors - 1));
    if (consecutiveErrors <= 3) {
      console.warn(`[nseStream] equity poll error (${consecutiveErrors}): ${e.message}`);
    }
  }
}

async function pollAllIndices() {
  if (!sessionInitialised) return;
  try {
    const data = await nseGet("/api/allIndices");
    const rows: any[] = data?.data ?? [];
    const ts = Date.now();

    for (const row of rows) {
      const rawSym = row.indexSymbol as string;
      if (!rawSym) continue;
      const sym   = mapSymbol(rawSym);
      const price = Number(row.last ?? row.lastPrice);
      if (!isFinite(price) || price <= 0) continue;

      const tick: NseTick = {
        symbol:    sym,
        price,
        open:      Number(row.open   ?? price),
        high:      Number(row.high   ?? price),
        low:       Number(row.low    ?? price),
        prevClose: Number(row.previousClose ?? price),
        change:    Number(row.change ?? 0),
        changePct: Number(row.percentChange ?? 0),
        volume:    0,
        timestamp: ts,
      };

      updateCandle(sym, price, 0, ts);
      if (onTick) {
        try { onTick(tick); } catch {}
      }
    }
  } catch (e: any) {
    // Silently ignore allIndices errors — equities are the primary feed
  }
}

// ─── Subscribe additional equity symbols on demand ────────────────────────────

export function subscribeNseSymbol(symbol: string) {
  EQUITY_SYMBOLS.add(symbol.toUpperCase());
}

// ─── Start / stop ─────────────────────────────────────────────────────────────

export async function startNseStream() {
  console.info("[nseStream] Starting NSE real-time stream (300ms polling)…");

  await initSession();

  // First poll immediately
  await pollEquities();
  await pollAllIndices();

  // Equity poll: 300ms
  pollInterval = setInterval(pollEquities, 300);

  // allIndices poll: 1s (slower — less critical)
  indexPollInterval = setInterval(pollAllIndices, 1000);

  console.info("[nseStream] NSE stream running — equities @ 300ms, indices @ 1s");
}

export function stopNseStream() {
  if (pollInterval)      clearInterval(pollInterval);
  if (indexPollInterval) clearInterval(indexPollInterval);
  pollInterval = indexPollInterval = null;
  console.info("[nseStream] NSE stream stopped");
}
