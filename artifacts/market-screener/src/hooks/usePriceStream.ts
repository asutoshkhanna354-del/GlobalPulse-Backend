/**
 * React hook — connects to the backend WebSocket price stream at /ws/prices
 * and exposes a live price map: { [symbol]: { price, timestamp, source } }
 *
 * Also receives live candle updates from the NSE backend candle engine:
 * { [symbol_timeframe]: OhlcCandle }
 *
 * Usage:
 *   const { prices, candles, connected } = usePriceStream();
 *   const livePrice  = prices["BTCUSD"]?.price;
 *   const liveCandle = candles["NIFTY50_1s"];
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface LivePrice {
  symbol:    string;
  price:     number;
  timestamp: number;
  source:    "finnhub" | "twelvedata" | "tradingview" | "nse" | "binance";
}

export interface LiveCandle {
  symbol:    string;
  timeframe: "1s" | "5s" | "1m";
  open:      number;
  high:      number;
  low:       number;
  close:     number;
  volume:    number;
  startTime: number;
  updatedAt: number;
}

type PriceMap  = Record<string, LivePrice>;
type CandleMap = Record<string, LiveCandle>; // key: `${symbol}_${timeframe}`

// Singleton WebSocket shared across all hook instances on the same page
let sharedWS: WebSocket | null = null;
const priceListeners:  Set<(map: PriceMap)  => void> = new Set();
const candleListeners: Set<(map: CandleMap) => void> = new Set();
let priceCache:  PriceMap  = {};
let candleCache: CandleMap = {};
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsUrl = "";

function getWSUrl(): string {
  if (wsUrl) return wsUrl;
  const proto   = window.location.protocol === "https:" ? "wss:" : "ws:";
  const apiBase = import.meta.env["VITE_API_URL"] || "";
  if (apiBase) {
    const base = apiBase.replace(/^https?:/, proto).replace(/\/$/, "");
    wsUrl = `${base}/ws/prices`;
  } else {
    wsUrl = `${proto}//${window.location.host}/ws/prices`;
  }
  return wsUrl;
}

function notifyPriceListeners()  { for (const fn of priceListeners)  fn({ ...priceCache }); }
function notifyCandleListeners() { for (const fn of candleListeners) fn({ ...candleCache }); }

function connectSharedWS() {
  if (sharedWS && (sharedWS.readyState === WebSocket.CONNECTING || sharedWS.readyState === WebSocket.OPEN)) return;
  if (reconnectTimer) clearTimeout(reconnectTimer);

  const url = getWSUrl();
  try {
    const ws = new WebSocket(url);
    sharedWS = ws;

    ws.onopen = () => {
      console.info("[priceStream] Connected →", url);
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data);

        if (msg.type === "tick") {
          const t = msg.data as LivePrice;
          priceCache[t.symbol] = t;
          notifyPriceListeners();

        } else if (msg.type === "snapshot") {
          for (const t of (msg.data as LivePrice[])) {
            priceCache[t.symbol] = t;
          }
          notifyPriceListeners();

        } else if (msg.type === "candle") {
          const c = msg.data as LiveCandle;
          const key = `${c.symbol}_${c.timeframe}`;
          candleCache[key] = c;
          notifyCandleListeners();
        }
      } catch {}
    };

    ws.onclose = () => {
      sharedWS = null;
      reconnectTimer = setTimeout(connectSharedWS, 4000);
    };

    ws.onerror = () => {
      try { ws.close(); } catch {}
    };
  } catch {
    reconnectTimer = setTimeout(connectSharedWS, 4000);
  }
}

// Start connection immediately when module loads (in browser context)
if (typeof window !== "undefined") {
  connectSharedWS();
}

// ─── React hook ─────────────────────────────────────────────────────────────

export function usePriceStream() {
  const [prices,  setPrices]  = useState<PriceMap>( () => ({ ...priceCache }));
  const [candles, setCandles] = useState<CandleMap>(() => ({ ...candleCache }));
  const [connected, setConnected] = useState(false);

  // Throttle price updates to ~60fps
  const pendingPriceRef  = useRef(false);
  const latestPriceRef   = useRef<PriceMap>({ ...priceCache });

  // Throttle candle updates to ~10fps (candles are lower frequency)
  const pendingCandleRef = useRef(false);
  const latestCandleRef  = useRef<CandleMap>({ ...candleCache });

  const onPriceUpdate = useCallback((map: PriceMap) => {
    latestPriceRef.current = map;
    if (!pendingPriceRef.current) {
      pendingPriceRef.current = true;
      requestAnimationFrame(() => {
        pendingPriceRef.current = false;
        setPrices({ ...latestPriceRef.current });
      });
    }
  }, []);

  const onCandleUpdate = useCallback((map: CandleMap) => {
    latestCandleRef.current = map;
    if (!pendingCandleRef.current) {
      pendingCandleRef.current = true;
      requestAnimationFrame(() => {
        pendingCandleRef.current = false;
        setCandles({ ...latestCandleRef.current });
      });
    }
  }, []);

  useEffect(() => {
    priceListeners.add(onPriceUpdate);
    candleListeners.add(onCandleUpdate);

    if (Object.keys(priceCache).length  > 0) onPriceUpdate({ ...priceCache });
    if (Object.keys(candleCache).length > 0) onCandleUpdate({ ...candleCache });

    connectSharedWS();

    const statusInterval = setInterval(() => {
      setConnected(sharedWS?.readyState === WebSocket.OPEN);
    }, 1000);

    return () => {
      priceListeners.delete(onPriceUpdate);
      candleListeners.delete(onCandleUpdate);
      clearInterval(statusInterval);
    };
  }, [onPriceUpdate, onCandleUpdate]);

  const subscribe = useCallback((symbol: string) => {
    if (sharedWS?.readyState === WebSocket.OPEN) {
      sharedWS.send(JSON.stringify({ type: "subscribe", symbol }));
    }
  }, []);

  return { prices, candles, connected, subscribe };
}
