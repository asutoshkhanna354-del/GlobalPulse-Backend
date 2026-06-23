import { Router } from "express";
import { getActiveSignals, generateNiftySignal } from "../lib/signalEngine.js";
import { requireAuth } from "../lib/authMiddleware.js";
import { logger } from "../lib/logger.js";

const router = Router();

// GET /api/signals
router.get("/", (req, res) => {
  try {
    const signals = getActiveSignals();
    res.json(signals);
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
