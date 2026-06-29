// niftyAnalysisRefresh.ts
import { db } from "@workspace/db";
import { niftyAnalysisTable, niftySniperTable, tradeHistoryTable, marketAssetsTable } from "@workspace/db";
import { logger } from "./logger";
import { openaiNifty as openai } from "./openaiClient.js";
import { sendNiftyAnalysisNotification } from "./pushNotification.js";
import { TradeEngine } from "./nifty/TradeEngine.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function getNiftySessionStatus(now: Date) {
  const istMs = now.getTime() + IST_OFFSET_MS;
  const istDate = new Date(istMs);
  const totalMinutes = istDate.getUTCHours() * 60 + istDate.getUTCMinutes();
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

async function explainDeterministicAnalysis(tradeData: any) {
  if (!openai) {
    return tradeData;
  }
  const prompt = `You are an institutional derivatives desk analyst. 
The backend quant engine has calculated the following deterministic trade setup for NIFTY 50:
${JSON.stringify(tradeData, null, 2)}

Your ONLY job is to write professional, institutional-grade explanations for this data.
DO NOT change any numbers, targets, stop losses, or the final verdict.

Write 2 fields:
1. "institutionalSummary": 3-4 sentence professional summary of the market structure, EMA alignment, and VWAP status.
2. "whyThisBias": 1-2 sentences explaining why the quant engine chose this bias based on the indicators.

Return ONLY valid JSON:
{
  "institutionalSummary": "...",
  "whyThisBias": "..."
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
      ...tradeData,
      institutionalSummary: parsed.institutionalSummary || "System Generated Summary",
      whyThisBias: parsed.whyThisBias || "System Generated Bias"
    };
  } catch (err) {
    logger.warn({ err: String(err) }, "LLM Formatting failed, returning raw deterministic data.");
    return { ...tradeData, institutionalSummary: "Math Summary", whyThisBias: "Math Bias" };
  }
}

export async function refreshNiftyComprehensive(): Promise<{ direction: string; confidence: number }> {
  logger.info("Starting Nifty 50 V4 comprehensive analysis refresh");
  const now = new Date();
  const sessionStatus = getNiftySessionStatus(now);
  
  if (sessionStatus.status !== "LIVE") {
    logger.info("Skipping Nifty comprehensive analysis (Outside Market Hours)");
    const { desc, eq } = await import("drizzle-orm");
    const [last] = await db.select().from(niftyAnalysisTable).where(eq(niftyAnalysisTable.analysisType, "comprehensive")).orderBy(desc(niftyAnalysisTable.createdAt)).limit(1);
    return { direction: last?.direction ?? "NEUTRAL", confidence: last?.confidence ?? 50 };
  }

  // Run V4 Trade Engine
  const rawTradeData = await TradeEngine.evaluateTrade("NIFTY 50");
  
  // Call LLM strictly for string formatting
  const finalData = await explainDeterministicAnalysis(rawTradeData);

  const directionStr = rawTradeData.trend === "BULLISH" ? "BULLISH" : rawTradeData.trend === "BEARISH" ? "BEARISH" : "NEUTRAL";

  const nextUpdate = new Date(Date.now() + 60 * 60 * 1000);

  if (rawTradeData.tradeType !== "NO TRADE") {
    await db.insert(tradeHistoryTable).values({
      tradeType: rawTradeData.tradeType,
      entry: rawTradeData.entry!,
      stoploss: rawTradeData.stoploss!,
      target1: rawTradeData.target1!,
      target2: rawTradeData.target2!,
      target3: rawTradeData.target3!,
      riskReward: rawTradeData.riskReward!,
      tradeGrade: rawTradeData.tradeGrade!,
      confidence: rawTradeData.confidence!,
      reliabilityScore: rawTradeData.reliabilityScore!,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  await db.insert(niftyAnalysisTable).values({
    analysisType: "comprehensive",
    direction: directionStr,
    confidence: finalData.confidence || 0,
    niftyPrice: finalData.entry || 0,
    niftyChange: 0,
    summary: finalData.institutionalSummary || "No Summary",
    outlook: finalData.whyThisBias || "No Bias",
    supportLevels: [String(finalData.stoploss)],
    resistanceLevels: [String(finalData.target1)],
    keyFactors: [finalData.reason],
    demandZones: [],
    supplyZones: [],
    candlePattern: "N/A",
    trendStrength: "STRONG",
    callPutRecommendation: finalData.tradeType,
    targetPrice: finalData.target1,
    stopLoss: finalData.stoploss,
    timeframe: "comprehensive",
    structuredData: finalData,
    nextAnalysisAt: nextUpdate,
    validUntil: new Date(Date.now() + 2 * 60 * 60 * 1000),
    createdAt: new Date(),
  });

  sendNiftyAnalysisNotification("comprehensive", directionStr, finalData.tradeType).catch(e => logger.error({ err: String(e) }, "Push failed"));

  return { direction: directionStr, confidence: finalData.confidence || 0 };
}
