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
const activeStreams = new Set<string>([
  "btcusdt@trade",
  "ethusdt@trade",
  "solusdt@trade",
  "bnbusdt@trade",
  "xrpusdt@trade",
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

// ─── Tick throttle — broadcast at ~20 Hz to avoid WS flood ──────────────────

const pendingTicks = new Map<string, BinanceTick>(); // latest tick per symbol
let   throttleTimer: ReturnType<typeof setInterval> | null = null;

function startThrottle() {
  if (throttleTimer) return;
  throttleTimer = setInterval(() => {
    if (!onTick || pendingTicks.size === 0) return;
    for (const tick of pendingTicks.values()) {
      try { onTick(tick); } catch {}
    }
    pendingTicks.clear();
  }, 50); // flush every 50ms → max 20 ticks/symbol/second to frontend
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
      const trade = msg.data ?? msg;
      if (trade.e !== "trade") return;

      const rawSymbol = trade.s as string;           // "BTCUSDT"
      const price     = parseFloat(trade.p);          // price string
      const qty       = parseFloat(trade.q);          // quantity string
      const tradeId   = trade.t as number;
      const ts        = trade.T as number ?? Date.now();

      if (!isFinite(price) || price <= 0) return;

      const symbol = normaliseBinanceSymbol(rawSymbol);

      // Always update candle on every tick (candle engine is O(1))
      updateCandle(symbol, price, qty, ts);

      // Throttle broadcast to frontend — keep only the latest tick per symbol
      pendingTicks.set(symbol, { symbol, rawSymbol, price, qty, tradeId, timestamp: ts });

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
  startThrottle();
  connect();
  console.info("[binanceStream] Binance direct stream engine started");
}

export function stopBinanceStream() {
  running = false;
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (throttleTimer)  clearInterval(throttleTimer);
  try { binanceWS?.close(); } catch {}
  binanceWS = null;
  console.info("[binanceStream] Binance stream stopped");
}
