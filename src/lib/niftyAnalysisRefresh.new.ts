import { db } from "@workspace/db";
import { niftyAnalysisTable, niftySniperTable, marketAssetsTable, newsItemsTable } from "@workspace/db";
import { logger } from "./logger";
import { fetchOHLC } from "./indicator.js";

import { openaiNifty as openai } from "./openaiClient.js";
import { sendNiftyAnalysisNotification } from "./pushNotification.js";

import { RuleEngine } from "./nifty/RuleEngine.js";
import { SniperEngine } from "./nifty/SniperEngine.js";
import { OHLC } from "./nifty/DataEngine.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(date: Date): string {
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", year: "numeric" });
}

function getISTComponents(date: Date): { hours: number; minutes: number; dayMs: number } {
  const istMs = date.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  return {
    hours: istDate.getUTCHours(),
    minutes: istDate.getUTCMinutes(),
    dayMs: istMs - ((istDate.getUTCHours() * 60 + istDate.getUTCMinutes()) * 60 + istDate.getUTCSeconds()) * 1000 - istDate.getUTCMilliseconds(),
  };
}

function getNiftySessionStatus(now: Date) {
  const { hours, minutes } = getISTComponents(now);
  const totalMinutes = hours * 60 + minutes;
  const openMinutes = 9 * 60 + 15;
  const closeMinutes = 15 * 60 + 30;

  if (totalMinutes < openMinutes) {
    return { status: "PRE_MARKET", label: "Pre-Market" };
  } else if (totalMinutes >= closeMinutes) {
    return { status: "POST_CLOSE", label: "Market Closed" };
  } else {
    return { status: "LIVE", label: "Live Trading" };
  }
}

function getNextSlotIST(): Date {
  const now = new Date();
  const istNow = new Date(now.getTime() + IST_OFFSET_MS);
  const minutes = istNow.getUTCMinutes();
  const remainder = minutes % 30;
  const nextSlotMinutes = remainder === 0 ? 30 : 30 - remainder;
  const nextSlot = new Date(istNow.getTime() + nextSlotMinutes * 60 * 1000);
  nextSlot.setUTCSeconds(0, 0);
  return new Date(nextSlot.getTime() - IST_OFFSET_MS);
}

async function gatherNiftySnapshot() {
  const now = new Date();
  const [assets, news] = await Promise.all([
    db.select().from(marketAssetsTable),
    db.select().from(newsItemsTable),
  ]);

  const niftyAsset = assets.find(a => a.symbol === "NIFTY 50");
  const sensexAsset = assets.find(a => a.symbol === "BSE SENSEX");
  const bankNiftyAsset = assets.find(a => a.symbol === "NIFTY BANK");
  const vixAsset = assets.find(a => a.symbol === "INDIA VIX");

  const niftyPrice = niftyAsset?.price ?? 24000;
  const changePercent = niftyAsset?.changePercent ?? 0;
  
  const [bars5m, bars15m, bars30m] = await Promise.all([
    fetchOHLC("NIFTY 50", "5m"),
    fetchOHLC("NIFTY 50", "15m"),
    fetchOHLC("NIFTY 50", "30m")
  ]);

  return {
    price: niftyPrice,
    changePercent,
    bars5m: bars5m as OHLC[],
    bars15m: bars15m as OHLC[],
    bars30m: bars30m as OHLC[],
    sessionStatus: getNiftySessionStatus(now),
    snapshotTime: now
  };
}

