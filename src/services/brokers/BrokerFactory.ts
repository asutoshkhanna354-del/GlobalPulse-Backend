import { IBrokerAdapter } from "./IBrokerAdapter.js";
import { DhanAdapter } from "./DhanAdapter.js";
import { ZerodhaAdapter } from "./ZerodhaAdapter.js";

export class BrokerFactory {
  static getAdapter(brokerId: string, credentials: Record<string, string>): IBrokerAdapter {
    switch (brokerId.toLowerCase()) {
      case "dhan":
        return new DhanAdapter(credentials.client_id, credentials.access_token);
      case "zerodha":
        return new ZerodhaAdapter(credentials.api_key, credentials.api_secret);
      default:
        throw new Error(`Broker adapter for ${brokerId} is not supported yet.`);
    }
  }
}
