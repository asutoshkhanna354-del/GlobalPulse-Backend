# Workspace

## Overview

pnpm workspace monorepo using TypeScript. Each package manages its own dependencies.

## Stack

- **Monorepo tool**: pnpm workspaces
- **Node.js version**: 24
- **Package manager**: pnpm
- **TypeScript version**: 5.9
- **API framework**: Express 5
- **Database**: PostgreSQL + Drizzle ORM
- **Validation**: Zod (`zod/v4`), `drizzle-zod`
- **API codegen**: Orval (from OpenAPI spec)
- **Build**: esbuild (CJS bundle)
- **Chart library**: lightweight-charts v5 (TradingView open source)

## Artifacts

### GlobalPulse — Global Market Intelligence Screener
- **Path**: `artifacts/market-screener/`
- **Preview**: `/` (root)
- **Purpose**: Professional TradingView-style light-themed financial terminal for traders and investors tracking global markets, economic indicators, geopolitical events, news, social intelligence, USD signals, Indian IPOs, and premium pro indicator signals
- **Theme**: Light theme with colored animated glow blobs, pastel badge colors (bg-*-50, text-*-600/700, border-*-200), semantic CSS variables (text-foreground, bg-card, bg-muted, etc.)
- **Self-hosting**: See DEPLOY.md for self-hosting deployment guide (Node.js + PostgreSQL + Nginx)

### API Server
- **Path**: `artifacts/api-server/`
- **Preview**: `/api`
- **Purpose**: Express 5 REST API serving all market data + indicator signals

## Key Commands

- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run dev` — run API server locally

## Features

- **Dashboard**: USD Direction Signal, Global Market Heat Map, Upcoming IPOs, market sentiment (VIX/DXY/Gold/Oil), top movers, breaking news, premium activation banner
- **Chart**: TradingView-style candlestick chart with lightweight-charts v5, volume histogram, symbol selector (13 assets), 8 timeframes (1m/5m/15m/30m/1H/4H/1D/1W), pro buy/sell signal markers (premium only), market mode indicator
- **Nifty 50 AI Analysis** (PRO): Comprehensive Nifty 50 outlook with support/resistance levels, demand/supply zones, candle patterns, Call/Put recommendations + periodic 30-min candle analysis (refreshes every 25 min, delivered 5-10 min before next slot)
- **Bitcoin AI Analysis** (PRO): Comprehensive BTC outlook with support/resistance levels, demand/supply zones, candle patterns, Long/Short recommendations + periodic 4-hour candle analysis (refreshes every 4h). Uses same AI engine as Nifty with crypto-specific context (ETH/SOL correlation, DXY inverse, on-chain data)
- **Market Screener**: Sortable table of 30+ assets across indices, currencies, commodities, crypto, bonds
- **Stocks**: Stock Screener (NSE + US, sector filters, gainers/losers) + Newcomers (IPO) tab with 20 curated IPOs (11 Indian + 9 US), market filter (All/Indian/US), scoring, GMP, recommendations, flag emojis, currency-aware (₹/$ based on market)
- **Economics**: Economic indicators by country + Economic calendar with upcoming data releases
- **Geopolitical**: Active conflicts with severity levels, market impact analysis, country risk heatmap
- **News**: Two tabs — Global Financial News (category/impact filters, market verdicts) + Forex News (economic calendar with currency/impact filters, upcoming events with forex pair conclusions)
- **Social Intelligence**: 37+ signals from Trump, Powell, Musk, Buffett with trading conclusions + USD impact
- **Terminal** (BETA): Intelligence terminal (route: `/terminal`, light theme, same layout as rest of app) — rotating 3D globe (Canvas 2D, no WebGL) with conflict zone markers, zoom/rotate controls, GLOBAL TENSION indicator, conflict events list with severity badges, FEED/WHALE TRACKER/FLIGHTS tabs, severity filter pills (All/Critical/High/Low), deduplicated social + news signal feed, search
- **Watchlist**: Add/remove assets, indicators, events, and countries to a personal watchlist

## Premium Key System

- Key: `ADMIN` grants lifetime premium access
- Stored in localStorage under `gp_premium_key`
- Gates: Pro indicator signals on chart page
- Context: `PremiumContext` (src/contexts/PremiumContext.tsx)
- Modal: `PremiumModal` (src/components/PremiumModal.tsx)
- Sidebar shows premium status badge + activation button

## Pro Indicator Engine

- **Engine**: `api-server/src/lib/indicator.ts` — multi-indicator confirmation engine
- **API**: `/api/indicator/signals/:symbol` — returns OHLC bars + buy/sell signals + market mode
- **Algorithm**: Multi-indicator confirmation (MACD, Bollinger Bands, EMA9/20/50/200, volume surge, candlestick patterns) with confidence scoring (65-95%), ATR-based SL/TP, min 3 confirmations, 5-bar gap enforcement, RR=2.5
- **Parameters**: Min confidence 65%, min confirmations 3, RR ratio 2.5

## Database Schema (lib/db/src/schema/)

- `market_assets` — Market prices for indices, currencies, commodities, crypto, bonds
- `economic_indicators` — GDP, inflation, unemployment, interest rates by country
- `economic_events` — Economic calendar events (past and upcoming)
- `geopolitical_events` — Active conflicts and geopolitical risks
- `news_items` — Financial news with impact/sentiment classification
- `social_posts` — Social intelligence posts from key market figures
- `forex_calendar` — Forex economic calendar events with pair impact conclusions
- `ipo_listings` — Curated IPO data (11 Indian + 9 US) with market column, GMP, subscription tiers, scores, pros/cons, recommendations (hardcoded real data with date-based status auto-detection)
- `usd_signals` — AI-powered USD direction signal analysis (BULLISH/BEARISH/NEUTRAL) via GPT-5.2 with full market context (DXY, gold, oil, VIX, news, geopolitical, social) + algorithmic fallback
- `nifty_analysis` — AI-powered Nifty 50 analysis (comprehensive hourly + 30m candle periodic) with direction, support/resistance, demand/supply zones, Call/Put recommendations, candle patterns
- `watchlist` — User watchlist items

## Data Refresh Intervals

- Market assets: 5s (live polling)
- News: 5s
- Social intelligence: 5s
- IPO listings: 10s
- USD direction signal: 5s (live refresh)

## API Routes

- `/api/market-data` — Market assets by category
- `/api/stocks` — Stock screener with NSE + US markets
- `/api/economic-indicators`, `/api/economic-events` — Economics data
- `/api/geopolitical` — Geopolitical events
- `/api/news` — News feed
- `/api/social` — Social intelligence posts
- `/api/forex-calendar` — Forex economic calendar events with pair impact analysis
- `/api/ipo` — IPO listings (GET all, GET by ID)
- `/api/usd-signal` — USD direction signal
- `/api/nifty-analysis` — Nifty 50 AI analysis (comprehensive + 30m candle)
- `/api/nifty-analysis/history` — Nifty analysis history
- `/api/indicator/signals/:symbol` — Pro indicator signals (OHLC + buy/sell + market mode)
- `/api/indicator/ohlc/:symbol` — Raw OHLC data from Yahoo Finance
- `/api/watchlist` — Watchlist CRUD

## Theme

Light theme with colored animated glow blobs:
- Background: White with floating gradient blobs (purple, blue, emerald, cyan, pink, amber, violet) at opacity 0.28/0.22
- Cards: bg-card with border-border, rounded-xl
- Sidebar: White with translucent backdrop
- Green (bull): green-600
- Red (bear): red-600
- Gold accent: amber-500/600
- Primary accent: violet-500/600
- Text: text-foreground (primary), text-muted-foreground (secondary)
- CSS classes: .glass-card, .glass-card-hover, .glass-card-inner, .glow-blob (opacity 0.28), .glow-blob-sm (opacity 0.22)
- All timestamps displayed in IST (Asia/Kolkata, UTC+5:30)

See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details.
