/**
 * Real-time price streaming via WebSocket
 *
 * Feed hierarchy (fastest → slowest):
 * - Binance direct WS → crypto (BTC, ETH, SOL, BNB, XRP …) — raw exchange feed
 * - NSE unofficial API → Indian equities + indices @ 300ms — direct
 * - Finnhub WS  → US stocks, forex, US indices
 * - Twelve Data WS → Indian NSE/BSE WS backup
 * - TradingView scanner → commodities, gold, global indices @ 60s
 *
 * All feeds normalise to { symbol, price, timestamp, source }
 * and broadcast to frontend clients via ws://…/ws/prices
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { startNseStream, setNseCallbacks } from "./nseStream.js";
import type { NseTick, OhlcCandle as NseCandle } from "./nseStream.js";
import {
  startBinanceStream,
  setBinanceCallbacks,
  subscribeBinanceSymbol,
  normaliseBinanceSymbol,
} from "./binanceStream.js";
import type { BinanceTick, OhlcCandle as BinanceCandle } from "./binanceStream.js";

// ─── Normalised tick ────────────────────────────────────────────────────────

export interface PriceTick {
  symbol:    string;
  price:     number;
  timestamp: number; // epoch ms
  source:    "finnhub" | "twelvedata" | "tradingview" | "nse" | "binance";
}

// ─── In-memory last-price cache ────────────────────────────────────────────

const latestPrices: Map<string, PriceTick> = new Map();

export function getLatestPrice(symbol: string): PriceTick | undefined {
  return latestPrices.get(symbol.toUpperCase());
}
export function getAllLatestPrices(): PriceTick[] {
  return [...latestPrices.values()];
}

// ─── Broadcast to all frontend clients ─────────────────────────────────────

let frontendWSS: WebSocketServer | null = null;

function broadcast(tick: PriceTick) {
  latestPrices.set(tick.symbol, tick);
  if (!frontendWSS) return;
  const msg = JSON.stringify({ type: "tick", data: tick });
  for (const client of frontendWSS.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}

// ─── Symbol routing ─────────────────────────────────────────────────────────

// These go to Twelve Data (Indian exchanges)
const TWELVEDATA_SYMBOLS: Set<string> = new Set([
  // NSE blue-chips
  "NSE:RELIANCE", "NSE:TCS", "NSE:HDFCBANK", "NSE:INFY", "NSE:ICICIBANK",
  "NSE:KOTAKBANK", "NSE:HINDUNILVR", "NSE:BAJFINANCE", "NSE:BHARTIARTL",
  "NSE:ASIANPAINT", "NSE:WIPRO", "NSE:AXISBANK", "NSE:LT", "NSE:SUNPHARMA",
  "NSE:NESTLEIND", "NSE:TITAN", "NSE:ULTRACEMCO", "NSE:POWERGRID",
  "NSE:NTPC", "NSE:ONGC", "NSE:ADANIENT", "NSE:ADANIPORTS",
  "NSE:MARUTI", "NSE:SBIN",
]);

// Finnhub handles: US stocks, forex, US indices
// Crypto is now handled by Binance direct WS (faster, no relay)
const FINNHUB_SYMBOLS: string[] = [
  // US Indices
  "^GSPC", "^NDX", "^DJI", "^VIX",
  // Forex
  "OANDA:EUR_USD", "OANDA:GBP_USD", "OANDA:USD_JPY",
  // US Stocks
  "AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN", "META",
  "JPM", "GS", "BAC",
];

// Symbol normalisation: Finnhub → our internal symbol names
const FINNHUB_SYMBOL_MAP: Record<string, string> = {
  "OANDA:EUR_USD":   "EURUSD",
  "OANDA:GBP_USD":   "GBPUSD",
  "OANDA:USD_JPY":   "USDJPY",
  "^GSPC":  "SPX",
  "^NDX":   "NDX",
  "^DJI":   "DJI",
  "^VIX":   "VIX",
};

// Internal symbols handled by Binance direct WS — skip if routed here
const BINANCE_SYMBOLS = new Set([
  "BTCUSD", "ETHUSD", "SOLUSD", "BNBUSD", "XRPUSD",
  "ADAUSD", "DOGEUSD", "DOTUSD", "LINKUSD", "AVAXUSD",
  "MATICUSD", "LTCUSD", "UNIUSD", "ATOMUSD",
]);

function normaliseFinnhubSymbol(raw: string): string {
  return FINNHUB_SYMBOL_MAP[raw] || raw;
}

// ─── Finnhub WebSocket ───────────────────────────────────────────────────────

let finnhubWS: WebSocket | null = null;
let finnhubReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let finnhubRetryCount = 0;
const FINNHUB_MAX_DELAY = 5 * 60 * 1000; // 5 min max backoff

function connectFinnhub() {
  const key = process.env["FINNHUB_API_KEY"];
  if (!key) {
    console.warn("[priceStream] FINNHUB_API_KEY not set — Finnhub feed disabled");
    return;
  }

  if (finnhubReconnectTimer) clearTimeout(finnhubReconnectTimer);

  const ws = new WebSocket(`wss://ws.finnhub.io?token=${key}`);
  finnhubWS = ws;

  ws.on("open", () => {
    finnhubRetryCount = 0;
    console.info("[priceStream] Finnhub WS connected");
    for (const sym of FINNHUB_SYMBOLS) {
      ws.send(JSON.stringify({ type: "subscribe", symbol: sym }));
    }
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type !== "trade" || !Array.isArray(msg.data)) return;
      for (const trade of msg.data) {
        const price = trade.p;
        const ts    = trade.t;
        const sym   = normaliseFinnhubSymbol(trade.s);
        if (price == null || !sym) continue;
        broadcast({ symbol: sym, price, timestamp: ts ?? Date.now(), source: "finnhub" });
      }
    } catch {}
  });

  ws.on("close", (code) => {
    finnhubWS = null;
    finnhubRetryCount++;
    const delay = Math.min(5000 * Math.pow(2, finnhubRetryCount - 1), FINNHUB_MAX_DELAY);
    console.warn(`[priceStream] Finnhub WS closed (${code}), reconnecting in ${Math.round(delay/1000)}s… (attempt ${finnhubRetryCount})`);
    finnhubReconnectTimer = setTimeout(connectFinnhub, delay);
  });

  ws.on("error", (err) => {
    console.error("[priceStream] Finnhub WS error:", err.message);
    try { ws.close(); } catch {}
  });
}

// ─── Twelve Data WebSocket ───────────────────────────────────────────────────

let twelveWS: WebSocket | null = null;
let twelveReconnectTimer: ReturnType<typeof setTimeout> | null = null;
let twelvePingInterval: ReturnType<typeof setInterval> | null = null;
let twelveRetryCount = 0;
const TWELVE_MAX_DELAY = 5 * 60 * 1000; // 5 min max backoff

function connectTwelveData() {
  const key = process.env["TWELVE_DATA_API_KEY"];
  if (!key) {
    console.warn("[priceStream] TWELVE_DATA_API_KEY not set — Twelve Data feed disabled");
    return;
  }

  if (twelveReconnectTimer) clearTimeout(twelveReconnectTimer);
  if (twelvePingInterval)   clearInterval(twelvePingInterval);

  const ws = new WebSocket("wss://ws.twelvedata.com/v1/quotes/price?apikey=" + key);
  twelveWS = ws;

  ws.on("open", () => {
    twelveRetryCount = 0;
    console.info("[priceStream] Twelve Data WS connected");
    const symbols = [...TWELVEDATA_SYMBOLS].join(",");
    ws.send(JSON.stringify({ action: "subscribe", params: { symbols } }));
    // Twelve Data requires a heartbeat / ping every 10s
    twelvePingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ action: "heartbeat" }));
      }
    }, 10000);
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      // Twelve Data sends {event:"price", symbol, price, timestamp}
      if (msg.event !== "price") return;
      const price = parseFloat(msg.price);
      const sym   = (msg.symbol as string)?.replace(":", "_"); // "NSE:RELIANCE" → "NSE_RELIANCE"
      if (isNaN(price) || !sym) return;
      broadcast({
        symbol: sym,
        price,
        timestamp: msg.timestamp ? msg.timestamp * 1000 : Date.now(),
        source: "twelvedata",
      });
    } catch {}
  });

  ws.on("close", (code) => {
    twelveWS = null;
    if (twelvePingInterval) clearInterval(twelvePingInterval);
    twelveRetryCount++;
    const delay = Math.min(5000 * Math.pow(2, twelveRetryCount - 1), TWELVE_MAX_DELAY);
    console.warn(`[priceStream] Twelve Data WS closed (${code}), reconnecting in ${Math.round(delay/1000)}s… (attempt ${twelveRetryCount})`);
    twelveReconnectTimer = setTimeout(connectTwelveData, delay);
  });

  ws.on("error", (err) => {
    console.error("[priceStream] Twelve Data WS error:", err.message);
    try { ws.close(); } catch {}
  });
}

// ─── Subscribe additional symbols on demand ──────────────────────────────────

export function subscribeSymbol(symbol: string) {
  const upper = symbol.toUpperCase();
  // Indian NSE/BSE → Twelve Data
  if (upper.includes("NSE:") || upper.includes("BSE:") || upper.endsWith(".NS") || upper.endsWith(".BO")) {
    const tdSym = upper.endsWith(".NS") ? "NSE:" + upper.replace(".NS", "") :
                  upper.endsWith(".BO") ? "BSE:" + upper.replace(".BO", "") : upper;
    TWELVEDATA_SYMBOLS.add(tdSym);
    if (twelveWS?.readyState === WebSocket.OPEN) {
      twelveWS.send(JSON.stringify({ action: "subscribe", params: { symbols: tdSym } }));
    }
    return;
  }
  // Crypto (BTCUSD, ETHUSD, etc.) → Binance direct WS
  if (BINANCE_SYMBOLS.has(upper) || upper.endsWith("USD") && !upper.startsWith("OANDA")) {
    subscribeBinanceSymbol(upper);
    return;
  }
  // Everything else → Finnhub
  if (!FINNHUB_SYMBOLS.includes(symbol)) FINNHUB_SYMBOLS.push(symbol);
  if (finnhubWS?.readyState === WebSocket.OPEN) {
    finnhubWS.send(JSON.stringify({ type: "subscribe", symbol }));
  }
}

// ─── TradingView fallback poll (60s) for symbols not covered by WS ───────────
// This keeps the market overview accurate even if WS misses a symbol

const TV_FALLBACK_SYMBOLS: Record<string, string> = {
  XAUUSD:  "OANDA:XAUUSD",
  XAGUSD:  "TVC:SILVER",
  USOIL:   "NYMEX:CL1!",
  BRENT:   "ICEEUR:BRN1!",
  NATGAS:  "NYMEX:NG1!",
  COPPER:  "COMEX:HG1!",
  DXY:     "TVC:DXY",
  DAX:     "XETR:DAX",
  FTSE:    "TVC:UKX",
  CAC40:   "EURONEXT:PX1",
  N225:    "TVC:NI225",
  HSI:     "TVC:HSI",
  SSEC:    "SSE:000001",
  WHEAT:   "CBOT:ZW1!",
  USDCNY:  "FX_IDC:USDCNY",
  US10Y:   "TVC:US10Y",
  US2Y:    "TVC:US02Y",
};

async function pollTVFallback() {
  const tickers = Object.values(TV_FALLBACK_SYMBOLS);
  try {
    const resp = await fetch("https://scanner.tradingview.com/global/scan", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent":   "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
        "Origin":       "https://www.tradingview.com",
        "Referer":      "https://www.tradingview.com/",
      },
      body: JSON.stringify({ columns: ["close"], symbols: { tickers } }),
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return;
    const data = await resp.json() as any;
    for (const item of data.data ?? []) {
      const price = item.d?.[0];
      if (price == null) continue;
      // Reverse-map TV symbol → our internal symbol
      const internalSym = Object.entries(TV_FALLBACK_SYMBOLS)
        .find(([, tv]) => tv === item.s)?.[0];
      if (!internalSym) continue;
      broadcast({ symbol: internalSym, price, timestamp: Date.now(), source: "tradingview" });
    }
  } catch {}
}

// ─── Candle broadcast ────────────────────────────────────────────────────────

type AnyCandle = NseCandle | BinanceCandle;

function broadcastCandle(candle: AnyCandle) {
  if (!frontendWSS) return;
  const msg = JSON.stringify({ type: "candle", data: candle });
  for (const client of frontendWSS.clients) {
    if (client.readyState === WebSocket.OPEN) {
      try { client.send(msg); } catch {}
    }
  }
}

// ─── Attach WebSocket server to HTTP server + start feeds ───────────────────

export function initPriceStream(httpServer: Server) {
  // Frontend clients connect to ws://…/ws/prices
  frontendWSS = new WebSocketServer({ server: httpServer, path: "/ws/prices" });

  frontendWSS.on("connection", (ws: WebSocket, _req: IncomingMessage) => {
    // Send current cache snapshot immediately on connect
    const snapshot = getAllLatestPrices();
    if (snapshot.length > 0) {
      try {
        ws.send(JSON.stringify({ type: "snapshot", data: snapshot }));
      } catch {}
    }
    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "subscribe" && msg.symbol) subscribeSymbol(msg.symbol);
      } catch {}
    });
  });

  // ── Binance direct WS — crypto at exchange speed (BTC, ETH, SOL …) ────────
  setBinanceCallbacks(
    (tick: BinanceTick) => {
      broadcast({
        symbol:    tick.symbol,
        price:     tick.price,
        timestamp: tick.timestamp,
        source:    "binance",
      });
    },
    (candle: BinanceCandle) => {
      broadcastCandle(candle);
    },
  );
  startBinanceStream();

  // ── NSE real-time stream (Indian markets, 300ms polling) ──────────────────
  setNseCallbacks(
    (nseTick: NseTick) => {
      broadcast({
        symbol:    nseTick.symbol,
        price:     nseTick.price,
        timestamp: nseTick.timestamp,
        source:    "nse",
      });
    },
    (candle: NseCandle) => {
      broadcastCandle(candle);
    },
  );
  startNseStream().catch((e) => {
    console.warn("[priceStream] NSE stream failed to start:", e.message);
  });

  // ── Finnhub — US stocks, forex, indices ──────────────────────────────────
  connectFinnhub();
  connectTwelveData();

  // ── TradingView fallback — commodities, gold, global indices @ 60s ────────
  pollTVFallback();
  setInterval(pollTVFallback, 60 * 1000);

  console.info("[priceStream] All price streams initialised: Binance + NSE + Finnhub + TwelveData + TradingView");
}
