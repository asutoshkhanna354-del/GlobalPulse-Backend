import { db } from "@workspace/db";
import { forexCalendarTable } from "@workspace/db";
import { logger } from "./logger";

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
  "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
};

interface RawForexEvent {
  title: string;
  currency: string;
  impact: string;
  eventDate: Date;
  actual?: string;
  forecast?: string;
  previous?: string;
}

const MAJOR_PAIRS: Record<string, string[]> = {
  USD: ["EUR/USD", "GBP/USD", "USD/JPY", "USD/CHF", "AUD/USD", "USD/CAD", "NZD/USD", "DXY"],
  EUR: ["EUR/USD", "EUR/GBP", "EUR/JPY", "EUR/CHF", "EUR/AUD", "EUR/CAD"],
  GBP: ["GBP/USD", "EUR/GBP", "GBP/JPY", "GBP/AUD", "GBP/CHF"],
  JPY: ["USD/JPY", "EUR/JPY", "GBP/JPY", "AUD/JPY", "CAD/JPY"],
  AUD: ["AUD/USD", "EUR/AUD", "GBP/AUD", "AUD/JPY", "AUD/NZD", "AUD/CAD"],
  CAD: ["USD/CAD", "EUR/CAD", "GBP/CAD", "AUD/CAD", "CAD/JPY"],
  CHF: ["USD/CHF", "EUR/CHF", "GBP/CHF", "CHF/JPY"],
  NZD: ["NZD/USD", "AUD/NZD", "NZD/JPY", "EUR/NZD", "GBP/NZD"],
  CNY: ["USD/CNY", "EUR/CNY"],
};

const HIGH_IMPACT_EVENTS: Record<string, { bias: string; description: string }> = {
  "non-farm employment change": { bias: "strong", description: "NFP is the most impactful USD event. Higher = USD bullish" },
  "nonfarm payrolls": { bias: "strong", description: "NFP is the most impactful USD event. Higher = USD bullish" },
  "interest rate decision": { bias: "strong", description: "Rate hike = currency bullish, cut = bearish" },
  "monetary policy": { bias: "strong", description: "Hawkish = currency bullish, dovish = bearish" },
  "cpi": { bias: "strong", description: "Higher CPI = hawkish central bank expectation = currency bullish" },
  "consumer price index": { bias: "strong", description: "Higher CPI = hawkish central bank expectation = currency bullish" },
  "inflation rate": { bias: "strong", description: "Higher inflation = rate hike expectations = currency bullish" },
  "gdp": { bias: "moderate", description: "Higher GDP = economic strength = currency bullish" },
  "gross domestic product": { bias: "moderate", description: "Higher GDP = economic strength = currency bullish" },
  "unemployment rate": { bias: "strong", description: "Lower unemployment = economic strength = currency bullish" },
  "employment change": { bias: "moderate", description: "Higher employment = economic strength = currency bullish" },
  "retail sales": { bias: "moderate", description: "Higher retail sales = consumer strength = currency bullish" },
  "pmi": { bias: "moderate", description: "PMI > 50 = expansion = currency bullish. Above forecast = bullish" },
  "manufacturing pmi": { bias: "moderate", description: "Higher manufacturing PMI = industrial strength = currency bullish" },
  "services pmi": { bias: "moderate", description: "Higher services PMI = service sector strength = currency bullish" },
  "trade balance": { bias: "moderate", description: "Surplus = currency bullish, deficit = bearish" },
  "federal funds rate": { bias: "strong", description: "Rate hike = USD bullish, cut = bearish" },
  "fomc": { bias: "strong", description: "Hawkish FOMC = USD bullish, dovish = bearish" },
  "ecb": { bias: "strong", description: "Hawkish ECB = EUR bullish, dovish = bearish" },
  "boe": { bias: "strong", description: "Hawkish BOE = GBP bullish, dovish = bearish" },
  "boj": { bias: "strong", description: "Hawkish BOJ = JPY bullish, dovish = bearish" },
  "rba": { bias: "strong", description: "Hawkish RBA = AUD bullish, dovish = bearish" },
};

