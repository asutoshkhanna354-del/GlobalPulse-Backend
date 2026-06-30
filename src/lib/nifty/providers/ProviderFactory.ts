// ProviderFactory.ts
import { MarketDataProvider } from "./MarketDataProvider.js";
import { UpstoxProvider } from "./UpstoxProvider.js";
import { FyersProvider } from "./FyersProvider.js";
import { logger } from "../../logger.js";

export class ProviderFactory {
  static getProvider(): MarketDataProvider {
    const providerName = process.env.MARKET_DATA_PROVIDER || "UPSTOX";
    
    switch (providerName.toUpperCase()) {
      case "UPSTOX":
        return new UpstoxProvider();
      case "FYERS":
        return new FyersProvider();
      // Future integrations: AngelOneProvider, ShoonyaProvider, KiteProvider
      default:
        logger.warn(`Provider ${providerName} not found, defaulting to UPSTOX`);
        return new UpstoxProvider();
    }
  }
}
