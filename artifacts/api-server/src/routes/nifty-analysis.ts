import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { niftyAnalysisTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";

const router: IRouter = Router();

router.get("/nifty-analysis", async (_req, res): Promise<void> => {
  const [comprehensive] = await db
    .select()
    .from(niftyAnalysisTable)
    .where(eq(niftyAnalysisTable.analysisType, "comprehensive"))
    .orderBy(desc(niftyAnalysisTable.createdAt))
    .limit(1);

  const [candle30m] = await db
    .select()
    .from(niftyAnalysisTable)
    .where(eq(niftyAnalysisTable.analysisType, "candle_30m"))
    .orderBy(desc(niftyAnalysisTable.createdAt))
    .limit(1);

  res.json({
    comprehensive: comprehensive ?? null,
    candle30m: candle30m ?? null,
  });
});

router.get("/nifty-analysis/history", async (req, res): Promise<void> => {
  const rawType = (req.query.type as string) || "comprehensive";
  const type = ["comprehensive", "candle_30m"].includes(rawType) ? rawType : "comprehensive";
  const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 20));

  const records = await db
    .select()
    .from(niftyAnalysisTable)
    .where(eq(niftyAnalysisTable.analysisType, type))
    .orderBy(desc(niftyAnalysisTable.createdAt))
    .limit(limit);

  res.json(records);
});

export default router;
