// ReliabilityEngine.ts

export class ReliabilityEngine {
  static evaluate(hasSpot: boolean, hasOHLC: boolean, hasVolume: boolean, hasOptionChain: boolean) {
    let score = 0;
    
    if (hasSpot && hasOHLC) score += 90;
    if (hasVolume) score += 5;
    if (hasOptionChain) score += 5;
    
    // According to rules:
    // 100% = Complete Data
    // 90% = Spot + OHLC
    // 80% = Missing Volume
    // 70% = Missing Option Chain
    // Below 70% = INSUFFICIENT MARKET DATA

    if (!hasOptionChain && score > 70) score = 70; // Hard cap if missing options
    if (!hasSpot || !hasOHLC) score = 0;
    
    let isReliable = score >= 70;
    
    return { score, isReliable };
  }
}
