import { db } from "@workspace/db";
import { niftyAnalysisTable, marketAssetsTable, newsItemsTable } from "@workspace/db";
import { logger } from "./logger";
import { fetchOHLC } from "./indicator.js";

let openai: any = null;
try {
  const mod = await import("@workspace/integrations-openai-ai-server");
  openai = mod.openai;
} catch {
  logger.warn("OpenAI integration not available for Nifty analysis");
}

function toIST(date: Date): string {
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", year: "numeric" });
}

function getNextSlotIST(): Date {
  const now = new Date();
  const istOffset = 5.5 * 60 * 60 * 1000;
  const istNow = new Date(now.getTime() + istOffset);
  const minutes = istNow.getUTCMinutes();
  const remainder = minutes % 30;
  const nextSlotMinutes = remainder === 0 ? 30 : 30 - remainder;
  const nextSlot = new Date(istNow.getTime() + nextSlotMinutes * 60 * 1000);
  nextSlot.setUTCSeconds(0, 0);
  return new Date(nextSlot.getTime() - istOffset);
}

interface NiftySnapshot {
  price: number | null;
  change: number;
  changePercent: number;
  open: number | null;
  high: number | null;
  low: number | null;
  prevClose: number | null;
  bars30m: any[];
  bars15m: any[];
  bars5m: any[];
  sensexPrice: number | null;
  sensexChange: number;
  bankNiftyPrice: number | null;
  bankNiftyChange: number;
  vixValue: number | null;
  globalCues: string[];
  indianNews: string[];
}

async function gatherNiftySnapshot(): Promise<NiftySnapshot> {
  const [assets, news] = await Promise.all([
    db.select().from(marketAssetsTable),
    db.select().from(newsItemsTable),
  ]);

  const findAsset = (s: string) => assets.find(a => a.symbol === s);
  const findByName = (n: string) => assets.find(a => a.name.toLowerCase().includes(n.toLowerCase()));

  const nifty = findAsset("NIFTY50") ?? findAsset("^NSEI") ?? findByName("Nifty");
  const sensex = findAsset("SENSEX") ?? findAsset("^BSESN") ?? findByName("Sensex");
  const bankNifty = findAsset("BANKNIFTY") ?? findByName("Bank Nifty");
  const vix = findAsset("INDIAVIX") ?? findByName("India VIX") ?? findAsset("VIX") ?? findByName("VIX");

  const sp500 = findAsset("SPX") ?? findByName("S&P");
  const dji = findAsset("DJI") ?? findByName("Dow");
  const nasdaq = findAsset("NDX") ?? findByName("Nasdaq");
  const dxy = findAsset("DXY") ?? findByName("Dollar");
  const oil = findAsset("USOIL") ?? findByName("WTI") ?? findByName("Crude");
  const gold = findAsset("XAUUSD") ?? findByName("Gold");

  const globalCues: string[] = [];
  if (sp500) globalCues.push(`S&P 500: ${sp500.changePercent > 0 ? "+" : ""}${sp500.changePercent.toFixed(2)}%`);
  if (dji) globalCues.push(`Dow: ${dji.changePercent > 0 ? "+" : ""}${dji.changePercent.toFixed(2)}%`);
  if (nasdaq) globalCues.push(`Nasdaq: ${nasdaq.changePercent > 0 ? "+" : ""}${nasdaq.changePercent.toFixed(2)}%`);
  if (dxy) globalCues.push(`DXY: ${dxy.price?.toFixed(2)} (${dxy.changePercent > 0 ? "+" : ""}${dxy.changePercent.toFixed(2)}%)`);
  if (oil) globalCues.push(`Oil: $${oil.price?.toFixed(2)} (${oil.changePercent > 0 ? "+" : ""}${oil.changePercent.toFixed(2)}%)`);
  if (gold) globalCues.push(`Gold: $${gold.price?.toFixed(0)} (${gold.changePercent > 0 ? "+" : ""}${gold.changePercent.toFixed(2)}%)`);

  const indianNews = news
    .filter(n => {
      const lc = (n.headline + " " + n.summary).toLowerCase();
      return lc.includes("india") || lc.includes("nifty") || lc.includes("sensex") || lc.includes("rbi") || lc.includes("rupee") || lc.includes("nse") || lc.includes("bse");
    })
    .slice(0, 10)
    .map(n => `[${n.impact}] ${n.headline}`);

  let bars30m: any[] = [];
  let bars15m: any[] = [];
  let bars5m: any[] = [];

  try { bars30m = await fetchOHLC("^NSEI", "5d", "30m"); } catch { }
  try { bars15m = await fetchOHLC("^NSEI", "5d", "15m"); } catch { }
  try { bars5m = await fetchOHLC("^NSEI", "2d", "5m"); } catch { }

  return {
    price: nifty?.price ?? null,
    change: nifty?.change ?? 0,
    changePercent: nifty?.changePercent ?? 0,
    open: null,
    high: null,
    low: null,
    prevClose: null,
    bars30m,
    bars15m,
    bars5m,
    sensexPrice: sensex?.price ?? null,
    sensexChange: sensex?.changePercent ?? 0,
    bankNiftyPrice: bankNifty?.price ?? null,
    bankNiftyChange: bankNifty?.changePercent ?? 0,
    vixValue: vix?.price ?? null,
    globalCues,
    indianNews,
  };
}

