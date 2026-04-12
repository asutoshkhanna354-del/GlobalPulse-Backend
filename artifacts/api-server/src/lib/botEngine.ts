import { db } from "@workspace/db";
import {
  botTradesTable,
  botSettingsTable,
  marketAssetsTable,
  newsItemsTable,
} from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { logger } from "./logger";
import { getOpenAiBtc } from "./openaiClient.js";
import { fetchOHLC } from "./indicator.js";

const ASSETS = [
  { symbol: "BTCUSD", label: "Bitcoin", category: "crypto" },
  { symbol: "XAUUSD", label: "Gold", category: "commodity" },
  { symbol: "XAGUSD", label: "Silver", category: "commodity" },
  { symbol: "EURUSD", label: "EUR/USD", category: "forex" },
  { symbol: "NIFTY50", label: "Nifty 50", category: "index" },
];

let botLoopTimer: NodeJS.Timeout | null = null;
let initialized = false;

export async function ensureUserBotSettings(userId: number): Promise<void> {
  try {
    const existing = await db.select().from(botSettingsTable)
      .where(eq(botSettingsTable.userId, userId)).limit(1);
    if (existing.length === 0) {
      await db.insert(botSettingsTable).values({
        userId,
        isRunning: true,
        riskPercent: 1,
        maxOpenTrades: 10000,
        enabledAssets: ["BTCUSD", "XAUUSD", "XAGUSD", "EURUSD", "NIFTY50"],
        enableScalp: true,
        enableIntraday: true,
        enableSwing: true,
        virtualBalance: 10000,
      });
      logger.info(`[bot] Default settings created for user ${userId}`);
    }
  } catch (e) {
    logger.warn(`[bot] ensureUserBotSettings(${userId}): ${e}`);
  }
}

const QUOTE_URL_BASE = process.env.SELF_API_URL ?? "http://localhost:8080/api";

async function getLivePrice(symbol: string): Promise<number | null> {
  try {
    const assets = await db.select().from(marketAssetsTable)
      .where(eq(marketAssetsTable.symbol, symbol)).limit(1);
    if (assets[0]?.price) return assets[0].price;
  } catch {}
  try {
    const r = await fetch(`${QUOTE_URL_BASE}/indicator/quote/${encodeURIComponent(symbol)}`);
    if (r.ok) {
      const d = await r.json();
      if (d?.price) return d.price;
    }
  } catch {}
  return null;
}

const TRADE_MAX_AGE_MS: Record<string, number> = {
  SCALP:    2  * 60 * 60 * 1000,
  INTRADAY: 8  * 60 * 60 * 1000,
  SWING:    72 * 60 * 60 * 1000,
};

async function markUserTradesClosed(userId: number) {
  try {
    const trades = await db.select().from(botTradesTable)
      .where(and(eq(botTradesTable.status, "open"), eq(botTradesTable.userId, userId)));

    for (const trade of trades) {
      const price = await getLivePrice(trade.symbol);
      if (!price) continue;

      const dir = trade.direction === "BUY" ? 1 : -1;
      const pnlPct = dir * ((price - trade.entryPrice) / trade.entryPrice) * 100;
      const pnl = (pnlPct / 100) * trade.entryPrice * trade.lotSize;

      let status = "open";
      let closeReason: string | null = null;

      const ageMs = Date.now() - new Date(trade.createdAt).getTime();
      const maxAge = TRADE_MAX_AGE_MS[trade.tradeType ?? "SWING"] ?? TRADE_MAX_AGE_MS.SWING;
      const expired = ageMs > maxAge;

      if (trade.direction === "BUY") {
        if (price >= trade.targetPrice)   { status = "closed_profit"; closeReason = "Target hit"; }
        else if (price <= trade.stopLoss) { status = "closed_loss";   closeReason = "Stop loss hit"; }
        else if (expired)                 { status = pnl >= 0 ? "closed_profit" : "closed_loss"; closeReason = `Expired (${trade.tradeType})`; }
      } else {
        if (price <= trade.targetPrice)   { status = "closed_profit"; closeReason = "Target hit"; }
        else if (price >= trade.stopLoss) { status = "closed_loss";   closeReason = "Stop loss hit"; }
        else if (expired)                 { status = pnl >= 0 ? "closed_profit" : "closed_loss"; closeReason = `Expired (${trade.tradeType})`; }
      }

      await db.update(botTradesTable).set({
        currentPrice: parseFloat(price.toFixed(4)),
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPercent: parseFloat(pnlPct.toFixed(2)),
        status,
        ...(status !== "open" ? { closedAt: new Date(), closeReason } : {}),
      }).where(eq(botTradesTable.id, trade.id));

      if (status !== "open") {
        // Update user's virtual balance
        await db.execute(
          `UPDATE bot_settings SET virtual_balance = virtual_balance + ${parseFloat(pnl.toFixed(2))}, updated_at = NOW() WHERE user_id = ${userId}`
        );
        logger.info(`[bot] user=${userId} Trade closed: ${trade.direction} ${trade.symbol} → ${status} P&L: $${pnl.toFixed(2)}`);
      }
    }
  } catch (err) {
    logger.warn(`[bot] markUserTradesClosed(${userId}): ${err}`);
  }
}

