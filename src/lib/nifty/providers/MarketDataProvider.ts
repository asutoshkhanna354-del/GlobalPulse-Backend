// MarketDataProvider.ts
// Abstract Interface for Provider Adapter Architecture

import { OHLC } from "../DataEngine.js";

export interface OptionChainData {
  strike: number;
  callOI: number;
  putOI: number;
  callOIChange: number;
  putOIChange: number;
  callPremium: number;
  putPremium: number;
  callIV: number;
  putIV: number;
  callVolume: number;
  putVolume: number;
}

export interface MarketDataProvider {
  getProviderName(): string;
  isAuthenticated(): boolean;
  
  getSpotPrice(symbol: string): Promise<number | null>;
  getOHLC(symbol: string, timeframe: string, limit?: number): Promise<OHLC[] | null>;
  getOptionChain(symbol: string, expiry: string): Promise<OptionChainData[] | null>;
  
  getIndiaVIX(): Promise<number | null>;
}
