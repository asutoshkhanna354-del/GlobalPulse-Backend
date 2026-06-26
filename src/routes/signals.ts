import { Router } from "express";
import { getActiveSignals, generateNiftySignal } from "../lib/signalEngine.js";
import { requireAuth, optionalAuth } from "../lib/authMiddleware.js";
import { logger } from "../lib/logger.js";
import { db } from "@workspace/db";
import { subscriptionsTable } from "@workspace/db";
import { eq, and, gt } from "drizzle-orm";

const router = Router();

// GET /api/signals
router.get("/", optionalAuth, async (req, res) => {
  try {
    const signals = getActiveSignals();
    
    let hasPlan = false;
    if (req.userId) {
      const now = new Date();
      const [sub] = await db
        .select()
        .from(subscriptionsTable)
        .where(
          and(
            eq(subscriptionsTable.userId, req.userId),
            eq(subscriptionsTable.status, "active"),
            gt(subscriptionsTable.endDate, now)
          )
        )
        .limit(1);
      
      if (sub && sub.planName !== "free") {
        hasPlan = true;
      }
    }

    if (hasPlan) {
      res.json(signals);
    } else {
      // Mask signals for free users
      const masked = signals.map(s => ({
        ...s,
        entryPrice: 0,
        target1: 0,
        target2: 0,
        stopLoss: 0,
        reasoning: "Premium intelligence locked. Upgrade to Pro to view exact entry, target, and stop loss zones."
      }));
      res.json(masked);
    }
  } catch (error) {
    logger.error({ error }, "Error fetching signals");
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/signals/generate (Admin only in real app, mocked here)
router.post("/generate", async (req, res) => {
  try {
    const { currentPrice, vix, rsi } = req.body;
    const signal = await generateNiftySignal(
      currentPrice || 24200, 
      vix || 14, 
      rsi || 50
    );
    res.json(signal);
  } catch (error) {
    logger.error({ error }, "Error generating signal");
    res.status(500).json({ error: "Failed to generate signal" });
  }
});

export default router;
