// MarketStructureEngine.ts
import { OHLC } from "./DataEngine.js";

export interface SwingPoint {
  index: number;
  price: number;
  type: "HH" | "HL" | "LH" | "LL";
}

export class MarketStructureEngine {
  static detectSwings(data: OHLC[], lookback: number = 5): SwingPoint[] {
    const swings: SwingPoint[] = [];
    let lastHigh = -Infinity;
    let lastLow = Infinity;
    
    for (let i = lookback; i < data.length - lookback; i++) {
      let isHigh = true;
      let isLow = true;
      for (let j = i - lookback; j <= i + lookback; j++) {
        if (i === j) continue;
        if (data[j].high >= data[i].high) isHigh = false;
        if (data[j].low <= data[i].low) isLow = false;
      }
      
      if (isHigh) {
        if (data[i].high > lastHigh) {
          swings.push({ index: i, price: data[i].high, type: "HH" });
        } else {
          swings.push({ index: i, price: data[i].high, type: "LH" });
        }
        lastHigh = data[i].high;
      }
      if (isLow) {
        if (data[i].low > lastLow) {
          swings.push({ index: i, price: data[i].low, type: "HL" });
        } else {
          swings.push({ index: i, price: data[i].low, type: "LL" });
        }
        lastLow = data[i].low;
      }
    }
    return swings;
  }

  static detectStructure(swings: SwingPoint[]): { bos: boolean, choch: boolean, trend: "BULLISH" | "BEARISH" | "SIDEWAYS" } {
    if (swings.length < 4) return { bos: false, choch: false, trend: "SIDEWAYS" };
    
    const last = swings[swings.length - 1];
    const prev = swings[swings.length - 2];
    
    let trend: "BULLISH" | "BEARISH" | "SIDEWAYS" = "SIDEWAYS";
    if (last.type === "HH" && prev.type === "HL") trend = "BULLISH";
    if (last.type === "LL" && prev.type === "LH") trend = "BEARISH";
    
    // Simplistic BOS/CHOCH logic
    const bos = last.type === "HH" || last.type === "LL";
    const choch = (last.type === "HL" && prev.type === "LL") || (last.type === "LH" && prev.type === "HH");

    return { bos, choch, trend };
  }
}
