import { XMLParser } from "fast-xml-parser";
import { db } from "@workspace/db";
import { socialPostsTable } from "@workspace/db";
import { lt } from "drizzle-orm";

const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });

interface Influencer {
  name: string;
  handle: string;
  platform: string;
  role: string;
  avatar: string;
  keywords: string[];
  marketAreas: string[];
  defaultAssets: string[];
}

const INFLUENCERS: Record<string, Influencer> = {
  trump: {
    name: "Donald Trump",
    handle: "@realDonaldTrump",
    platform: "Truth Social · X",
    role: "US President",
    avatar: "🇺🇸",
    keywords: ["trump", "president trump", "trump admin", "trump says", "white house tariff", "executive order", "trump signs", "mar-a-lago", "truth social", "trump tariff", "trump sanction"],
    marketAreas: ["USD", "Trade", "Equities", "Crypto", "Energy", "Bonds"],
    defaultAssets: ["DXY", "SPX", "USOIL", "XAUUSD"],
  },
  musk: {
    name: "Elon Musk",
    handle: "@elonmusk",
    platform: "X (Twitter)",
    role: "CEO Tesla/SpaceX · DOGE Dept",
    avatar: "⚡",
    keywords: ["elon musk", "elon ", "tesla ceo", "musk says", "musk tweets", "doge department", "spacex", "neuralink", "grok"],
    marketAreas: ["TSLA", "Bitcoin", "DOGE", "AI", "EV Sector"],
    defaultAssets: ["BTCUSD", "ETHUSD", "NDX"],
  },
  powell: {
    name: "Jerome Powell",
    handle: "@FederalReserve",
    platform: "Federal Reserve",
    role: "Fed Chair",
    avatar: "🏦",
    keywords: ["jerome powell", "powell ", "fed chair", "federal reserve", "fomc", "fed meeting", "fed rate", "fed decision", "central bank rate", "monetary policy committee"],
    marketAreas: ["USD", "Bonds", "Gold", "Equities", "Interest Rates"],
    defaultAssets: ["DXY", "US10Y", "XAUUSD", "SPX"],
  },
  yellen: {
    name: "Janet Yellen",
    handle: "@USTreasury",
    platform: "US Treasury",
    role: "US Treasury Secretary",
    avatar: "💵",
    keywords: ["janet yellen", "yellen ", "treasury secretary", "us treasury", "treasury department"],
    marketAreas: ["USD", "Bonds", "Fiscal Policy"],
    defaultAssets: ["DXY", "US10Y", "US2Y"],
  },
  buffett: {
    name: "Warren Buffett",
    handle: "@BerkshireHathaway",
    platform: "Berkshire / Press",
    role: "CEO Berkshire Hathaway",
    avatar: "💼",
    keywords: ["warren buffett", "buffett ", "berkshire hathaway", "oracle of omaha", "buffett buys", "buffett sells", "buffett warning"],
    marketAreas: ["Equities", "Value Stocks", "Banking", "Insurance"],
    defaultAssets: ["SPX", "DJI"],
  },
  saylor: {
    name: "Michael Saylor",
    handle: "@saylor",
    platform: "X (Twitter)",
    role: "Exec Chairman MicroStrategy",
    avatar: "₿",
    keywords: ["michael saylor", "saylor ", "microstrategy", "mstr bitcoin", "saylor buys"],
    marketAreas: ["Bitcoin", "Crypto"],
    defaultAssets: ["BTCUSD"],
  },
  wood: {
    name: "Cathie Wood",
    handle: "@CathieDWood",
    platform: "X (Twitter) · ARK Invest",
    role: "CEO ARK Invest",
    avatar: "🚀",
    keywords: ["cathie wood", "ark invest", "ark innovation", "arkk fund"],
    marketAreas: ["Tech", "AI", "Innovation", "EV", "Genomics"],
    defaultAssets: ["NDX", "BTCUSD"],
  },
  xi: {
    name: "Xi Jinping",
    handle: "@XinhuaChina",
    platform: "State Media / Xinhua",
    role: "President of China",
    avatar: "🇨🇳",
    keywords: ["xi jinping", "china president", "beijing policy", "pboc", "china government stimulus", "china economy policy"],
    marketAreas: ["CNY", "China Equities", "Trade", "Commodities", "Hong Kong"],
    defaultAssets: ["SSEC", "HSI", "COPPER", "USDCNY"],
  },
  modi: {
    name: "Narendra Modi",
    handle: "@narendramodi",
    platform: "X (Twitter)",
    role: "Prime Minister of India",
    avatar: "🇮🇳",
    keywords: ["narendra modi", "modi government", "india pm", "pm modi", "india budget", "rbi governor", "india reforms"],
    marketAreas: ["NIFTY50", "INR", "India Equities"],
    defaultAssets: ["NIFTY50", "SENSEX", "USDINR"],
  },
  lagarde: {
    name: "Christine Lagarde",
    handle: "@ecb",
    platform: "ECB",
    role: "ECB President",
    avatar: "🇪🇺",
    keywords: ["lagarde ", "ecb president", "european central bank", "ecb rate decision", "ecb inflation"],
    marketAreas: ["EUR", "European Equities", "Bonds", "Interest Rates"],
    defaultAssets: ["EURUSD", "DAX", "CAC40"],
  },
};

