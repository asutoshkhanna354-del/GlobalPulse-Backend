// RiskEngine.ts
import { IndicatorEngine } from "./IndicatorEngine.js";
import { OHLC } from "./DataEngine.js";
import { SwingPoint } from "./MarketStructureEngine.js";

export class RiskEngine {
  static calculate(
    data: OHLC[], 
    entry: number, 
    trend: string, 
    swings: SwingPoint[]
  ) {
    const atrArray = IndicatorEngine.calculateATR(data, 14);
    const atr = atrArray[atrArray.length - 1];

    let stoploss = 0;
    
    // Find most recent swing for SL
    const lastSwing = swings[swings.length - 1];
    
    if (trend === "BULLISH") {
      stoploss = Math.min(entry - atr * 1.5, lastSwing?.type === "HL" || lastSwing?.type === "LL" ? lastSwing.price - 10 : entry - 50);
    } else if (trend === "BEARISH") {
      stoploss = Math.max(entry + atr * 1.5, lastSwing?.type === "HH" || lastSwing?.type === "LH" ? lastSwing.price + 10 : entry + 50);
    } else {
      stoploss = entry - atr * 1.5;
    }

    const risk = Math.abs(entry - stoploss);
    
    const target1 = trend === "BULLISH" ? entry + risk * 1.5 : entry - risk * 1.5;
    const target2 = trend === "BULLISH" ? entry + risk * 2.0 : entry - risk * 2.0;
    const target3 = trend === "BULLISH" ? entry + risk * 3.0 : entry - risk * 3.0;

    const riskReward = (Math.abs(target2 - entry) / risk).toFixed(1);
    
    return { stoploss, target1, target2, target3, riskReward: `1:${riskReward}` };
  }
}
