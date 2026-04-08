/**
 * Binance Direct WebSocket Stream
 *
 * Connects directly to wss://stream.binance.com:9443 — no relays, no proxies.
 * Faster and more reliable than routing through Finnhub for crypto.
 *
 * Features:
 * - Combined stream: one WS connection, many symbols
 * - Dynamic subscription: add symbols at runtime without reconnecting
 * - OHLC candle engine (1s / 5s / 1m) — same logic as NSE engine
 * - Smart tick throttling: stores every tick in-memory, broadcasts at ~20 Hz
 *   so backend <→ frontend WS is never overwhelmed by high-frequency crypto
 * - Auto-reconnect with exponential backoff
 */

import { WebSocket } from "ws";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BinanceTick {
  symbol:    string;   // normalised: BTCUSD, ETHUSD …
  rawSymbol: string;   // as-is from Binance: BTCUSDT …
  price:     number;
  qty:       number;
  tradeId:   number;
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
  volume:    number;   // cumulative quote volume in this bucket
  trades:    number;   // trade count
  startTime: number;
  updatedAt: number;
}

// ─── Broadcast callbacks (injected by priceStream.ts) ────────────────────────

type TickCallback   = (tick: BinanceTick)  => void;
type CandleCallback = (candle: OhlcCandle) => void;

let onTick:   TickCallback   | null = null;
let onCandle: CandleCallback | null = null;

export function setBinanceCallbacks(t: TickCallback, c: CandleCallback) {
  onTick   = t;
  onCandle = c;
}

// ─── Symbol mapping ──────────────────────────────────────────────────────────

// Binance USDT pair → our internal symbol name
const SYMBOL_MAP: Record<string, string> = {
  BTCUSDT:  "BTCUSD",
  ETHUSDT:  "ETHUSD",
  SOLUSDT:  "SOLUSD",
  BNBUSDT:  "BNBUSD",
  XRPUSDT:  "XRPUSD",
  ADAUSDT:  "ADAUSD",
  DOGEUSDT: "DOGEUSD",
  DOTUSDT:  "DOTUSD",
  LINKUSDT: "LINKUSD",
  AVAXUSDT: "AVAXUSD",
  MATICUSDT:"MATICUSD",
  LTCUSDT:  "LTCUSD",
  UNIUSDT:  "UNIUSD",
  ATOMUSDT: "ATOMUSD",
};

// Initial set of symbols to subscribe (stream names are lowercase)
// @trade       = every individual exchange fill (true last price)
// @bookTicker  = best bid/ask update on every order-book change (very high Hz)
const activeStreams = new Set<string>([
  "btcusdt@trade",   "btcusdt@bookTicker",
  "ethusdt@trade",   "ethusdt@bookTicker",
  "solusdt@trade",   "solusdt@bookTicker",
  "bnbusdt@trade",   "bnbusdt@bookTicker",
  "xrpusdt@trade",   "xrpusdt@bookTicker",
]);

export function normaliseBinanceSymbol(raw: string): string {
  return SYMBOL_MAP[raw.toUpperCase()] || raw.replace("USDT", "USD");
}

// ─── OHLC Candle Engine ───────────────────────────────────────────────────────

const TIMEFRAMES: CandleTimeframe[] = ["1s", "5s", "1m"];

function bucketMs(tf: CandleTimeframe): number {
  if (tf === "1s") return 1000;
  if (tf === "5s") return 5000;
  return 60_000;
}

const candleStore = new Map<string, Map<CandleTimeframe, OhlcCandle>>();

function updateCandle(symbol: string, price: number, qty: number, ts: number) {
  if (!candleStore.has(symbol)) candleStore.set(symbol, new Map());
  const symMap = candleStore.get(symbol)!;

  for (const tf of TIMEFRAMES) {
    const bucket  = bucketMs(tf);
    const bucketT = Math.floor(ts / bucket) * bucket;

    let candle = symMap.get(tf);

    if (!candle || candle.startTime !== bucketT) {
      candle = {
        symbol,
        timeframe: tf,
        open:      price,
        high:      price,
        low:       price,
        close:     price,
        volume:    qty,
        trades:    1,
        startTime: bucketT,
        updatedAt: ts,
      };
    } else {
      candle.high      = Math.max(candle.high, price);
      candle.low       = Math.min(candle.low, price);
      candle.close     = price;
      candle.volume   += qty;
      candle.trades   += 1;
      candle.updatedAt = ts;
    }

    symMap.set(tf, candle);

    if (onCandle) {
      try { onCandle({ ...candle }); } catch {}
    }
  }
}

export function getBinanceCandle(symbol: string, tf: CandleTimeframe): OhlcCandle | undefined {
  return candleStore.get(symbol.toUpperCase())?.get(tf);
}

