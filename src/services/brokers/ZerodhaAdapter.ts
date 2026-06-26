import { IBrokerAdapter, FundDetails, Position, Order, PlaceOrderParams, ModifyOrderParams } from "./IBrokerAdapter.js";
import { logger } from "../../lib/logger.js";

export class ZerodhaAdapter implements IBrokerAdapter {
  brokerId = "zerodha";
  private apiKey: string;
  private apiSecret: string;
  private baseUrl = "https://api.kite.trade";

  constructor(apiKey: string, apiSecret: string) {
    this.apiKey = apiKey;
    this.apiSecret = apiSecret;
  }

  getLoginUrl(): string { return `https://kite.zerodha.com/connect/login?v=3&api_key=${this.apiKey}`; }
  async generateSession(): Promise<any> { return { accessToken: "mock_token" }; }

  private getHeaders() {
    return {
      "X-Kite-Version": "3",
      "Authorization": `token ${this.apiKey}:mock_access_token`
    };
  }

  async getFunds(): Promise<FundDetails> {
    const res = await fetch(`${this.baseUrl}/user/margins`, { headers: this.getHeaders() });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Zerodha API getFunds failed: ${err}`);
    }
    const data = await res.json();
    return {
      availableMargin: data.data.equity.available.live_balance || 0,
      usedMargin: data.data.equity.utilised.debits || 0,
      openingBalance: data.data.equity.available.opening_balance || 0
    };
  }

  async getProfile(): Promise<any> { return { clientId: "ZERODHA_MOCK" }; }
  async getPositions(): Promise<Position[]> { return []; }
  async getHoldings(): Promise<any[]> { return []; }
  async getOrders(): Promise<Order[]> { return []; }

  async placeOrder(params: PlaceOrderParams): Promise<string> {
    const payload = new URLSearchParams();
    payload.append("tradingsymbol", params.tradingSymbol);
    payload.append("exchange", params.exchange);
    payload.append("transaction_type", params.transactionType);
    payload.append("order_type", params.orderType);
    payload.append("quantity", params.quantity.toString());
    payload.append("product", params.productType === "MIS" ? "MIS" : "NRML");
    payload.append("validity", "DAY");

    const res = await fetch(`${this.baseUrl}/orders/regular`, {
      method: "POST",
      headers: { ...this.getHeaders(), "Content-Type": "application/x-www-form-urlencoded" },
      body: payload
    });

    if (!res.ok) {
      const err = await res.text();
      logger.error(`[ZerodhaAdapter] Order Failed: ${err}`);
      throw new Error(`Failed to place order via Zerodha: ${err}`);
    }
    
    const data = await res.json();
    logger.info(`[ZerodhaAdapter] Placed order for ${params.tradingSymbol}. ID: ${data.data?.order_id}`);
    return data.data?.order_id || `ZRO_ORD_${Date.now()}`;
  }

  async modifyOrder(params: ModifyOrderParams): Promise<boolean> { return true; }
  async cancelOrder(orderId: string): Promise<boolean> { return true; }

  async getLTP(instrumentTokens: string[]): Promise<Record<string, number>> {
    return { [instrumentTokens[0]]: 22100.50 };
  }
}