function formatBarsForAI(bars: any[], label: string, limit = 10): string {
  if (!bars.length) return `${label}: No data available`;
  const recent = bars.slice(-limit);
  return `${label} (last ${recent.length} candles):\n` + recent.map(b => {
    const t = new Date(b.timestamp);
    const ist = t.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
    return `  ${ist} O:${b.open?.toFixed(1)} H:${b.high?.toFixed(1)} L:${b.low?.toFixed(1)} C:${b.close?.toFixed(1)} V:${b.volume ?? 0}`;
  }).join("\n");
}

async function analyzeNiftyComprehensive(snapshot: NiftySnapshot): Promise<any> {
  if (!openai) return fallbackNiftyAnalysis(snapshot, "comprehensive");

  const prompt = `You are a senior Indian equity strategist at Goldman Sachs specializing in Nifty 50 index trading. Provide a COMPREHENSIVE, ACTIONABLE analysis.

CURRENT NIFTY 50 DATA:
- Price: ${snapshot.price?.toFixed(2) ?? "N/A"} (${snapshot.changePercent > 0 ? "+" : ""}${snapshot.changePercent.toFixed(2)}%)
- Sensex: ${snapshot.sensexPrice?.toFixed(2) ?? "N/A"} (${snapshot.sensexChange > 0 ? "+" : ""}${snapshot.sensexChange.toFixed(2)}%)
- Bank Nifty: ${snapshot.bankNiftyPrice?.toFixed(2) ?? "N/A"} (${snapshot.bankNiftyChange > 0 ? "+" : ""}${snapshot.bankNiftyChange.toFixed(2)}%)
- India VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"}

GLOBAL CUES:
${snapshot.globalCues.length > 0 ? snapshot.globalCues.join("\n") : "No data"}

${formatBarsForAI(snapshot.bars30m, "30-MIN CANDLES", 12)}

${formatBarsForAI(snapshot.bars15m, "15-MIN CANDLES", 15)}

INDIAN MARKET NEWS:
${snapshot.indianNews.length > 0 ? snapshot.indianNews.join("\n") : "No significant news"}

ANALYSIS REQUIREMENTS:
1. Whether Nifty will FALL or RISE — give specific price targets and timeframes
2. Key support and resistance levels (at least 3 each)
3. Demand and supply zones based on candle analysis
4. Specific Call/Put recommendation for index options trading
5. Risk assessment and stop-loss levels

Return ONLY valid JSON:
{
  "direction": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": 55-98,
  "summary": "3-4 sentence professional analysis with specific price levels and timeframes",
  "outlook": "Detailed 2-3 paragraph outlook covering short-term (today), medium-term (this week), and key events to watch. Include specific scenarios for both upside and downside. Mention when the fall or jump is expected.",
  "supportLevels": ["24100", "23950", "23800"],
  "resistanceLevels": ["24350", "24500", "24650"],
  "demandZones": ["23950-24050 (strong institutional buying zone)", "23800-23850 (previous swing low)"],
  "supplyZones": ["24400-24500 (heavy call writing zone)", "24600-24650 (previous resistance)"],
  "candlePattern": "Name of the current candle pattern observed (e.g., Bullish Engulfing, Doji, etc.)",
  "trendStrength": "STRONG" or "MODERATE" or "WEAK",
  "callPutRecommendation": "Specific recommendation e.g. 'BUY NIFTY 24200 CE at 180-200, target 280, SL 120' or 'BUY NIFTY 24300 PE at 150, target 250, SL 90'",
  "targetPrice": 24350.0,
  "stopLoss": 24050.0,
  "keyFactors": ["factor 1", "factor 2", "factor 3", "factor 4", "factor 5"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: "You are a senior Indian equity strategist. Analyze Nifty 50 with candlestick patterns, demand-supply zones, and give clear Call/Put recommendations. All times should be in IST. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    logger.info({ responseLength: text.length, preview: text.slice(0, 300) }, "AI Nifty comprehensive raw response");
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonText);
    return {
      analysisType: "comprehensive",
      direction: parsed.direction || "NEUTRAL",
      confidence: Math.max(30, Math.min(98, Number(parsed.confidence) || 50)),
      summary: parsed.summary || "Analysis in progress...",
      outlook: parsed.outlook || "",
      supportLevels: Array.isArray(parsed.supportLevels) ? parsed.supportLevels.map(String) : [],
      resistanceLevels: Array.isArray(parsed.resistanceLevels) ? parsed.resistanceLevels.map(String) : [],
      demandZones: Array.isArray(parsed.demandZones) ? parsed.demandZones.map(String) : [],
      supplyZones: Array.isArray(parsed.supplyZones) ? parsed.supplyZones.map(String) : [],
      candlePattern: parsed.candlePattern || null,
      trendStrength: parsed.trendStrength || "MODERATE",
      callPutRecommendation: parsed.callPutRecommendation || null,
      targetPrice: Number(parsed.targetPrice) || null,
      stopLoss: Number(parsed.stopLoss) || null,
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.map(String) : [],
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "AI Nifty comprehensive failed, using fallback");
    return fallbackNiftyAnalysis(snapshot, "comprehensive");
  }
}

async function analyzeNiftyCandle30m(snapshot: NiftySnapshot): Promise<any> {
  if (!openai) return fallbackNiftyAnalysis(snapshot, "candle_30m");

  const nextSlot = getNextSlotIST();
  const nextSlotIST = toIST(nextSlot);

  const prompt = `You are a professional intraday options trader specializing in Nifty 50 index options. Analyze the 30-minute and 5-minute candle data for DEMAND-SUPPLY based trading.

CURRENT TIME (IST): ${toIST(new Date())}
NEXT 30-MIN CANDLE CLOSES AT: ${nextSlotIST}

NIFTY 50: ${snapshot.price?.toFixed(2) ?? "N/A"} (${snapshot.changePercent > 0 ? "+" : ""}${snapshot.changePercent.toFixed(2)}%)
India VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"}

${formatBarsForAI(snapshot.bars30m, "30-MIN CANDLES", 15)}

${formatBarsForAI(snapshot.bars5m, "5-MIN CANDLES (recent)", 20)}

TASK: Provide a 30-min periodic demand-supply analysis for the NEXT candle. This analysis should arrive 5-10 minutes BEFORE the next candle forms, so traders can position Call/Put.

Return ONLY valid JSON:
{
  "direction": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": 55-98,
  "summary": "2-3 sentence analysis of current 30m candle action and prediction for next candle",
  "outlook": "What to expect in the next 30-60 minutes. Specific price action prediction.",
  "demandZones": ["zone1 with price range", "zone2"],
  "supplyZones": ["zone1 with price range", "zone2"],
  "candlePattern": "Current candle pattern (30m timeframe)",
  "trendStrength": "STRONG" or "MODERATE" or "WEAK",
  "callPutRecommendation": "Specific CE/PE recommendation with entry, target, stop-loss for the next 30 minutes",
  "targetPrice": 24250.0,
  "stopLoss": 24150.0,
  "keyFactors": ["factor1", "factor2", "factor3"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1536,
      messages: [
        { role: "system", content: "You are a professional Nifty 50 intraday options trader. Provide demand-supply analysis for the next 30-min candle. Be specific with price levels. All times in IST. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    logger.info({ responseLength: text.length, preview: text.slice(0, 300) }, "AI Nifty 30m candle raw response");
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonText);

    return {
      analysisType: "candle_30m",
      direction: parsed.direction || "NEUTRAL",
      confidence: Math.max(30, Math.min(98, Number(parsed.confidence) || 50)),
      summary: parsed.summary || "30m candle analysis in progress...",
      outlook: parsed.outlook || "",
      supportLevels: [],
      resistanceLevels: [],
      demandZones: Array.isArray(parsed.demandZones) ? parsed.demandZones.map(String) : [],
      supplyZones: Array.isArray(parsed.supplyZones) ? parsed.supplyZones.map(String) : [],
      candlePattern: parsed.candlePattern || null,
      trendStrength: parsed.trendStrength || "MODERATE",
      callPutRecommendation: parsed.callPutRecommendation || null,
      targetPrice: Number(parsed.targetPrice) || null,
      stopLoss: Number(parsed.stopLoss) || null,
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.map(String) : [],
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "AI Nifty 30m candle failed, using fallback");
    return fallbackNiftyAnalysis(snapshot, "candle_30m");
  }
}

function fallbackNiftyAnalysis(snapshot: NiftySnapshot, type: string): any {
  const price = snapshot.price ?? 24000;
  const change = snapshot.changePercent;
  const direction = change > 0.3 ? "BULLISH" : change < -0.3 ? "BEARISH" : "NEUTRAL";
  const confidence = Math.min(75, Math.max(40, 50 + Math.abs(change) * 5));

  const support1 = Math.round(price * 0.995 / 50) * 50;
  const support2 = Math.round(price * 0.99 / 50) * 50;
  const support3 = Math.round(price * 0.985 / 50) * 50;
  const resistance1 = Math.round(price * 1.005 / 50) * 50;
  const resistance2 = Math.round(price * 1.01 / 50) * 50;
  const resistance3 = Math.round(price * 1.015 / 50) * 50;

  return {
    analysisType: type,
    direction,
    confidence: Math.round(confidence),
    summary: `Nifty at ${price.toFixed(2)} (${change > 0 ? "+" : ""}${change.toFixed(2)}%). ${direction === "BULLISH" ? "Upward momentum detected." : direction === "BEARISH" ? "Selling pressure observed." : "Consolidation phase."} VIX at ${snapshot.vixValue?.toFixed(2) ?? "N/A"}.`,
    outlook: `${direction === "BULLISH" ? `Nifty showing strength above ${support1}. If sustains above ${resistance1}, can target ${resistance2}-${resistance3}. Global cues ${snapshot.globalCues.length > 0 ? "are mixed" : "awaited"}.` : direction === "BEARISH" ? `Nifty under pressure below ${resistance1}. If breaks ${support1}, can slide to ${support2}-${support3}. Caution warranted.` : `Nifty consolidating between ${support1}-${resistance1}. Wait for breakout direction. Range-bound strategy recommended.`}`,
    supportLevels: [String(support1), String(support2), String(support3)],
    resistanceLevels: [String(resistance1), String(resistance2), String(resistance3)],
    demandZones: [`${support2}-${support1} (key demand zone)`],
    supplyZones: [`${resistance1}-${resistance2} (key supply zone)`],
    candlePattern: "Algorithmic analysis (AI unavailable)",
    trendStrength: Math.abs(change) > 0.8 ? "STRONG" : Math.abs(change) > 0.3 ? "MODERATE" : "WEAK",
    callPutRecommendation: direction === "BULLISH" ? `BUY NIFTY ${resistance1} CE near support ${support1}, target ${resistance2}, SL ${support2}` : direction === "BEARISH" ? `BUY NIFTY ${support1} PE near resistance ${resistance1}, target ${support2}, SL ${resistance2}` : `Wait for breakout above ${resistance1} or breakdown below ${support1}`,
    targetPrice: direction === "BULLISH" ? resistance2 : direction === "BEARISH" ? support2 : price,
    stopLoss: direction === "BULLISH" ? support2 : direction === "BEARISH" ? resistance2 : price,
    keyFactors: [
      `Nifty ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}%`,
      `VIX at ${snapshot.vixValue?.toFixed(2) ?? "N/A"}`,
      snapshot.globalCues[0] ?? "Global cues awaited",
      `Bank Nifty ${snapshot.bankNiftyChange > 0 ? "+" : ""}${snapshot.bankNiftyChange.toFixed(2)}%`,
      `Sensex ${snapshot.sensexChange > 0 ? "+" : ""}${snapshot.sensexChange.toFixed(2)}%`,
    ],
  };
}

export async function refreshNiftyComprehensive(): Promise<{ direction: string; confidence: number }> {
  logger.info("Starting Nifty 50 comprehensive analysis refresh");
  const snapshot = await gatherNiftySnapshot();
  const analysis = await analyzeNiftyComprehensive(snapshot);

  const nextUpdate = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(niftyAnalysisTable).values({
    ...analysis,
    niftyPrice: snapshot.price,
    niftyChange: snapshot.changePercent,
    timeframe: "comprehensive",
    nextAnalysisAt: nextUpdate,
    validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  logger.info({ direction: analysis.direction, confidence: analysis.confidence }, "Nifty comprehensive analysis complete");
  return { direction: analysis.direction, confidence: analysis.confidence };
}

export async function refreshNiftyCandle30m(): Promise<{ direction: string; confidence: number }> {
  logger.info("Starting Nifty 50 30-min candle analysis refresh");
  const snapshot = await gatherNiftySnapshot();
  const analysis = await analyzeNiftyCandle30m(snapshot);

  const nextSlot = getNextSlotIST();

  await db.insert(niftyAnalysisTable).values({
    ...analysis,
    niftyPrice: snapshot.price,
    niftyChange: snapshot.changePercent,
    timeframe: "30m",
    nextAnalysisAt: nextSlot,
    validUntil: new Date(nextSlot.getTime() + 30 * 60 * 1000),
    createdAt: new Date(),
  });

  logger.info({ direction: analysis.direction, confidence: analysis.confidence }, "Nifty 30m candle analysis complete");
  return { direction: analysis.direction, confidence: analysis.confidence };
}