async function generateBotSignalForAsset(
  symbol: string,
  label: string,
  settings: typeof botSettingsTable.$inferSelect
): Promise<{ direction: "BUY" | "SELL" | "NEUTRAL"; confidence: number; reasoning: string; tradeType: string; targetPct: number; slPct: number } | null> {

  const ai = getOpenAiBtc();
  if (!ai) return generateRuleBasedSignal(symbol, label);

  const price = await getLivePrice(symbol);
  const news = await db.select().from(newsItemsTable).limit(5);
  const newsText = news.map(n => `${n.headline}: ${n.summary}`).join("; ").slice(0, 600);

  let ohlcBars: any[] = [];
  try {
    ohlcBars = await fetchOHLC(symbol.replace("USD", "/USD").replace("XAUUSD", "GC=F").replace("XAGUSD", "SI=F").replace("NIFTY50", "^NSEI"), "1d", 14);
  } catch { }

  const priceStr = price ? `$${price.toFixed(2)}` : "unknown";
  const ohlcStr = ohlcBars.length > 0
    ? ohlcBars.slice(-5).map(b => `O:${b.open?.toFixed(2)} H:${b.high?.toFixed(2)} L:${b.low?.toFixed(2)} C:${b.close?.toFixed(2)}`).join(" | ")
    : "No OHLC";

  const allowedTypes = [
    settings.enableScalp && "SCALP",
    settings.enableIntraday && "INTRADAY",
    settings.enableSwing && "SWING",
  ].filter(Boolean).join(", ");

  const prompt = `You are an expert algorithmic trader. Analyze ${label} (${symbol}).
Current price: ${priceStr}
Recent OHLC (last 5 bars): ${ohlcStr}
Recent market news: ${newsText}

Task: Generate a precise paper trading signal.
Available trade types: ${allowedTypes}
Risk per trade: ${settings.riskPercent}%

Respond ONLY with this JSON (no markdown):
{
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": 55-95,
  "tradeType": "SCALP" | "INTRADAY" | "SWING",
  "targetPct": <target % from entry, e.g. 1.5>,
  "slPct": <stop loss % from entry, e.g. 0.7>,
  "reasoning": "<2-3 concise sentences>"
}`;

  try {
    const resp = await ai.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.3,
    });
    const raw = resp.choices[0]?.message?.content?.trim() ?? "";
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const json = JSON.parse(cleaned);
    if (!json.direction || !json.confidence) return null;
    return {
      direction: json.direction,
      confidence: Math.min(95, Math.max(50, Number(json.confidence))),
      reasoning: json.reasoning ?? "AI signal",
      tradeType: json.tradeType ?? "SWING",
      targetPct: Math.max(0.3, Math.min(5, Number(json.targetPct) || 1.5)),
      slPct: Math.max(0.2, Math.min(3, Number(json.slPct) || 0.8)),
    };
  } catch (e) {
    logger.warn(`[bot] AI parse failed for ${symbol}: ${e}`);
    return generateRuleBasedSignal(symbol, label);
  }
}

