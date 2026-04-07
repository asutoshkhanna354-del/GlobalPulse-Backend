import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { bitcoinAnalysisTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/bitcoin-analysis", async (_req, res): Promise<void> => {
  const [comprehensive] = await db
    .select()
    .from(bitcoinAnalysisTable)
    .where(eq(bitcoinAnalysisTable.analysisType, "comprehensive"))
    .orderBy(desc(bitcoinAnalysisTable.createdAt))
    .limit(1);

  const [candle4h] = await db
    .select()
    .from(bitcoinAnalysisTable)
    .where(eq(bitcoinAnalysisTable.analysisType, "candle_4h"))
    .orderBy(desc(bitcoinAnalysisTable.createdAt))
    .limit(1);

  res.json({
    comprehensive: comprehensive ?? null,
    candle4h: candle4h ?? null,
  });
});

router.get("/bitcoin-analysis/history", async (req, res): Promise<void> => {
  const rawType = (req.query.type as string) || "comprehensive";
  const type = ["comprehensive", "candle_4h"].includes(rawType) ? rawType : "comprehensive";
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));

  const records = await db
    .select()
    .from(bitcoinAnalysisTable)
    .where(eq(bitcoinAnalysisTable.analysisType, type))
    .orderBy(desc(bitcoinAnalysisTable.createdAt))
    .limit(limit);

  res.json(records);
});

export default router;
