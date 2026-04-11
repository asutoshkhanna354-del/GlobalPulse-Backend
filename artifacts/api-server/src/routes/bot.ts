import { Router } from "express";
import { db } from "@workspace/db";
import { botTradesTable, botSettingsTable } from "@workspace/db";
import { eq, desc, and, ne } from "drizzle-orm";
import { logger } from "../lib/logger";

const router = Router();

router.get("/bot/trades", async (_req, res) => {
  try {
    const trades = await db.select().from(botTradesTable).orderBy(desc(botTradesTable.createdAt)).limit(100);
    res.json({ trades });
  } catch (err) {
    logger.error(`[bot/trades] ${err}`);
    res.status(500).json({ error: "Failed to fetch trades" });
  }
});

router.get("/bot/stats", async (_req, res) => {
  try {
    const allTrades = await db.select().from(botTradesTable).orderBy(desc(botTradesTable.createdAt)).limit(200);

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

    const settings = await db.select().from(botSettingsTable).limit(1);

    res.json({
      openTrades: open.length,
      closedTrades: closed.length,
      winRate,
      totalPnl: parseFloat(totalPnl.toFixed(2)),
      unrealizedPnl: parseFloat(unrealizedPnl.toFixed(2)),
      wins: wins.length,
      losses: losses.length,
      avgConfidence,
      isRunning: settings[0]?.isRunning ?? true,
      virtualBalance: settings[0]?.virtualBalance ?? 10000,
    });
  } catch (err) {
    logger.error(`[bot/stats] ${err}`);
    res.status(500).json({ error: "Failed to fetch stats" });
  }
});

router.get("/bot/settings", async (_req, res) => {
  try {
    const rows = await db.select().from(botSettingsTable).limit(1);
    if (!rows[0]) return res.json({
      isRunning: true, riskPercent: 1, maxOpenTrades: 5,
      enabledAssets: ["BTCUSD", "XAUUSD", "XAGUSD", "EURUSD", "NIFTY50"],
      enableScalp: true, enableIntraday: true, enableSwing: true, virtualBalance: 10000,
    });
    res.json(rows[0]);
  } catch (err) {
    logger.error(`[bot/settings] ${err}`);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

router.patch("/bot/settings", async (req, res) => {
  try {
    const rows = await db.select().from(botSettingsTable).limit(1);
    if (!rows[0]) {
      await db.insert(botSettingsTable).values({ ...req.body, updatedAt: new Date() });
    } else {
      await db.update(botSettingsTable).set({ ...req.body, updatedAt: new Date() }).where(eq(botSettingsTable.id, rows[0].id));
    }
    const updated = await db.select().from(botSettingsTable).limit(1);
    res.json(updated[0]);
  } catch (err) {
    logger.error(`[bot/settings PATCH] ${err}`);
    res.status(500).json({ error: "Failed to update settings" });
  }
});

router.post("/bot/toggle", async (_req, res) => {
  try {
    const rows = await db.select().from(botSettingsTable).limit(1);
    const current = rows[0];
    if (!current) return res.status(404).json({ error: "Settings not found" });
    const newState = !current.isRunning;
    await db.update(botSettingsTable).set({ isRunning: newState, updatedAt: new Date() }).where(eq(botSettingsTable.id, current.id));
    res.json({ isRunning: newState });
  } catch (err) {
    logger.error(`[bot/toggle] ${err}`);
    res.status(500).json({ error: "Failed to toggle bot" });
  }
});

router.delete("/bot/trades", async (_req, res) => {
  try {
    await db.delete(botTradesTable).where(ne(botTradesTable.status, "open"));
    res.json({ success: true });
  } catch (err) {
    logger.error(`[bot/trades DELETE] ${err}`);
    res.status(500).json({ error: "Failed to clear history" });
  }
});

export default router;
