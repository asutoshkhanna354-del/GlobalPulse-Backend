import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { newsItemsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import {
  GetNewsQueryParams,
  GetNewsResponse,
  GetBreakingNewsResponse,
} from "@workspace/api-zod";
import { refreshNewsIfStale } from "../lib/newsRefresh.js";

const router: IRouter = Router();

router.get("/news", async (req, res): Promise<void> => {
  const parsed = GetNewsQueryParams.safeParse(req.query);
  const { category, impact, limit } = parsed.success ? parsed.data : { category: undefined, impact: undefined, limit: 30 };

  refreshNewsIfStale().catch(() => {});

  let items = await db.select().from(newsItemsTable).orderBy(desc(newsItemsTable.publishedAt));

  if (category && category !== "all") {
    items = items.filter(n => n.category === category);
  }
  if (impact) {
    items = items.filter(n => n.impact === impact);
  }

  const sliced = items.slice(0, limit ?? 30);

  const validCategories = ["macro", "geopolitical", "earnings", "central-banks", "commodities", "crypto"];
  res.json(GetNewsResponse.parse(sliced.map(n => ({
    ...n,
    category: validCategories.includes(n.category) ? n.category : "macro",
    publishedAt: n.publishedAt.toISOString(),
  }))));
});

router.get("/news/breaking", async (_req, res): Promise<void> => {
  const items = await db
    .select()
    .from(newsItemsTable)
    .where(eq(newsItemsTable.isBreaking, true))
    .orderBy(desc(newsItemsTable.publishedAt));

  const validCategories = ["macro", "geopolitical", "earnings", "central-banks", "commodities", "crypto"];
  res.json(GetBreakingNewsResponse.parse(items.map(n => ({
    ...n,
    category: validCategories.includes(n.category) ? n.category : "macro",
    publishedAt: n.publishedAt.toISOString(),
  }))));
});

router.post("/news/refresh", async (_req, res): Promise<void> => {
  const result = await refreshNewsIfStale(true);
  res.json(result);
});

export default router;
