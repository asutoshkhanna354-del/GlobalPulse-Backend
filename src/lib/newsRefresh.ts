import { XMLParser } from "fast-xml-parser";
import { db } from "@workspace/db";
import { newsItemsTable } from "@workspace/db";
import { lt } from "drizzle-orm";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

interface RawRSSItem {
  title: string;
  description: string;
  pubDate: string | null;
  source: string;
}

const RSS_FEEDS = [
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC Business" },
  { url: "https://feeds.marketwatch.com/marketwatch/marketpulse/", source: "MarketWatch" },
  { url: "https://www.cnbc.com/id/15839135/device/rss/rss.html", source: "CNBC Markets" },
  { url: "https://www.cnbc.com/id/10000664/device/rss/rss.html", source: "CNBC Finance" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC World Economy" },
  { url: "https://finance.yahoo.com/rss/topfinstories", source: "Yahoo Finance News" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", source: "Wall Street Journal Markets" },
  { url: "https://economictimes.indiatimes.com/markets/rssfeeds/1977021501.cms", source: "Economic Times" },
  { url: "https://feeds.feedburner.com/ndtvprofit-latest", source: "NDTV Profit" },
  { url: "https://www.investing.com/rss/news.rss", source: "Investing.com" },
];

const PERSONAL_FINANCE_PATTERNS = /\b(ira|401k|mortgage|retire|shoveling|sidewalk|social security|inheritance|estate planning|personal finance|budget tips|debt advice|savings account|credit card tips|life insurance)\b/i;

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—")
    .replace(/&ndash;/g, "–")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&ldquo;/g, "\u201C")
    .replace(/&rdquo;/g, "\u201D");
}

