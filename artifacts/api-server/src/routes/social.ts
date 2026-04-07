import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { socialPostsTable } from "@workspace/db";
import { desc, eq } from "drizzle-orm";
import { refreshSocialIfStale } from "../lib/socialRefresh.js";

const router: IRouter = Router();

router.get("/social", async (req, res): Promise<void> => {
  refreshSocialIfStale().catch(() => {});

  const category = req.query.category as string | undefined;
  const limit = Math.min(Number(req.query.limit) || 40, 80);

  let posts = await db
    .select()
    .from(socialPostsTable)
    .orderBy(desc(socialPostsTable.publishedAt));

  if (category && category !== "all") {
    posts = posts.filter(p => p.category === category);
  }

  res.json(posts.slice(0, limit).map(p => ({
    ...p,
    publishedAt: p.publishedAt.toISOString(),
  })));
});

router.post("/social/refresh", async (_req, res): Promise<void> => {
  const result = await refreshSocialIfStale(true);
  res.json(result);
});

export default router;
