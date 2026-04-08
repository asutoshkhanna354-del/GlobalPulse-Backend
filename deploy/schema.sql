-- GlobalPulse Intelligence — PostgreSQL Schema
-- Run this ONCE on a fresh database, then the app seeds itself on first start.
-- Render Blueprint auto-runs this via the DATABASE_URL it injects.

CREATE TABLE IF NOT EXISTS market_assets (
  id              SERIAL PRIMARY KEY,
  symbol          TEXT    NOT NULL,
  name            TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  price           REAL    NOT NULL,
  change          REAL    NOT NULL,
  change_percent  REAL    NOT NULL,
  volume          TEXT,
  market_cap      TEXT,
  currency        TEXT    NOT NULL DEFAULT 'USD',
  country         TEXT,
  flag            TEXT,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economic_indicators (
  id              SERIAL PRIMARY KEY,
  country         TEXT    NOT NULL,
  country_code    TEXT    NOT NULL,
  flag            TEXT    NOT NULL,
  indicator       TEXT    NOT NULL,
  value           REAL    NOT NULL,
  unit            TEXT    NOT NULL,
  previous_value  REAL,
  change          REAL,
  period          TEXT    NOT NULL,
  trend           TEXT    NOT NULL,
  impact          TEXT    NOT NULL,
  last_updated    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS economic_events (
  id              SERIAL PRIMARY KEY,
  title           TEXT    NOT NULL,
  country         TEXT    NOT NULL,
  flag            TEXT    NOT NULL,
  indicator       TEXT    NOT NULL,
  scheduled_at    TIMESTAMPTZ NOT NULL,
  forecast        REAL,
  previous        REAL,
  actual          REAL,
  unit            TEXT    NOT NULL,
  impact          TEXT    NOT NULL,
  released        BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS geopolitical_events (
  id                  SERIAL PRIMARY KEY,
  title               TEXT    NOT NULL,
  description         TEXT    NOT NULL,
  region              TEXT    NOT NULL,
  countries           TEXT[]  NOT NULL,
  type                TEXT    NOT NULL,
  severity            TEXT    NOT NULL,
  market_impact       TEXT    NOT NULL,
  market_conclusion   TEXT    NOT NULL DEFAULT '',
  affected_markets    TEXT[]  NOT NULL DEFAULT '{}',
  affected_assets     TEXT[]  NOT NULL,
  sources             TEXT[]  NOT NULL DEFAULT '{}',
  start_date          TEXT    NOT NULL,
  status              TEXT    NOT NULL,
  casualties_reported BOOLEAN NOT NULL DEFAULT FALSE,
  economic_loss       TEXT,
  last_updated        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS news_items (
  id              SERIAL PRIMARY KEY,
  headline        TEXT    NOT NULL,
  summary         TEXT    NOT NULL,
  source          TEXT    NOT NULL,
  url             TEXT    NOT NULL,
  category        TEXT    NOT NULL,
  sentiment       TEXT    NOT NULL,
  impact          TEXT    NOT NULL,
  affected_assets TEXT[]  NOT NULL DEFAULT '{}',
  published_at    TIMESTAMPTZ NOT NULL,
  is_breaking     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS social_intelligence (
  id              SERIAL PRIMARY KEY,
  symbol          TEXT    NOT NULL,
  platform        TEXT    NOT NULL,
  content         TEXT    NOT NULL,
  sentiment       TEXT    NOT NULL,
  engagement      INTEGER NOT NULL DEFAULT 0,
  author          TEXT,
  url             TEXT,
  published_at    TIMESTAMPTZ NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ipo_listings (
  id              SERIAL PRIMARY KEY,
  company         TEXT    NOT NULL,
  symbol          TEXT,
  exchange        TEXT    NOT NULL,
  price_range_low  REAL,
  price_range_high REAL,
  offer_price     REAL,
  listing_price   REAL,
  market          TEXT    NOT NULL,
  status          TEXT    NOT NULL,
  open_date       TEXT,
  close_date      TEXT,
  listing_date    TEXT,
  lot_size        INTEGER,
  issue_size      TEXT,
  gmp             REAL,
  subscribed      REAL,
  category        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS nifty_analysis (
  id                  SERIAL PRIMARY KEY,
  direction           TEXT    NOT NULL,
  confidence          INTEGER NOT NULL,
  summary             TEXT    NOT NULL,
  outlook             TEXT    NOT NULL,
  support_levels      TEXT[]  NOT NULL DEFAULT '{}',
  resistance_levels   TEXT[]  NOT NULL DEFAULT '{}',
  key_factors         TEXT[]  NOT NULL DEFAULT '{}',
  demand_zones        TEXT[]  NOT NULL DEFAULT '{}',
  supply_zones        TEXT[]  NOT NULL DEFAULT '{}',
  candle_pattern      TEXT,
  trend_strength      TEXT,
  trade_recommendation TEXT,
  target_price        REAL,
  stop_loss           REAL,
  timeframe           TEXT,
  next_analysis_at    TIMESTAMPTZ,
  valid_until         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS bitcoin_analysis (
  id                  SERIAL PRIMARY KEY,
  direction           TEXT    NOT NULL,
  confidence          INTEGER NOT NULL,
  summary             TEXT    NOT NULL,
  outlook             TEXT    NOT NULL,
  support_levels      TEXT[]  NOT NULL DEFAULT '{}',
  resistance_levels   TEXT[]  NOT NULL DEFAULT '{}',
  key_factors         TEXT[]  NOT NULL DEFAULT '{}',
  demand_zones        TEXT[]  NOT NULL DEFAULT '{}',
  supply_zones        TEXT[]  NOT NULL DEFAULT '{}',
  candle_pattern      TEXT,
  trend_strength      TEXT,
  trade_recommendation TEXT,
  target_price        REAL,
  stop_loss           REAL,
  timeframe           TEXT,
  next_analysis_at    TIMESTAMPTZ,
  valid_until         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS watchlist (
  id        SERIAL PRIMARY KEY,
  symbol    TEXT        NOT NULL,
  name      TEXT        NOT NULL,
  type      TEXT        NOT NULL,
  notes     TEXT,
  added_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id                  SERIAL PRIMARY KEY,
  endpoint            TEXT    NOT NULL,
  p256dh_key          TEXT    NOT NULL,
  auth_key            TEXT    NOT NULL,
  symbol              TEXT    NOT NULL,
  symbol_label        TEXT    NOT NULL,
  browser_fingerprint TEXT    NOT NULL,
  last_notified_at    TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
