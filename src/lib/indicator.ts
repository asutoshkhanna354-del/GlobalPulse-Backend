interface OHLCBar {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HoldingTerm {
  label: "SCALP" | "INTRADAY" | "SWING" | "POSITION";
  timeRange: string;
  description: string;
}

interface Signal {
  timestamp: number;
  type: "buy" | "sell" | "exitLong" | "exitShort";
  price: number;
  confidence: number;
  stopLoss: number;
  takeProfit: number;
  riskReward: number;
  holdingTerm: HoldingTerm;
}

function resolveHoldingTerm(interval: string, confidence: number): HoldingTerm {
  // Lower-confidence signals suggest shorter hold to limit exposure
  const highConf = confidence >= 80;
  switch (interval) {
    case "1m":
      return {
        label: "SCALP",
        timeRange: highConf ? "10–30 min" : "5–15 min",
        description: "Quick momentum scalp. Enter at signal, exit on first sign of reversal. Use tight stop-loss. Do not hold overnight.",
      };
    case "5m":
      return {
        label: "SCALP",
        timeRange: highConf ? "30 min–2 hrs" : "15–45 min",
        description: "Fast intra-session scalp. Watch for volume fade or candle reversal. Close same session — no overnight holding.",
      };
    case "15m":
      return {
        label: "INTRADAY",
        timeRange: highConf ? "2–5 hrs" : "1–3 hrs",
        description: "Intraday swing. Hold through the move, trail your stop every 30 min. Close before session end to avoid gap risk.",
      };
    case "30m":
      return {
        label: "INTRADAY",
        timeRange: highConf ? "4–8 hrs" : "2–5 hrs",
        description: "Same-day position. Monitor progress each hour. Close by end of day — do not carry overnight without strong trend confirmation.",
      };
    case "1h":
      return {
        label: "SWING",
        timeRange: highConf ? "2–4 days" : "1–2 days",
        description: "Overnight swing trade. Hold through normal retracements, trail stop daily. Reassess if price closes beyond your stop.",
      };
    case "4h":
      return {
        label: "SWING",
        timeRange: highConf ? "5–10 days" : "3–6 days",
        description: "Multi-day swing. Review position every morning. Use daily close as your reference — only exit on daily candle confirmation.",
      };
    case "1d":
      return {
        label: "POSITION",
        timeRange: highConf ? "3–8 weeks" : "2–4 weeks",
        description: "Position trade. Weekly review cadence. Hold through day-to-day noise, manage via weekly close. No intraday stop triggers.",
      };
    case "1wk":
      return {
        label: "POSITION",
        timeRange: highConf ? "2–4 months" : "1–2 months",
        description: "Macro trend trade. Monthly review. Wide stops allow for multi-week retracements. Exit only on monthly close reversal signal.",
      };
    default:
      return {
        label: "SWING",
        timeRange: "1–3 days",
        description: "Hold overnight and review daily. Trail stop as price moves in your favour.",
      };
  }
}

interface IndicatorResult {
  signals: Signal[];
  drsi: number[];
  signalLine: number[];
  marketMode: string;
  strength: number;
}

function computeRSI(closes: number[], period: number): number[] {
  const rsi: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return rsi;

  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) avgGain += diff;
    else avgLoss += Math.abs(diff);
  }
  avgGain /= period;
  avgLoss /= period;

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? Math.abs(diff) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return rsi;
}

function polyDiff(data: number[], window: number, degree: number): { diff: number[]; nrmse: number[] } {
  const result: number[] = new Array(data.length).fill(NaN);
  const nrmseArr: number[] = new Array(data.length).fill(NaN);

  for (let idx = window - 1; idx < data.length; idx++) {
    const slice: number[] = [];
    let hasNaN = false;
    for (let j = 0; j < window; j++) {
      const v = data[idx - window + 1 + j];
      if (isNaN(v)) { hasNaN = true; break; }
      slice.push(v);
    }
    if (hasNaN) continue;

    const J: number[][] = [];
    for (let i = 0; i < window; i++) {
      const row: number[] = [];
      for (let j = 0; j <= degree; j++) {
        row.push(Math.pow(i, j));
      }
      J.push(row);
    }

    const coeffs = leastSquares(J, slice);
    if (!coeffs) continue;

    let diffVal = 0;
    for (let i = 1; i <= degree; i++) {
      diffVal += i * coeffs[i] * Math.pow(window - 1, i - 1);
    }
    result[idx] = diffVal;

    let mse = 0;
    let mean = 0;
    for (let i = 0; i < window; i++) {
      let yhat = 0;
      for (let j = 0; j <= degree; j++) {
        yhat += coeffs[j] * Math.pow(i, j);
      }
      mse += Math.pow(slice[i] - yhat, 2) / window;
      mean += slice[i] / window;
    }
    nrmseArr[idx] = mean !== 0 ? Math.sqrt(mse) / Math.abs(mean) : 0;
  }

  return { diff: result, nrmse: nrmseArr };
}

