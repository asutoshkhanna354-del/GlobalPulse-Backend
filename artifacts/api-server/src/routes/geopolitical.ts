import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import { geopoliticalEventsTable } from "@workspace/db";
import {
  GetGeopoliticalEventsQueryParams,
  GetGeopoliticalEventsResponse,
  GetGeopoliticalHeatmapResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/geopolitical", async (req, res): Promise<void> => {
  const parsed = GetGeopoliticalEventsQueryParams.safeParse(req.query);
  const { severity, region } = parsed.success ? parsed.data : { severity: undefined, region: undefined };

  let events = await db.select().from(geopoliticalEventsTable);

  if (severity) {
    events = events.filter(e => e.severity === severity);
  }
  if (region) {
    events = events.filter(e => e.region.toLowerCase().includes(region.toLowerCase()));
  }

  const mapped = events.map(e => ({
    ...e,
    affectedMarkets: e.affectedMarkets ?? [],
    marketConclusion: e.marketConclusion ?? "",
    sources: e.sources ?? [],
    lastUpdated: e.lastUpdated ? e.lastUpdated.toISOString() : new Date().toISOString(),
  }));

  res.json(GetGeopoliticalEventsResponse.parse(mapped));
});

router.get("/geopolitical/heatmap", async (_req, res): Promise<void> => {
  const events = await db.select().from(geopoliticalEventsTable);

  const riskMap: Record<string, { score: number; level: string; primaryRisk: string; hasConflict: boolean }> = {};

  for (const event of events) {
    for (const country of event.countries) {
      if (!riskMap[country]) {
        riskMap[country] = { score: 0, level: "low", primaryRisk: "None", hasConflict: false };
      }
      const scoreDelta = event.severity === "critical" ? 90 : event.severity === "high" ? 70 : event.severity === "medium" ? 45 : 20;
      riskMap[country].score = Math.max(riskMap[country].score, scoreDelta);
      riskMap[country].primaryRisk = event.type;
      riskMap[country].hasConflict = event.type === "war" || event.type === "conflict";
    }
  }

  const countryCodeMap: Record<string, string> = {
    "Russia": "RU", "Ukraine": "UA", "United States": "US", "China": "CN",
    "Taiwan": "TW", "Israel": "IL", "Palestine": "PS", "Iran": "IR",
    "Yemen": "YE", "Saudi Arabia": "SA", "North Korea": "KP", "South Korea": "KR",
    "Germany": "DE", "France": "FR", "United Kingdom": "GB", "Japan": "JP",
    "India": "IN", "Pakistan": "PK", "Turkey": "TR", "Syria": "SY",
    "Lebanon": "LB", "Sudan": "SD", "Ethiopia": "ET", "Venezuela": "VE",
    "Myanmar": "MM", "Afghanistan": "AF",
  };

  const heatmapData = Object.entries(riskMap).map(([country, risk]) => ({
    countryCode: countryCodeMap[country] ?? "XX",
    country,
    riskScore: risk.score,
    riskLevel: risk.score >= 80 ? "extreme" : risk.score >= 60 ? "high" : risk.score >= 40 ? "elevated" : risk.score >= 20 ? "moderate" : "low",
    primaryRisk: risk.primaryRisk,
    hasActiveConflict: risk.hasConflict,
  }));

  res.json(GetGeopoliticalHeatmapResponse.parse(heatmapData));
});

export default router;