const SOCIAL_FEEDS = [
  { url: "https://www.federalreserve.gov/feeds/press_all.xml", source: "Federal Reserve" },
  { url: "https://www.cnbc.com/id/10000101/device/rss/rss.html", source: "CNBC Politics" },
  { url: "https://www.cnbc.com/id/100727362/device/rss/rss.html", source: "CNBC" },
  { url: "https://rss.politico.com/politics-news.xml", source: "Politico" },
  { url: "https://feeds.a.dj.com/rss/WSJcomUSBusiness.xml", source: "Wall Street Journal" },
  { url: "https://feeds.a.dj.com/rss/RSSMarketsMain.xml", source: "WSJ Markets" },
  { url: "https://www.cnbc.com/id/20910258/device/rss/rss.html", source: "CNBC World Economy" },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", source: "BBC Business" },
  { url: "https://www.investing.com/rss/news.rss", source: "Investing.com" },
];

const TARGETED_SEARCH_FEEDS: Array<{ query: string; influencerKey: string; source: string }> = [
  { query: "Elon+Musk+market+economy", influencerKey: "musk", source: "Google News" },
  { query: "Elon+Musk+Tesla+stock", influencerKey: "musk", source: "Google News" },
  { query: "Jerome+Powell+Federal+Reserve", influencerKey: "powell", source: "Google News" },
  { query: "FOMC+interest+rate+decision", influencerKey: "powell", source: "Google News" },
  { query: "Warren+Buffett+Berkshire+Hathaway", influencerKey: "buffett", source: "Google News" },
  { query: "Janet+Yellen+Treasury", influencerKey: "yellen", source: "Google News" },
  { query: "Michael+Saylor+Bitcoin+MicroStrategy", influencerKey: "saylor", source: "Google News" },
  { query: "Cathie+Wood+ARK+Invest", influencerKey: "wood", source: "Google News" },
  { query: "Xi+Jinping+China+economy", influencerKey: "xi", source: "Google News" },
  { query: "Narendra+Modi+India+economy", influencerKey: "modi", source: "Google News" },
  { query: "Christine+Lagarde+ECB+rate", influencerKey: "lagarde", source: "Google News" },
  { query: "Trump+tariff+trade+policy", influencerKey: "trump", source: "Google News" },
];

function decodeHtml(text: string): string {
  return (text || "")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&nbsp;/g, " ")
    .replace(/&mdash;/g, "—").replace(/&ndash;/g, "–")
    .replace(/<!\[CDATA\[(.*?)\]\]>/gs, "$1")
    .replace(/<[^>]*>/g, "").trim();
}

function detectInfluencer(text: string): [string, Influencer] | null {
  const t = text.toLowerCase();
  for (const [key, inf] of Object.entries(INFLUENCERS)) {
    if (inf.keywords.some(kw => t.includes(kw.toLowerCase()))) {
      return [key, inf];
    }
  }
  return null;
}