function leastSquares(J: number[][], y: number[]): number[] | null {
  const m = J.length;
  const n = J[0].length;

  const JtJ: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const Jty: number[] = new Array(n).fill(0);

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < m; k++) {
        sum += J[k][i] * J[k][j];
      }
      JtJ[i][j] = sum;
    }
    let sum = 0;
    for (let k = 0; k < m; k++) {
      sum += J[k][i] * y[k];
    }
    Jty[i] = sum;
  }

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(JtJ[k][i]) > Math.abs(JtJ[maxRow][i])) maxRow = k;
    }
    [JtJ[i], JtJ[maxRow]] = [JtJ[maxRow], JtJ[i]];
    [Jty[i], Jty[maxRow]] = [Jty[maxRow], Jty[i]];

    if (Math.abs(JtJ[i][i]) < 1e-12) return null;

    for (let k = i + 1; k < n; k++) {
      const factor = JtJ[k][i] / JtJ[i][i];
      for (let j = i; j < n; j++) {
        JtJ[k][j] -= factor * JtJ[i][j];
      }
      Jty[k] -= factor * Jty[i];
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = Jty[i];
    for (let j = i + 1; j < n; j++) {
      x[i] -= JtJ[i][j] * x[j];
    }
    x[i] /= JtJ[i][i];
  }

  return x;
}

function ema(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  const k = 2 / (period + 1);

  let firstValid = -1;
  for (let i = 0; i < data.length; i++) {
    if (!isNaN(data[i])) { firstValid = i; break; }
  }
  if (firstValid === -1) return result;

  result[firstValid] = data[firstValid];
  for (let i = firstValid + 1; i < data.length; i++) {
    if (isNaN(data[i])) {
      result[i] = result[i - 1];
    } else {
      result[i] = data[i] * k + (isNaN(result[i - 1]) ? data[i] : result[i - 1]) * (1 - k);
    }
  }
  return result;
}

function sma(data: number[], period: number): number[] {
  const result: number[] = new Array(data.length).fill(NaN);
  for (let i = period - 1; i < data.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = 0; j < period; j++) {
      if (!isNaN(data[i - j])) { sum += data[i - j]; count++; }
    }
    if (count === period) result[i] = sum / count;
  }
  return result;
}

function computeATR(bars: OHLCBar[], period: number): number[] {
  const atr: number[] = new Array(bars.length).fill(NaN);
  if (bars.length < period + 1) return atr;

  const tr: number[] = [];
  for (let i = 0; i < bars.length; i++) {
    if (i === 0) {
      tr.push(bars[i].high - bars[i].low);
    } else {
      const hl = bars[i].high - bars[i].low;
      const hc = Math.abs(bars[i].high - bars[i - 1].close);
      const lc = Math.abs(bars[i].low - bars[i - 1].close);
      tr.push(Math.max(hl, hc, lc));
    }
  }

  let sum = 0;
  for (let i = 0; i < period; i++) sum += tr[i];
  atr[period - 1] = sum / period;

  for (let i = period; i < bars.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

function computeMACD(closes: number[]): { macd: number[]; signal: number[]; hist: number[] } {
  const ema12 = ema(closes, 12);
  const ema26 = ema(closes, 26);
  const macdLine: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(ema12[i]) && !isNaN(ema26[i])) macdLine[i] = ema12[i] - ema26[i];
  }
  const signalL = ema(macdLine, 9);
  const hist: number[] = new Array(closes.length).fill(NaN);
  for (let i = 0; i < closes.length; i++) {
    if (!isNaN(macdLine[i]) && !isNaN(signalL[i])) hist[i] = macdLine[i] - signalL[i];
  }
  return { macd: macdLine, signal: signalL, hist };
}

