import { Router } from "express";
import { db } from "@workspace/db";
import { brokerConnectionsTable, botTradesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { placeOrder, verifyBrokerConnection } from "../lib/brokerEngine";
import { logger } from "../lib/logger";

const router = Router();

router.get("/broker/connections", async (_req, res) => {
  try {
    const rows = await db.select().from(brokerConnectionsTable).orderBy(brokerConnectionsTable.connectedAt);
    const safe = rows.map(r => ({
      id: r.id,
      broker: r.broker,
      label: r.label,
      environment: r.environment,
      isActive: r.isActive,
      connectedAt: r.connectedAt,
      apiKeyHint: r.apiKey.slice(0, 6) + "****",
    }));
    res.json({ connections: safe });
  } catch (err) {
    logger.error({ err }, "Failed to list broker connections");
    res.status(500).json({ error: "Failed to list connections" });
  }
});

router.post("/broker/connect", async (req, res) => {
  try {
    const { broker, label, apiKey, apiSecret, accessToken, accountId, environment } = req.body;
    if (!broker || !apiKey) return res.status(400).json({ error: "broker and apiKey are required" });

    const [conn] = await db.insert(brokerConnectionsTable).values({
      broker,
      label: label || broker,
      apiKey,
      apiSecret: apiSecret || null,
      accessToken: accessToken || null,
      accountId: accountId || null,
      environment: environment || "paper",
      isActive: true,
    }).returning();

    const verify = await verifyBrokerConnection(conn);
    if (!verify.valid) {
      await db.delete(brokerConnectionsTable).where(eq(brokerConnectionsTable.id, conn.id));
      return res.status(400).json({ error: verify.message });
    }

    res.json({
      success: true,
      connection: { id: conn.id, broker: conn.broker, label: conn.label, environment: conn.environment },
      accountInfo: verify.accountInfo,
    });
  } catch (err) {
    logger.error({ err }, "Failed to connect broker");
    res.status(500).json({ error: "Failed to connect broker" });
  }
});

router.delete("/broker/connections/:id", async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    await db.delete(brokerConnectionsTable).where(eq(brokerConnectionsTable.id, id));
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to remove connection" });
  }
});

router.get("/broker/connections/order-list", async (_req, res) => {
  try {
    const rows = await db.select({
      id: brokerConnectionsTable.id,
      broker: brokerConnectionsTable.broker,
      label: brokerConnectionsTable.label,
      environment: brokerConnectionsTable.environment,
    }).from(brokerConnectionsTable).where(eq(brokerConnectionsTable.isActive, true));
    res.json({ connections: rows });
  } catch {
    res.json({ connections: [] });
  }
});

router.post("/broker/order", async (req, res) => {
  try {
    const { brokerId, symbol, symbolLabel, direction, quantity, price, orderType, tradeType, stopLossPercent, targetPercent } = req.body;

    const slPct = parseFloat(stopLossPercent ?? 2);
    const tpPct = parseFloat(targetPercent ?? 4);
    const qty = parseFloat(quantity ?? 1);

    const sl = direction === "BUY"
      ? price * (1 - slPct / 100)
      : price * (1 + slPct / 100);
    const tp = direction === "BUY"
      ? price * (1 + tpPct / 100)
      : price * (1 - tpPct / 100);

    if (!brokerId || brokerId === "paper") {
      const [trade] = await db.insert(botTradesTable).values({
        symbol,
        symbolLabel: symbolLabel || symbol,
        direction,
        entryPrice: parseFloat(price.toFixed(4)),
        targetPrice: parseFloat(tp.toFixed(4)),
        stopLoss: parseFloat(sl.toFixed(4)),
        currentPrice: parseFloat(price.toFixed(4)),
        pnl: 0,
        pnlPercent: 0,
        status: "open",
        tradeType: tradeType || "INTRADAY",
        confidence: 80,
        reasoning: `Manual ${direction} trade via chart button`,
        lotSize: qty,
        riskPercent: slPct,
      }).returning();

      return res.json({ success: true, mode: "paper", trade, message: `Paper ${direction} trade placed for ${symbol}` });
    }

    const result = await placeOrder({
      brokerId: parseInt(brokerId),
      symbol,
      direction,
      quantity: qty,
      price,
      orderType: orderType || "MARKET",
    });

    res.json({ ...result, mode: "live" });
  } catch (err) {
    logger.error({ err }, "Order placement failed");
    res.status(500).json({ error: "Order placement failed" });
  }
});

export default router;