function stripHtml(html: string): string {
  return decodeHtmlEntities((html || "").replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1").replace(/<[^>]*>/g, "")).trim();
}

function classifyCategory(text: string): string {
  const t = text.toLowerCase();
  if (/bitcoin|ethereum|crypto|blockchain|defi|web3|nft|token|binance|coinbase|solana|altcoin/i.test(t)) return "crypto";
  if (/federal reserve|fed |ecb|bank of japan|boj|rate hike|rate cut|fomc|monetary policy|powell|lagarde|central bank|interest rate/i.test(t)) return "central-banks";
  if (/\boil\b|crude|brent|opec|\bgold\b|\bsilver\b|\bcopper\b|\bwheat\b|commodity|commodities|natural gas|lng/i.test(t)) return "commodities";
  if (/\bwar\b|conflict|sanction|military|nato|geopolit|russia|ukraine|israel|hamas|iran|taiwan|south china sea|missiles|troops|offensive/i.test(t)) return "geopolitical";
  if (/earnings|revenue|profit|quarterly result|annual result|\beps\b|guidance|beat estimates|q[1-4] result/i.test(t)) return "earnings";
  if (/tariff|trade war|import duty|export ban|wto|bilateral trade|trade deal|trade deficit/i.test(t)) return "trade";
  if (/forex|currency|dollar|euro|yen|rupee|yuan|pound|exchange rate|fx market/i.test(t)) return "currencies";
  return "macro";
}

function classifySentiment(text: string): string {
  const t = text.toLowerCase();
  const bearPatterns = /\bfall\b|\bdrop\b|\bdecline\b|\bcrash\b|\bplunge\b|\btumble\b|sell.?off|\bbear\b|\bfear\b|\bloss\b|\bshrink\b|\bcontract\b|\brecession\b|\bslump\b|\bweak\b|\bworsen/g;
  const bullPatterns = /\brise\b|\bsurge\b|\brally\b|\bgain\b|\bgrowth\b|\bbull\b|\bsoar\b|\bboom\b|record high|\bstrong\b|\bbeat\b|\bpositive\b|\brobust\b|\brebound\b|\brecovery\b/g;
  const bearCount = (t.match(bearPatterns) || []).length;
  const bullCount = (t.match(bullPatterns) || []).length;
  if (bullCount > bearCount + 1) return "bullish";
  if (bearCount > bullCount + 1) return "bearish";
  return "neutral";
}

function classifyImpact(text: string): string {
  const t = text.toLowerCase();
  if (/crash|surge|record|historic|unprecedented|massive|crisis|shock|emergency|major|significant|collapse/i.test(t)) return "high";
  if (/slight|minor|modest|small change|marginal/i.test(t)) return "low";
  return "medium";
}

function inferAffectedAssets(text: string): string[] {
  const t = text.toLowerCase();
  const assets: Set<string> = new Set();
  if (/s&p 500|spx|us equit|wall street/i.test(t)) { assets.add("SPX"); assets.add("NDX"); }
  if (/nasdaq/i.test(t)) assets.add("NDX");
  if (/dow jones|djia/i.test(t)) assets.add("DJI");
  if (/bitcoin|\bbtc\b/i.test(t)) assets.add("BTCUSD");
  if (/ethereum|\beth\b/i.test(t)) assets.add("ETHUSD");
  if (/solana|\bsol\b/i.test(t)) assets.add("SOLUSD");
  if (/gold|xau/i.test(t)) assets.add("XAUUSD");
  if (/crude oil|brent|\bwti\b/i.test(t)) { assets.add("USOIL"); assets.add("BRENT"); }
  if (/opec/i.test(t)) { assets.add("USOIL"); assets.add("BRENT"); }
  if (/euro|eur.usd|\beur\b/i.test(t)) assets.add("EURUSD");
  if (/yen|jpy|japan/i.test(t)) { assets.add("USDJPY"); assets.add("N225"); }
  if (/india|nifty|sensex|\binr\b|rupee/i.test(t)) { assets.add("NIFTY50"); assets.add("SENSEX"); }
  if (/china|yuan|\bcny\b|hong kong|hsi|shanghai/i.test(t)) { assets.add("SSEC"); assets.add("HSI"); }
  if (/treasury|10.year bond|\byield\b/i.test(t)) assets.add("US10Y");
  if (/dollar index|\bdxy\b/i.test(t)) assets.add("DXY");
  if (/vix|volatility index/i.test(t)) assets.add("VIX");
  if (/\bcopper\b/i.test(t)) assets.add("COPPER");
  if (/\bwheat\b|\bgrain\b/i.test(t)) assets.add("WHEAT");
  if (/natural gas/i.test(t)) assets.add("NATGAS");
  if (/\bdax\b|germany|german economy/i.test(t)) assets.add("DAX");
  if (/ftse|british market|london stock/i.test(t)) assets.add("FTSE");
  if (/cac 40|\bcac40\b|french market/i.test(t)) assets.add("CAC40");
  if (/silver|\bxag\b/i.test(t)) assets.add("SILVER");
  return [...assets];
}

function inferRegion(text: string): string | null {
  const t = text.toLowerCase();
  if (/india|nifty|sensex|mumbai|rbi|sebi|ndtv|economic times/i.test(t)) return "Asia-Pacific";
  if (/china|beijing|shanghai|hong kong|pbc|yuan/i.test(t)) return "Asia-Pacific";
  if (/japan|tokyo|nikkei|boj/i.test(t)) return "Asia-Pacific";
  if (/australia|asx|sydney/i.test(t)) return "Asia-Pacific";
  if (/europe|ecb|germany|france|\buk\b|britain|eurozone|\beu\b/i.test(t)) return "Europe";
  if (/russia|ukraine|eastern europe/i.test(t)) return "Eastern Europe";
  if (/middle east|israel|iran|saudi|gulf|opec/i.test(t)) return "Middle East";
  if (/africa|nigeria|kenya|south africa/i.test(t)) return "Africa";
  if (/latin america|brazil|mexico|argentina/i.test(t)) return "Latin America";
  if (/fed |us |america|wall street|nasdaq|s&p|treasury|washington|dollar/i.test(t)) return "North America";
  return null;
}

function inferMarketConclusion(text: string, sentiment: string, category: string): string {
  const t = text.toLowerCase();
  if (category === "crypto") {
    if (sentiment === "bullish") return "Crypto risk-on. BTC/ETH momentum favors longs. Watch for ETF inflow acceleration.";
    if (sentiment === "bearish") return "Crypto risk-off. Reduce leverage. Monitor BTC support levels for re-entry.";
    return "Mixed crypto signals. Range-bound action expected. Await breakout direction.";
  }
  if (category === "central-banks") {
    if (/rate cut|dovish|easing/i.test(t)) return "Rate cut expectations bullish for equities and bonds. USD weakens. Gold supportive.";
    if (/rate hike|hawkish|tighten|higher.for.longer/i.test(t)) return "Higher-for-longer rates pressure equities. USD strengthens. Bonds sell off. EM currencies at risk.";
    return "Central bank uncertainty — await next data print. Neutral equity stance.";
  }
  if (category === "commodities") {
    if (/oil|crude|brent/i.test(t) && sentiment === "bullish") return "Bullish oil. Energy equities benefit. Watch inflationary impact on rate expectations.";
    if (/oil|crude|brent/i.test(t) && sentiment === "bearish") return "Oil weakness eases inflation. Bullish for bonds. Bearish for energy stocks.";
    if (/gold|silver/i.test(t) && sentiment === "bullish") return "Safe haven demand rising. Bullish gold and silver. Dollar may soften.";
    if (/copper/i.test(t)) return "Copper is a growth barometer. Direction signals global demand outlook.";
    return "Commodity market moving — monitor supply-demand dynamics and inflation implications.";
  }
  if (category === "geopolitical") {
    return "Risk-off environment. Safe haven flows to gold, USD, and bonds. Reduce equity exposure in affected regions.";
  }
  if (category === "earnings") {
    if (sentiment === "bullish") return "Strong earnings support sector re-rating. Broad market positive signal.";
    if (sentiment === "bearish") return "Earnings miss raises recession concerns. Sector rotation to defensives advised.";
    return "Earnings in line — minimal market catalyst. Guidance key for next move.";
  }
  if (category === "trade") {
    if (/tariff|trade war/i.test(t)) return "Trade tensions bearish for global equities. Safe haven demand. Supply chains at risk.";
    return "Trade developments impact export-oriented sectors. Monitor currency moves.";
  }
  if (category === "macro") {
    if (sentiment === "bullish") return "Positive macro data supports risk-on posture. Equities and growth assets favored.";
    if (sentiment === "bearish") return "Weak macro data — defensive rotation advisable. Monitor central bank response.";
    return "Neutral macro backdrop. Stay positioned per prevailing trend.";
  }
  return "Monitor developments. Assess position sizing based on evolving risk landscape.";
}

async function fetchFeed(url: string, sourceName: string): Promise<RawRSSItem[]> {
  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
        "Accept": "application/xml, text/xml, */*",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!response.ok) return [];
    const text = await response.text();
    const parsed = parser.parse(text);
    const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
    const itemArr: any[] = Array.isArray(items) ? items : [items];

    return itemArr.slice(0, 10).map((item: any) => ({
      title: stripHtml(
        typeof item.title === "object" ? (item.title?.["#text"] ?? "") : (item.title ?? "")
      ),
      description: stripHtml(
        typeof item.description === "object"
          ? (item.description?.["#text"] ?? "")
          : (item.description ?? item.summary?.["#text"] ?? item.summary ?? "")
      ),
      pubDate: item.pubDate ?? item.updated ?? item.published ?? null,
      source: sourceName,
    }));
  } catch {
    return [];
  }
}

