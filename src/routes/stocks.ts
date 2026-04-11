import { Router, type IRouter } from "express";

const router: IRouter = Router();

const INDIAN_STOCKS = [
  { symbol: "RELIANCE", yahooSymbol: "RELIANCE.NS", name: "Reliance Industries", sector: "Energy / Conglomerate" },
  { symbol: "TCS", yahooSymbol: "TCS.NS", name: "Tata Consultancy Services", sector: "Information Technology" },
  { symbol: "HDFCBANK", yahooSymbol: "HDFCBANK.NS", name: "HDFC Bank", sector: "Banking" },
  { symbol: "INFY", yahooSymbol: "INFY.NS", name: "Infosys", sector: "Information Technology" },
  { symbol: "ICICIBANK", yahooSymbol: "ICICIBANK.NS", name: "ICICI Bank", sector: "Banking" },
  { symbol: "HINDUNILVR", yahooSymbol: "HINDUNILVR.NS", name: "Hindustan Unilever", sector: "FMCG" },
  { symbol: "ITC", yahooSymbol: "ITC.NS", name: "ITC Limited", sector: "FMCG" },
  { symbol: "SBIN", yahooSymbol: "SBIN.NS", name: "State Bank of India", sector: "Banking" },
  { symbol: "BAJFINANCE", yahooSymbol: "BAJFINANCE.NS", name: "Bajaj Finance", sector: "NBFC" },
  { symbol: "ADANIENT", yahooSymbol: "ADANIENT.NS", name: "Adani Enterprises", sector: "Infrastructure / Energy" },
  { symbol: "WIPRO", yahooSymbol: "WIPRO.NS", name: "Wipro", sector: "Information Technology" },
  { symbol: "LT", yahooSymbol: "LT.NS", name: "Larsen & Toubro", sector: "Infrastructure / Energy" },
  { symbol: "MARUTI", yahooSymbol: "MARUTI.NS", name: "Maruti Suzuki", sector: "Automobile" },
  { symbol: "TATAMOTORS", yahooSymbol: "TATAMOTORS.NS", name: "Tata Motors", sector: "Automobile" },
  { symbol: "TATASTEEL", yahooSymbol: "TATASTEEL.NS", name: "Tata Steel", sector: "Metals & Mining" },
  { symbol: "AXISBANK", yahooSymbol: "AXISBANK.NS", name: "Axis Bank", sector: "Banking" },
  { symbol: "ASIANPAINT", yahooSymbol: "ASIANPAINT.NS", name: "Asian Paints", sector: "Paints & Coatings" },
  { symbol: "ULTRACEMCO", yahooSymbol: "ULTRACEMCO.NS", name: "UltraTech Cement", sector: "Cement" },
  { symbol: "SUNPHARMA", yahooSymbol: "SUNPHARMA.NS", name: "Sun Pharmaceutical", sector: "Pharmaceuticals" },
  { symbol: "DRREDDY", yahooSymbol: "DRREDDY.NS", name: "Dr. Reddy's Laboratories", sector: "Pharmaceuticals" },
  { symbol: "POWERGRID", yahooSymbol: "POWERGRID.NS", name: "Power Grid Corporation", sector: "Utilities" },
  { symbol: "NTPC", yahooSymbol: "NTPC.NS", name: "NTPC Limited", sector: "Utilities" },
  { symbol: "ONGC", yahooSymbol: "ONGC.NS", name: "Oil & Natural Gas Corp", sector: "Energy" },
  { symbol: "COALINDIA", yahooSymbol: "COALINDIA.NS", name: "Coal India", sector: "Mining" },
  { symbol: "HCLTECH", yahooSymbol: "HCLTECH.NS", name: "HCL Technologies", sector: "Information Technology" },
];

