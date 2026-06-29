// RuleEngine.ts
import { IndicatorEngine } from "./IndicatorEngine.js";
import { MarketStructureEngine } from "./MarketStructureEngine.js";
import { OptionChainData } from "./providers/MarketDataProvider.js";
import { OHLC } from "./DataEngine.js";

export class RuleEngine {
  static evaluate(
    data: OHLC[], 
    optionChain: OptionChainData[] | null, 
    spotPrice: number
  ) {
    let score = 0;
    
    // 1. Trend Alignment (20 points)
    const ema20 = IndicatorEngine.calculateEMA(data, 20);
    const ema50 = IndicatorEngine.calculateEMA(data, 50);
    const lastEma20 = ema20[ema20.length - 1];
    const lastEma50 = ema50[ema50.length - 1];
    
    let trend = "SIDEWAYS";
    if (spotPrice > lastEma20 && lastEma20 > lastEma50) {
      trend = "BULLISH";
      score += 20;
    } else if (spotPrice < lastEma20 && lastEma20 < lastEma50) {
      trend = "BEARISH";
      score += 20;
    }

    // 2. Market Structure (15 points)
    const swings = MarketStructureEngine.detectSwings(data);
    const structure = MarketStructureEngine.detectStructure(swings);
    if (structure.trend === trend) score += 15;

    // 3. VWAP (10 points)
    const vwap = IndicatorEngine.calculateVWAP(data);
    const lastVwap = vwap[vwap.length - 1];
    if (trend === "BULLISH" && spotPrice > lastVwap) score += 10;
    if (trend === "BEARISH" && spotPrice < lastVwap) score += 10;

    // 4. Momentum / RSI / ADX
    const rsi = IndicatorEngine.calculateRSI(data);
    const lastRsi = rsi[rsi.length - 1];
    const adxScore = 5; // placeholder for ADX math 
    score += adxScore;
    
    if (trend === "BULLISH" && lastRsi > 50 && lastRsi < 70) score += 5;
    if (trend === "BEARISH" && lastRsi < 50 && lastRsi > 30) score += 5;

    // 5. Options Data (15 points)
    if (optionChain) {
       // Option Data exists
       score += 15;
    }

    return {
      totalScore: score,
      trend,
      structure: structure.trend,
      vwap: lastVwap,
      rsi: lastRsi
    };
  }
}
