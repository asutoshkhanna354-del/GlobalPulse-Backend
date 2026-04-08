/**
 * React hook — connects to the backend WebSocket price stream at /ws/prices
 * and exposes a live price map: { [symbol]: { price, timestamp, source } }
 *
 * Usage:
 *   const { prices, connected } = usePriceStream();
 *   const livePrice = prices["BTCUSD"]?.price;
 */

import { useEffect, useRef, useState, useCallback } from "react";

export interface LivePrice {
  symbol:    string;
  price:     number;
  timestamp: number;
  source:    "finnhub" | "twelvedata" | "tradingview";
}

type PriceMap = Record<string, LivePrice>;

// Singleton WebSocket shared across all hook instances on the same page
let sharedWS: WebSocket | null = null;
const listeners: Set<(map: PriceMap) => void> = new Set();
let priceCache: PriceMap = {};
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let wsUrl = "";

function getWSUrl(): string {
  if (wsUrl) return wsUrl;
  const proto  = window.location.protocol === "https:" ? "wss:" : "ws:";
  const apiBase = import.meta.env["VITE_API_URL"] || "";
  if (apiBase) {
    const base = apiBase.replace(/^https?:/, proto).replace(/\/$/, "");
    wsUrl = `${base}/ws/prices`;
  } else {
    // Same-origin — replace port with backend port (8080) or use same host
    const host = window.location.host.replace(/:\d+$/, "") + ":8080";
    wsUrl = `${proto}//${host}/ws/prices`;
  }
  return wsUrl;
}

function notifyListeners() {
  for (const fn of listeners) fn({ ...priceCache });
}

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
          notifyListeners();
        } else if (msg.type === "snapshot") {
          for (const t of (msg.data as LivePrice[])) {
            priceCache[t.symbol] = t;
          }
          notifyListeners();
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
  const [prices, setPrices] = useState<PriceMap>(() => ({ ...priceCache }));
  const [connected, setConnected] = useState(false);

  // Throttle state updates to ~60fps (every ~16ms)
  const pendingRef = useRef(false);
  const latestRef  = useRef<PriceMap>({ ...priceCache });

  const onUpdate = useCallback((map: PriceMap) => {
    latestRef.current = map;
    if (!pendingRef.current) {
      pendingRef.current = true;
      requestAnimationFrame(() => {
        pendingRef.current = false;
        setPrices({ ...latestRef.current });
      });
    }
  }, []);

  useEffect(() => {
    listeners.add(onUpdate);
    // Trigger an initial paint with whatever is already cached
    if (Object.keys(priceCache).length > 0) onUpdate({ ...priceCache });
    connectSharedWS();

    // Poll connection status
    const statusInterval = setInterval(() => {
      setConnected(sharedWS?.readyState === WebSocket.OPEN);
    }, 1000);

    return () => {
      listeners.delete(onUpdate);
      clearInterval(statusInterval);
    };
  }, [onUpdate]);

  const subscribe = useCallback((symbol: string) => {
    if (sharedWS?.readyState === WebSocket.OPEN) {
      sharedWS.send(JSON.stringify({ type: "subscribe", symbol }));
    }
  }, []);

  return { prices, connected, subscribe };
}