function inferSentiment(text: string): string {
  const t = text.toLowerCase();
  const bear = (t.match(/\bfall\b|\bdrop\b|\bdecline\b|\bcrash\b|\bwarning\b|\brisk\b|\bconcer\b|\bthreat\b|\bsanction\b|\bban\b|\bfear\b|\bcrisis\b|\bvol/g) || []).length;
  const bull = (t.match(/\brise\b|\bsurge\b|\brally\b|\bgrowth\b|\brecord\b|\bstrong\b|\bgain\b|\bexpan\b|\bboost\b|\bopportunity\b|\bpositive\b/g) || []).length;
  if (bull > bear + 1) return "bullish";
  if (bear > bull + 1) return "bearish";
  return "neutral";
}

function inferAffectedAssets(text: string, defaultAssets: string[]): string[] {
  const t = text.toLowerCase();
  const found = new Set<string>(defaultAssets);
  if (/bitcoin|\bbtc\b/.test(t)) found.add("BTCUSD");
  if (/ethereum|\beth\b/.test(t)) found.add("ETHUSD");
  if (/gold|\bxau\b/.test(t)) found.add("XAUUSD");
  if (/oil|crude|brent|opec/.test(t)) { found.add("USOIL"); found.add("BRENT"); }
  if (/tariff|trade war|import duty/.test(t)) { found.add("DXY"); found.add("SPX"); found.add("XAUUSD"); }
  if (/rate cut|rate hike|interest rate|fomc/.test(t)) { found.add("DXY"); found.add("US10Y"); found.add("XAUUSD"); }
  if (/china|yuan|cny/.test(t)) { found.add("USDCNY"); found.add("SSEC"); }
  if (/india|rupee|inr|nifty/.test(t)) { found.add("USDINR"); found.add("NIFTY50"); }
  if (/euro|eur|ecb|eurozone/.test(t)) { found.add("EURUSD"); found.add("DAX"); }
  if (/yen|jpy|japan/.test(t)) { found.add("USDJPY"); found.add("N225"); }
  if (/copper/.test(t)) found.add("COPPER");
  if (/natural gas/.test(t)) found.add("NATGAS");
  if (/bond|treasury|yield/.test(t)) found.add("US10Y");
  return [...found].slice(0, 8);
}

function buildUsdImpact(influencerKey: string, text: string, sentiment: string): string {
  const t = text.toLowerCase();
  if (/tariff|trade war|import duty|sanction/.test(t)) {
    return "USD: Short-term STRENGTHENING on safe-haven flows and reduced trade. Long-term NEGATIVE if trade wars escalate and damage US growth.";
  }
  if (/rate cut|rate hike/.test(t) && (influencerKey === "powell" || influencerKey === "yellen")) {
    if (/rate cut|dovish|easing/.test(t)) return "USD: WEAKENING expected. Lower rates reduce dollar carry appeal. Watch DXY for breakdown.";
    if (/rate hike|hawkish|tighten/.test(t)) return "USD: STRENGTHENING. Higher yields boost dollar demand. EM currencies under pressure.";
    return "USD: Neutral — monitor next FOMC statement.";
  }
  if (/bitcoin|crypto/.test(t) && influencerKey === "trump") {
    return "USD: NEUTRAL to slightly NEGATIVE. Crypto adoption as alternative currency reduces dollar dominance narrative.";
  }
  if (/dollar|usd|devalue|greenback/.test(t)) {
    if (sentiment === "bearish") return "USD: DIRECT WEAKNESS signal. Monitor DXY 100 support.";
    if (sentiment === "bullish") return "USD: STRENGTHENING signal. Watch DXY for momentum.";
  }
  if (influencerKey === "trump") return "USD: Monitor for tariff/trade policy impact on dollar. Policies historically cause short-term USD volatility.";
  if (influencerKey === "powell") return "USD: High sensitivity to Fed communication. Watch DXY post-statement for direction.";
  return "USD: Indirect impact — monitor DXY for correlated moves.";
}

