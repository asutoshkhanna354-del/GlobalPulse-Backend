import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { ipoListingsTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/ipo", async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;

  const results = status
    ? await db.select().from(ipoListingsTable).where(eq(ipoListingsTable.status, status)).orderBy(desc(ipoListingsTable.lastUpdated))
    : await db.select().from(ipoListingsTable).orderBy(desc(ipoListingsTable.lastUpdated));

  res.json(results);
});

router.get("/ipo/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [ipo] = await db.select().from(ipoListingsTable).where(eq(ipoListingsTable.id, id));
  if (!ipo) {
    res.status(404).json({ error: "IPO not found" });
    return;
  }

  res.json(ipo);
});

export default router;