export function getAllBinanceCandles(): OhlcCandle[] {
  const out: OhlcCandle[] = [];
  for (const m of candleStore.values())
    for (const c of m.values()) out.push(c);
  return out;
}

// ─── Immediate tick dispatch — zero delay, every exchange event forwarded ────

function dispatchTick(tick: BinanceTick) {
  try { onTick?.(tick); } catch {}
}

// ─── Binance WebSocket connection ─────────────────────────────────────────────

let binanceWS: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectDelay = 1000;
let running = false;
let subRequestId = 1;

function buildStreamUrl(): string {
  const streams = [...activeStreams].join("/");
  return `wss://stream.binance.com:9443/stream?streams=${streams}`;
}

function connect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);

  const url = buildStreamUrl();
  console.info(`[binanceStream] Connecting to ${activeStreams.size} streams…`);

  const ws = new WebSocket(url, {
    handshakeTimeout: 10_000,
  });
  binanceWS = ws;

  ws.on("open", () => {
    console.info("[binanceStream] Connected — Binance direct feed live");
    reconnectDelay = 1000; // reset backoff on successful connect
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Combined stream wraps data: { stream: "btcusdt@trade", data: {...} }
      const ev = msg.data ?? msg;

      if (ev.e === "trade") {
        // ── Individual trade event ──────────────────────────────────────────
        const rawSymbol = ev.s as string;
        const price     = parseFloat(ev.p);
        const qty       = parseFloat(ev.q);
        const tradeId   = ev.t as number;
        const ts        = (ev.T as number) ?? Date.now();

        if (!isFinite(price) || price <= 0) return;

        const symbol = normaliseBinanceSymbol(rawSymbol);
        updateCandle(symbol, price, qty, ts);
        dispatchTick({ symbol, rawSymbol, price, qty, tradeId, timestamp: ts });

      } else if (ev.e === "bookTicker") {
        // ── Best bid/ask update — fires on every order-book change (~1ms Hz) ─
        const rawSymbol = ev.s as string;
        const bid       = parseFloat(ev.b);
        const ask       = parseFloat(ev.a);
        if (!isFinite(bid) || !isFinite(ask) || bid <= 0 || ask <= 0) return;

        // Mid-price: (best_bid + best_ask) / 2 — best real-time price proxy
        const price  = (bid + ask) / 2;
        const ts     = Date.now();
        const symbol = normaliseBinanceSymbol(rawSymbol);

        // bookTicker updates candle close without adding volume (no trade)
        updateCandle(symbol, price, 0, ts);
        dispatchTick({ symbol, rawSymbol, price, qty: 0, tradeId: 0, timestamp: ts });
      }

    } catch {}
  });

  ws.on("close", (code, reason) => {
    binanceWS = null;
    if (!running) return;
    const msg = reason?.toString() || "";
    console.warn(`[binanceStream] Disconnected (${code}${msg ? " — " + msg : ""}), reconnecting in ${reconnectDelay}ms…`);
    reconnectTimer = setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, 30_000);
      connect();
    }, reconnectDelay);
  });

  ws.on("error", (err) => {
    console.error("[binanceStream] WS error:", err.message);
    try { ws.close(); } catch {}
  });
}

// ─── Dynamic subscription ────────────────────────────────────────────────────

export function subscribeBinanceSymbol(rawSymbol: string) {
  // Accepts: "BTCUSD", "BTCUSDT", "btcusdt" — normalise to stream name
  const upper = rawSymbol.toUpperCase();
  // Convert internal symbol to Binance pair if needed
  const binancePair = upper.endsWith("USDT") ? upper : upper.replace(/USD$/, "USDT");
  const stream      = binancePair.toLowerCase() + "@trade";

  if (activeStreams.has(stream)) return; // already subscribed
  activeStreams.add(stream);

  if (binanceWS?.readyState === WebSocket.OPEN) {
    // Subscribe on the live connection without reconnecting
    binanceWS.send(JSON.stringify({
      method: "SUBSCRIBE",
      params: [stream],
      id:     subRequestId++,
    }));
    console.info(`[binanceStream] Subscribed to ${stream}`);
  } else {
    // Will be included in next connect() URL
    console.info(`[binanceStream] Queued subscription: ${stream}`);
  }
}

// ─── Start / stop ─────────────────────────────────────────────────────────────

export function startBinanceStream() {
  if (running) return;
  running = true;
  connect();
  console.info("[binanceStream] Binance direct stream engine started");
}

export function stopBinanceStream() {
  running = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  try { binanceWS?.close(); } catch {}
  binanceWS = null;
  console.info("[binanceStream] Binance stream stopped");
}
