import { db } from "@workspace/db";
import {
  usdSignalsTable,
  marketAssetsTable,
  newsItemsTable,
  geopoliticalEventsTable,
  socialPostsTable,
} from "@workspace/db";
import { logger } from "./logger";

import { openaiUsd as openai } from "./openaiClient.js";

interface MarketSnapshot {
  dxy: number | null;
  dxyChange: number;
  gold: number | null;
  goldChange: number;
  oil: number | null;
  oilChange: number;
  vix: number | null;
  sp500Change: number;
  btcChange: number;
  ustyield: number | null;
  topNews: string[];
  geoRisks: string[];
  socialSignals: string[];
}

async function gatherMarketSnapshot(): Promise<MarketSnapshot> {
  const [assets, news, geoEvents, socialPosts] = await Promise.all([
    db.select().from(marketAssetsTable),
    db.select().from(newsItemsTable),
    db.select().from(geopoliticalEventsTable),
    db.select().from(socialPostsTable),
  ]);

  const findAsset = (symbol: string) => assets.find(a => a.symbol === symbol);
  const findByName = (name: string) => assets.find(a => a.name.toLowerCase().includes(name.toLowerCase()));

  const dxy = findAsset("DXY") ?? findByName("Dollar Index");
  const gold = findAsset("XAUUSD") ?? findAsset("XAU/USD") ?? findByName("Gold");
  const oil = findAsset("USOIL") ?? findAsset("WTI") ?? findByName("WTI") ?? findByName("Crude");
  const vix = findAsset("VIX") ?? findByName("VIX");
  const sp500 = findAsset("SPX") ?? findAsset("S&P 500") ?? findByName("S&P");
  const btc = findAsset("BTC") ?? findByName("Bitcoin");
  const ustyield = findAsset("US10Y") ?? findByName("10-Year");

  const topNews = news
    .filter(n => n.impact === "high" || n.sentiment === "bearish" || n.sentiment === "bullish")
    .slice(0, 15)
    .map(n => `[${n.sentiment ?? "neutral"}] ${n.headline}`);

  const geoRisks = geoEvents
    .filter(e => e.status === "active" || e.status === "escalating")
    .slice(0, 8)
    .map(e => `[${e.severity}] ${e.title} — ${e.region}`);

  const socialSignals = socialPosts
    .filter(p => {
      const lc = (p.content || "").toLowerCase();
      return lc.includes("dollar") || lc.includes("usd") || lc.includes("fed") ||
             lc.includes("tariff") || lc.includes("rate") || lc.includes("inflation") ||
             lc.includes("trade") || lc.includes("economy");
    })
    .slice(0, 10)
    .map(p => `[${p.influencer ?? p.category}] ${p.content.slice(0, 120)}`);

  return {
    dxy: dxy?.price ?? null,
    dxyChange: dxy?.changePercent ?? 0,
    gold: gold?.price ?? null,
    goldChange: gold?.changePercent ?? 0,
    oil: oil?.price ?? null,
    oilChange: oil?.changePercent ?? 0,
    vix: vix?.price ?? null,
    sp500Change: sp500?.changePercent ?? 0,
    btcChange: btc?.changePercent ?? 0,
    ustyield: ustyield?.price ?? null,
    topNews,
    geoRisks,
    socialSignals,
  };
}

interface AiUsdAnalysis {
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  confidence: number;
  summary: string;
  factors: string[];
  fedSignal: string;
  geopoliticalRisk: string;
}

