import { db } from "@workspace/db";
import { bitcoinAnalysisTable, marketAssetsTable, newsItemsTable } from "@workspace/db";
import { logger } from "./logger";
import { fetchOHLC } from "./indicator.js";

let openai: any = null;
try {
  const mod = await import("@workspace/integrations-openai-ai-server");
  openai = mod.openai;
} catch {
  logger.warn("OpenAI integration not available for Bitcoin analysis");
}

function toIST(date: Date): string {
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", year: "numeric" });
}

interface BtcSnapshot {
  price: number | null;
  change: number;
  changePercent: number;
  ethPrice: number | null;
  ethChange: number;
  solPrice: number | null;
  solChange: number;
  dxyValue: number | null;
  dxyChange: number;
  goldPrice: number | null;
  goldChange: number;
  vixValue: number | null;
  bars4h: any[];
  bars1h: any[];
  bars15m: any[];
  globalCues: string[];
  cryptoNews: string[];
}

async function gatherBtcSnapshot(): Promise<BtcSnapshot> {
  const [assets, news] = await Promise.all([
    db.select().from(marketAssetsTable),
    db.select().from(newsItemsTable),
  ]);

  const findAsset = (s: string) => assets.find(a => a.symbol === s);
  const findByName = (n: string) => assets.find(a => a.name.toLowerCase().includes(n.toLowerCase()));

  const btc = findAsset("BTCUSD") ?? findByName("Bitcoin");
  const eth = findAsset("ETHUSD") ?? findByName("Ethereum");
  const sol = findAsset("SOLUSD") ?? findByName("Solana");
  const dxy = findAsset("DXY") ?? findByName("Dollar Index");
  const gold = findAsset("XAUUSD") ?? findByName("Gold");
  const vix = findAsset("VIX") ?? findByName("VIX");
  const sp500 = findAsset("SPX") ?? findByName("S&P");

  const globalCues: string[] = [];
  if (eth) globalCues.push(`ETH: $${eth.price?.toFixed(0)} (${eth.changePercent > 0 ? "+" : ""}${eth.changePercent.toFixed(2)}%)`);
  if (sol) globalCues.push(`SOL: $${sol.price?.toFixed(2)} (${sol.changePercent > 0 ? "+" : ""}${sol.changePercent.toFixed(2)}%)`);
  if (dxy) globalCues.push(`DXY: ${dxy.price?.toFixed(2)} (${dxy.changePercent > 0 ? "+" : ""}${dxy.changePercent.toFixed(2)}%)`);
  if (gold) globalCues.push(`Gold: $${gold.price?.toFixed(0)} (${gold.changePercent > 0 ? "+" : ""}${gold.changePercent.toFixed(2)}%)`);
  if (sp500) globalCues.push(`S&P 500: ${sp500.changePercent > 0 ? "+" : ""}${sp500.changePercent.toFixed(2)}%`);
  if (vix) globalCues.push(`VIX: ${vix.price?.toFixed(2)}`);

  const cryptoNews = news
    .filter(n => {
      const lc = (n.headline + " " + n.summary).toLowerCase();
      return lc.includes("bitcoin") || lc.includes("btc") || lc.includes("crypto") || lc.includes("ethereum") || lc.includes("blockchain") || lc.includes("halving") || lc.includes("etf");
    })
    .slice(0, 10)
    .map(n => `[${n.impact}] ${n.headline}`);

  let bars4h: any[] = [];
  let bars1h: any[] = [];
  let bars15m: any[] = [];

  try { bars4h = await fetchOHLC("BTC-USD", "1mo", "1h"); } catch {}
  try { bars1h = await fetchOHLC("BTC-USD", "5d", "1h"); } catch {}
  try { bars15m = await fetchOHLC("BTC-USD", "2d", "15m"); } catch {}

  return {
    price: btc?.price ?? null,
    change: btc?.change ?? 0,
    changePercent: btc?.changePercent ?? 0,
    ethPrice: eth?.price ?? null,
    ethChange: eth?.changePercent ?? 0,
    solPrice: sol?.price ?? null,
    solChange: sol?.changePercent ?? 0,
    dxyValue: dxy?.price ?? null,
    dxyChange: dxy?.changePercent ?? 0,
    goldPrice: gold?.price ?? null,
    goldChange: gold?.changePercent ?? 0,
    vixValue: vix?.price ?? null,
    bars4h,
    bars1h,
    bars15m,
    globalCues,
    cryptoNews,
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

async function analyzeBtcComprehensive(snapshot: BtcSnapshot): Promise<any> {
  if (!openai) return fallbackBtcAnalysis(snapshot, "comprehensive");

  const prompt = `You are a senior crypto strategist at a top hedge fund specializing in Bitcoin trading. Provide a COMPREHENSIVE, ACTIONABLE analysis.

CURRENT BITCOIN DATA:
- BTC Price: $${snapshot.price?.toFixed(2) ?? "N/A"} (${snapshot.changePercent > 0 ? "+" : ""}${snapshot.changePercent.toFixed(2)}%)
- ETH: $${snapshot.ethPrice?.toFixed(0) ?? "N/A"} (${snapshot.ethChange > 0 ? "+" : ""}${snapshot.ethChange.toFixed(2)}%)
- SOL: $${snapshot.solPrice?.toFixed(2) ?? "N/A"} (${snapshot.solChange > 0 ? "+" : ""}${snapshot.solChange.toFixed(2)}%)
- DXY: ${snapshot.dxyValue?.toFixed(2) ?? "N/A"} (${snapshot.dxyChange > 0 ? "+" : ""}${snapshot.dxyChange.toFixed(2)}%)
- Gold: $${snapshot.goldPrice?.toFixed(0) ?? "N/A"} (${snapshot.goldChange > 0 ? "+" : ""}${snapshot.goldChange.toFixed(2)}%)
- VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"}

MACRO CONTEXT:
${snapshot.globalCues.length > 0 ? snapshot.globalCues.join("\n") : "No data"}

${formatBarsForAI(snapshot.bars4h, "4-HOUR CANDLES", 12)}

${formatBarsForAI(snapshot.bars1h, "1-HOUR CANDLES", 15)}

CRYPTO NEWS:
${snapshot.cryptoNews.length > 0 ? snapshot.cryptoNews.join("\n") : "No significant news"}

ANALYSIS REQUIREMENTS:
1. Whether BTC will FALL or RISE — give specific price targets and timeframes
2. Key support and resistance levels (at least 3 each)
3. Demand and supply zones based on candle analysis
4. Specific Long/Short recommendation with entry, target, stop-loss
5. Risk assessment and correlation with DXY, Gold, equities

Return ONLY valid JSON:
{
  "direction": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": 55-98,
  "summary": "3-4 sentence professional analysis with specific price levels and timeframes",
  "outlook": "Detailed 2-3 paragraph outlook covering short-term (24h), medium-term (this week). Include specific scenarios for both upside and downside.",
  "supportLevels": ["82000", "80500", "78000"],
  "resistanceLevels": ["85000", "87500", "90000"],
  "demandZones": ["80000-81000 (strong institutional accumulation zone)", "78000-78500 (previous swing low)"],
  "supplyZones": ["86000-87000 (heavy selling pressure)", "90000-91000 (psychological resistance)"],
  "candlePattern": "Name of the current candle pattern observed",
  "trendStrength": "STRONG" or "MODERATE" or "WEAK",
  "tradeRecommendation": "Specific recommendation e.g. 'LONG BTC at $83000-83500, target $87000, SL $81000' or 'SHORT BTC at $85000, target $82000, SL $86500'",
  "targetPrice": 87000.0,
  "stopLoss": 81000.0,
  "keyFactors": ["factor 1", "factor 2", "factor 3", "factor 4", "factor 5"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 2048,
      messages: [
        { role: "system", content: "You are a senior crypto strategist. Analyze Bitcoin with candlestick patterns, demand-supply zones, on-chain context, and macro correlations. Give clear Long/Short recommendations. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    logger.info({ responseLength: text.length, preview: text.slice(0, 300) }, "AI BTC comprehensive raw response");
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
      tradeRecommendation: parsed.tradeRecommendation || null,
      targetPrice: Number(parsed.targetPrice) || null,
      stopLoss: Number(parsed.stopLoss) || null,
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.map(String) : [],
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "AI BTC comprehensive failed, using fallback");
    return fallbackBtcAnalysis(snapshot, "comprehensive");
  }
}

async function analyzeBtcCandle(snapshot: BtcSnapshot): Promise<any> {
  if (!openai) return fallbackBtcAnalysis(snapshot, "candle_4h");

  const prompt = `You are a professional crypto trader specializing in Bitcoin. Analyze the 4-hour and 15-minute candle data for DEMAND-SUPPLY based trading.

CURRENT TIME (IST): ${toIST(new Date())}

BITCOIN: $${snapshot.price?.toFixed(2) ?? "N/A"} (${snapshot.changePercent > 0 ? "+" : ""}${snapshot.changePercent.toFixed(2)}%)
DXY: ${snapshot.dxyValue?.toFixed(2) ?? "N/A"}
VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"}

${formatBarsForAI(snapshot.bars1h, "1-HOUR CANDLES", 15)}

${formatBarsForAI(snapshot.bars15m, "15-MIN CANDLES (recent)", 20)}

TASK: Provide a periodic analysis for the next 4-hour candle. Include demand/supply zones and a specific Long/Short recommendation.

Return ONLY valid JSON:
{
  "direction": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": 55-98,
  "summary": "2-3 sentence analysis of current price action and prediction",
  "outlook": "What to expect in the next 4-8 hours. Specific price action prediction.",
  "demandZones": ["zone1", "zone2"],
  "supplyZones": ["zone1", "zone2"],
  "candlePattern": "Current candle pattern",
  "trendStrength": "STRONG" or "MODERATE" or "WEAK",
  "tradeRecommendation": "Specific Long/Short recommendation with entry, target, stop-loss",
  "targetPrice": 85000.0,
  "stopLoss": 82000.0,
  "keyFactors": ["factor1", "factor2", "factor3"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.2",
      max_completion_tokens: 1536,
      messages: [
        { role: "system", content: "You are a professional Bitcoin trader. Provide demand-supply analysis for the next 4-hour candle. Be specific with price levels. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    logger.info({ responseLength: text.length, preview: text.slice(0, 300) }, "AI BTC 4h candle raw response");
    const jsonText = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed = JSON.parse(jsonText);

    return {
      analysisType: "candle_4h",
      direction: parsed.direction || "NEUTRAL",
      confidence: Math.max(30, Math.min(98, Number(parsed.confidence) || 50)),
      summary: parsed.summary || "4h candle analysis in progress...",
      outlook: parsed.outlook || "",
      supportLevels: [],
      resistanceLevels: [],
      demandZones: Array.isArray(parsed.demandZones) ? parsed.demandZones.map(String) : [],
      supplyZones: Array.isArray(parsed.supplyZones) ? parsed.supplyZones.map(String) : [],
      candlePattern: parsed.candlePattern || null,
      trendStrength: parsed.trendStrength || "MODERATE",
      tradeRecommendation: parsed.tradeRecommendation || null,
      targetPrice: Number(parsed.targetPrice) || null,
      stopLoss: Number(parsed.stopLoss) || null,
      keyFactors: Array.isArray(parsed.keyFactors) ? parsed.keyFactors.map(String) : [],
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "AI BTC 4h candle failed, using fallback");
    return fallbackBtcAnalysis(snapshot, "candle_4h");
  }
}

function fallbackBtcAnalysis(snapshot: BtcSnapshot, type: string): any {
  const price = snapshot.price ?? 84000;
  const change = snapshot.changePercent;
  const direction = change > 0.5 ? "BULLISH" : change < -0.5 ? "BEARISH" : "NEUTRAL";
  const confidence = Math.min(75, Math.max(40, 50 + Math.abs(change) * 3));

  const support1 = Math.round(price * 0.97 / 100) * 100;
  const support2 = Math.round(price * 0.94 / 100) * 100;
  const support3 = Math.round(price * 0.91 / 100) * 100;
  const resistance1 = Math.round(price * 1.03 / 100) * 100;
  const resistance2 = Math.round(price * 1.06 / 100) * 100;
  const resistance3 = Math.round(price * 1.09 / 100) * 100;

  return {
    analysisType: type,
    direction,
    confidence: Math.round(confidence),
    summary: `Bitcoin at $${price.toFixed(0)} (${change > 0 ? "+" : ""}${change.toFixed(2)}%). ${direction === "BULLISH" ? "Upward momentum detected." : direction === "BEARISH" ? "Selling pressure observed." : "Consolidation phase."} DXY at ${snapshot.dxyValue?.toFixed(2) ?? "N/A"}.`,
    outlook: `${direction === "BULLISH" ? `BTC showing strength above $${support1}. If sustains above $${resistance1}, can target $${resistance2}-$${resistance3}. Watch DXY for inverse correlation.` : direction === "BEARISH" ? `BTC under pressure below $${resistance1}. If breaks $${support1}, can slide to $${support2}-$${support3}. Risk-off environment.` : `BTC consolidating between $${support1}-$${resistance1}. Wait for breakout direction. Range-bound strategy recommended.`}`,
    supportLevels: [String(support1), String(support2), String(support3)],
    resistanceLevels: [String(resistance1), String(resistance2), String(resistance3)],
    demandZones: [`$${support2}-$${support1} (key demand zone)`],
    supplyZones: [`$${resistance1}-$${resistance2} (key supply zone)`],
    candlePattern: "Algorithmic analysis (AI unavailable)",
    trendStrength: Math.abs(change) > 2 ? "STRONG" : Math.abs(change) > 0.5 ? "MODERATE" : "WEAK",
    tradeRecommendation: direction === "BULLISH" ? `LONG BTC at $${support1}, target $${resistance2}, SL $${support2}` : direction === "BEARISH" ? `SHORT BTC at $${resistance1}, target $${support2}, SL $${resistance2}` : `Wait for breakout above $${resistance1} or breakdown below $${support1}`,
    targetPrice: direction === "BULLISH" ? resistance2 : direction === "BEARISH" ? support2 : price,
    stopLoss: direction === "BULLISH" ? support2 : direction === "BEARISH" ? resistance2 : price,
    keyFactors: [
      `BTC ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}%`,
      `DXY at ${snapshot.dxyValue?.toFixed(2) ?? "N/A"} (${snapshot.dxyChange > 0 ? "+" : ""}${snapshot.dxyChange.toFixed(2)}%)`,
      `ETH ${snapshot.ethChange > 0 ? "+" : ""}${snapshot.ethChange.toFixed(2)}%`,
      `VIX at ${snapshot.vixValue?.toFixed(2) ?? "N/A"}`,
      snapshot.globalCues[0] ?? "Macro data awaited",
    ],
  };
}

export async function refreshBtcComprehensive(): Promise<{ direction: string; confidence: number }> {
  logger.info("Starting Bitcoin comprehensive analysis refresh");
  const snapshot = await gatherBtcSnapshot();
  const analysis = await analyzeBtcComprehensive(snapshot);

  const nextUpdate = new Date(Date.now() + 60 * 60 * 1000);

  await db.insert(bitcoinAnalysisTable).values({
    ...analysis,
    btcPrice: snapshot.price,
    btcChange: snapshot.changePercent,
    timeframe: "comprehensive",
    nextAnalysisAt: nextUpdate,
    validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  logger.info({ direction: analysis.direction, confidence: analysis.confidence }, "BTC comprehensive analysis complete");
  return { direction: analysis.direction, confidence: analysis.confidence };
}

export async function refreshBtcCandle4h(): Promise<{ direction: string; confidence: number }> {
  logger.info("Starting Bitcoin 4h candle analysis refresh");
  const snapshot = await gatherBtcSnapshot();
  const analysis = await analyzeBtcCandle(snapshot);

  const nextUpdate = new Date(Date.now() + 4 * 60 * 60 * 1000);

  await db.insert(bitcoinAnalysisTable).values({
    ...analysis,
    btcPrice: snapshot.price,
    btcChange: snapshot.changePercent,
    timeframe: "4h",
    nextAnalysisAt: nextUpdate,
    validUntil: new Date(nextUpdate.getTime() + 4 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  logger.info({ direction: analysis.direction, confidence: analysis.confidence }, "BTC 4h candle analysis complete");
  return { direction: analysis.direction, confidence: analysis.confidence };
}
