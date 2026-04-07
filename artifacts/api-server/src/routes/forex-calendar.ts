import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { forexCalendarTable } from "@workspace/db";
import { eq, desc, gte, asc } from "drizzle-orm";

const router: IRouter = Router();

router.get("/forex-calendar", async (req, res): Promise<void> => {
  const currency = req.query.currency as string | undefined;
  const impact = req.query.impact as string | undefined;

  let results;
  if (currency) {
    results = await db.select().from(forexCalendarTable)
      .where(eq(forexCalendarTable.currency, currency.toUpperCase()))
      .orderBy(asc(forexCalendarTable.eventDate));
  } else {
    results = await db.select().from(forexCalendarTable)
      .orderBy(asc(forexCalendarTable.eventDate));
  }

  if (impact) {
    results = results.filter(r => r.impact === impact);
  }

  res.json(results);
});

export default router;