async function analyzeWithAI(snapshot: MarketSnapshot): Promise<AiUsdAnalysis> {
  if (!openai) {
    logger.info("OpenAI not available, using fallback algorithm for USD signal");
    return fallbackAnalysis(snapshot);
  }
  const prompt = `You are a senior FX analyst at Goldman Sachs. Analyze the current market data and give a DEFINITIVE USD direction signal. You MUST commit to BULLISH or BEARISH — only say NEUTRAL if indicators are truly perfectly balanced (which is rare).

CURRENT MARKET DATA:
- DXY (USD Index): ${snapshot.dxy?.toFixed(2) ?? "N/A"} (${snapshot.dxyChange > 0 ? "+" : ""}${snapshot.dxyChange.toFixed(2)}% change)
- Gold (XAU/USD): $${snapshot.gold?.toFixed(0) ?? "N/A"} (${snapshot.goldChange > 0 ? "+" : ""}${snapshot.goldChange.toFixed(2)}% change)
- WTI Oil: $${snapshot.oil?.toFixed(2) ?? "N/A"} (${snapshot.oilChange > 0 ? "+" : ""}${snapshot.oilChange.toFixed(2)}% change)
- VIX: ${snapshot.vix?.toFixed(1) ?? "N/A"}
- S&P 500 Change: ${snapshot.sp500Change > 0 ? "+" : ""}${snapshot.sp500Change.toFixed(2)}%
- Bitcoin Change: ${snapshot.btcChange > 0 ? "+" : ""}${snapshot.btcChange.toFixed(2)}%
- US 10Y Yield: ${snapshot.ustyield?.toFixed(2) ?? "N/A"}%

TOP MARKET NEWS:
${snapshot.topNews.length > 0 ? snapshot.topNews.join("\n") : "No significant news"}

GEOPOLITICAL RISKS:
${snapshot.geoRisks.length > 0 ? snapshot.geoRisks.join("\n") : "No active risks"}

KEY SOCIAL SIGNALS (from Trump, Powell, Musk, Buffett, etc.):
${snapshot.socialSignals.length > 0 ? snapshot.socialSignals.join("\n") : "No significant signals"}

ANALYSIS RULES:
1. DXY direction is the #1 signal — if DXY is rising, USD is bullish
2. Gold inverse — rising gold = bearish USD (usually)
3. High VIX = flight to safety = bullish USD
4. Fed hawkish (rate hikes, inflation concern) = bullish USD; Fed dovish (rate cuts, easing) = bearish USD
5. Trade wars/tariffs create USD UNCERTAINTY but initial reaction is often USD strength
6. Geopolitical crises = safe haven = bullish USD
7. Rising yields = bullish USD (higher returns attract capital)
8. Weak equities = bullish USD (risk-off)

Return ONLY valid JSON (no markdown):
{
  "direction": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": number 55-98 (your conviction level — be confident, commit to a direction),
  "summary": "2-3 sentence professional analysis with specific data points and a clear trading recommendation (e.g., LONG USD, SHORT EUR/USD)",
  "factors": ["factor 1 with specific data", "factor 2", "factor 3", "factor 4", "factor 5"],
  "fedSignal": "HAWKISH" or "DOVISH" or "NEUTRAL",
  "geopoliticalRisk": "LOW" or "MODERATE" or "ELEVATED" or "HIGH" or "EXTREME"
}`;

  const response = await openai.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    max_completion_tokens: 1024,
    response_format: { type: "json_object" as const },
    messages: [
      { role: "system", content: "You are a senior FX strategist. Return only valid JSON. Be decisive — commit to BULLISH or BEARISH. Traders need clear signals, not fence-sitting." },
      { role: "user", content: prompt },
    ],
  });

  const text = response.choices[0]?.message?.content?.trim() || "";
  logger.info({ responseLength: text.length, preview: text.slice(0, 300) }, "AI USD raw response");
  const jsonText = (() => { const s = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); const m = s.match(/\{[\s\S]*\}/); return (m ? m[0] : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""); })();

  try {
    const parsed = JSON.parse(jsonText);
    const validDirections = ["BULLISH", "BEARISH", "NEUTRAL"];
    const normalizedDirection = String(parsed.direction || "NEUTRAL").toUpperCase().trim();
    return {
      direction: validDirections.includes(normalizedDirection) ? normalizedDirection : "NEUTRAL",
      confidence: Math.max(30, Math.min(98, Number(parsed.confidence) || 50)),
      summary: String(parsed.summary || "AI analysis in progress..."),
      factors: Array.isArray(parsed.factors) ? parsed.factors.map(String) : [],
      fedSignal: String(parsed.fedSignal || "NEUTRAL").toLowerCase(),
      geopoliticalRisk: String(parsed.geopoliticalRisk || "MODERATE").toLowerCase(),
    };
  } catch {
    logger.warn({ responsePreview: jsonText.slice(0, 300) }, "Failed to parse AI USD analysis, using fallback");
    return fallbackAnalysis(snapshot);
  }
}

