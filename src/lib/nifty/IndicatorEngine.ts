// IndicatorEngine.ts
import { OHLC } from "./DataEngine.js";

export class IndicatorEngine {
  static calculateEMA(data: OHLC[], period: number): number[] {
    const k = 2 / (period + 1);
    let emaArray = [];
    let currentEma = data[0].close;
    
    for (let i = 0; i < data.length; i++) {
      currentEma = (data[i].close - currentEma) * k + currentEma;
      emaArray.push(currentEma);
    }
    return emaArray;
  }

  static calculateRSI(data: OHLC[], period: number = 14): number[] {
    let gains = 0, losses = 0;
    const rsiArray: number[] = new Array(data.length).fill(50);
    
    for (let i = 1; i <= period && i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    let avgGain = gains / period;
    let avgLoss = losses / period;
    
    for (let i = period; i < data.length; i++) {
      const change = data[i].close - data[i - 1].close;
      let gain = change > 0 ? change : 0;
      let loss = change < 0 ? -change : 0;
      
      avgGain = (avgGain * (period - 1) + gain) / period;
      avgLoss = (avgLoss * (period - 1) + loss) / period;
      
      const rs = avgGain / (avgLoss === 0 ? 1 : avgLoss);
      rsiArray[i] = 100 - (100 / (1 + rs));
    }
    
    return rsiArray;
  }

  static calculateATR(data: OHLC[], period: number = 14): number[] {
    const atrArray = new Array(data.length).fill(0);
    let sumTR = 0;
    
    for (let i = 1; i <= period && i < data.length; i++) {
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      );
      sumTR += tr;
    }
    
    let currentATR = sumTR / period;
    
    for (let i = period; i < data.length; i++) {
      const tr = Math.max(
        data[i].high - data[i].low,
        Math.abs(data[i].high - data[i - 1].close),
        Math.abs(data[i].low - data[i - 1].close)
      );
      currentATR = (currentATR * (period - 1) + tr) / period;
      atrArray[i] = currentATR;
    }
    return atrArray;
  }

  static calculateVWAP(data: OHLC[]): number[] {
    let cumulativeTypicalPriceVolume = 0;
    let cumulativeVolume = 0;
    return data.map(d => {
      if (d.volume === 0) return d.close;
      const typicalPrice = (d.high + d.low + d.close) / 3;
      cumulativeTypicalPriceVolume += typicalPrice * d.volume;
      cumulativeVolume += d.volume;
      return cumulativeTypicalPriceVolume / cumulativeVolume;
    });
  }

  static calculateSuperTrend(data: OHLC[], period: number = 10, multiplier: number = 3) {
    const atr = this.calculateATR(data, period);
    const supertrend = new Array(data.length).fill(0);
    const direction = new Array(data.length).fill(1); // 1 for bull, -1 for bear

    let finalUpperband = 0;
    let finalLowerband = 0;

    for (let i = 1; i < data.length; i++) {
      const basicUpperband = (data[i].high + data[i].low) / 2 + multiplier * atr[i];
      const basicLowerband = (data[i].high + data[i].low) / 2 - multiplier * atr[i];
      
      finalUpperband = (basicUpperband < finalUpperband || data[i-1].close > finalUpperband) ? basicUpperband : finalUpperband;
      finalLowerband = (basicLowerband > finalLowerband || data[i-1].close < finalLowerband) ? basicLowerband : finalLowerband;

      if (supertrend[i-1] === finalUpperband && data[i].close <= finalUpperband) {
        direction[i] = -1;
      } else if (supertrend[i-1] === finalUpperband && data[i].close >= finalUpperband) {
        direction[i] = 1;
      } else if (supertrend[i-1] === finalLowerband && data[i].close >= finalLowerband) {
        direction[i] = 1;
      } else if (supertrend[i-1] === finalLowerband && data[i].close <= finalLowerband) {
        direction[i] = -1;
      } else {
        direction[i] = direction[i-1];
      }
      supertrend[i] = direction[i] === 1 ? finalLowerband : finalUpperband;
    }

    return { supertrend, direction };
  }
}
