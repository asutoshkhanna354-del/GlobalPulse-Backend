import { IBrokerAdapter, PlaceOrderParams } from "../brokers/IBrokerAdapter";
import { RiskEngine } from "./RiskEngine";
import { IndSettings } from "../../../lib/db/src/schema/ind_trade";

export class ExecutionEngine {
  
  constructor(private brokerAdapter: IBrokerAdapter) {}

  /**
   * Executes a trade after passing risk checks
   */
  async executeTrade(
    orderParams: PlaceOrderParams, 
    userSettings: IndSettings
  ): Promise<{ success: boolean; orderId?: string; error?: string }> {
    try {
      const funds = await this.brokerAdapter.getFunds();
      
      const riskCheck = await RiskEngine.validateOrder(orderParams, userSettings, funds.availableMargin);
      if (!riskCheck.allowed) {
        return { success: false, error: riskCheck.reason };
      }

      // Validated. Proceed to placement.
      const orderId = await this.brokerAdapter.placeOrder(orderParams);
      return { success: true, orderId };
      
    } catch (error: any) {
      console.error("Execution Engine Error:", error);
      return { success: false, error: error.message };
    }
  }
}
