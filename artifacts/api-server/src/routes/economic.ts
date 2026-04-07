import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { economicIndicatorsTable, economicEventsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetEconomicIndicatorsQueryParams,
  GetEconomicIndicatorsResponse,
  GetEconomicCalendarResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/economic-indicators", async (req, res): Promise<void> => {
  const parsed = GetEconomicIndicatorsQueryParams.safeParse(req.query);
  const { country, indicator } = parsed.success ? parsed.data : { country: undefined, indicator: undefined };

  let indicators = await db.select().from(economicIndicatorsTable);

  if (country) {
    indicators = indicators.filter(i => i.country.toLowerCase() === country.toLowerCase() || i.countryCode.toLowerCase() === country.toLowerCase());
  }
  if (indicator) {
    indicators = indicators.filter(i => i.indicator === indicator);
  }

  res.json(GetEconomicIndicatorsResponse.parse(indicators.map(i => ({
    ...i,
    lastUpdated: i.lastUpdated.toISOString(),
  }))));
});

router.get("/economic-indicators/calendar", async (_req, res): Promise<void> => {
  const events = await db.select().from(economicEventsTable);

  res.json(GetEconomicCalendarResponse.parse(events.map(e => ({
    ...e,
    scheduledAt: e.scheduledAt.toISOString(),
  }))));
});

export default router;
