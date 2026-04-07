import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { usdSignalsTable } from "@workspace/db";
import { desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/usd-signal", async (_req, res): Promise<void> => {
  const [latest] = await db
    .select()
    .from(usdSignalsTable)
    .orderBy(desc(usdSignalsTable.createdAt))
    .limit(1);

  if (!latest) {
    res.json({
      direction: "NEUTRAL",
      confidence: 50,
      summary: "Generating initial signal... Please wait for next refresh cycle.",
      factors: [],
      dxyValue: null,
      goldPrice: null,
      oilPrice: null,
      vixValue: null,
      fedSignal: "neutral",
      geopoliticalRisk: "moderate",
      nextUpdate: new Date(Date.now() + 4 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });
    return;
  }

  res.json(latest);
});

router.get("/usd-signal/history", async (_req, res): Promise<void> => {
  const signals = await db
    .select()
    .from(usdSignalsTable)
    .orderBy(desc(usdSignalsTable.createdAt))
    .limit(24);

  res.json(signals);
});

export default router;