function computeBollingerBands(closes: number[], period: number = 20, mult: number = 2): { upper: number[]; middle: number[]; lower: number[] } {
  const middle = sma(closes, period);
  const upper: number[] = new Array(closes.length).fill(NaN);
  const lower: number[] = new Array(closes.length).fill(NaN);
  for (let i = period - 1; i < closes.length; i++) {
    if (isNaN(middle[i])) continue;
    let variance = 0;
    for (let j = 0; j < period; j++) variance += Math.pow(closes[i - j] - middle[i], 2);
    const stddev = Math.sqrt(variance / period);
    upper[i] = middle[i] + mult * stddev;
    lower[i] = middle[i] - mult * stddev;
  }
  return { upper, middle, lower };
}

export function computeSignals(bars: OHLCBar[], params?: {
  rsiLength?: number;
  polyOrder?: number;
  windowLength?: number;
  signalLength?: number;
  rrRatio?: number;
  interval?: string;
}): IndicatorResult {
  const rsiLen = params?.rsiLength ?? 14;
  const degree = params?.polyOrder ?? 2;
  const window = params?.windowLength ?? 28;
  const sigLen = params?.signalLength ?? 2;
  const rr = params?.rrRatio ?? 2.5;
  const interval = params?.interval ?? "1h";

  const closes = bars.map(b => b.close);
  const rsi = computeRSI(closes, rsiLen);
  const { diff: drsi } = polyDiff(rsi, window, degree);
  const signalLine = ema(drsi, sigLen);
  const atr = computeATR(bars, 14);

  const ema9 = ema(closes, 9);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const ema200 = ema(closes, 200);
  const rsi14 = rsi;
  const { macd, signal: macdSignal, hist: macdHist } = computeMACD(closes);
  const { upper: bbUpper, lower: bbLower } = computeBollingerBands(closes);
  const vol20 = sma(bars.map(b => b.volume), 20);

  const signals: Signal[] = [];
  let lastSignalBar = -999;

  for (let i = 3; i < bars.length; i++) {
    if (isNaN(drsi[i]) || isNaN(drsi[i - 1]) || isNaN(signalLine[i]) || isNaN(signalLine[i - 1])) continue;

    if (i - lastSignalBar < 3) continue;

    const crossSignalUp = drsi[i - 1] <= signalLine[i - 1] && drsi[i] > signalLine[i];
    const crossSignalDw = drsi[i - 1] >= signalLine[i - 1] && drsi[i] < signalLine[i];
    const dirChangeUp = drsi[i] > drsi[i - 1] && drsi[i - 1] < drsi[i - 2] && drsi[i - 2] < drsi[i - 3] && drsi[i - 1] < -0.3;
    const dirChangeDw = drsi[i] < drsi[i - 1] && drsi[i - 1] > drsi[i - 2] && drsi[i - 2] > drsi[i - 3] && drsi[i - 1] > 0.3;

    const goLong = crossSignalUp || dirChangeUp;
    const goShort = crossSignalDw || dirChangeDw;

    if (!goLong && !goShort) continue;

    let score = 0;
    let confirmations = 0;

    const ema9v = ema9[i];
    const ema20v = ema20[i];
    const ema50v = ema50[i];
    const ema200v = ema200[i];
    const rsiV = rsi14[i];
    const price = closes[i];

    if (!isNaN(ema9v) && !isNaN(ema20v)) {
      if (goLong && price > ema9v && price > ema20v) { score += 8; confirmations++; }
      if (goShort && price < ema9v && price < ema20v) { score += 8; confirmations++; }
      if (goLong && ema9v > ema20v) { score += 6; confirmations++; }
      if (goShort && ema9v < ema20v) { score += 6; confirmations++; }
    }

    if (!isNaN(ema20v) && !isNaN(ema50v)) {
      if (goLong && ema20v > ema50v) { score += 7; confirmations++; }
      if (goShort && ema20v < ema50v) { score += 7; confirmations++; }
    }

    if (!isNaN(ema200v)) {
      if (goLong && price > ema200v) { score += 9; confirmations++; }
      else if (goLong && price < ema200v) { score -= 8; }
      if (goShort && price < ema200v) { score += 9; confirmations++; }
      else if (goShort && price > ema200v) { score -= 8; }
    }

    if (!isNaN(rsiV)) {
      if (goLong && rsiV <= 25) { score += 18; confirmations += 2; }
      else if (goLong && rsiV <= 35) { score += 12; confirmations++; }
      else if (goLong && rsiV <= 45) { score += 6; confirmations++; }
      else if (goLong && rsiV >= 65) { score -= 8; }
      else if (goLong && rsiV >= 75) { score -= 15; }

      if (goShort && rsiV >= 75) { score += 18; confirmations += 2; }
      else if (goShort && rsiV >= 65) { score += 12; confirmations++; }
      else if (goShort && rsiV >= 55) { score += 6; confirmations++; }
      else if (goShort && rsiV <= 35) { score -= 8; }
      else if (goShort && rsiV <= 25) { score -= 15; }
    }

    if (!isNaN(macdHist[i]) && !isNaN(macdHist[i - 1])) {
      const histTurning = goLong ? (macdHist[i] > macdHist[i - 1]) : (macdHist[i] < macdHist[i - 1]);
      const histAligned = goLong ? macdHist[i] > 0 : macdHist[i] < 0;
      const histCrossing = goLong ? (macdHist[i - 1] < 0 && macdHist[i] > 0) : (macdHist[i - 1] > 0 && macdHist[i] < 0);

      if (histCrossing) { score += 14; confirmations += 2; }
      else if (histTurning && histAligned) { score += 9; confirmations++; }
      else if (histTurning) { score += 5; confirmations++; }
      else if (!histTurning && histAligned) { score -= 4; }
    }

    if (!isNaN(bbLower[i]) && !isNaN(bbUpper[i])) {
      const bbRange = bbUpper[i] - bbLower[i];
      if (goLong && closes[i] <= bbLower[i] * 1.001) { score += 12; confirmations += 2; }
      else if (goLong && closes[i] <= bbLower[i] + bbRange * 0.15) { score += 7; confirmations++; }
      if (goShort && closes[i] >= bbUpper[i] * 0.999) { score += 12; confirmations += 2; }
      else if (goShort && closes[i] >= bbUpper[i] - bbRange * 0.15) { score += 7; confirmations++; }
    }

    if (!isNaN(vol20[i]) && bars[i].volume > 0 && vol20[i] > 0) {
      const volRatio = bars[i].volume / vol20[i];
      if (volRatio >= 2.0) { score += 10; confirmations += 2; }
      else if (volRatio >= 1.5) { score += 7; confirmations++; }
      else if (volRatio >= 1.2) { score += 4; confirmations++; }
      else if (volRatio < 0.5) { score -= 5; }
    }

    const drsiMag = Math.abs(drsi[i]);
    const separation = Math.abs(drsi[i] - signalLine[i]);
    if (drsiMag > 3.0) { score += 10; confirmations++; }
    else if (drsiMag > 2.0) { score += 7; confirmations++; }
    else if (drsiMag > 1.0) { score += 4; }
    if (separation > 1.5) { score += 6; confirmations++; }
    else if (separation > 0.8) { score += 3; }

    if (i >= 3) {
      const recentBars = bars.slice(Math.max(0, i - 4), i + 1);
      if (goLong) {
        const hasHammer = recentBars.some(b => {
          const body = Math.abs(b.close - b.open);
          const lowerWick = Math.min(b.open, b.close) - b.low;
          return lowerWick > body * 2.5 && body > 0;
        });
        const hasBullEngulf = i >= 1 &&
          bars[i - 1].close < bars[i - 1].open &&
          bars[i].close > bars[i].open &&
          bars[i].close > bars[i - 1].open &&
          bars[i].open < bars[i - 1].close;
        if (hasBullEngulf) { score += 12; confirmations += 2; }
        else if (hasHammer) { score += 7; confirmations++; }
      }
      if (goShort) {
        const hasShootingStar = recentBars.some(b => {
          const body = Math.abs(b.close - b.open);
          const upperWick = b.high - Math.max(b.open, b.close);
          return upperWick > body * 2.5 && body > 0;
        });
        const hasBearEngulf = i >= 1 &&
          bars[i - 1].close > bars[i - 1].open &&
          bars[i].close < bars[i].open &&
          bars[i].close < bars[i - 1].open &&
          bars[i].open > bars[i - 1].close;
        if (hasBearEngulf) { score += 12; confirmations += 2; }
        else if (hasShootingStar) { score += 7; confirmations++; }
      }
    }

    if (i >= 10) {
      const priorHigh = Math.max(...bars.slice(i - 10, i).map(b => b.high));
      const priorLow = Math.min(...bars.slice(i - 10, i).map(b => b.low));
      const range10 = priorHigh - priorLow;
      if (goLong && bars[i].low <= priorLow * 1.001 && range10 > 0) { score += 8; confirmations++; }
      if (goShort && bars[i].high >= priorHigh * 0.999 && range10 > 0) { score += 8; confirmations++; }
    }

    const confidence = Math.min(96, Math.max(45, Math.round(45 + score * 0.7)));

    if (confidence < 58 || confirmations < 2) continue;

    const atrVal = !isNaN(atr[i]) ? atr[i] : (bars[i].high - bars[i].low);

    if (goLong) {
      const swingLow = Math.min(bars[i].low, bars[i - 1].low, bars[i - 2].low);
      const sl = swingLow - atrVal * 0.3;
      const entry = bars[i].close;
      const risk = entry - sl;
      if (risk <= 0) continue;
      const tp = entry + risk * rr;
      signals.push({
        timestamp: bars[i].timestamp,
        type: "buy",
        price: entry,
        confidence,
        stopLoss: sl,
        takeProfit: tp,
        riskReward: rr,
        holdingTerm: resolveHoldingTerm(interval, confidence),
      });
      lastSignalBar = i;
    }

    if (goShort) {
      const swingHigh = Math.max(bars[i].high, bars[i - 1].high, bars[i - 2].high);
      const sl = swingHigh + atrVal * 0.3;
      const entry = bars[i].close;
      const risk = sl - entry;
      if (risk <= 0) continue;
      const tp = entry - risk * rr;
      signals.push({
        timestamp: bars[i].timestamp,
        type: "sell",
        price: entry,
        confidence,
        stopLoss: sl,
        takeProfit: tp,
        riskReward: rr,
        holdingTerm: resolveHoldingTerm(interval, confidence),
      });
      lastSignalBar = i;
    }
  }

  const lastDrsi = drsi.filter(v => !isNaN(v));
  const strength = lastDrsi.length > 0 ? Math.abs(lastDrsi[lastDrsi.length - 1]) : 0;
  const lastEma20 = ema20.filter(v => !isNaN(v));
  const lastEma50 = ema50.filter(v => !isNaN(v));
  let marketMode = "RANGING";
  if (lastEma20.length > 0 && lastEma50.length > 0) {
    const e20 = lastEma20[lastEma20.length - 1];
    const e50 = lastEma50[lastEma50.length - 1];
    if (e20 > e50 * 1.002) marketMode = "BULLISH";
    else if (e20 < e50 * 0.998) marketMode = "BEARISH";
    else marketMode = "STABLE";
  }

  return {
    signals,
    drsi: drsi.filter(v => !isNaN(v)),
    signalLine: signalLine.filter(v => !isNaN(v)),
    marketMode,
    strength: Math.min(100, strength * 20),
  };
}

export async function fetchOHLC(symbol: string, range: string = "1mo", interval: string = "1h"): Promise<OHLCBar[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=${interval}&includePrePost=false`;
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    signal: AbortSignal.timeout(10000),
  });
  if (!resp.ok) throw new Error(`Yahoo Finance HTTP ${resp.status}`);
  const data = await resp.json();
  const result = data.chart?.result?.[0];
  if (!result) throw new Error("No chart data");

  const timestamps = result.timestamp ?? [];
  const quote = result.indicators?.quote?.[0] ?? {};

  const bars: OHLCBar[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i] ?? 0;
    if (o != null && h != null && l != null && c != null) {
      bars.push({ timestamp: timestamps[i] * 1000, open: o, high: h, low: l, close: c, volume: v });
    }
  }
  return bars;
}
