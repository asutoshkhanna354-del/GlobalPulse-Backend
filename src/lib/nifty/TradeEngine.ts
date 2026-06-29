// TradeEngine.ts
import { ProviderFactory } from "./providers/ProviderFactory.js";
import { IndicatorEngine } from "./IndicatorEngine.js";
import { MarketStructureEngine } from "./MarketStructureEngine.js";
import { RuleEngine } from "./RuleEngine.js";
import { TradeQualityEngine } from "./TradeQualityEngine.js";
import { RiskEngine } from "./RiskEngine.js";
import { ReliabilityEngine } from "./ReliabilityEngine.js";
import { OptionEngine } from "./OptionEngine.js";

export class TradeEngine {
  static async evaluateTrade(symbol: string) {
    const provider = ProviderFactory.getProvider();
    
    // 1. Fetch live data
    const spotPrice = await provider.getSpotPrice(symbol);
    const ohlc = await provider.getOHLC(symbol, "5m", 200);
    const optionAnalysis = await OptionEngine.evaluate(provider, symbol, spotPrice ?? 0);
    
    // 2. Reliability Check
    const reliability = ReliabilityEngine.evaluate(
      spotPrice !== null, 
      ohlc !== null && ohlc.length > 0,
      true, // assuming volume is present in OHLC
      optionAnalysis.status !== "OPTION CHAIN DATA UNAVAILABLE"
    );

    if (!reliability.isReliable || !ohlc || spotPrice === null) {
      return { tradeType: "NO TRADE", reason: "INSUFFICIENT MARKET DATA", reliability: reliability.score };
    }

    // 3. Math Engines
    const swings = MarketStructureEngine.detectSwings(ohlc);
    const rules = RuleEngine.evaluate(ohlc, optionAnalysis.chainData ?? null, spotPrice);
    
    // 4. Quality & Grading
    const quality = TradeQualityEngine.gradeTrade(rules.totalScore);
    if (!quality.actionable) {
      return { tradeType: "NO TRADE", reason: "TRADE QUALITY BELOW B", grade: quality.grade, confidence: rules.totalScore, reliability: reliability.score };
    }

    // 5. Risk & Targets
    const risk = RiskEngine.calculate(ohlc, spotPrice, rules.trend, swings);

    let tradeType = "NO TRADE";
    if (rules.trend === "BULLISH") tradeType = "BUY CE";
    else if (rules.trend === "BEARISH") tradeType = "BUY PE";

    return {
      tradeType,
      entry: spotPrice,
      stoploss: risk.stoploss,
      target1: risk.target1,
      target2: risk.target2,
      target3: risk.target3,
      riskReward: risk.riskReward,
      tradeGrade: quality.grade,
      confidence: rules.totalScore,
      reliabilityScore: reliability.score,
      trend: rules.trend
    };
  }
}
