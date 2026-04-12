import { db } from "@workspace/db";
import { logger } from "./logger";

const MIGRATIONS = [
  `CREATE TABLE IF NOT EXISTS market_assets (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    price REAL NOT NULL,
    change REAL NOT NULL,
    change_percent REAL NOT NULL,
    volume TEXT,
    market_cap TEXT,
    currency TEXT NOT NULL DEFAULT 'USD',
    country TEXT,
    flag TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS economic_indicators (
    id SERIAL PRIMARY KEY,
    country TEXT NOT NULL,
    country_code TEXT NOT NULL,
    flag TEXT NOT NULL,
    indicator TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    previous_value REAL,
    change REAL,
    period TEXT NOT NULL,
    trend TEXT NOT NULL,
    impact TEXT NOT NULL,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS economic_events (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    country TEXT NOT NULL,
    flag TEXT NOT NULL,
    indicator TEXT NOT NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    forecast REAL,
    previous REAL,
    actual REAL,
    unit TEXT NOT NULL,
    impact TEXT NOT NULL,
    released BOOLEAN NOT NULL DEFAULT false
  )`,
  `CREATE TABLE IF NOT EXISTS geopolitical_events (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    region TEXT NOT NULL,
    countries TEXT[] NOT NULL,
    type TEXT NOT NULL,
    severity TEXT NOT NULL,
    market_impact TEXT NOT NULL,
    market_conclusion TEXT NOT NULL DEFAULT '',
    affected_markets TEXT[] NOT NULL DEFAULT '{}',
    affected_assets TEXT[] NOT NULL,
    sources TEXT[] NOT NULL DEFAULT '{}',
    start_date TEXT NOT NULL,
    status TEXT NOT NULL,
    casualties_reported BOOLEAN NOT NULL DEFAULT false,
    economic_loss TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS news_items (
    id SERIAL PRIMARY KEY,
    headline TEXT NOT NULL,
    summary TEXT NOT NULL,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    impact TEXT NOT NULL,
    sentiment TEXT NOT NULL,
    region TEXT,
    affected_assets TEXT[] NOT NULL,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    market_conclusion TEXT NOT NULL,
    is_breaking BOOLEAN NOT NULL DEFAULT false
  )`,
  `CREATE TABLE IF NOT EXISTS social_posts (
    id SERIAL PRIMARY KEY,
    influencer TEXT NOT NULL,
    handle TEXT NOT NULL,
    platform TEXT NOT NULL,
    content TEXT NOT NULL,
    source TEXT NOT NULL,
    source_url TEXT,
    category TEXT NOT NULL,
    market_impact TEXT NOT NULL,
    affected_assets TEXT[] NOT NULL,
    trading_conclusion TEXT NOT NULL,
    sentiment TEXT NOT NULL,
    usd_impact TEXT,
    is_breaking BOOLEAN NOT NULL DEFAULT false,
    published_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS ipo_listings (
    id SERIAL PRIMARY KEY,
    company_name TEXT NOT NULL,
    symbol TEXT,
    market TEXT NOT NULL DEFAULT 'india',
    exchange TEXT NOT NULL DEFAULT 'NSE',
    issue_size TEXT,
    price_range TEXT,
    open_date TEXT,
    close_date TEXT,
    listing_date TEXT,
    lot_size INTEGER,
    ipo_type TEXT NOT NULL DEFAULT 'mainboard',
    status TEXT NOT NULL DEFAULT 'upcoming',
    gmp REAL,
    subscription_qib REAL,
    subscription_hni REAL,
    subscription_retail REAL,
    subscription_total REAL,
    industry TEXT,
    revenue TEXT,
    profit TEXT,
    company_description TEXT,
    pros_text TEXT,
    cons_text TEXT,
    recommendation_listing TEXT,
    recommendation_long_term TEXT,
    total_score INTEGER,
    listing_price REAL,
    listing_gain_percent REAL,
    current_price REAL,
    source_url TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS usd_signals (
    id SERIAL PRIMARY KEY,
    direction TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    summary TEXT NOT NULL,
    factors TEXT[] NOT NULL,
    dxy_value REAL,
    gold_price REAL,
    oil_price REAL,
    vix_value REAL,
    fed_signal TEXT,
    geopolitical_risk TEXT,
    next_update TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS forex_calendar (
    id SERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    currency TEXT NOT NULL,
    impact TEXT NOT NULL,
    event_date TIMESTAMPTZ NOT NULL,
    actual TEXT,
    forecast TEXT,
    previous TEXT,
    affected_pairs TEXT[],
    conclusion TEXT,
    direction_signal TEXT,
    source_url TEXT,
    last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS nifty_analysis (
    id SERIAL PRIMARY KEY,
    analysis_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    nifty_price REAL,
    nifty_change REAL,
    summary TEXT NOT NULL,
    outlook TEXT NOT NULL,
    support_levels TEXT[] NOT NULL DEFAULT '{}',
    resistance_levels TEXT[] NOT NULL DEFAULT '{}',
    key_factors TEXT[] NOT NULL DEFAULT '{}',
    demand_zones TEXT[] NOT NULL DEFAULT '{}',
    supply_zones TEXT[] NOT NULL DEFAULT '{}',
    candle_pattern TEXT,
    trend_strength TEXT,
    call_put_recommendation TEXT,
    target_price REAL,
    stop_loss REAL,
    timeframe TEXT,
    next_analysis_at TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bitcoin_analysis (
    id SERIAL PRIMARY KEY,
    analysis_type TEXT NOT NULL,
    direction TEXT NOT NULL,
    confidence INTEGER NOT NULL,
    btc_price REAL,
    btc_change REAL,
    summary TEXT NOT NULL,
    outlook TEXT NOT NULL,
    support_levels TEXT[] NOT NULL DEFAULT '{}',
    resistance_levels TEXT[] NOT NULL DEFAULT '{}',
    key_factors TEXT[] NOT NULL DEFAULT '{}',
    demand_zones TEXT[] NOT NULL DEFAULT '{}',
    supply_zones TEXT[] NOT NULL DEFAULT '{}',
    candle_pattern TEXT,
    trend_strength TEXT,
    trade_recommendation TEXT,
    target_price REAL,
    stop_loss REAL,
    timeframe TEXT,
    next_analysis_at TIMESTAMPTZ,
    valid_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS watchlist (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    notes TEXT,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bot_trades (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    symbol_label TEXT NOT NULL,
    direction TEXT NOT NULL,
    entry_price REAL NOT NULL,
    target_price REAL NOT NULL,
    stop_loss REAL NOT NULL,
    current_price REAL,
    pnl REAL,
    pnl_percent REAL,
    status TEXT NOT NULL DEFAULT 'open',
    trade_type TEXT NOT NULL DEFAULT 'SWING',
    confidence INTEGER NOT NULL,
    reasoning TEXT NOT NULL,
    lot_size REAL NOT NULL DEFAULT 1,
    risk_percent REAL NOT NULL DEFAULT 1,
    closed_at TIMESTAMPTZ,
    close_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS bot_settings (
    id SERIAL PRIMARY KEY,
    is_running BOOLEAN NOT NULL DEFAULT true,
    risk_percent REAL NOT NULL DEFAULT 1,
    max_open_trades INTEGER NOT NULL DEFAULT 10000,
    enabled_assets TEXT[] NOT NULL DEFAULT ARRAY['BTCUSD','XAUUSD','XAGUSD','EURUSD','NIFTY50'],
    enable_scalp BOOLEAN NOT NULL DEFAULT true,
    enable_intraday BOOLEAN NOT NULL DEFAULT true,
    enable_swing BOOLEAN NOT NULL DEFAULT true,
    virtual_balance REAL NOT NULL DEFAULT 10000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS push_subscriptions (
    id SERIAL PRIMARY KEY,
    endpoint TEXT NOT NULL,
    p256dh_key TEXT NOT NULL,
    auth_key TEXT NOT NULL,
    symbol TEXT NOT NULL,
    symbol_label TEXT NOT NULL,
    browser_fingerprint TEXT NOT NULL,
    last_notified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS broker_connections (
    id SERIAL PRIMARY KEY,
    broker TEXT NOT NULL,
    label TEXT NOT NULL,
    api_key TEXT NOT NULL,
    api_secret TEXT,
    access_token TEXT,
    account_id TEXT,
    environment TEXT NOT NULL DEFAULT 'paper',
    is_active BOOLEAN NOT NULL DEFAULT true,
    connected_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

export async function runStartupMigrations(): Promise<void> {
  let succeeded = 0;
  let failed = 0;

  for (const sql of MIGRATIONS) {
    const tableName = sql.match(/CREATE TABLE IF NOT EXISTS (\w+)/)?.[1] ?? "unknown";
    try {
      await db.execute(sql);
      succeeded++;
    } catch (err: any) {
      failed++;
      logger.warn(`[migrations] ${tableName}: ${err?.message?.split("\n")[0]}`);
    }
  }

  if (failed === 0) {
    logger.info(`[migrations] All ${succeeded} tables ensured on active DB`);
  } else {
    logger.warn(`[migrations] ${succeeded} tables OK, ${failed} failed — check DB connectivity`);
  }
}