function fallbackAnalysis(snapshot: MarketSnapshot): AiUsdAnalysis {
  let score = 0;
  const factors: string[] = [];

  if (snapshot.dxyChange > 0.3) { score += 2; factors.push(`DXY rising +${snapshot.dxyChange.toFixed(2)}% — USD momentum bullish`); }
  else if (snapshot.dxyChange < -0.3) { score -= 2; factors.push(`DXY falling ${snapshot.dxyChange.toFixed(2)}% — USD momentum bearish`); }
  else { factors.push(`DXY flat at ${snapshot.dxy?.toFixed(2) ?? "N/A"} — neutral momentum`); }

  if (snapshot.goldChange > 1) { score -= 1; factors.push(`Gold surging +${snapshot.goldChange.toFixed(2)}% — safe haven demand weakens USD`); }
  if (snapshot.vix && snapshot.vix > 25) { score += 1; factors.push(`VIX elevated at ${snapshot.vix.toFixed(1)} — flight to safety supports USD`); }
  if (snapshot.sp500Change < -1) { score += 1; factors.push(`S&P 500 falling ${snapshot.sp500Change.toFixed(2)}% — equity weakness supports USD`); }

  const direction = score > 1.5 ? "BULLISH" : score < -1.5 ? "BEARISH" : "NEUTRAL";
  const confidence = Math.min(85, Math.max(40, 50 + Math.abs(score) * 8));

  return {
    direction: direction as AiUsdAnalysis["direction"],
    confidence: Math.round(confidence),
    summary: `USD ${direction}. DXY at ${snapshot.dxy?.toFixed(2) ?? "N/A"}, Gold at $${snapshot.gold?.toFixed(0) ?? "N/A"}, VIX at ${snapshot.vix?.toFixed(1) ?? "N/A"}. ${factors.length} factors analyzed.`,
    factors,
    fedSignal: "neutral",
    geopoliticalRisk: "moderate",
  };
}

export async function refreshUsdSignal(): Promise<{ direction: string; confidence: number }> {
  logger.info("Starting AI-powered USD signal refresh");

  const snapshot = await gatherMarketSnapshot();

  let analysis: AiUsdAnalysis;
  let isAI = false;
  try {
    analysis = await analyzeWithAI(snapshot);
    isAI = true;
    logger.info({ direction: analysis.direction, confidence: analysis.confidence, source: "AI" }, "AI USD analysis complete");
  } catch (err) {
    logger.warn({ err: String(err) }, "AI USD analysis failed — keeping last DB signal, skipping insert");
    const [last] = await db.select().from(usdSignalsTable).orderBy((await import("drizzle-orm")).desc(usdSignalsTable.createdAt)).limit(1);
    if (last) {
      return { direction: last.direction, confidence: last.confidence };
    }
    analysis = fallbackAnalysis(snapshot);
  }

  if (!isAI) {
    logger.info({ direction: analysis.direction, confidence: analysis.confidence }, "USD signal using fallback (AI unavailable), not writing to DB");
    return { direction: analysis.direction, confidence: analysis.confidence };
  }

  const nextUpdate = new Date(Date.now() + 4 * 60 * 60 * 1000);

  await db.insert(usdSignalsTable).values({
    direction: analysis.direction,
    confidence: analysis.confidence,
    summary: analysis.summary,
    factors: analysis.factors,
    dxyValue: snapshot.dxy,
    goldPrice: snapshot.gold,
    oilPrice: snapshot.oil,
    vixValue: snapshot.vix,
    fedSignal: analysis.fedSignal,
    geopoliticalRisk: analysis.geopoliticalRisk,
    nextUpdate,
    createdAt: new Date(),
  });

  logger.info({ direction: analysis.direction, confidence: analysis.confidence }, "USD signal refresh complete");
  return { direction: analysis.direction, confidence: analysis.confidence };
}