async function explainDeterministicAnalysis(deterministicData: any, snapshot: any) {
  if (!openai) {
    return deterministicData;
  }
  const prompt = `You are an institutional derivatives desk analyst. 
The backend quant engine has calculated the following deterministic trade setup for NIFTY 50:
${JSON.stringify(deterministicData, null, 2)}

Your ONLY job is to write professional, institutional-grade explanations for this data.
DO NOT change any numbers, targets, stop losses, or the final verdict.

Write 4 fields:
1. "institutionalSummary": 3-4 sentence professional summary of the market structure, EMA alignment, and VWAP status.
2. "whyThisBias": 1-2 sentences explaining why the quant engine chose this bias based on the indicators.
3. "bullishScenario": A professional description of the upside potential and key levels to watch.
4. "bearishScenario": A professional description of the downside risk and key levels to watch.

Return ONLY valid JSON:
{
  "institutionalSummary": "...",
  "whyThisBias": "...",
  "bullishScenario": "...",
  "bearishScenario": "..."
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "llama3.1-70b",
      max_completion_tokens: 1024,
      response_format: { type: "json_object" as const },
      messages: [
        { role: "system", content: "You are an institutional analyst. Return only JSON." },
        { role: "user", content: prompt }
      ]
    });
    
    const text = response.choices[0]?.message?.content?.trim() || "{}";
    const parsed = JSON.parse(text);
    
    return {
      ...deterministicData,
      institutionalSummary: parsed.institutionalSummary || deterministicData.institutionalSummary,
      whyThisBias: parsed.whyThisBias || deterministicData.whyThisBias,
      bullishScenario: parsed.bullishScenario || deterministicData.bullishScenario,
      bearishScenario: parsed.bearishScenario || deterministicData.bearishScenario
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "LLM Formatting failed, returning raw deterministic data.");
    return deterministicData;
  }
}

export async function refreshNiftyComprehensive(): Promise<{ direction: string; confidence: number }> {
  logger.info("Starting Nifty 50 comprehensive analysis refresh (Deterministic Engine)");
  const snapshot = await gatherNiftySnapshot();
  
  if (snapshot.sessionStatus.status !== "LIVE") {
    logger.info("Skipping Nifty comprehensive analysis (Outside Market Hours)");
    const { desc, eq } = await import("drizzle-orm");
    const [last] = await db.select().from(niftyAnalysisTable).where(eq(niftyAnalysisTable.analysisType, "comprehensive")).orderBy(desc(niftyAnalysisTable.createdAt)).limit(1);
    return { direction: last?.direction ?? "NEUTRAL", confidence: last?.confidence ?? 50 };
  }

  // 1. Run Deterministic Rule Engine
  const rawRuleData = RuleEngine.analyze(snapshot.bars5m, snapshot.price);
  
  // 2. Call LLM for formatting ONLY
  const finalData = await explainDeterministicAnalysis(rawRuleData, snapshot);

  // 3. Run Sniper Engine
  const sniperData = SniperEngine.analyze(snapshot.bars5m, snapshot.price);
  
  if (sniperData.signalType !== "NO SNIPER TRADE") {
    await db.insert(niftySniperTable).values({
      signalType: sniperData.signalType,
      entry: sniperData.entry,
      strike: sniperData.strike,
      currentPremium: sniperData.currentPremium,
      target1: sniperData.target1,
      target2: sniperData.target2,
      target3: sniperData.target3,
      target4: sniperData.target4,
      stopLoss: sniperData.stopLoss,
      riskReward: sniperData.riskReward,
      expectedHoldingTime: sniperData.expectedHoldingTime,
      confirmationScore: sniperData.confirmationScore,
      reasoning: sniperData.reasoning,
      status: "active",
      createdAt: new Date(),
    });
  }

  const nextUpdate = new Date(Date.now() + 60 * 60 * 1000);
  const directionStr = finalData.overallBias === "Bullish" ? "BULLISH" : finalData.overallBias === "Bearish" ? "BEARISH" : "NEUTRAL";

  await db.insert(niftyAnalysisTable).values({
    analysisType: "comprehensive",
    direction: directionStr,
    confidence: finalData.confidence,
    niftyPrice: snapshot.price,
    niftyChange: snapshot.changePercent,
    summary: finalData.institutionalSummary,
    outlook: finalData.whyThisBias,
    supportLevels: finalData.supportLevels.map(String),
    resistanceLevels: finalData.resistanceLevels.map(String),
    keyFactors: [finalData.reasoning],
    demandZones: finalData.demandZones.map(String),
    supplyZones: finalData.supplyZones.map(String),
    candlePattern: finalData.marketStructure,
    trendStrength: "STRONG",
    callPutRecommendation: finalData.recommendedTrade,
    targetPrice: finalData.target1,
    stopLoss: finalData.stoploss,
    timeframe: "comprehensive",
    structuredData: finalData,
    nextAnalysisAt: nextUpdate,
    validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  sendNiftyAnalysisNotification("comprehensive", directionStr, finalData.recommendedTrade).catch(e => logger.error({ err: String(e) }, "Push failed"));

  return { direction: directionStr, confidence: finalData.confidence };
}

export async function refreshNiftyCandle30m(): Promise<{ direction: string; confidence: number }> {
  // We can just mirror comprehensive logic or run the exact same on a different timeframe
  logger.info("Starting Nifty 50 30m analysis refresh (Deterministic Engine)");
  const snapshot = await gatherNiftySnapshot();
  
  if (snapshot.sessionStatus.status !== "LIVE") {
    const { desc, eq } = await import("drizzle-orm");
    const [last] = await db.select().from(niftyAnalysisTable).where(eq(niftyAnalysisTable.analysisType, "candle_30m")).orderBy(desc(niftyAnalysisTable.createdAt)).limit(1);
    return { direction: last?.direction ?? "NEUTRAL", confidence: last?.confidence ?? 50 };
  }

  const rawRuleData = RuleEngine.analyze(snapshot.bars30m, snapshot.price);
  const finalData = await explainDeterministicAnalysis(rawRuleData, snapshot);
  
  const nextSlot = getNextSlotIST();
  const directionStr = finalData.overallBias === "Bullish" ? "BULLISH" : finalData.overallBias === "Bearish" ? "BEARISH" : "NEUTRAL";

  await db.insert(niftyAnalysisTable).values({
    analysisType: "candle_30m",
    direction: directionStr,
    confidence: finalData.confidence,
    niftyPrice: snapshot.price,
    niftyChange: snapshot.changePercent,
    summary: finalData.institutionalSummary,
    outlook: finalData.whyThisBias,
    supportLevels: finalData.supportLevels.map(String),
    resistanceLevels: finalData.resistanceLevels.map(String),
    keyFactors: [finalData.reasoning],
    demandZones: finalData.demandZones.map(String),
    supplyZones: finalData.supplyZones.map(String),
    candlePattern: finalData.marketStructure,
    trendStrength: "STRONG",
    callPutRecommendation: finalData.recommendedTrade,
    targetPrice: finalData.target1,
    stopLoss: finalData.stoploss,
    timeframe: "30m",
    structuredData: finalData,
    nextAnalysisAt: nextSlot,
    validUntil: new Date(nextSlot.getTime() + 30 * 60 * 1000),
    createdAt: new Date(),
  });

  return { direction: directionStr, confidence: finalData.confidence };
}
