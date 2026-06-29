// DataEngine.ts
// Institutional-grade deterministic calculation engine for Nifty 50

export interface OHLC {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export class DataEngine {
  
  static calculateEMA(closes: number[], period: number): number {
    if (closes.length < period) return closes[closes.length - 1] || 0;
    
    const k = 2 / (period + 1);
    let ema = closes.slice(0, period).reduce((a, b) => a + b, 0) / period; // SMA for first EMA
    
    for (let i = period; i < closes.length; i++) {
      ema = (closes[i] * k) + (ema * (1 - k));
    }
    return ema;
  }

  static calculateVWAP(bars: OHLC[]): number {
    if (!bars.length) return 0;
    
    let cumVol = 0;
    let cumTypVol = 0;
    
    for (const b of bars) {
      const typ = (b.high + b.low + b.close) / 3;
      const vol = b.volume || 1; 
      cumVol += vol;
      cumTypVol += typ * vol;
    }
    
    return cumVol === 0 ? bars[bars.length - 1].close : (cumTypVol / cumVol);
  }

  static calculateRSI(closes: number[], period: number = 14): number {
    if (closes.length <= period) return 50;

    let gains = 0;
    let losses = 0;

    for (let i = 1; i <= period; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) gains += diff;
      else losses -= diff;
    }

    let avgGain = gains / period;
    let avgLoss = losses / period;

    for (let i = period + 1; i < closes.length; i++) {
      const diff = closes[i] - closes[i - 1];
      if (diff >= 0) {
        avgGain = (avgGain * (period - 1) + diff) / period;
        avgLoss = (avgLoss * (period - 1)) / period;
      } else {
        avgGain = (avgGain * (period - 1)) / period;
        avgLoss = (avgLoss * (period - 1) - diff) / period;
      }
    }

    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  }

  static calculateMACD(closes: number[]): { macd: number; signal: number; hist: number } {
    const ema12 = this.calculateEMA(closes, 12);
    const ema26 = this.calculateEMA(closes, 26);
    const macdLine = ema12 - ema26;
    
    // For signal line, we technically need the last 9 MACD values.
    // For simplicity and speed in a stateless environment, we compute full series.
    const macdSeries = [];
    for (let i = 26; i <= closes.length; i++) {
      const slice = closes.slice(0, i);
      macdSeries.push(this.calculateEMA(slice, 12) - this.calculateEMA(slice, 26));
    }
    
    const signal = this.calculateEMA(macdSeries, 9);
    return { macd: macdLine, signal, hist: macdLine - signal };
  }