function buildTradingConclusion(influencerKey: string, text: string, sentiment: string): string {
  const t = text.toLowerCase();

  if (influencerKey === "trump") {
    if (/tariff|trade war/.test(t)) return "⚠️ TARIFF RISK: SHORT Chinese/Asian equities. LONG gold (safe haven). LONG USD short-term. Reduce EU equities exposure. Watch SPX for sell-off trigger below 5,500.";
    if (/sanction/.test(t)) return "🚨 SANCTIONS: Specific currency SHORTING opportunity (targeted country FX). LONG defense stocks. LONG oil if Middle East. REDUCE EM exposure.";
    if (/bitcoin|crypto/.test(t)) return "₿ CRYPTO CATALYST: LONG BTC/ETH on government adoption signal. Monitor for regulatory clarity. Risk-on for crypto sector.";
    if (/iran|middle east|war|military/.test(t)) return "🚨 GEOPOLITICAL RISK: LONG oil (WTI/Brent). LONG gold. LONG USD. SHORT regional equities. Buy VIX calls as hedge.";
    if (/china|beijing/.test(t)) return "🇨🇳 CHINA RISK: SHORT Chinese equities (HSI/SSEC). LONG USD. Watch copper as demand proxy. REDUCE EM allocation.";
    if (/tax cut|deregulation|energy/.test(t) && sentiment === "bullish") return "📈 GROWTH POLICY: LONG US equities (SPX/NDX). LONG energy stocks. LONG financials (deregulation). USD positive.";
    if (sentiment === "bearish") return "⚠️ UNCERTAINTY: De-risk portfolios. LONG gold and USD. Monitor SPX 50-day MA for support. Cash positions justified.";
    return "📊 TRUMP WATCH: Markets pricing policy uncertainty. Hold defensive assets. Any confirmation of specific policy warrants directional move.";
  }

  if (influencerKey === "musk") {
    if (/bitcoin|btc/.test(t)) return "₿ MUSK/BTC: LONG Bitcoin on Musk endorsement. High volatility trade — use tight stops. DOGE also benefits.";
    if (/tesla|tsla/.test(t) && sentiment === "bullish") return "⚡ TSLA BULL: LONG Tesla on Musk catalyst. EV supply chain stocks benefit. Risk: High valuation.";
    if (/tesla|tsla/.test(t) && sentiment === "bearish") return "⚡ TSLA RISK: REDUCE Tesla exposure. Musk distraction from operations historically causes dips. Watch $150 support.";
    if (/doge|government cut|spending/.test(t)) return "🏛️ DOGE DEPT: Fiscal hawkishness POSITIVE for bonds and USD. SHORT government spending plays.";
    return "⚡ MUSK CATALYST: High social impact — monitor TSLA, DOGE, BTC for immediate price reaction within 30 mins.";
  }

  if (influencerKey === "powell") {
    if (/rate cut|dovish|pivot|easing/.test(t)) return "🕊️ DOVISH FED: LONG equities (SPX/NDX). LONG gold. SHORT USD. LONG bonds. Emerging markets benefit from dollar weakness.";
    if (/rate hike|hawkish|inflation|tighten/.test(t)) return "🦅 HAWKISH FED: SHORT bonds (rising yields). LONG USD (DXY). REDUCE growth stocks. LONG value stocks. Gold under pressure.";
    if (/hold|pause|unchanged/.test(t)) return "⏸️ FED HOLD: Wait-and-see posture. Equities range-bound. Watch inflation data for next catalyst. USD stable.";
    return "🏦 FED STATEMENT: High market sensitivity. Await language parsing. Risk: Surprise messaging causing 1-2% equity swing.";
  }

  if (influencerKey === "buffett") {
    if (/buy|purchased|acquired|stake/.test(t)) return "💼 BUFFETT BUY: FOLLOW the position — high conviction signal. Value sector benefits. Generally market bullish.";
    if (/sell|reduce|exit/.test(t)) return "💼 BUFFETT SELL: Respect the signal — reduce related exposure. Cash build suggests market caution warranted.";
    if (/crash|bubble|overvalue/.test(t)) return "⚠️ BUFFETT WARNING: Reduce equity risk. Increase cash/bonds/gold. Historically accurate timing indicator.";
    return "💼 BUFFETT SIGNAL: Analyze specific company/sector mentioned. Long-term value investing perspective — not for short-term trades.";
  }

  if (influencerKey === "saylor") {
    if (/buy|purchase|acquired/.test(t)) return "₿ SAYLOR BUYS BTC: Bullish signal for Bitcoin. LONG BTC with target above recent highs. MicroStrategy (MSTR) also rallies on this.";
    return "₿ SAYLOR/BTC: Institutional Bitcoin demand narrative strengthens. LONG BTC on dips. Monitor on-chain accumulation data.";
  }

  if (influencerKey === "yellen") {
    if (/sanction|freeze|asset/.test(t)) return "💵 TREASURY ACTION: Targeted currency WEAKNESS (sanctioned country). LONG USD. Watch collateral damage to EM.";
    if (/debt|deficit|borrowing/.test(t)) return "💵 FISCAL RISK: USD NEGATIVE long-term. LONG gold as deficit hedge. Watch 10Y yield for bond market reaction.";
    return "💵 TREASURY WATCH: USD-centric impact. Monitor DXY and US Treasury yield curve for reaction.";
  }

  if (influencerKey === "lagarde") {
    if (/rate cut|dovish|easing/.test(t)) return "🇪🇺 ECB DOVISH: EUR WEAKENING. LONG European equities (DAX, CAC40). SHORT EUR/USD. Bonds rally.";
    if (/rate hike|hawkish|inflation/.test(t)) return "🇪🇺 ECB HAWKISH: EUR STRENGTHENING. SHORT European equities. LONG EUR/USD. Bonds sell off.";
    return "🇪🇺 ECB WATCH: EUR highly sensitive to Lagarde communication. Monitor EUR/USD for 50-pip moves post-statement.";
  }

  if (influencerKey === "xi") {
    if (/stimulus|support|growth/.test(t)) return "🇨🇳 CHINA STIMULUS: LONG HSI/SSEC. LONG copper and industrial metals. LONG iron ore. Risk-on for EM.";
    if (/taiwan|military|south china/.test(t)) return "🚨 GEOPOLITICAL RISK: LONG gold, USD, VIX. SHORT TSM, AAPL (supply chain). SHORT Asian equities.";
    return "🇨🇳 CHINA POLICY: Watch for PBOC follow-up. Copper is leading indicator. Commodity exporters (AUD, BRL) benefit.";
  }

  if (influencerKey === "modi") {
    return "🇮🇳 INDIA POLICY: LONG NIFTY50/SENSEX. Monitor INR strength. Infrastructure and defense sector beneficiaries.";
  }

  return `📡 MARKET SIGNAL: Analyze the specific statement for directional trades. ${sentiment === "bullish" ? "Risk-on positioning appropriate." : sentiment === "bearish" ? "Risk-off posture advised." : "Neutral — await confirmation."}`;
}