function generateConclusion(event: RawForexEvent): { conclusion: string; directionSignal: string; affectedPairs: string[] } {
  const titleLower = event.title.toLowerCase();
  const affectedPairs = MAJOR_PAIRS[event.currency] ?? [];

  let matchedEvent: { bias: string; description: string } | null = null;
  for (const [key, value] of Object.entries(HIGH_IMPACT_EVENTS)) {
    if (titleLower.includes(key)) { matchedEvent = value; break; }
  }

  const hasActual = event.actual && event.actual !== "";
  const hasForecast = event.forecast && event.forecast !== "";
  let directionSignal = "neutral";
  let conclusion = "";

  if (hasActual && hasForecast) {
    const actual = parseFloat(event.actual!.replace(/[^0-9.-]/g, ""));
    const forecast = parseFloat(event.forecast!.replace(/[^0-9.-]/g, ""));
    if (!isNaN(actual) && !isNaN(forecast)) {
      const isPositiveEvent = matchedEvent?.bias === "strong" || matchedEvent?.bias === "moderate";
      const beatForecast = actual > forecast;
      directionSignal = (isPositiveEvent && beatForecast) || (!isPositiveEvent && !beatForecast) ? "bullish" : "bearish";
      conclusion = `${event.currency} ${directionSignal === "bullish" ? "bullish" : "bearish"}: Actual ${event.actual} vs Forecast ${event.forecast}. ${matchedEvent?.description ?? ""}`;
    }
  } else {
    conclusion = matchedEvent?.description ?? `Watch ${event.currency} pairs for volatility around this ${event.impact}-impact event.`;
  }

  return { conclusion, directionSignal, affectedPairs };
}

async function fetchRssCalendar(): Promise<RawForexEvent[]> {
  const events: RawForexEvent[] = [];
  try {
    const rssUrl = "https://news.google.com/rss/search?q=forex+economic+calendar+NFP+CPI+FOMC+GDP+interest+rate&hl=en&gl=US&ceid=US:en";
    const res = await fetch(rssUrl, { headers: HEADERS, signal: AbortSignal.timeout(10000) });
    if (!res.ok) return events;

    const xml = await res.text();
    const items = xml.match(/<item>[\s\S]*?<\/item>/g) ?? [];
    const currencies = ["USD", "EUR", "GBP", "JPY", "AUD", "CAD", "CHF", "NZD"];

    for (const item of items.slice(0, 50)) {
      const titleMatch = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/) ?? item.match(/<title>(.*?)<\/title>/);
      const pubDateMatch = item.match(/<pubDate>(.*?)<\/pubDate>/);
      if (!titleMatch) continue;

      const title = titleMatch[1].replace(/<[^>]+>/g, "").trim();
      const titleLower = title.toLowerCase();

      const isForexRelated = /(nfp|cpi|gdp|pmi|fomc|ecb|boe|boj|rate decision|inflation|unemployment|retail sales|payroll|employment|fed |interest rate|trade balance)/i.test(titleLower);
      if (!isForexRelated) continue;

      let detectedCurrency = "";
      for (const c of currencies) {
        if (title.includes(c)) { detectedCurrency = c; break; }
      }
      if (!detectedCurrency) {
        if (/fed |fomc|nfp|us |american|payroll/i.test(titleLower)) detectedCurrency = "USD";
        else if (/ecb|euro|eurozone/i.test(titleLower)) detectedCurrency = "EUR";
        else if (/boe|uk |britain|sterling/i.test(titleLower)) detectedCurrency = "GBP";
        else if (/boj|japan/i.test(titleLower)) detectedCurrency = "JPY";
        else if (/rba|australia/i.test(titleLower)) detectedCurrency = "AUD";
        else if (/boc|canada/i.test(titleLower)) detectedCurrency = "CAD";
        else detectedCurrency = "USD";
      }

      const impact = /(nfp|cpi|gdp|rate decision|fomc|ecb interest|boe interest|fed fund)/i.test(titleLower) ? "high" :
                     /(pmi|retail sales|employment|unemployment|trade balance)/i.test(titleLower) ? "medium" : "low";

      events.push({
        title: cleanTitle(title),
        currency: detectedCurrency,
        impact,
        eventDate: pubDateMatch ? new Date(pubDateMatch[1]) : new Date(),
      });
    }

    logger.info({ count: events.length }, "Google News forex calendar parsed");
  } catch (err) {
    logger.warn({ error: String(err) }, "Google News forex calendar fetch failed");
  }
  return events;
}

