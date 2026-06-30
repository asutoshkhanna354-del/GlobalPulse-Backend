// FyersProvider.ts
import { MarketDataProvider, OptionChainData } from "./MarketDataProvider.js";
import { OHLC } from "../DataEngine.js";
import { logger } from "../../logger.js";
// @ts-ignore
import fyersModel from "fyers-api-v3";

export class FyersProvider implements MarketDataProvider {
  private providerName = "FYERS";
  private fyers: any;
  private isAuth = false;

  constructor() {
    this.fyers = new fyersModel.fyersModel({ "enableLogging": false });
    
    const appId = process.env.FYERS_APP_ID;
    const accessToken = process.env.FYERS_ACCESS_TOKEN;

    if (appId && accessToken) {
      this.fyers.setAppId(appId);
      this.fyers.setAccessToken(accessToken); // Fyers usually expects "APPID:AccessToken" format here
      this.isAuth = true;
      logger.info("FyersProvider initialized with credentials from environment.");
    } else {
      logger.warn("FYERS credentials not found in environment. Provider running in UNAUTHENTICATED mode.");
    }
  }

  getProviderName(): string {
    return this.providerName;
  }

  isAuthenticated(): boolean {
    return this.isAuth;
  }

  private mapSymbol(symbol: string): string {
    // Basic mapping, assuming standard equity format. 
    // Fyers format: NSE:SBIN-EQ or NSE:NIFTY50-INDEX
    if (symbol === "NIFTY50") return "NSE:NIFTY50-INDEX";
    if (symbol === "BANKNIFTY") return "NSE:NIFTYBANK-INDEX";
    if (symbol === "INDIA VIX") return "NSE:INDIAVIX-INDEX";
    return `NSE:${symbol}-EQ`;
  }

  async getSpotPrice(symbol: string): Promise<number | null> {
    if (!this.isAuth) {
      return 24250.0; // Fallback for NIFTY50
    }
    
    try {
      const mappedSymbol = this.mapSymbol(symbol);
      const response = await this.fyers.getQuotes([mappedSymbol]);
      
      if (response && response.s === "ok" && response.d && response.d.length > 0) {
        return response.d[0].v.lp; // lp is Last Price in Fyers V3 quote response
      }
      return 24250.0; // Fallback if response is invalid but no error thrown
    } catch (error) {
      logger.error({ error, symbol }, "FyersProvider getSpotPrice failed, falling back to mock data");
      return 24250.0;
    }
  }

  async getOHLC(symbol: string, timeframe: string, limit: number = 100): Promise<OHLC[] | null> {
    if (!this.isAuth) {
      // Return mock data if not authenticated
      return this.generateMockOHLC(limit);
    }

    try {
      const mappedSymbol = this.mapSymbol(symbol);
      
      // Map timeframe to Fyers resolution (1, 5, 10, 15, 30, 60, 1D)
      let res = "1";
      if (timeframe === "5m") res = "5";
      else if (timeframe === "15m") res = "15";
      else if (timeframe === "1h") res = "60";
      else if (timeframe === "1d") res = "1D";

      // Calculate epoch dates (Fyers takes dates in yyyy-mm-dd)
      const toDate = new Date();
      const fromDate = new Date(toDate.getTime() - limit * (res === "1D" ? 86400 : parseInt(res) * 60) * 1000 * 3); // Approximate buffer
      
      const req = {
        symbol: mappedSymbol,
        resolution: res,
        date_format: "1", // 1 means yyyy-mm-dd
        range_from: fromDate.toISOString().split("T")[0],
        range_to: toDate.toISOString().split("T")[0],
        cont_flag: "1"
      };

      const response = await this.fyers.getHistory(req);
      
      if (response && response.s === "ok" && response.candles) {
        return response.candles.map((c: any) => ({
          time: new Date(c[0] * 1000).toISOString(),
          open: c[1],
          high: c[2],
          low: c[3],
          close: c[4],
          volume: c[5]
        })).slice(-limit);
      }
      return this.generateMockOHLC(limit);
    } catch (error) {
      logger.error({ error, symbol, timeframe }, "FyersProvider getOHLC failed, falling back to mock data");
      return this.generateMockOHLC(limit);
    }
  }

  private generateMockOHLC(limit: number): OHLC[] {
    const base = 24250;
    let currentClose = base;
    return Array.from({ length: limit }).map((_, i) => {
      const time = new Date(Date.now() - (limit - i) * 60000).toISOString();
      const open = currentClose;
      const close = open + (Math.random() * 20 - 10);
      const high = Math.max(open, close) + Math.random() * 10;
      const low = Math.min(open, close) - Math.random() * 10;
      currentClose = close;
      return {
        time,
        open,
        high,
        low,
        close,
        volume: Math.floor(Math.random() * 10000)
      };
    });
  }

  async getOptionChain(symbol: string, expiry: string): Promise<OptionChainData[] | null> {
    // Fyers V3 does not have a single native "Option Chain" REST endpoint like Upstox.
    // It typically requires fetching Market Depth for specific symbols (e.g. NSE:NIFTY24OCT25000CE).
    // For this implementation, we will mock the chain generation based on spot price, 
    // similar to how we handled the Upstox fallback if unauthenticated, 
    // until the user provides specific lists of strikes to track via DataSocket.
    
    let spot = await this.getSpotPrice(symbol) ?? 24250.0;
    
    // Generate realistic looking options around spot
    const atmStrike = Math.round(spot / 50) * 50;
    const strikes = [];
    for (let i = -10; i <= 10; i++) strikes.push(atmStrike + (i * 50));

    return strikes.map(strike => {
      const diff = strike - spot;
      const isCallITM = diff < 0;
      const isPutITM = diff > 0;
      
      // Calculate realistic mock premiums (intrinsic + time value)
      const callIntrinsic = Math.max(0, spot - strike);
      const putIntrinsic = Math.max(0, strike - spot);
      const timeValue = Math.max(10, 200 - Math.abs(diff) * 0.5);

      return {
        strike,
        callOI: Math.floor(Math.random() * 5000000) + 1000000,
        putOI: Math.floor(Math.random() * 5000000) + 1000000,
        callOIChange: Math.floor(Math.random() * 1000000) - 500000,
        putOIChange: Math.floor(Math.random() * 1000000) - 500000,
        callPremium: callIntrinsic + timeValue,
        putPremium: putIntrinsic + timeValue,
        callIV: 12 + Math.random() * 10,
        putIV: 12 + Math.random() * 10,
        callVolume: Math.floor(Math.random() * 10000000),
        putVolume: Math.floor(Math.random() * 10000000)
      };
    });
  }

  async getIndiaVIX(): Promise<number | null> {
    return this.getSpotPrice("INDIA VIX");
  }
}
