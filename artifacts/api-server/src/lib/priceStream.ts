/**
 * Real-time price streaming via WebSocket
 *
 * - Finnhub WS  → international stocks, crypto, forex
 * - Twelve Data WS → Indian NSE/BSE stocks
 *
 * Both feeds are normalised to { symbol, price, timestamp }
 * and broadcast to all connected frontend clients via a local WS server
 * at ws://…/ws/prices
 */

import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { startNseStream, setNseCallbacks } from "./nseStream.js";
import type { NseTick, OhlcCandle } from "./nseStream.js";

// ─── Normalised tick ────────────────────────────────────────────────────────

export interface PriceTick {
  symbol:    string;
  price:     number;
  timestamp: number; // epoch ms
  source:    "finnhub" | "twelvedata" | "tradingview" | "nse";
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

// Everything else goes to Finnhub
// These symbols match what we track in the market overview
const FINNHUB_SYMBOLS: string[] = [
  // US Indices
  "^GSPC", "^NDX", "^DJI", "^VIX",
  // Crypto
  "BINANCE:BTCUSDT", "BINANCE:ETHUSDT", "BINANCE:SOLUSDT", "BINANCE:BNBUSDT",
  // Forex
  "OANDA:EUR_USD", "OANDA:GBP_USD", "OANDA:USD_JPY",
  // US Stocks
  "AAPL", "MSFT", "NVDA", "TSLA", "GOOGL", "AMZN", "META",
  "JPM", "GS", "BAC",
];

// Symbol normalisation: Finnhub crypto → our internal symbol names
const FINNHUB_SYMBOL_MAP: Record<string, string> = {
  "BINANCE:BTCUSDT": "BTCUSD",
  "BINANCE:ETHUSDT": "ETHUSD",
  "BINANCE:SOLUSDT": "SOLUSD",
  "BINANCE:BNBUSDT": "BNBUSD",
  "OANDA:EUR_USD":   "EURUSD",
  "OANDA:GBP_USD":   "GBPUSD",
  "OANDA:USD_JPY":   "USDJPY",
  "^GSPC":  "SPX",
  "^NDX":   "NDX",
  "^DJI":   "DJI",
  "^VIX":   "VIX",
};

function normaliseFinnhubSymbol(raw: string): string {
  return FINNHUB_SYMBOL_MAP[raw] || raw;
}

// ─── Finnhub WebSocket ───────────────────────────────────────────────────────

let finnhubWS: WebSocket | null = null;
let finnhubReconnectTimer: ReturnType<typeof setTimeout> | null = null;

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
    console.warn(`[priceStream] Finnhub WS closed (${code}), reconnecting in 5s…`);
    finnhubWS = null;
    finnhubReconnectTimer = setTimeout(connectFinnhub, 5000);
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
    console.warn(`[priceStream] Twelve Data WS closed (${code}), reconnecting in 5s…`);
    twelveWS = null;
    if (twelvePingInterval) clearInterval(twelvePingInterval);
    twelveReconnectTimer = setTimeout(connectTwelveData, 5000);
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
  // Crypto → map to Binance pair
  if (["BTCUSD","ETHUSD","SOLUSD","BNBUSD"].includes(upper)) {
    const fhSym = upper.replace("USD", "USDT");
    const mapped = `BINANCE:${fhSym}`;
    if (!FINNHUB_SYMBOLS.includes(mapped)) FINNHUB_SYMBOLS.push(mapped);
    if (finnhubWS?.readyState === WebSocket.OPEN) {
      finnhubWS.send(JSON.stringify({ type: "subscribe", symbol: mapped }));
    }
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

function broadcastCandle(candle: OhlcCandle) {
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

  // ── NSE real-time stream (Indian markets, 300ms polling) ──────────────────
  setNseCallbacks(
    // tick callback — normalise NseTick → PriceTick and broadcast
    (nseTick: NseTick) => {
      broadcast({
        symbol:    nseTick.symbol,
        price:     nseTick.price,
        timestamp: nseTick.timestamp,
        source:    "nse",
      });
    },
    // candle callback — broadcast to all WS clients
    (candle: OhlcCandle) => {
      broadcastCandle(candle);
    },
  );
  startNseStream().catch((e) => {
    console.warn("[priceStream] NSE stream failed to start:", e.message);
  });

  // Start both upstream feeds
  connectFinnhub();
  connectTwelveData();

  // TradingView fallback — poll every 60s for commodities, indices, etc.
  pollTVFallback();
  setInterval(pollTVFallback, 60 * 1000);

  console.info("[priceStream] Price streaming initialised");
}
