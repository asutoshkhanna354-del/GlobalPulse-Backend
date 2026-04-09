import { db } from "@workspace/db";
import { niftyAnalysisTable, marketAssetsTable, newsItemsTable } from "@workspace/db";
import { logger } from "./logger";
import { fetchOHLC } from "./indicator.js";

import { openaiNifty as openai } from "./openaiClient.js";

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function toIST(date: Date): string {
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour12: true, hour: "2-digit", minute: "2-digit", day: "2-digit", month: "short", year: "numeric" });
}

function toISTHHMM(date: Date): string {
  return date.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });
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

function getNiftySessionStatus(now: Date): {
  status: "PRE_MARKET" | "LIVE" | "POST_CLOSE";
  label: string;
  sessionOpenTime: string;
  sessionCloseTime: string;
  minutesElapsed: number;
  minutesRemaining: number;
} {
  const { hours, minutes } = getISTComponents(now);
  const totalMinutes = hours * 60 + minutes;
  const openMinutes = 9 * 60 + 15;
  const closeMinutes = 15 * 60 + 30;

  if (totalMinutes < openMinutes) {
    return {
      status: "PRE_MARKET",
      label: "Pre-Market (session opens at 9:15 AM IST)",
      sessionOpenTime: "9:15 AM IST",
      sessionCloseTime: "3:30 PM IST",
      minutesElapsed: 0,
      minutesRemaining: openMinutes - totalMinutes,
    };
  } else if (totalMinutes >= closeMinutes) {
    return {
      status: "POST_CLOSE",
      label: "Market Closed (session closed at 3:30 PM IST)",
      sessionOpenTime: "9:15 AM IST",
      sessionCloseTime: "3:30 PM IST",
      minutesElapsed: closeMinutes - openMinutes,
      minutesRemaining: 0,
    };
  } else {
    const elapsed = totalMinutes - openMinutes;
    const remaining = closeMinutes - totalMinutes;
    return {
      status: "LIVE",
      label: `Live Trading (${Math.floor(elapsed / 60)}h ${elapsed % 60}m elapsed, ${Math.floor(remaining / 60)}h ${remaining % 60}m remaining)`,
      sessionOpenTime: "9:15 AM IST",
      sessionCloseTime: "3:30 PM IST",
      minutesElapsed: elapsed,
      minutesRemaining: remaining,
    };
  }
}

