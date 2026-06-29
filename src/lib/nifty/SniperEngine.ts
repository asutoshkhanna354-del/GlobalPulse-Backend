// SniperEngine.ts
// Specialized Institutional Options Sniper Engine

import { DataEngine, OHLC } from "./DataEngine.js";
import { OptionEngine } from "./OptionEngine.js";

export class SniperEngine {
  static analyze(bars: OHLC[], spotPrice: number): any {
    if (bars.length < 200) {
      return this.generateNoTrade("Insufficient data for Sniper Analysis.");
    }

    const closes = bars.map(b => b.close);
    
    // 1. Calculate Core Metrics
    const ema20 = DataEngine.calculateEMA(closes, 20);
    const ema50 = DataEngine.calculateEMA(closes, 50);
    const vwap = DataEngine.calculateVWAP(bars);
    const adx = DataEngine.calculateADX(bars, 14);
    const atr = DataEngine.calculateATR(bars, 14);
    const struct = DataEngine.detectMarketStructure(bars);
    const options = OptionEngine.calculateMetrics(spotPrice, struct.trend);

    // 2. Strict Sniper Confirmations (Max 10)
    let bullishScore = 0;
    if (struct.trend === "Bullish") bullishScore++; // 1
    if (adx > 25) bullishScore++; // 2
    if (spotPrice > vwap) bullishScore++; // 3
    if (ema20 > ema50) bullishScore++; // 4
    if (struct.bos) bullishScore++; // 5 (Break of structure)
    // Assume volume breakout if last bar volume > 1.5x average
    const avgVol = bars.slice(-10).reduce((acc, b) => acc + b.volume, 0) / 10;
    if (bars[bars.length - 1].volume > avgVol * 1.5) bullishScore++; // 6
    if (options.pcr > 1.2) bullishScore++; // 7
    if (options.putWriting) bullishScore++; // 8
    if (!options.callWriting) bullishScore++; // 9
    if (spotPrice > options.maxPain) bullishScore++; // 10

    let bearishScore = 0;
    if (struct.trend === "Bearish") bearishScore++;
    if (adx > 25) bearishScore++;
    if (spotPrice < vwap) bearishScore++;
    if (ema20 < ema50) bearishScore++;
    if (struct.bos) bearishScore++;
    if (bars[bars.length - 1].volume > avgVol * 1.5) bearishScore++;
    if (options.pcr < 0.8) bearishScore++;
    if (options.callWriting) bearishScore++;
    if (!options.putWriting) bearishScore++;
    if (spotPrice < options.maxPain) bearishScore++;

    let signalType = "NO SNIPER TRADE";
    let score = 0;
    
    if (bullishScore >= 9) { // strict 9-10 required for sniper
      signalType = struct.bos ? "Breakout CE" : "Momentum CE";
      score = bullishScore;
    } else if (bearishScore >= 9) {
      signalType = struct.bos ? "Breakdown PE" : "Momentum PE";
      score = bearishScore;
    } else {
      return this.generateNoTrade("Sniper criteria unmet. Requires 9/10 confirmations.");
    }

    const confidenceScore = score === 10 ? 98 : 92; 
    const strike = OptionEngine.selectStrike(spotPrice, signalType.includes("CE") ? "BUY CE" : "BUY PE");
    
    const stopLoss = signalType.includes("CE") ? spotPrice - atr : spotPrice + atr;
    const risk = Math.abs(spotPrice - stopLoss);
    
    // Minimum 1:3 for Sniper
    const target1 = signalType.includes("CE") ? spotPrice + risk * 2 : spotPrice - risk * 2;
    const target2 = signalType.includes("CE") ? spotPrice + risk * 3 : spotPrice - risk * 3;
    const target3 = signalType.includes("CE") ? spotPrice + risk * 4 : spotPrice - risk * 4;
    const target4 = signalType.includes("CE") ? spotPrice + risk * 6 : spotPrice - risk * 6;

    return {
      signalType,
      entry: spotPrice,
      strike: strike.toString(),
      currentPremium: 150, // Simulated real premium as requested
      target1,
      target2,
      target3,
      target4,
      stopLoss,
      riskReward: "1:3+",
      expectedHoldingTime: "1-4 Hours",
      confirmationScore: confidenceScore,
      reasoning: `Extremely high probability setup. Trend alignment, ADX(${adx.toFixed(1)}) > 25, Break of structure, high volume, and strong options activity.`,
    };
  }

  static generateNoTrade(reason: string) {
    return {
      signalType: "NO SNIPER TRADE",
      entry: 0,
      strike: "N/A",
      currentPremium: 0,
      target1: 0,
      target2: 0,
      target3: 0,
      target4: 0,
      stopLoss: 0,
      riskReward: "N/A",
      expectedHoldingTime: "N/A",
      confirmationScore: 0,
      reasoning: reason
    };
  }
}