let lastRefresh = 0;
const REFRESH_INTERVAL_MS = 60 * 1000;

export async function refreshNewsIfStale(force = false): Promise<{ refreshed: boolean; count: number }> {
  if (!force && Date.now() - lastRefresh < REFRESH_INTERVAL_MS) {
    return { refreshed: false, count: 0 };
  }
  lastRefresh = Date.now();

  try {
    const allRaw: RawRSSItem[] = [];
    const results = await Promise.allSettled(RSS_FEEDS.map(f => fetchFeed(f.url, f.source)));
    for (const r of results) {
      if (r.status === "fulfilled") allRaw.push(...r.value);
    }

    const validItems = allRaw.filter(item =>
      item.title.length > 10 && !PERSONAL_FINANCE_PATTERNS.test(item.title)
    );
    if (validItems.length === 0) return { refreshed: false, count: 0 };

    if (force) {
      await db.delete(newsItemsTable);
    } else {
      const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
      await db.delete(newsItemsTable).where(lt(newsItemsTable.publishedAt, cutoff));
    }

    const seen = new Set<string>();
    const freshItems = validItems.filter(item => {
      const key = item.title.slice(0, 80).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).map(item => {
      const combined = `${item.title} ${item.description}`;
      const category = classifyCategory(combined);
      const sentiment = classifySentiment(combined);
      const impact = classifyImpact(combined);
      const affectedAssets = inferAffectedAssets(combined);
      const region = inferRegion(combined);
      const rawDate = item.pubDate ? new Date(item.pubDate) : new Date();
      const publishedAt = isNaN(rawDate.getTime()) ? new Date() : rawDate;
      const ageMs = Date.now() - publishedAt.getTime();
      const isBreaking = impact === "high" && ageMs < 4 * 60 * 60 * 1000;

      return {
        headline: item.title.slice(0, 300),
        summary: (item.description || item.title).slice(0, 600),
        source: item.source,
        category,
        impact,
        sentiment,
        region,
        affectedAssets,
        publishedAt,
        marketConclusion: inferMarketConclusion(combined, sentiment, category),
        isBreaking,
      };
    });

    if (freshItems.length > 0) {
      await db.insert(newsItemsTable).values(freshItems);
    }

    return { refreshed: true, count: freshItems.length };
  } catch (err) {
    console.error("[newsRefresh] Error:", err);
    return { refreshed: false, count: 0 };
  }
}