  static calculateATR(bars: OHLC[], period: number = 14): number {
    if (bars.length <= period) return 50;
    const trs = [];
    for (let i = 1; i < bars.length; i++) {
      const hl = bars[i].high - bars[i].low;
      const hpc = Math.abs(bars[i].high - bars[i - 1].close);
      const lpc = Math.abs(bars[i].low - bars[i - 1].close);
      trs.push(Math.max(hl, hpc, lpc));
    }
    
    // Smoothed TR
    let atr = trs.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < trs.length; i++) {
      atr = (atr * (period - 1) + trs[i]) / period;
    }
    return atr;
  }

  static calculateADX(bars: OHLC[], period: number = 14): number {
    if (bars.length <= period * 2) return 20; 
    
    let plusDM = 0;
    let minusDM = 0;
    let tr = 0;
    
    for (let i = 1; i <= period; i++) {
      const upMove = bars[i].high - bars[i - 1].high;
      const downMove = bars[i - 1].low - bars[i].low;
      
      if (upMove > downMove && upMove > 0) plusDM += upMove;
      if (downMove > upMove && downMove > 0) minusDM += downMove;
      
      const hl = bars[i].high - bars[i].low;
      const hpc = Math.abs(bars[i].high - bars[i - 1].close);
      const lpc = Math.abs(bars[i].low - bars[i - 1].close);
      tr += Math.max(hl, hpc, lpc);
    }
    
    let smoothedPlus = plusDM;
    let smoothedMinus = minusDM;
    let smoothedTr = tr;
    
    const dxSeries = [];
    for (let i = period + 1; i < bars.length; i++) {
      const upMove = bars[i].high - bars[i - 1].high;
      const downMove = bars[i - 1].low - bars[i].low;
      
      const pDM = (upMove > downMove && upMove > 0) ? upMove : 0;
      const nDM = (downMove > upMove && downMove > 0) ? downMove : 0;
      
      const hl = bars[i].high - bars[i].low;
      const hpc = Math.abs(bars[i].high - bars[i - 1].close);
      const lpc = Math.abs(bars[i].low - bars[i - 1].close);
      const currentTr = Math.max(hl, hpc, lpc);
      
      smoothedPlus = smoothedPlus - (smoothedPlus / period) + pDM;
      smoothedMinus = smoothedMinus - (smoothedMinus / period) + nDM;
      smoothedTr = smoothedTr - (smoothedTr / period) + currentTr;
      
      const diPlus = (smoothedPlus / smoothedTr) * 100;
      const diMinus = (smoothedMinus / smoothedTr) * 100;
      const dx = Math.abs(diPlus - diMinus) / (diPlus + diMinus) * 100;
      dxSeries.push(dx);
    }
    
    let adx = dxSeries.slice(0, period).reduce((a, b) => a + b, 0) / period;
    for (let i = period; i < dxSeries.length; i++) {
      adx = ((adx * (period - 1)) + dxSeries[i]) / period;
    }
    
    return adx || 20;
  }

  static detectMarketStructure(bars: OHLC[]): { 
    trend: "Bullish" | "Bearish" | "Sideways", 
    structure: "Higher High" | "Lower High" | "Higher Low" | "Lower Low" | "Consolidation",
    bos: boolean,
    liquiditySweep: boolean
  } {
    if (bars.length < 10) return { trend: "Sideways", structure: "Consolidation", bos: false, liquiditySweep: false };
    
    const recent = bars.slice(-10);
    const startClose = recent[0].close;
    const endClose = recent[recent.length - 1].close;
    
    const maxHigh = Math.max(...recent.map(b => b.high));
    const minLow = Math.min(...recent.map(b => b.low));
    
    const isBullish = endClose > startClose && (endClose - minLow) > (maxHigh - endClose);
    const isBearish = endClose < startClose && (maxHigh - endClose) > (endClose - minLow);
    
    const trend = isBullish ? "Bullish" : isBearish ? "Bearish" : "Sideways";
    
    let structure: "Higher High" | "Lower High" | "Higher Low" | "Lower Low" | "Consolidation" = "Consolidation";
    if (isBullish && endClose >= maxHigh * 0.999) structure = "Higher High";
    else if (isBullish) structure = "Higher Low";
    else if (isBearish && endClose <= minLow * 1.001) structure = "Lower Low";
    else if (isBearish) structure = "Lower High";
    
    return {
      trend,
      structure,
      bos: structure === "Higher High" || structure === "Lower Low",
      liquiditySweep: false 
    };
  }

  static detectSupplyDemand(bars: OHLC[]): { supply: number[], demand: number[] } {
    const supply: number[] = [];
    const demand: number[] = [];
    if (bars.length < 20) return { supply, demand };

    // Simple deterministic logic: find sharp drops -> supply is the top before drop
    // Find sharp rallies -> demand is the bottom before rally
    for (let i = 1; i < bars.length - 1; i++) {
      const drop = (bars[i].close - bars[i+1].close) / bars[i].close;
      if (drop > 0.005) { // 0.5% drop in one bar
        supply.push(bars[i].high);
      }
      const rally = (bars[i+1].close - bars[i].close) / bars[i].close;
      if (rally > 0.005) { // 0.5% rally
        demand.push(bars[i].low);
      }
    }

    return { supply: supply.slice(-3), demand: demand.slice(-3) }; // last 3 zones
  }
}