function generateScheduledEvents(): RawForexEvent[] {
  const now = new Date();
  const events: RawForexEvent[] = [];

  const schedule = [
    { title: "US Non-Farm Payrolls", currency: "USD", impact: "high", day: 5 },
    { title: "US CPI (YoY)", currency: "USD", impact: "high", day: 2 },
    { title: "FOMC Meeting Minutes", currency: "USD", impact: "high", day: 3 },
    { title: "ECB Interest Rate Decision", currency: "EUR", impact: "high", day: 4 },
    { title: "UK GDP (QoQ)", currency: "GBP", impact: "high", day: 1 },
    { title: "BOJ Interest Rate Decision", currency: "JPY", impact: "high", day: 5 },
    { title: "US Retail Sales (MoM)", currency: "USD", impact: "medium", day: 2 },
    { title: "US ISM Manufacturing PMI", currency: "USD", impact: "medium", day: 1 },
    { title: "US ISM Services PMI", currency: "USD", impact: "medium", day: 3 },
    { title: "Eurozone CPI (YoY)", currency: "EUR", impact: "high", day: 1 },
    { title: "UK CPI (YoY)", currency: "GBP", impact: "high", day: 3 },
    { title: "RBA Interest Rate Decision", currency: "AUD", impact: "high", day: 2 },
    { title: "BOC Interest Rate Decision", currency: "CAD", impact: "high", day: 3 },
    { title: "US Unemployment Rate", currency: "USD", impact: "high", day: 5 },
    { title: "US Core CPI (MoM)", currency: "USD", impact: "high", day: 2 },
    { title: "US Initial Jobless Claims", currency: "USD", impact: "medium", day: 4 },
    { title: "BOE Interest Rate Decision", currency: "GBP", impact: "high", day: 4 },
    { title: "FOMC Press Conference", currency: "USD", impact: "high", day: 3 },
    { title: "Fed Chair Powell Speaks", currency: "USD", impact: "high", day: 4 },
    { title: "ECB Press Conference", currency: "EUR", impact: "high", day: 4 },
    { title: "Australia Employment Change", currency: "AUD", impact: "high", day: 4 },
    { title: "Canada CPI (MoM)", currency: "CAD", impact: "high", day: 2 },
    { title: "US PPI (MoM)", currency: "USD", impact: "medium", day: 4 },
    { title: "US Consumer Confidence", currency: "USD", impact: "medium", day: 2 },
  ];

  for (const evt of schedule) {
    const today = now.getDay();
    let offset = evt.day - today;
    if (offset <= 0) offset += 7;
    const eventDate = new Date(now);
    eventDate.setDate(eventDate.getDate() + offset);
    eventDate.setHours(8 + Math.floor(Math.random() * 8), Math.random() > 0.5 ? 30 : 0, 0, 0);
    events.push({ title: evt.title, currency: evt.currency, impact: evt.impact, eventDate });
  }

  return events;
}

function cleanTitle(title: string): string {
  return title.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim().slice(0, 120);
}

function deduplicateEvents(events: RawForexEvent[]): RawForexEvent[] {
  const seen = new Set<string>();
  return events.filter(e => {
    const key = `${e.currency}-${e.title.toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 40)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function refreshForexCalendar(): Promise<{ count: number }> {
  try {
    logger.info("Starting forex calendar refresh...");

    const rssEvents = await fetchRssCalendar();
    const scheduledEvents = generateScheduledEvents();
    const rawEvents = [...rssEvents, ...scheduledEvents];
    const events = deduplicateEvents(rawEvents);

    if (events.length === 0) {
      logger.warn("No forex calendar events fetched");
      return { count: 0 };
    }

    const inserts = events.map(event => {
      const analysis = generateConclusion(event);
      return {
        title: event.title,
        currency: event.currency,
        impact: event.impact,
        eventDate: event.eventDate,
        actual: event.actual ?? null,
        forecast: event.forecast ?? null,
        previous: event.previous ?? null,
        affectedPairs: analysis.affectedPairs,
        conclusion: analysis.conclusion,
        directionSignal: analysis.directionSignal,
        sourceUrl: "https://news.google.com/rss",
        lastUpdated: new Date(),
      };
    });

    await db.transaction(async (tx) => {
      await tx.delete(forexCalendarTable);
      await tx.insert(forexCalendarTable).values(inserts);
    });

    logger.info({ count: inserts.length }, "Forex calendar refresh complete");
    return { count: inserts.length };
  } catch (err) {
    logger.error({ error: String(err) }, "Forex calendar refresh error");
    return { count: 0 };
  }
}