const US_STOCKS = [
  { symbol: "AAPL", yahooSymbol: "AAPL", name: "Apple Inc.", sector: "Technology" },
  { symbol: "MSFT", yahooSymbol: "MSFT", name: "Microsoft Corporation", sector: "Technology" },
  { symbol: "NVDA", yahooSymbol: "NVDA", name: "NVIDIA Corporation", sector: "Semiconductors" },
  { symbol: "GOOGL", yahooSymbol: "GOOGL", name: "Alphabet Inc.", sector: "Technology" },
  { symbol: "META", yahooSymbol: "META", name: "Meta Platforms", sector: "Technology" },
  { symbol: "AMZN", yahooSymbol: "AMZN", name: "Amazon.com Inc.", sector: "E-Commerce / Cloud" },
  { symbol: "TSLA", yahooSymbol: "TSLA", name: "Tesla Inc.", sector: "Automobile / EV" },
  { symbol: "JPM", yahooSymbol: "JPM", name: "JPMorgan Chase", sector: "Banking" },
  { symbol: "GS", yahooSymbol: "GS", name: "Goldman Sachs Group", sector: "Investment Banking" },
  { symbol: "BAC", yahooSymbol: "BAC", name: "Bank of America", sector: "Banking" },
  { symbol: "BRK-B", yahooSymbol: "BRK-B", name: "Berkshire Hathaway B", sector: "Conglomerate" },
  { symbol: "UNH", yahooSymbol: "UNH", name: "UnitedHealth Group", sector: "Healthcare" },
  { symbol: "JNJ", yahooSymbol: "JNJ", name: "Johnson & Johnson", sector: "Healthcare" },
  { symbol: "XOM", yahooSymbol: "XOM", name: "ExxonMobil Corporation", sector: "Energy" },
  { symbol: "V", yahooSymbol: "V", name: "Visa Inc.", sector: "Fintech / Payments" },
  { symbol: "MA", yahooSymbol: "MA", name: "Mastercard Inc.", sector: "Fintech / Payments" },
  { symbol: "WMT", yahooSymbol: "WMT", name: "Walmart Inc.", sector: "Retail" },
  { symbol: "PG", yahooSymbol: "PG", name: "Procter & Gamble", sector: "Consumer Goods" },
  { symbol: "HD", yahooSymbol: "HD", name: "Home Depot Inc.", sector: "Retail" },
  { symbol: "COST", yahooSymbol: "COST", name: "Costco Wholesale", sector: "Retail" },
  { symbol: "AMD", yahooSymbol: "AMD", name: "Advanced Micro Devices", sector: "Semiconductors" },
  { symbol: "NFLX", yahooSymbol: "NFLX", name: "Netflix Inc.", sector: "Entertainment / Streaming" },
  { symbol: "CRM", yahooSymbol: "CRM", name: "Salesforce Inc.", sector: "Enterprise Software" },
  { symbol: "DIS", yahooSymbol: "DIS", name: "The Walt Disney Company", sector: "Entertainment" },
  { symbol: "PYPL", yahooSymbol: "PYPL", name: "PayPal Holdings", sector: "Fintech / Payments" },
];

const HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
  "Accept": "application/json",
  "Accept-Language": "en-US,en;q=0.9",
};

async function fetchSparkBatch(yahooSymbols: string[]): Promise<Record<string, any>> {
  const url = `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${yahooSymbols.join(",")}&range=1d&interval=1d`;
  const response = await fetch(url, { headers: HEADERS });
  if (!response.ok) throw new Error(`Yahoo Finance spark API error: ${response.status}`);
  const data = await response.json() as any;
  const quotes: Record<string, any> = {};
  for (const item of (data?.spark?.result ?? [])) {
    const meta = item?.response?.[0]?.meta;
    if (meta && item.symbol) quotes[item.symbol] = meta;
  }
  return quotes;
}

async function fetchSparkQuotes(yahooSymbols: string[]): Promise<Record<string, any>> {
  const BATCH_SIZE = 20;
  const batches: string[][] = [];
  for (let i = 0; i < yahooSymbols.length; i += BATCH_SIZE) {
    batches.push(yahooSymbols.slice(i, i + BATCH_SIZE));
  }
  const results = await Promise.all(batches.map(b => fetchSparkBatch(b)));
  return Object.assign({}, ...results);
}