function extractTodaySessionBars(bars: any[], now: Date): {
  todayBars: any[];
  firstCandle: any | null;
  lastCandle: any | null;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  dayClose: number | null;
  prevDayClose: number | null;
  prevDayBars: any[];
} {
  if (!bars.length) {
    return { todayBars: [], firstCandle: null, lastCandle: null, dayOpen: null, dayHigh: null, dayLow: null, dayClose: null, prevDayClose: null, prevDayBars: [] };
  }

  const istNowMs = now.getTime() + IST_OFFSET_MS;
  const istNowDate = new Date(istNowMs);
  const todayStartUTC = Date.UTC(
    istNowDate.getUTCFullYear(),
    istNowDate.getUTCMonth(),
    istNowDate.getUTCDate()
  ) - IST_OFFSET_MS;
  const todayEndUTC = todayStartUTC + 24 * 60 * 60 * 1000;

  const todayBars = bars.filter(b => {
    const ts = new Date(b.timestamp).getTime();
    return ts >= todayStartUTC && ts < todayEndUTC;
  });

  const prevDayBars = bars.filter(b => {
    const ts = new Date(b.timestamp).getTime();
    return ts < todayStartUTC;
  });

  if (!todayBars.length) {
    return { todayBars: [], firstCandle: null, lastCandle: null, dayOpen: null, dayHigh: null, dayLow: null, dayClose: null, prevDayClose: null, prevDayBars };
  }

  const sortedToday = [...todayBars].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const firstCandle = sortedToday[0];
  const lastCandle = sortedToday[sortedToday.length - 1];

  const dayOpen = firstCandle?.open ?? null;
  const dayHigh = Math.max(...sortedToday.map(b => b.high ?? 0));
  const dayLow = Math.min(...sortedToday.map(b => b.low ?? Infinity));
  const dayClose = lastCandle?.close ?? null;

  const sortedPrev = [...prevDayBars].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  const prevDayClose = sortedPrev.length > 0 ? sortedPrev[sortedPrev.length - 1]?.close ?? null : null;

  return {
    todayBars: sortedToday,
    firstCandle,
    lastCandle,
    dayOpen,
    dayHigh: dayHigh === 0 ? null : dayHigh,
    dayLow: dayLow === Infinity ? null : dayLow,
    dayClose,
    prevDayClose,
    prevDayBars: sortedPrev,
  };
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

interface NiftySnapshot {
  price: number | null;
  change: number;
  changePercent: number;
  dayOpen: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  dayClose: number | null;
  prevDayClose: number | null;
  firstCandle: any | null;
  lastCandle: any | null;
  sessionStatus: ReturnType<typeof getNiftySessionStatus>;
  bars30m: any[];
  bars15m: any[];
  bars5m: any[];
  todayBars5m: any[];
  sensexPrice: number | null;
  sensexChange: number;
  bankNiftyPrice: number | null;
  bankNiftyChange: number;
  vixValue: number | null;
  globalCues: string[];
  indianNews: string[];
  snapshotTime: Date;
}

async function gatherNiftySnapshot(): Promise<NiftySnapshot & { realChangePercent: number; realChange: number }> {
  const now = new Date();
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

  const sessionStatus = getNiftySessionStatus(now);
  const sessionData = extractTodaySessionBars(bars5m.length > 0 ? bars5m : bars15m, now);

  // When market is closed, compute real day change from candle data (DB price goes stale at 0%)
  const rawChangePercent = nifty?.changePercent ?? 0;
  const rawChange = nifty?.change ?? 0;
  let realChangePercent = rawChangePercent;
  let realChange = rawChange;
  if (sessionStatus.status === "POST_CLOSE" && sessionData.dayClose != null && sessionData.prevDayClose != null && sessionData.prevDayClose !== 0) {
    realChange = sessionData.dayClose - sessionData.prevDayClose;
    realChangePercent = (realChange / sessionData.prevDayClose) * 100;
  } else if (sessionStatus.status === "POST_CLOSE" && sessionData.dayClose != null && sessionData.dayOpen != null && sessionData.dayOpen !== 0) {
    realChange = sessionData.dayClose - sessionData.dayOpen;
    realChangePercent = (realChange / sessionData.dayOpen) * 100;
  }

  return {
    price: sessionStatus.status === "POST_CLOSE" && sessionData.dayClose != null ? sessionData.dayClose : (nifty?.price ?? null),
    change: realChange,
    changePercent: realChangePercent,
    dayOpen: sessionData.dayOpen,
    dayHigh: sessionData.dayHigh,
    dayLow: sessionData.dayLow,
    dayClose: sessionData.dayClose,
    prevDayClose: sessionData.prevDayClose,
    firstCandle: sessionData.firstCandle,
    lastCandle: sessionData.lastCandle,
    sessionStatus,
    bars30m,
    bars15m,
    bars5m,
    todayBars5m: sessionData.todayBars,
    sensexPrice: sensex?.price ?? null,
    sensexChange: sensex?.changePercent ?? 0,
    bankNiftyPrice: bankNifty?.price ?? null,
    bankNiftyChange: bankNifty?.changePercent ?? 0,
    vixValue: vix?.price ?? null,
    globalCues,
    indianNews,
    snapshotTime: now,
    realChangePercent,
    realChange,
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

function formatSessionContext(snapshot: NiftySnapshot): string {
  const { sessionStatus, dayOpen, dayHigh, dayLow, dayClose, prevDayClose, firstCandle, lastCandle } = snapshot;
  const now = toIST(snapshot.snapshotTime);

  const dayRange = (dayHigh != null && dayLow != null)
    ? `Day Range: ${dayLow.toFixed(2)} – ${dayHigh.toFixed(2)} (spread: ${(dayHigh - dayLow).toFixed(2)} pts)`
    : "Day Range: Insufficient data";

  const openInfo = dayOpen != null
    ? `Day Open (9:15 AM candle): ${dayOpen.toFixed(2)}`
    : "Day Open: Not yet (pre-market or data unavailable)";

  const prevCloseInfo = prevDayClose != null
    ? `Previous Day Close: ${prevDayClose.toFixed(2)}${dayOpen != null ? ` | Gap: ${(dayOpen - prevDayClose) > 0 ? "+" : ""}${(dayOpen - prevDayClose).toFixed(2)} (${(((dayOpen - prevDayClose) / prevDayClose) * 100).toFixed(2)}%)` : ""}`
    : "Previous Day Close: N/A";

  const firstCandleInfo = firstCandle
    ? `First Candle (9:15 AM opening candle): O:${firstCandle.open?.toFixed(2)} H:${firstCandle.high?.toFixed(2)} L:${firstCandle.low?.toFixed(2)} C:${firstCandle.close?.toFixed(2)} — ${firstCandle.close > firstCandle.open ? "BULLISH (green)" : firstCandle.close < firstCandle.open ? "BEARISH (red)" : "DOJI"} opening candle sets the early tone`
    : "First Candle (9:15 AM): Not yet formed";

  const lastCandleInfo = lastCandle
    ? (() => {
        const t = new Date(lastCandle.timestamp);
        const ist = toISTHHMM(t);
        const { hours, minutes } = getISTComponents(t);
        const isClosingCandle = hours === 15 && minutes === 30;
        return `Last Candle (${ist}${isClosingCandle ? " — CLOSING CANDLE 3:30 PM" : ""}): O:${lastCandle.open?.toFixed(2)} H:${lastCandle.high?.toFixed(2)} L:${lastCandle.low?.toFixed(2)} C:${lastCandle.close?.toFixed(2)} — ${lastCandle.close > lastCandle.open ? "BULLISH close" : lastCandle.close < lastCandle.open ? "BEARISH close" : "DOJI"}`;
      })()
    : "Last Candle: No intraday data";

  const dayMoveInfo = (dayOpen != null && dayClose != null)
    ? (() => {
        const move = dayClose - dayOpen;
        const movePct = (move / dayOpen * 100).toFixed(2);
        return `Day Movement so far: ${move > 0 ? "+" : ""}${move.toFixed(2)} pts (${move > 0 ? "+" : ""}${movePct}%) from open to current`;
      })()
    : "";

  return `NIFTY 50 SESSION CONTEXT:
- Current Time (IST): ${now}
- Session Status: ${sessionStatus.label}
- Market Hours: Opens 9:15 AM IST | Closes 3:30 PM IST (Mon-Fri, NSE)
- ${openInfo}
- ${prevCloseInfo}
- ${dayRange}
${dayMoveInfo ? `- ${dayMoveInfo}` : ""}
- ${firstCandleInfo}
- ${lastCandleInfo}`;
}

async function analyzeNiftyComprehensive(snapshot: NiftySnapshot): Promise<any> {
  if (!openai) return fallbackNiftyAnalysis(snapshot, "comprehensive");

  const sessionCtx = formatSessionContext(snapshot);

  const prompt = `You are a senior Indian equity strategist at Goldman Sachs specializing in Nifty 50 index trading. Provide a COMPREHENSIVE, ACTIONABLE analysis grounded in today's actual session data.

${sessionCtx}

CURRENT NIFTY 50 DATA:
- Current Price: ${snapshot.price?.toFixed(2) ?? "N/A"} (${snapshot.changePercent > 0 ? "+" : ""}${snapshot.changePercent.toFixed(2)}%)
- Sensex: ${snapshot.sensexPrice?.toFixed(2) ?? "N/A"} (${snapshot.sensexChange > 0 ? "+" : ""}${snapshot.sensexChange.toFixed(2)}%)
- Bank Nifty: ${snapshot.bankNiftyPrice?.toFixed(2) ?? "N/A"} (${snapshot.bankNiftyChange > 0 ? "+" : ""}${snapshot.bankNiftyChange.toFixed(2)}%)
- India VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"}

GLOBAL CUES:
${snapshot.globalCues.length > 0 ? snapshot.globalCues.join("\n") : "No data"}

TODAY'S INTRADAY BARS (5-MIN — today's full session):
${snapshot.todayBars5m.length > 0 ? formatBarsForAI(snapshot.todayBars5m, "Today's 5-MIN candles", snapshot.todayBars5m.length) : "No intraday data for today yet"}

${formatBarsForAI(snapshot.bars30m, "30-MIN CANDLES (recent sessions)", 12)}

${formatBarsForAI(snapshot.bars15m, "15-MIN CANDLES (recent sessions)", 15)}

INDIAN MARKET NEWS:
${snapshot.indianNews.length > 0 ? snapshot.indianNews.join("\n") : "No significant news"}

ANALYSIS REQUIREMENTS:
${snapshot.sessionStatus.status === "POST_CLOSE" ? `
⚠️ MARKET HAS CLOSED FOR TODAY (3:30 PM IST).
Today's session is COMPLETE. You MUST:
1. Determine if today was BULLISH or BEARISH: compare today's CLOSE (${snapshot.dayClose?.toFixed(2) ?? "N/A"}) vs today's OPEN (${snapshot.dayOpen?.toFixed(2) ?? "N/A"}) and previous day's close (${snapshot.prevDayClose?.toFixed(2) ?? "N/A"})
2. Describe today's full session in detail (open, high, low, close, total range, key moves)
3. Give a clear TOMORROW outlook — gap up/gap down probability, expected opening range
4. Provide next-day CE/PE recommendation with entry, target, SL based on today's closing levels
5. DO NOT return NEUTRAL unless today was literally a doji with zero move — today has a real close price, give a real direction
` : `
1. Use today's OPENING price (9:15 AM first candle) and current/closing price to assess direction
2. Identify if today's candle is BULLISH or BEARISH based on open vs close
3. Whether Nifty will FALL or RISE — give specific price targets
4. Key support and resistance levels (at least 3 each)
5. Demand and supply zones based on intraday candle clusters
6. Specific Call/Put recommendation for index options
7. Risk assessment and stop-loss levels
`}

Return ONLY valid JSON:
{
  "direction": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": 55-98,
  "summary": "3-4 sentence professional analysis referencing today's day open, day high/low, day close, and the overall session movement",
  "outlook": "Detailed 2-3 paragraph outlook: paragraph 1 — today's session analysis (open to close movement, key levels hit), paragraph 2 — what to expect next session or rest of day, paragraph 3 — key levels and scenarios. Mention specific IST times.",
  "supportLevels": ["24100", "23950", "23800"],
  "resistanceLevels": ["24350", "24500", "24650"],
  "demandZones": ["23950-24050 (today's intraday demand zone)", "23800-23850 (previous day low)"],
  "supplyZones": ["24400-24500 (today's supply/distribution zone)", "24600-24650 (previous session high)"],
  "candlePattern": "Today's daily candle pattern (e.g., Bullish Engulfing day candle, Bearish Doji, Inside Bar, etc.)",
  "trendStrength": "STRONG" or "MODERATE" or "WEAK",
  "callPutRecommendation": "Specific recommendation with entry, target, SL based on today's key levels",
  "targetPrice": 24350.0,
  "stopLoss": 24050.0,
  "keyFactors": ["Today's gap up/down from prev close", "First candle direction", "Day range vs avg", "factor 4", "factor 5"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_completion_tokens: 2048,
      response_format: { type: "json_object" as const },
      messages: [
        { role: "system", content: `You are a senior Indian equity strategist. Nifty 50 trades 9:15 AM to 3:30 PM IST on NSE. Always base signals on today's actual opening price (first candle at 9:15 AM), today's day high/low, and today's closing price. ${snapshot.sessionStatus.status === "POST_CLOSE" ? "IMPORTANT: The market has CLOSED today. Give a definitive BULLISH or BEARISH direction based on today's close vs open/prev-close. Then give a clear next-day opening outlook with gap-up/gap-down probability and next-day CE/PE recommendation. NEVER return NEUTRAL when market has closed with a real close price." : "If market is live, mention time remaining."} All times in IST. Return only valid JSON.` },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    logger.info({ responseLength: text.length, preview: text.slice(0, 300) }, "AI Nifty comprehensive raw response");
    const jsonText = (() => { const s = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); const m = s.match(/\{[\s\S]*\}/); return (m ? m[0] : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""); })();
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
  const sessionCtx = formatSessionContext(snapshot);

  const prompt = `You are a professional intraday options trader specializing in Nifty 50 index options. Analyze demand-supply for the next 30-minute candle.

${sessionCtx}

CURRENT TIME (IST): ${toIST(snapshot.snapshotTime)}
NEXT 30-MIN CANDLE CLOSES AT: ${nextSlotIST}

NIFTY 50: ${snapshot.price?.toFixed(2) ?? "N/A"} (${snapshot.changePercent > 0 ? "+" : ""}${snapshot.changePercent.toFixed(2)}%)
India VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"}

${formatBarsForAI(snapshot.bars30m, "30-MIN CANDLES", 15)}

TODAY'S 5-MIN BARS (intraday context — from 9:15 AM open):
${snapshot.todayBars5m.length > 0 ? formatBarsForAI(snapshot.todayBars5m, "Today's 5-MIN candles", snapshot.todayBars5m.length) : "No intraday 5m data yet"}

TASK: Provide a 30-min demand-supply analysis for the NEXT candle. Consider:
- Today's session direction (from 9:15 AM open to current price)
- How much of today's day range has been consumed
- Whether the market is trending or reversing from morning highs/lows
- If session is POST_CLOSE (after 3:30 PM), give overnight outlook for next day's open

${snapshot.sessionStatus.status === "POST_CLOSE"
  ? "IMPORTANT: Market has closed for today (3:30 PM IST). Provide next-day gap-up/gap-down outlook based on today's closing candle and global cues."
  : snapshot.sessionStatus.status === "PRE_MARKET"
    ? "IMPORTANT: Market has not opened yet. Provide opening gap analysis and what to expect at 9:15 AM."
    : `IMPORTANT: Market is LIVE. ${snapshot.sessionStatus.minutesRemaining} minutes remain in today's session. Give specific CE/PE recommendation.`}

Return ONLY valid JSON:
{
  "direction": "BULLISH" or "BEARISH" or "NEUTRAL",
  "confidence": 55-98,
  "summary": "2-3 sentence analysis: reference today's opening (9:15 AM candle), current price vs day open, and prediction for next 30 minutes",
  "outlook": "What to expect in the next 30-60 minutes or next session. Reference today's full-day movement in context.",
  "demandZones": ["zone1 with price range and context (e.g. today's morning low zone)", "zone2"],
  "supplyZones": ["zone1 with price range and context (e.g. today's afternoon high zone)", "zone2"],
  "candlePattern": "Current 30m candle pattern AND today's overall daily candle shape so far",
  "trendStrength": "STRONG" or "MODERATE" or "WEAK",
  "callPutRecommendation": "Specific CE/PE recommendation with entry, target, stop-loss. Reference today's open and key intraday levels.",
  "targetPrice": 24250.0,
  "stopLoss": 24150.0,
  "keyFactors": ["factor1 (e.g. trading above/below today's open)", "factor2", "factor3"]
}`;

  try {
    const response = await openai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      max_completion_tokens: 1536,
      response_format: { type: "json_object" as const },
      messages: [
        { role: "system", content: "You are a professional Nifty 50 intraday options trader. Nifty 50 trades 9:15 AM to 3:30 PM IST on NSE. Always reference today's actual opening price (9:15 AM first candle) and today's day high/low in your analysis. If market is live, mention time remaining. If market closed, give next-day outlook. Be specific with price levels. All times in IST. Return only valid JSON." },
        { role: "user", content: prompt },
      ],
    });

    const text = response.choices[0]?.message?.content?.trim() || "";
    logger.info({ responseLength: text.length, preview: text.slice(0, 300) }, "AI Nifty 30m candle raw response");
    const jsonText = (() => { const s = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim(); const m = s.match(/\{[\s\S]*\}/); return (m ? m[0] : s).replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, ""); })();
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

function fallbackNiftyAnalysis(snapshot: NiftySnapshot & { realChangePercent?: number; realChange?: number }, type: string): any {
  const price = snapshot.price ?? snapshot.dayClose ?? 24000;
  const isPostClose = snapshot.sessionStatus.status === "POST_CLOSE";
  // Use real candle-derived change when available (avoids stale 0% after market close)
  const change = (snapshot as any).realChangePercent ?? snapshot.changePercent;
  const dayOpen = snapshot.dayOpen;
  const dayClose = snapshot.dayClose;
  // For closed market, derive direction from dayClose vs dayOpen/prevDayClose
  let direction: string;
  if (isPostClose && dayClose != null) {
    const ref = snapshot.prevDayClose ?? dayOpen;
    if (ref != null && ref !== 0) {
      const pct = ((dayClose - ref) / ref) * 100;
      direction = pct > 0.2 ? "BULLISH" : pct < -0.2 ? "BEARISH" : "NEUTRAL";
    } else {
      direction = change > 0.2 ? "BULLISH" : change < -0.2 ? "BEARISH" : "NEUTRAL";
    }
  } else {
    direction = change > 0.3 ? "BULLISH" : change < -0.3 ? "BEARISH" : "NEUTRAL";
  }
  const confidence = Math.min(75, Math.max(40, 50 + Math.abs(change) * 5));

  const support1 = Math.round(price * 0.995 / 50) * 50;
  const support2 = Math.round(price * 0.99 / 50) * 50;
  const support3 = Math.round(price * 0.985 / 50) * 50;
  const resistance1 = Math.round(price * 1.005 / 50) * 50;
  const resistance2 = Math.round(price * 1.01 / 50) * 50;
  const resistance3 = Math.round(price * 1.015 / 50) * 50;

  const sessionLabel = snapshot.sessionStatus.label;
  const closeNote = isPostClose && dayClose != null
    ? ` Today closed at ${dayClose.toFixed(2)} (opened ${dayOpen?.toFixed(2) ?? "N/A"}, H: ${snapshot.dayHigh?.toFixed(2) ?? "N/A"}, L: ${snapshot.dayLow?.toFixed(2) ?? "N/A"}).`
    : dayOpen != null ? ` Day opened at ${dayOpen.toFixed(2)} (${price > dayOpen ? "trading above open" : price < dayOpen ? "trading below open" : "at open"}).` : "";

  const summaryBase = isPostClose
    ? `Market Closed. Nifty closed at ${(dayClose ?? price).toFixed(2)} (${change > 0 ? "+" : ""}${change.toFixed(2)}%).${closeNote} ${direction === "BULLISH" ? "Today was a BULLISH session — closed above open." : direction === "BEARISH" ? "Today was a BEARISH session — closed below open." : "Session ended near open (doji)."} VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"}.`
    : `Nifty at ${price.toFixed(2)} (${change > 0 ? "+" : ""}${change.toFixed(2)}%).${closeNote} ${direction === "BULLISH" ? "Upward momentum detected." : direction === "BEARISH" ? "Selling pressure observed." : "Consolidation phase."} VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"}. Session: ${sessionLabel}.`;

  const outlookBase = isPostClose
    ? (direction === "BULLISH"
        ? `Today's session was positive with Nifty closing at ${(dayClose ?? price).toFixed(2)}, up from open of ${dayOpen?.toFixed(2) ?? "N/A"}. Key resistance for tomorrow is ${resistance1}-${resistance2}. If global cues remain supportive, expect a gap-up or positive opening tomorrow. Watch for continuation above ${resistance1}. Support for tomorrow's session is at ${support1}-${support2}.`
        : direction === "BEARISH"
          ? `Today's session was negative with Nifty closing at ${(dayClose ?? price).toFixed(2)}, down from open of ${dayOpen?.toFixed(2) ?? "N/A"}. Key support for tomorrow is ${support1}-${support2}. If selling pressure continues, expect gap-down or weak opening. Watch for recovery above ${resistance1} for reversal. Bears in control below ${resistance1}.`
          : `Nifty ended today near its opening level, forming a doji-like pattern. Tomorrow's direction will depend on global cues. Key range: ${support1}–${resistance1}. A decisive break on either side will determine the trend.`)
    : (direction === "BULLISH"
        ? `Nifty showing strength above ${support1}.${dayOpen != null ? ` Opened at ${dayOpen.toFixed(2)}, currently ${price > dayOpen ? "above" : "near"} the day open.` : ""} If sustains above ${resistance1}, can target ${resistance2}-${resistance3}.`
        : direction === "BEARISH"
          ? `Nifty under pressure below ${resistance1}.${dayOpen != null ? ` Opened at ${dayOpen.toFixed(2)}, currently ${price < dayOpen ? "below" : "near"} the day open.` : ""} If breaks ${support1}, can slide to ${support2}-${support3}.`
          : `Nifty consolidating between ${support1}-${resistance1}.${dayOpen != null ? ` Day opened at ${dayOpen.toFixed(2)}.` : ""} Wait for breakout direction.`);

  return {
    analysisType: type,
    direction,
    confidence: Math.round(confidence),
    summary: summaryBase,
    outlook: outlookBase,
    supportLevels: [String(support1), String(support2), String(support3)],
    resistanceLevels: [String(resistance1), String(resistance2), String(resistance3)],
    demandZones: [`${support2}-${support1} (key demand zone)`],
    supplyZones: [`${resistance1}-${resistance2} (key supply zone)`],
    candlePattern: isPostClose
      ? (direction === "BULLISH" ? `Bullish session — closed ${dayClose != null && dayOpen != null ? (dayClose - dayOpen).toFixed(2) + " pts above open" : "above open"}` : direction === "BEARISH" ? `Bearish session — closed ${dayClose != null && dayOpen != null ? Math.abs(dayClose - dayOpen).toFixed(2) + " pts below open" : "below open"}` : "Doji — closed near open")
      : "Algorithmic analysis (AI unavailable)",
    trendStrength: Math.abs(change) > 0.8 ? "STRONG" : Math.abs(change) > 0.3 ? "MODERATE" : "WEAK",
    callPutRecommendation: isPostClose
      ? (direction === "BULLISH"
          ? `Tomorrow: BUY NIFTY ${resistance1} CE on dip to ${support1} at open, target ${resistance2}, SL ${support2}. Watch global cues for gap-up confirmation.`
          : direction === "BEARISH"
            ? `Tomorrow: BUY NIFTY ${support1} PE on bounce to ${resistance1} at open, target ${support2}, SL ${resistance2}. Avoid longs unless recovery above ${resistance1}.`
            : `Tomorrow: Wait for opening direction. BUY CE if breaks above ${resistance1}, BUY PE if breaks below ${support1}. Avoid pre-open positions.`)
      : (direction === "BULLISH"
          ? `BUY NIFTY ${resistance1} CE near support ${support1}, target ${resistance2}, SL ${support2}`
          : direction === "BEARISH"
            ? `BUY NIFTY ${support1} PE near resistance ${resistance1}, target ${support2}, SL ${resistance2}`
            : `Wait for breakout above ${resistance1} or breakdown below ${support1}`),
    targetPrice: direction === "BULLISH" ? resistance2 : direction === "BEARISH" ? support2 : price,
    stopLoss: direction === "BULLISH" ? support2 : direction === "BEARISH" ? resistance2 : price,
    keyFactors: isPostClose
      ? [
          `Market Closed | Today: ${direction} session (${change > 0 ? "+" : ""}${change.toFixed(2)}%)`,
          dayOpen != null && dayClose != null ? `Today Open: ${dayOpen.toFixed(2)} → Close: ${dayClose.toFixed(2)} (${dayClose > dayOpen ? "+" : ""}${(dayClose - dayOpen).toFixed(2)} pts)` : "Session data awaited",
          snapshot.dayHigh != null && snapshot.dayLow != null ? `Day Range: ${snapshot.dayLow.toFixed(2)} – ${snapshot.dayHigh.toFixed(2)} (${(snapshot.dayHigh - snapshot.dayLow).toFixed(2)} pts spread)` : "Range data unavailable",
          `VIX: ${snapshot.vixValue?.toFixed(2) ?? "N/A"} | Bank Nifty: ${snapshot.bankNiftyChange > 0 ? "+" : ""}${snapshot.bankNiftyChange.toFixed(2)}%`,
          `Tomorrow key levels: Support ${support1}-${support2} | Resistance ${resistance1}-${resistance2}`,
        ]
      : [
          `Nifty ${change > 0 ? "up" : "down"} ${Math.abs(change).toFixed(2)}% | Session: ${sessionLabel}`,
          dayOpen != null ? `Day Open: ${dayOpen.toFixed(2)} | Current: ${price.toFixed(2)} (${price > dayOpen ? "above" : price < dayOpen ? "below" : "at"} open)` : "Day Open: Data awaited",
          `VIX at ${snapshot.vixValue?.toFixed(2) ?? "N/A"}`,
          `Bank Nifty ${snapshot.bankNiftyChange > 0 ? "+" : ""}${snapshot.bankNiftyChange.toFixed(2)}%`,
          `Sensex ${snapshot.sensexChange > 0 ? "+" : ""}${snapshot.sensexChange.toFixed(2)}%`,
        ],
  };
}

export async function refreshNiftyComprehensive(): Promise<{ direction: string; confidence: number }> {
  logger.info("Starting Nifty 50 comprehensive analysis refresh");
  const snapshot = await gatherNiftySnapshot();
  logger.info({ sessionStatus: snapshot.sessionStatus.status, dayOpen: snapshot.dayOpen, dayHigh: snapshot.dayHigh, dayLow: snapshot.dayLow, dayClose: snapshot.dayClose, prevDayClose: snapshot.prevDayClose }, "Nifty session data gathered");
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
  logger.info({ sessionStatus: snapshot.sessionStatus.status, dayOpen: snapshot.dayOpen, dayHigh: snapshot.dayHigh, dayLow: snapshot.dayLow, todayBars5mCount: snapshot.todayBars5m.length }, "Nifty session data for 30m analysis");
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
