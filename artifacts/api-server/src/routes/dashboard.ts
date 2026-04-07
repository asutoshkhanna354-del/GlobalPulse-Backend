import { Router, type IRouter } from "express";
import { db } from "@workspace/db";
import {
  marketAssetsTable,
  newsItemsTable,
  geopoliticalEventsTable,
} from "@workspace/db";
import { eq } from "drizzle-orm";
import {
  GetDashboardOverviewResponse,
  GetMarketSentimentResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/dashboard/overview", async (_req, res): Promise<void> => {
  const [assets, news, geoEvents] = await Promise.all([
    db.select().from(marketAssetsTable),
    db.select().from(newsItemsTable),
    db.select().from(geopoliticalEventsTable),
  ]);

  const breakingCount = news.filter(n => n.isBreaking).length;
  const highImpactNews = news.filter(n => n.impact === "high").length;
  const activeConflicts = geoEvents.filter(e => e.status === "active" || e.status === "escalating").length;

  const majorIndices = assets.filter(a => a.category === "indices");
  const up = majorIndices.filter(a => a.changePercent > 0).length;
  const down = majorIndices.filter(a => a.changePercent < 0).length;

  const avgChange = assets.reduce((s, a) => s + a.changePercent, 0) / (assets.length || 1);
  let sentiment = "neutral";
  if (avgChange > 0.5) sentiment = "bullish";
  else if (avgChange < -0.5) sentiment = "bearish";
  else if (assets.some(a => Math.abs(a.changePercent) > 2)) sentiment = "volatile";

  const criticalEvents = geoEvents.filter(e => e.severity === "critical");
  const topRiskRegion = criticalEvents[0]?.region ?? "Middle East";

  const bestAsset = [...assets].sort((a, b) => b.changePercent - a.changePercent)[0];
  const topOpportunityRegion = bestAsset?.country ?? "Asia-Pacific";

  const globalRiskScore = Math.min(100, Math.round(
    (activeConflicts * 8) +
    (highImpactNews * 4) +
    (criticalEvents.length * 12) +
    50
  ));

  const overview = {
    globalRiskScore: Math.min(globalRiskScore, 100),
    marketSentiment: sentiment,
    activeConflicts,
    highImpactEvents: highImpactNews,
    breakingNewsCount: breakingCount,
    majorMarketsUp: up,
    majorMarketsDown: down,
    topRiskRegion,
    topOpportunityRegion,
    keyConclusion: `Global markets showing ${sentiment} bias. ${activeConflicts} active geopolitical tensions with ${criticalEvents.length} critical situations. ${breakingCount} breaking developments require attention.`,
    updatedAt: new Date().toISOString(),
  };

  res.json(GetDashboardOverviewResponse.parse(overview));
});

router.get("/dashboard/sentiment", async (_req, res): Promise<void> => {
  const sentimentData = [
    { region: "North America", sentimentScore: 62, trend: "improving", riskLevel: "moderate", keyDriver: "Strong corporate earnings, Fed pivot expectations" },
    { region: "Europe", sentimentScore: 44, trend: "deteriorating", riskLevel: "elevated", keyDriver: "Energy costs, Ukraine war spillover, ECB policy" },
    { region: "Asia-Pacific", sentimentScore: 58, trend: "stable", riskLevel: "moderate", keyDriver: "China reopening, Japan monetary policy shifts" },
    { region: "Middle East", sentimentScore: 28, trend: "deteriorating", riskLevel: "high", keyDriver: "Regional conflicts, oil supply disruptions" },
    { region: "Latin America", sentimentScore: 41, trend: "stable", riskLevel: "elevated", keyDriver: "Currency volatility, political uncertainty" },
    { region: "Africa", sentimentScore: 35, trend: "stable", riskLevel: "elevated", keyDriver: "Debt crises, commodity dependency, political instability" },
    { region: "Eastern Europe", sentimentScore: 22, trend: "deteriorating", riskLevel: "extreme", keyDriver: "Active war zones, sanctions, supply chain disruption" },
  ];

  res.json(GetMarketSentimentResponse.parse(sentimentData));
});

export default router;
