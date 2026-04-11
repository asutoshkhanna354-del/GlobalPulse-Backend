import { Router } from "express";
import { getAllCandles, getCandles } from "../lib/nseStream.js";
import type { CandleTimeframe } from "../lib/nseStream.js";

const router = Router();

// GET /api/nse/candles — all live candles across all symbols and timeframes
router.get("/nse/candles", (_req, res) => {
  res.json({ candles: getAllCandles() });
});

// GET /api/nse/candles/:symbol/:timeframe — single candle for a symbol
router.get("/nse/candles/:symbol/:timeframe", (req, res) => {
  const { symbol, timeframe } = req.params;
  const valid: CandleTimeframe[] = ["1s", "5s", "1m"];
  if (!valid.includes(timeframe as CandleTimeframe)) {
    return res.status(400).json({ error: "timeframe must be 1s, 5s, or 1m" });
  }
  const candle = getCandles(symbol.toUpperCase(), timeframe as CandleTimeframe);
  if (!candle) return res.status(404).json({ error: "No candle data yet for this symbol" });
  return res.json({ candle });
});

export default router;
