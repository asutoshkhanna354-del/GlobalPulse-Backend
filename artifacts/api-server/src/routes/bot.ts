import { Router } from "express";
import { db } from "@workspace/db";
import { botTradesTable, botSettingsTable } from "@workspace/db";
import { eq, desc, and, ne } from "drizzle-orm";
import { requireAuth } from "../lib/authMiddleware";
import { ensureUserBotSettings } from "../lib/botEngine";
import { logger } from "../lib/logger";

const router = Router();

router.get("/bot/trades", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const trades = await db.select().from(botTradesTable)
      .where(eq(botTradesTable.userId, userId))
      .orderBy(desc(botTradesTable.createdAt)).limit(100);
    res.json({ trades });
  } catch (err) {
    logger.error(`[bot/trades] ${err}`);
    res.status(500).json({ error: "Failed to fetch trades" });
  }
});

router.get("/bot/stats", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const allTrades = await db.select().from(botTradesTable)
      .where(eq(botTradesTable.userId, userId))
      .orderBy(desc(botTradesTable.createdAt)).limit(200);

    const closed = allTrades.filter(t => t.status !== "open");
    const open = allTrades.filter(t => t.status === "open");
    const wins = closed.filter(t => t.status === "closed_profit");
    const losses = closed.filter(t => t.status === "closed_loss");

    const totalPnl = closed.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const unrealizedPnl = open.reduce((sum, t) => sum + (t.pnl ?? 0), 0);
    const winRate = closed.length > 0 ? Math.round((wins.length / closed.length) * 100) : 0;
    const avgConfidence = allTrades.length > 0
      ? Math.round(allTrades.reduce((s, t) => s + t.confidence, 0) / allTrades.length)
      : 0;

    const [settings] = await db.select().from(botSettingsTable)
      .where(eq(botSettingsTable.userId, userId)).limit(1);

    res.json({
      openTrades: open.length,
      closedTrades: closed.length,
      winRate,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
      wins: wins.length,
      losses: losses.length,
      avgConfidence,
      isRunning: settings?.isRunning ?? true,
      virtualBalance: settings?.virtualBalance ?? 10000,
    });
  } catch (err) {
    logger.error(`[bot/stats] ${err}`);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/bot/settings", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    await ensureUserBotSettings(userId);
    const [row] = await db.select().from(botSettingsTable)
      .where(eq(botSettingsTable.userId, userId)).limit(1);
    res.json(row ?? {
      isRunning: true, riskPercent: 1, maxOpenTrades: 10000,
      enabledAssets: ["BTCUSD", "XAUUSD", "XAGUSD", "EURUSD", "NIFTY50"],
      enableScalp: true, enableIntraday: true, enableSwing: true, virtualBalance: 10000,
    });
  } catch (err) {
    logger.error(`[bot/settings] ${err}`);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.patch("/bot/settings", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    await ensureUserBotSettings(userId);
    const [existing] = await db.select().from(botSettingsTable)
      .where(eq(botSettingsTable.userId, userId)).limit(1);

    const { userId: _u, id: _i, ...safeBody } = req.body;
    if (existing) {
      await db.update(botSettingsTable)
        .set({ ...safeBody, updatedAt: new Date() })
        .where(eq(botSettingsTable.id, existing.id));
    } else {
      await db.insert(botSettingsTable).values({ ...safeBody, userId, updatedAt: new Date() });
    }
    const [updated] = await db.select().from(botSettingsTable)
      .where(eq(botSettingsTable.userId, userId)).limit(1);
    res.json(updated);
  } catch (err) {
    logger.error(`[bot/settings PATCH] ${err}`);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.post("/bot/toggle", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    await ensureUserBotSettings(userId);
    const [current] = await db.select().from(botSettingsTable)
      .where(eq(botSettingsTable.userId, userId)).limit(1);
    if (!current) return res.status(404).json({ error: "Settings not found" });
    const newState = !current.isRunning;
    await db.update(botSettingsTable)
      .set({ isRunning: newState, updatedAt: new Date() })
      .where(eq(botSettingsTable.id, current.id));
    res.json({ isRunning: newState });
  } catch (err) {
    logger.error(`[bot/toggle] ${err}`);
    res.status(500).json({ error: "Failed to toggle bot" });
  }
});

router.delete("/bot/trades", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    await db.delete(botTradesTable)
      .where(and(eq(botTradesTable.userId, userId), ne(botTradesTable.status, "open")));
    res.json({ success: true });
  } catch (err) {
    logger.error(`[bot/trades DELETE] ${err}`);
    res.status(500).json({ error: "Failed to clear history" });
  }
});

router.patch("/bot/trades/:id/close", requireAuth, async (req, res) => {
  try {
    const userId = req.userId!;
    const id = parseInt(req.params.id);
    if (isNaN(id)) return res.status(400).json({ error: "Invalid trade id" });

    const [trade] = await db.select().from(botTradesTable)
      .where(and(eq(botTradesTable.id, id), eq(botTradesTable.userId, userId)));
    if (!trade) return res.status(404).json({ error: "Trade not found" });
    if (trade.status !== "open") return res.status(400).json({ error: "Trade already closed" });

    const currentPrice = typeof req.body.currentPrice === "number"
      ? req.body.currentPrice : trade.currentPrice ?? trade.entryPrice;
    const pnl = trade.direction === "BUY"
      ? (currentPrice - trade.entryPrice) * (trade.lotSize ?? 1)
      : (trade.entryPrice - currentPrice) * (trade.lotSize ?? 1);
    const pnlPercent = ((currentPrice - trade.entryPrice) / trade.entryPrice) * 100 * (trade.direction === "BUY" ? 1 : -1);
    const status = pnl >= 0 ? "closed_profit" : "closed_loss";

    const [updated] = await db.update(botTradesTable).set({
      status,
      pnl: parseFloat(pnl.toFixed(2)),
      pnlPercent: parseFloat(pnlPercent.toFixed(2)),
      currentPrice: parseFloat(currentPrice.toFixed(4)),
      closedAt: new Date(),
      closeReason: req.body.reason || "Manual close",
    }).where(eq(botTradesTable.id, id)).returning();

    // Update virtual balance
    await db.execute(
      `UPDATE bot_settings SET virtual_balance = virtual_balance + ${parseFloat(pnl.toFixed(2))}, updated_at = NOW() WHERE user_id = ${userId}`
    );

    res.json({ success: true, trade: updated });
  } catch (err) {
    logger.error(`[bot/trades CLOSE] ${err}`);
    res.status(500).json({ error: "Failed to close trade" });
  }
});

export default router;
