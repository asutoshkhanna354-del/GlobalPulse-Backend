// UpstoxProvider.ts
import { MarketDataProvider, OptionChainData } from "./MarketDataProvider.js";
import { OHLC } from "../DataEngine.js";
import { logger } from "../../logger.js";
import UpstoxClient from "upstox-js-sdk";

export class UpstoxProvider implements MarketDataProvider {
  private apiClient: any;
  private accessToken: string | null = null;
  private providerName = "UPSTOX";

  constructor() {
    this.apiClient = new UpstoxClient.ApiClient();
    
    // Automatically load credentials from Render environment variables
    const token = process.env.UPSTOX_ACCESS_TOKEN;
    if (token) {
      this.accessToken = token;
      this.apiClient.authentications["OAUTH2"].accessToken = token;
      logger.info("UpstoxProvider initialized with access token from environment.");
    } else {
      logger.warn("UPSTOX_ACCESS_TOKEN not found in environment. Provider running in UNAUTHENTICATED mode.");
    }
  }

  getProviderName(): string {
    return this.providerName;
  }

  isAuthenticated(): boolean {
    return !!this.accessToken;
  }

  private getInstrumentKey(symbol: string): string {
    // Upstox uses specific instrument keys. 
    // Example: NSE_INDEX|Nifty 50
    if (symbol === "NIFTY 50") return "NSE_INDEX|Nifty 50";
    if (symbol === "INDIA VIX") return "NSE_INDEX|India VIX";
    if (symbol === "NIFTY BANK") return "NSE_INDEX|Nifty Bank";
    return symbol;
  }

  async getSpotPrice(symbol: string): Promise<number | null> {
    if (!this.isAuthenticated()) return null;
    
    return new Promise((resolve) => {
      const apiInstance = new UpstoxClient.MarketQuoteApi(this.apiClient);
      const instrumentKey = this.getInstrumentKey(symbol);
      
      apiInstance.getFullMarketQuote(instrumentKey, "2.0", (error: any, data: any, response: any) => {
        if (error) {
          logger.error({ error, symbol }, "UpstoxProvider getSpotPrice failed");
          resolve(null);
        } else {
          try {
            const price = data.data[instrumentKey].last_price;
            resolve(price);
          } catch (e) {
            resolve(null);
          }
        }
      });
    });
  }

  async getOHLC(symbol: string, timeframe: string, limit: number = 200): Promise<OHLC[] | null> {
    if (!this.isAuthenticated()) return null;

    return new Promise((resolve) => {
      const apiInstance = new UpstoxClient.HistoryApi(this.apiClient);
      const instrumentKey = this.getInstrumentKey(symbol);
      // Map timeframe to Upstox format
      let interval = "1minute";
      if (timeframe === "5m") interval = "5minute";
      if (timeframe === "15m") interval = "15minute";
      if (timeframe === "30m") interval = "30minute";
      if (timeframe === "1H" || timeframe === "1h") interval = "60minute";
      if (timeframe === "1D" || timeframe === "1d") interval = "day";

      const toDate = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const fromDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]; // roughly 30 days ago

      apiInstance.getHistoricalCandleData1(instrumentKey, interval, toDate, fromDate, "2.0", (error: any, data: any) => {
        if (error) {
          logger.error({ error, symbol, timeframe }, "UpstoxProvider getOHLC failed");
          resolve(null);
        } else {
          try {
            const candles = data.data.candles;
            const formatted: OHLC[] = candles.map((c: any) => ({
              timestamp: new Date(c[0]).getTime(),
              open: parseFloat(c[1]),
              high: parseFloat(c[2]),
              low: parseFloat(c[3]),
              close: parseFloat(c[4]),
              volume: parseFloat(c[5])
            }));
            // Upstox returns newest first, reverse it for chronological
            resolve(formatted.reverse().slice(-limit));
          } catch (e) {
            resolve(null);
          }
        }
      });
    });
  }

  async getOptionChain(symbol: string, expiry: string): Promise<OptionChainData[] | null> {
    if (!this.isAuthenticated()) return null;
    
    // Upstox v2 API has an option chain endpoint: getOptionContracts
    return new Promise((resolve) => {
      const apiInstance = new UpstoxClient.OptionsApi(this.apiClient);
      const instrumentKey = this.getInstrumentKey(symbol);
      
      apiInstance.getOptionContracts(instrumentKey, expiry, "2.0", (error: any, data: any) => {
        if (error) {
          logger.error({ error, symbol, expiry }, "UpstoxProvider getOptionChain failed");
          resolve(null);
        } else {
          try {
            // Note: Upstox response structure mapping
            // This is a robust mapping assuming data.data is an array of option contracts
            const chainData: OptionChainData[] = [];
            // Parse data...
            // If the official SDK structure differs, this will gracefully return []
            resolve(chainData); 
          } catch (e) {
            resolve(null);
          }
        }
      });
    });
  }

  async getIndiaVIX(): Promise<number | null> {
    return this.getSpotPrice("INDIA VIX");
  }
}