async function fetchFeedItems(url: string, source: string): Promise<Array<{ title: string; description: string; link: string; pubDate: string | null }>> {
  try {
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Accept": "application/xml, text/xml, */*" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const text = await resp.text();
    const parsed = parser.parse(text);
    const items = parsed?.rss?.channel?.item ?? parsed?.feed?.entry ?? [];
    const arr: any[] = Array.isArray(items) ? items : [items];
    return arr.slice(0, 15).map((item: any) => ({
      title: decodeHtml(typeof item.title === "object" ? item.title?.["#text"] ?? "" : item.title ?? ""),
      description: decodeHtml(
        typeof item.description === "object" ? item.description?.["#text"] ?? "" :
        item.description ?? item.summary?.["#text"] ?? item.summary ?? ""
      ).slice(0, 400),
      link: item.link?.["@_href"] ?? item.link ?? "",
      pubDate: item.pubDate ?? item.updated ?? item.published ?? null,
    }));
  } catch {
    return [];
  }
}

async function fetchGoogleNewsForLeader(
  query: string,
  influencerKey: string,
  source: string
): Promise<Array<{ title: string; description: string; link: string; pubDate: string | null; source: string; forcedInfluencer: string }>> {
  try {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}+when:2d&hl=en&gl=US&ceid=US:en`;
    const resp = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      signal: AbortSignal.timeout(8000),
    });
    if (!resp.ok) return [];
    const text = await resp.text();
    const parsed = parser.parse(text);
    const items = parsed?.rss?.channel?.item ?? [];
    const arr: any[] = Array.isArray(items) ? items : [items];
    return arr.slice(0, 10).map((item: any) => ({
      title: decodeHtml(typeof item.title === "object" ? item.title?.["#text"] ?? "" : item.title ?? ""),
      description: decodeHtml(
        typeof item.description === "object" ? item.description?.["#text"] ?? "" :
        item.description ?? ""
      ).slice(0, 400),
      link: item.link ?? "",
      pubDate: item.pubDate ?? null,
      source,
      forcedInfluencer: influencerKey,
    }));
  } catch {
    return [];
  }
}

let lastSocialRefresh = 0;
const SOCIAL_REFRESH_INTERVAL = 60 * 1000;

export async function refreshSocialIfStale(force = false): Promise<{ refreshed: boolean; count: number }> {
  if (!force && Date.now() - lastSocialRefresh < SOCIAL_REFRESH_INTERVAL) {
    return { refreshed: false, count: 0 };
  }
  lastSocialRefresh = Date.now();

  try {
    type RawItem = { title: string; description: string; link: string; pubDate: string | null; source: string; forcedInfluencer?: string };
    const allItems: RawItem[] = [];

    const [generalResults, targetedResults] = await Promise.all([
      Promise.allSettled(SOCIAL_FEEDS.map(f => fetchFeedItems(f.url, f.source))),
      Promise.allSettled(
        TARGETED_SEARCH_FEEDS.map(f => fetchGoogleNewsForLeader(f.query, f.influencerKey, f.source))
      ),
    ]);

    for (let i = 0; i < generalResults.length; i++) {
      const r = generalResults[i];
      if (r.status === "fulfilled") {
        allItems.push(...r.value.map(item => ({ ...item, source: SOCIAL_FEEDS[i].source })));
      }
    }

    for (const r of targetedResults) {
      if (r.status === "fulfilled") {
        allItems.push(...r.value);
      }
    }

    const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    await db.delete(socialPostsTable).where(lt(socialPostsTable.publishedAt, cutoff));

    const seen = new Set<string>();
    const posts: typeof socialPostsTable.$inferInsert[] = [];

    for (const item of allItems) {
      const combined = `${item.title} ${item.description}`;

      let influencerKey: string;
      let inf: Influencer;

      if (item.forcedInfluencer && INFLUENCERS[item.forcedInfluencer]) {
        influencerKey = item.forcedInfluencer;
        inf = INFLUENCERS[influencerKey];
      } else {
        const match = detectInfluencer(combined);
        if (!match) continue;
        [influencerKey, inf] = match;
      }

      const titleNorm = item.title.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 60);
      const dedupKey = `${influencerKey}:${titleNorm}`;
      if (seen.has(dedupKey)) continue;
      seen.add(dedupKey);

      if (item.title.length < 15) continue;

      const sentiment = inferSentiment(combined);
      const affectedAssets = inferAffectedAssets(combined, inf.defaultAssets);
      const publishedAt = item.pubDate ? new Date(item.pubDate) : new Date();
      const ageMs = Date.now() - publishedAt.getTime();
      const isBreaking = ageMs < 2 * 60 * 60 * 1000;

      const marketImpact = inf.marketAreas.join(" · ");
      const tradingConclusion = buildTradingConclusion(influencerKey, combined, sentiment);
      const usdImpact = buildUsdImpact(influencerKey, combined, sentiment);

      posts.push({
        influencer: inf.name,
        handle: inf.handle,
        platform: `${inf.platform} · via ${item.source}`,
        content: item.title,
        source: item.source,
        sourceUrl: item.link || null,
        category: influencerKey,
        marketImpact,
        affectedAssets,
        tradingConclusion,
        sentiment,
        usdImpact,
        isBreaking,
        publishedAt: isNaN(publishedAt.getTime()) ? new Date() : publishedAt,
      });
    }

    if (posts.length > 0) {
      await db.insert(socialPostsTable).values(posts);
    }

    return { refreshed: true, count: posts.length };
  } catch (err) {
    console.error("[socialRefresh] Error:", err);
    return { refreshed: false, count: 0 };
  }
}