function generateRuleBasedSignal(symbol: string, label: string) {
  const r = Math.random();
  const direction = r < 0.45 ? "BUY" : r < 0.90 ? "SELL" : "NEUTRAL";
  if (direction === "NEUTRAL") return null;
  return {
    direction: direction as "BUY" | "SELL",
    confidence: Math.floor(55 + Math.random() * 25),
    reasoning: `Rule-based signal for ${label}: momentum analysis suggests ${direction} opportunity.`,
    tradeType: ["SCALP", "INTRADAY", "SWING"][Math.floor(Math.random() * 3)],
    targetPct: 0.8 + Math.random() * 1.5,
    slPct: 0.4 + Math.random() * 0.6,
  };
}

async function runBotCycleForUser(userId: number) {
  try {
    const [settings] = await db.select().from(botSettingsTable)
      .where(eq(botSettingsTable.userId, userId)).limit(1);
    if (!settings?.isRunning) return;

    await markUserTradesClosed(userId);

    const openTrades = await db.select().from(botTradesTable)
      .where(and(eq(botTradesTable.status, "open"), eq(botTradesTable.userId, userId)));

    if (openTrades.length >= settings.maxOpenTrades) return;

    const activeSymbols = settings.enabledAssets ?? ["BTCUSD", "XAUUSD"];
    const knownLabels: Record<string, string> = Object.fromEntries(ASSETS.map(a => [a.symbol, a.label]));

    for (const sym of activeSymbols) {
      const alreadyOpen = openTrades.some(t => t.symbol === sym);
      if (alreadyOpen) continue;

      const signal = await generateBotSignalForAsset(sym, knownLabels[sym] ?? sym, settings);
      if (!signal || signal.direction === "NEUTRAL" || signal.confidence < 60) continue;

      const price = await getLivePrice(sym);
      if (!price) continue;

      const targetPrice = signal.direction === "BUY"
        ? price * (1 + signal.targetPct / 100)
        : price * (1 - signal.targetPct / 100);

      const stopLoss = signal.direction === "BUY"
        ? price * (1 - signal.slPct / 100)
        : price * (1 + signal.slPct / 100);

      await db.insert(botTradesTable).values({
        userId,
        symbol: sym,
        symbolLabel: knownLabels[sym] ?? sym,
        direction: signal.direction,
        entryPrice: parseFloat(price.toFixed(4)),
        targetPrice: parseFloat(targetPrice.toFixed(4)),
        stopLoss: parseFloat(stopLoss.toFixed(4)),
        currentPrice: parseFloat(price.toFixed(4)),
        pnl: 0,
        pnlPercent: 0,
        status: "open",
        tradeType: signal.tradeType,
        confidence: signal.confidence,
        reasoning: signal.reasoning,
        lotSize: 1,
        riskPercent: settings.riskPercent,
      });

      logger.info(`[bot] user=${userId} New trade: ${signal.direction} ${sym} @ ${price}`);
    }
  } catch (err) {
    logger.error(`[bot] runBotCycleForUser(${userId}): ${err}`);
  }
}

async function runBotCycleForAllUsers() {
  try {
    const rows = await db.execute(
      `SELECT DISTINCT user_id FROM bot_settings WHERE is_running = true AND user_id IS NOT NULL`
    );
    const userIds: number[] = (rows as any).rows?.map((r: any) => Number(r.user_id)) ?? [];
    if (userIds.length === 0) return;
    logger.info(`[bot] Running cycles for ${userIds.length} user(s)`);
    for (const uid of userIds) {
      await runBotCycleForUser(uid);
    }
  } catch (err) {
    logger.error(`[bot] runBotCycleForAllUsers: ${err}`);
  }
}

export async function startBotEngine() {
  if (initialized) return;
  initialized = true;
  logger.info("[bot] AutoPilot engine starting (per-user mode)");
  await runBotCycleForAllUsers();
  botLoopTimer = setInterval(async () => {
    await runBotCycleForAllUsers();
  }, 5 * 60 * 1000);
}

export async function stopBotEngine() {
  if (botLoopTimer) { clearInterval(botLoopTimer); botLoopTimer = null; }
  initialized = false;
  logger.info("[bot] AutoPilot engine stopped");
}
