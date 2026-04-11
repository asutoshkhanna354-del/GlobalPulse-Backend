import { db } from "@workspace/db";
import { brokerConnectionsTable, type BrokerConnection } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

export interface PlaceOrderParams {
  brokerId: number;
  symbol: string;
  direction: "BUY" | "SELL";
  quantity: number;
  price: number;
  orderType?: "MARKET" | "LIMIT";
}

export interface OrderResult {
  success: boolean;
  orderId?: string;
  message: string;
  broker: string;
}

async function placeZerodhaOrder(conn: BrokerConnection, params: PlaceOrderParams): Promise<OrderResult> {
  try {
    const headers: Record<string, string> = {
      "X-Kite-Version": "3",
      "Authorization": `token ${conn.apiKey}:${conn.accessToken}`,
      "Content-Type": "application/x-www-form-urlencoded",
    };

    const exchange = params.symbol.endsWith(".NS") || params.symbol.endsWith(".BO") ? "NSE" : "NSE";
    const tradingsymbol = params.symbol.replace(/\.(NS|BO)$/, "").toUpperCase();

    const body = new URLSearchParams({
      exchange,
      tradingsymbol,
      transaction_type: params.direction,
      quantity: String(params.quantity),
      product: "MIS",
      order_type: params.orderType ?? "MARKET",
      validity: "DAY",
    });

    const res = await fetch("https://api.kite.trade/orders/regular", {
      method: "POST",
      headers,
      body: body.toString(),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (res.ok && data.status === "success") {
      return { success: true, orderId: data.data?.order_id, message: `Order placed via Zerodha Kite`, broker: "zerodha" };
    }
    return { success: false, message: data.message ?? "Zerodha order failed", broker: "zerodha" };
  } catch (err) {
    logger.error({ err }, "Zerodha order error");
    return { success: false, message: String(err), broker: "zerodha" };
  }
}

async function placeBinanceOrder(conn: BrokerConnection, params: PlaceOrderParams): Promise<OrderResult> {
  try {
    const crypto = await import("crypto");
    const timestamp = Date.now();
    const qs = new URLSearchParams({
      symbol: params.symbol.replace("/", "").toUpperCase(),
      side: params.direction,
      type: params.orderType ?? "MARKET",
      quantity: String(params.quantity),
      timestamp: String(timestamp),
    });

    const signature = crypto.createHmac("sha256", conn.apiSecret ?? "").update(qs.toString()).digest("hex");
    qs.append("signature", signature);

    const baseUrl = conn.environment === "live" ? "https://api.binance.com" : "https://testnet.binance.vision";
    const res = await fetch(`${baseUrl}/api/v3/order?${qs.toString()}`, {
      method: "POST",
      headers: { "X-MBX-APIKEY": conn.apiKey },
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (res.ok && data.orderId) {
      return { success: true, orderId: String(data.orderId), message: `Order placed via Binance`, broker: "binance" };
    }
    return { success: false, message: data.msg ?? "Binance order failed", broker: "binance" };
  } catch (err) {
    logger.error({ err }, "Binance order error");
    return { success: false, message: String(err), broker: "binance" };
  }
}

async function placeOandaOrder(conn: BrokerConnection, params: PlaceOrderParams): Promise<OrderResult> {
  try {
    const baseUrl = conn.environment === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";
    const accountId = conn.accountId;
    if (!accountId) return { success: false, message: "OANDA account ID not configured", broker: "oanda" };

    const instrument = params.symbol.replace("/", "_").toUpperCase();
    const units = params.direction === "BUY" ? params.quantity : -params.quantity;

    const res = await fetch(`${baseUrl}/v3/accounts/${accountId}/orders`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${conn.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        order: {
          type: "MARKET",
          instrument,
          units: String(units),
          timeInForce: "FOK",
          positionFill: "DEFAULT",
        },
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = await res.json();
    if (res.ok && data.orderCreateTransaction) {
      return { success: true, orderId: data.orderCreateTransaction.id, message: `Order placed via OANDA`, broker: "oanda" };
    }
    return { success: false, message: data.errorMessage ?? "OANDA order failed", broker: "oanda" };
  } catch (err) {
    logger.error({ err }, "OANDA order error");
    return { success: false, message: String(err), broker: "oanda" };
  }
}

export async function placeOrder(params: PlaceOrderParams): Promise<OrderResult> {
  const [conn] = await db.select().from(brokerConnectionsTable).where(eq(brokerConnectionsTable.id, params.brokerId));
  if (!conn) return { success: false, message: "Broker connection not found", broker: "unknown" };
  if (!conn.isActive) return { success: false, message: "Broker connection is inactive", broker: conn.broker };

  switch (conn.broker) {
    case "zerodha": return placeZerodhaOrder(conn, params);
    case "binance": return placeBinanceOrder(conn, params);
    case "oanda": return placeOandaOrder(conn, params);
    default: return { success: false, message: `Unsupported broker: ${conn.broker}`, broker: conn.broker };
  }
}

export async function verifyBrokerConnection(conn: BrokerConnection): Promise<{ valid: boolean; message: string; accountInfo?: any }> {
  try {
    switch (conn.broker) {
      case "zerodha": {
        const res = await fetch("https://api.kite.trade/user/profile", {
          headers: { "X-Kite-Version": "3", "Authorization": `token ${conn.apiKey}:${conn.accessToken}` },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          return { valid: true, message: "Zerodha connection verified", accountInfo: data.data };
        }
        return { valid: false, message: "Invalid Zerodha credentials" };
      }
      case "binance": {
        const crypto = await import("crypto");
        const timestamp = Date.now();
        const qs = `timestamp=${timestamp}`;
        const sig = crypto.createHmac("sha256", conn.apiSecret ?? "").update(qs).digest("hex");
        const base = conn.environment === "live" ? "https://api.binance.com" : "https://testnet.binance.vision";
        const res = await fetch(`${base}/api/v3/account?${qs}&signature=${sig}`, {
          headers: { "X-MBX-APIKEY": conn.apiKey },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          return { valid: true, message: "Binance connection verified", accountInfo: { balances: data.balances?.slice(0, 5) } };
        }
        return { valid: false, message: "Invalid Binance credentials" };
      }
      case "oanda": {
        const base = conn.environment === "live" ? "https://api-fxtrade.oanda.com" : "https://api-fxpractice.oanda.com";
        const res = await fetch(`${base}/v3/accounts`, {
          headers: { "Authorization": `Bearer ${conn.apiKey}` },
          signal: AbortSignal.timeout(8000),
        });
        if (res.ok) {
          const data = await res.json();
          return { valid: true, message: "OANDA connection verified", accountInfo: data.accounts?.[0] };
        }
        return { valid: false, message: "Invalid OANDA credentials" };
      }
      default:
        return { valid: false, message: `Unknown broker: ${conn.broker}` };
    }
  } catch (err) {
    return { valid: false, message: String(err) };
  }
}
