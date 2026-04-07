import { Router } from "express";
import { db, pushSubscriptionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getVapidPublicKey } from "../lib/pushNotification.js";
import { logger } from "../lib/logger.js";

const router = Router();

router.get("/vapid-public-key", (_req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    res.status(503).json({ error: "Push notifications not configured" });
    return;
  }
  res.json({ publicKey: key });
});

router.post("/subscribe", async (req, res) => {
  try {
    const { subscription, symbol, symbolLabel, browserFingerprint } = req.body;

    if (
      !subscription?.endpoint ||
      !subscription?.keys?.p256dh ||
      !subscription?.keys?.auth ||
      !symbol ||
      !symbolLabel ||
      !browserFingerprint
    ) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    const existing = await db
      .select()
      .from(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.browserFingerprint, browserFingerprint),
          eq(pushSubscriptionsTable.symbol, symbol),
        ),
      );

    if (existing.length > 0) {
      await db
        .update(pushSubscriptionsTable)
        .set({
          endpoint: subscription.endpoint,
          p256dhKey: subscription.keys.p256dh,
          authKey: subscription.keys.auth,
        })
        .where(
          and(
            eq(pushSubscriptionsTable.browserFingerprint, browserFingerprint),
            eq(pushSubscriptionsTable.symbol, symbol),
          ),
        );
    } else {
      await db.insert(pushSubscriptionsTable).values({
        endpoint: subscription.endpoint,
        p256dhKey: subscription.keys.p256dh,
        authKey: subscription.keys.auth,
        symbol,
        symbolLabel,
        browserFingerprint,
      });
    }

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error subscribing to push notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.delete("/unsubscribe", async (req, res) => {
  try {
    const { symbol, browserFingerprint } = req.body;

    if (!symbol || !browserFingerprint) {
      res.status(400).json({ error: "Missing required fields" });
      return;
    }

    await db
      .delete(pushSubscriptionsTable)
      .where(
        and(
          eq(pushSubscriptionsTable.browserFingerprint, browserFingerprint),
          eq(pushSubscriptionsTable.symbol, symbol),
        ),
      );

    res.json({ success: true });
  } catch (err) {
    logger.error({ err }, "Error unsubscribing from push notifications");
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/subscriptions", async (req, res) => {
  try {
    const { fingerprint } = req.query;

    if (!fingerprint || typeof fingerprint !== "string") {
      res.status(400).json({ error: "Missing fingerprint" });
      return;
    }

    const subs = await db
      .select({
        symbol: pushSubscriptionsTable.symbol,
        symbolLabel: pushSubscriptionsTable.symbolLabel,
        createdAt: pushSubscriptionsTable.createdAt,
      })
      .from(pushSubscriptionsTable)
      .where(eq(pushSubscriptionsTable.browserFingerprint, fingerprint));

    res.json(subs);
  } catch (err) {
    logger.error({ err }, "Error fetching push subscriptions");
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
