import { PlaceOrderParams } from "../brokers/IBrokerAdapter.js";
import { logger } from "../../lib/logger.js";

export class RiskEngine {
  /**
   * Validates if a proposed order meets the risk criteria set by the user
   */
  static async validateOrder(
    orderParams: PlaceOrderParams, 
    availableMargin: number,
    projectedLTP: number,
    riskPercent: number
  ): Promise<{ allowed: boolean; reason?: string; quantityAllowed: number }> {
    
    if (orderParams.productType !== "MIS" && orderParams.productType !== "NRML") {
       return { allowed: false, reason: "Product type not supported for automated trading.", quantityAllowed: 0 };
    }

    // 1. Position Sizing Check (Margin Limit based on RiskPercent)
    const allowedCapital = availableMargin * (riskPercent / 100);
    const requiredMarginPerLot = projectedLTP * orderParams.quantity;
    
    // In actual broker API, margin requirement for selling options is huge, buying is premium. 
    // We assume buying for now.
    const maxLots = Math.floor(allowedCapital / requiredMarginPerLot);

    if (maxLots < 1) {
      logger.warn(`[RiskEngine] Insufficient capital. Required: ${requiredMarginPerLot}, Allowed: ${allowedCapital}`);
      return { allowed: false, reason: "Insufficient capital based on risk settings.", quantityAllowed: 0 };
    }

    // The safe quantity we can trade
    const quantityAllowed = maxLots * orderParams.quantity; // Adjust if multiple lots

    return { allowed: true, quantityAllowed };
  }
}
