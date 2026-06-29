// OptionEngine.ts
import { MarketDataProvider, OptionChainData } from "./providers/MarketDataProvider.js";

export class OptionEngine {
  static async evaluate(provider: MarketDataProvider, symbol: string, spotPrice: number) {
    if (!provider.isAuthenticated()) {
      return { status: "OPTION CHAIN DATA UNAVAILABLE" };
    }
    
    // We would need the current expiry string. We'll use a placeholder for today's logic.
    // E.g., '2026-06-25'
    const today = new Date().toISOString().split('T')[0];
    const chain = await provider.getOptionChain(symbol, today);
    
    if (!chain || chain.length === 0) {
      return { status: "OPTION CHAIN DATA UNAVAILABLE" };
    }

    // Calculate PCR
    let totalCallOI = 0;
    let totalPutOI = 0;
    chain.forEach(c => {
      totalCallOI += c.callOI;
      totalPutOI += c.putOI;
    });
    
    const pcr = totalCallOI > 0 ? totalPutOI / totalCallOI : 0;
    
    return {
      status: "AVAILABLE",
      pcr,
      chainData: chain
    };
  }
}
