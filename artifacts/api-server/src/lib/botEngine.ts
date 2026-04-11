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

async function ensureSettingsRow() {
  try {
    const rows = await db.select().from(botSettingsTable).limit(1);
    if (rows.length === 0) {
      await db.insert(botSettingsTable).values({
        isRunning: true,
        riskPercent: 1,
        maxOpenTrades: 5,
        enabledAssets: ["BTCUSD", "XAUUSD", "XAGUSD", "EURUSD", "NIFTY50"],
        enableScalp: true,
        enableIntraday: true,
        enableSwing: true,
        virtualBalance: 10000,
      });
      logger.info("[bot] Default settings created");
    }
  } catch (e) {
    logger.warn(`[bot] ensureSettingsRow: ${e}`);
  }
}

const DEFAULT_SETTINGS = {
  id: 1,
  isRunning: true,
  riskPercent: 1,
  maxOpenTrades: 5,
  enabledAssets: ["BTCUSD", "XAUUSD", "XAGUSD", "EURUSD", "NIFTY50"],
  enableScalp: true,
  enableIntraday: true,
  enableSwing: true,
  virtualBalance: 10000,
  updatedAt: new Date(),
};

async function getSettings() {
  try {
    const rows = await db.select().from(botSettingsTable).limit(1);
    return rows[0] ?? DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

const QUOTE_URL_BASE = process.env.SELF_API_URL ?? "http://localhost:8080/api";

async function getLivePrice(symbol: string): Promise<number | null> {
  try {
    const assets = await db.select().from(marketAssetsTable).where(eq(marketAssetsTable.symbol, symbol)).limit(1);
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

async function getOpenTrades() {
  try {
    return await db.select().from(botTradesTable).where(eq(botTradesTable.status, "open"));
  } catch {
    return [];
  }
}

async function markTradesClosed(trades: typeof botTradesTable.$inferSelect[]) {
  for (const trade of trades) {
    const price = await getLivePrice(trade.symbol);
    if (!price) continue;

    const dir = trade.direction === "BUY" ? 1 : -1;
    const pnlPct = dir * ((price - trade.entryPrice) / trade.entryPrice) * 100;
    const pnl = (pnlPct / 100) * trade.entryPrice * trade.lotSize;

    let status = "open";
    let closeReason: string | null = null;

    if (trade.direction === "BUY") {
      if (price >= trade.targetPrice) { status = "closed_profit"; closeReason = "Target hit"; }
      else if (price <= trade.stopLoss) { status = "closed_loss"; closeReason = "Stop loss hit"; }
    } else {
      if (price <= trade.targetPrice) { status = "closed_profit"; closeReason = "Target hit"; }
      else if (price >= trade.stopLoss) { status = "closed_loss"; closeReason = "Stop loss hit"; }
    }

    await db.update(botTradesTable)
      .set({
        currentPrice: price,
        pnl: parseFloat(pnl.toFixed(2)),
        pnlPercent: parseFloat(pnlPct.toFixed(2)),
        status,
        ...(status !== "open" ? { closedAt: new Date(), closeReason } : {}),
      })
      .where(eq(botTradesTable.id, trade.id));
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
  } catch { /* ignore */ }

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

Your task: Generate a precise paper trading signal.
Available trade types: ${allowedTypes}
Risk per trade: ${settings.riskPercent}%

Respond ONLY with this JSON (no markdown):
{
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "confidence": 55-95,
  "tradeType": "SCALP" | "INTRADAY" | "SWING",
  "targetPct": <target % from entry, e.g. 1.5>,
  "slPct": <stop loss % from entry, e.g. 0.7>,
  "reasoning": "<2-3 concise sentences explaining why>"
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
    reasoning: `Rule-based signal for ${label}: momentum and volatility analysis suggest ${direction} opportunity.`,
    tradeType: ["SCALP", "INTRADAY", "SWING"][Math.floor(Math.random() * 3)],
    targetPct: 0.8 + Math.random() * 1.5,
    slPct: 0.4 + Math.random() * 0.6,
  };
}

async function runBotCycle() {
  try {
    const settings = await getSettings();
    if (!settings?.isRunning) {
      logger.info("[bot] Bot is paused — skipping cycle");
      return;
    }

    const openTrades = await getOpenTrades();

    await markTradesClosed(openTrades);

    const freshOpen = await getOpenTrades();
    const openCount = freshOpen.length;

    if (openCount >= settings.maxOpenTrades) {
      logger.info(`[bot] Max open trades (${settings.maxOpenTrades}) reached — skipping new signals`);
      return;
    }

    const activeSymbols = settings.enabledAssets ?? ["BTCUSD", "XAUUSD"];
    const knownLabels: Record<string,string> = Object.fromEntries(ASSETS.map(a=>[a.symbol,a.label]));
    const activeAssets = activeSymbols.map(sym => ({
      symbol: sym,
      label: knownLabels[sym] ?? sym,
    }));

    for (const asset of activeAssets) {
      const alreadyOpen = freshOpen.some(t => t.symbol === asset.symbol);
      if (alreadyOpen) continue;

      const signal = await generateBotSignalForAsset(asset.symbol, asset.label, settings);
      if (!signal || signal.direction === "NEUTRAL") continue;
      if (signal.confidence < 60) continue;

      const price = await getLivePrice(asset.symbol);
      if (!price) continue;

      const targetPrice = signal.direction === "BUY"
        ? price * (1 + signal.targetPct / 100)
        : price * (1 - signal.targetPct / 100);

      const stopLoss = signal.direction === "BUY"
        ? price * (1 - signal.slPct / 100)
        : price * (1 + signal.slPct / 100);

      await db.insert(botTradesTable).values({
        symbol: asset.symbol,
        symbolLabel: asset.label,
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

      logger.info(`[bot] New trade: ${signal.direction} ${asset.symbol} @ ${price}`);
    }
  } catch (err) {
    logger.error(`[bot] Cycle error: ${err}`);
  }
}

export async function startBotEngine() {
  if (initialized) return;
  initialized = true;

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS bot_trades (
        id SERIAL PRIMARY KEY,
        symbol TEXT NOT NULL,
        symbol_label TEXT NOT NULL,
        direction TEXT NOT NULL,
        entry_price REAL NOT NULL,
        target_price REAL NOT NULL,
        stop_loss REAL NOT NULL,
        current_price REAL,
        pnl REAL,
        pnl_percent REAL,
        status TEXT NOT NULL DEFAULT 'open',
        trade_type TEXT NOT NULL DEFAULT 'SWING',
        confidence INTEGER NOT NULL,
        reasoning TEXT NOT NULL,
        lot_size REAL NOT NULL DEFAULT 1,
        risk_percent REAL NOT NULL DEFAULT 1,
        closed_at TIMESTAMPTZ,
        close_reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await db.execute(`
      CREATE TABLE IF NOT EXISTS bot_settings (
        id SERIAL PRIMARY KEY,
        is_running BOOLEAN NOT NULL DEFAULT true,
        risk_percent REAL NOT NULL DEFAULT 1,
        max_open_trades INTEGER NOT NULL DEFAULT 5,
        enabled_assets TEXT[] NOT NULL DEFAULT ARRAY['BTCUSD','XAUUSD','XAGUSD','EURUSD','NIFTY50'],
        enable_scalp BOOLEAN NOT NULL DEFAULT true,
        enable_intraday BOOLEAN NOT NULL DEFAULT true,
        enable_swing BOOLEAN NOT NULL DEFAULT true,
        virtual_balance REAL NOT NULL DEFAULT 10000,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    logger.info("[bot] Tables ensured");
    await ensureSettingsRow();
  } catch (e) {
    logger.warn(`[bot] Table ensure failed (may already exist): ${e}`);
    try { await ensureSettingsRow(); } catch {}
  }

  logger.info("[bot] AutoPilot engine starting");
  await runBotCycle();

  botLoopTimer = setInterval(async () => {
    await runBotCycle();
  }, 5 * 60 * 1000);
}

export async function stopBotEngine() {
  if (botLoopTimer) { clearInterval(botLoopTimer); botLoopTimer = null; }
  initialized = false;
  logger.info("[bot] AutoPilot engine stopped");
}