function buildStock(
  meta: { symbol: string; yahooSymbol: string; name: string; sector: string },
  quote: any,
  market: "india" | "us"
) {
  const price: number = quote?.regularMarketPrice ?? 0;
  const prevClose: number = quote?.chartPreviousClose ?? price;
  const change = price - prevClose;
  const changePercent = prevClose ? (change / prevClose) * 100 : 0;

  return {
    symbol: meta.symbol,
    yahooSymbol: meta.yahooSymbol,
    name: (quote?.longName ?? quote?.shortName ?? meta.name) as string,
    market,
    exchange: market === "india" ? "NSE" : "NASDAQ/NYSE",
    sector: meta.sector,
    price,
    change,
    changePercent,
    open: quote?.regularMarketOpen ?? null,
    high: quote?.regularMarketDayHigh ?? null,
    low: quote?.regularMarketDayLow ?? null,
    previousClose: prevClose ?? null,
    volume: quote?.regularMarketVolume ?? null,
    avgVolume: null,
    marketCap: null,
    peRatio: null,
    weekHigh52: quote?.fiftyTwoWeekHigh ?? null,
    weekLow52: quote?.fiftyTwoWeekLow ?? null,
    dividendYield: null,
    eps: null,
    currency: (quote?.currency ?? (market === "india" ? "INR" : "USD")) as string,
    flag: market === "india" ? "🇮🇳" : "🇺🇸",
    source: "Yahoo Finance",
    lastUpdated: new Date().toISOString(),
  };
}

router.get("/stocks", async (req, res): Promise<void> => {
  const market = (req.query.market as string) ?? "all";
  const sector = req.query.sector as string | undefined;

  let stockMetas = market === "india"
    ? INDIAN_STOCKS
    : market === "us"
    ? US_STOCKS
    : [...INDIAN_STOCKS, ...US_STOCKS];

  if (sector) {
    stockMetas = stockMetas.filter(s => s.sector.toLowerCase().includes(sector.toLowerCase()));
  }

  const yahooSymbols = stockMetas.map(s => s.yahooSymbol);

  try {
    const quotes = await fetchSparkQuotes(yahooSymbols);
    const stocks = stockMetas.map(meta => {
      const quote = quotes[meta.yahooSymbol];
      const mkt: "india" | "us" = INDIAN_STOCKS.some(s => s.yahooSymbol === meta.yahooSymbol) ? "india" : "us";
      return buildStock(meta, quote, mkt);
    });
    res.json(stocks);
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch live stock data", details: String(err) });
  }
});

router.get("/stocks/movers", async (req, res): Promise<void> => {
  const market = (req.query.market as string) ?? "india";
  const stockMetas = market === "us" ? US_STOCKS : INDIAN_STOCKS;
  const yahooSymbols = stockMetas.map(s => s.yahooSymbol);

  try {
    const quotes = await fetchSparkQuotes(yahooSymbols);
    const mkKey: "india" | "us" = market === "us" ? "us" : "india";
    const stocks = stockMetas.map(meta => buildStock(meta, quotes[meta.yahooSymbol], mkKey));
    const sorted = [...stocks].sort((a, b) => b.changePercent - a.changePercent);
    res.json({
      gainers: sorted.filter(s => s.changePercent > 0).slice(0, 5),
      losers: [...sorted].filter(s => s.changePercent < 0).slice(-5).reverse(),
      market,
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch stock movers", details: String(err) });
  }
});

router.get("/stocks/chart/:symbol", async (req, res): Promise<void> => {
  const { symbol } = req.params;
  const range = (req.query.range as string) ?? "1mo";

  const intervalMap: Record<string, string> = {
    "1d": "5m",
    "5d": "15m",
    "1mo": "1d",
    "3mo": "1d",
    "6mo": "1wk",
    "1y": "1wk",
  };

  const interval = intervalMap[range] ?? "1d";

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
    const response = await fetch(url, { headers: HEADERS });

    if (!response.ok) {
      res.status(502).json({ error: "Failed to fetch chart data" });
      return;
    }

    const data = await response.json() as any;
    const result = data?.chart?.result?.[0];

    if (!result) {
      res.status(404).json({ error: "No chart data found" });
      return;
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.quote?.[0] ?? {};
    const closes: number[] = quotes.close ?? [];
    const opens: number[] = quotes.open ?? [];
    const highs: number[] = quotes.high ?? [];
    const lows: number[] = quotes.low ?? [];
    const volumes: number[] = quotes.volume ?? [];

    const points = timestamps.map((ts, i) => ({
      timestamp: new Date(ts * 1000).toISOString(),
      open: opens[i] ?? null,
      high: highs[i] ?? null,
      low: lows[i] ?? null,
      close: closes[i] ?? 0,
      volume: volumes[i] ?? null,
    })).filter(p => p.close !== null && p.close !== 0);

    res.json({
      symbol,
      range,
      currency: result.meta?.currency ?? "USD",
      points,
      source: "Yahoo Finance",
    });
  } catch (err) {
    res.status(502).json({ error: "Failed to fetch chart data", details: String(err) });
  }
});

export default router;
