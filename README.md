# GlobalPulse — Global Market Intelligence Terminal

A professional dark OLED TradingView-style financial terminal for tracking global markets, economic data, geopolitical events, news, and social intelligence — all in one place.

## Features

- **Dashboard** — Live market sentiment (VIX, DXY, Gold, Oil), USD Direction Signal, Global Market Heat Map with real SVG world continents, Upcoming IPOs, breaking news ticker
- **Chart** — TradingView-style candlestick chart (lightweight-charts v5), volume histogram, 13 assets, 8 timeframes (1m/5m/15m/30m/1H/4H/1D/1W), pro buy/sell signal markers (premium)
- **Market Screener** — Sortable table of 30+ assets across indices, currencies, commodities, crypto, bonds
- **Stocks** — NSE + US stock screener with sector filters, gainers/losers + IPO tracker with scoring, GMP, recommendations
- **Economics** — Economic indicators by country + calendar with upcoming data releases
- **Geopolitical** — Active conflicts with severity levels, market impact analysis, country risk heatmap
- **News** — Global financial news + forex economic calendar with currency pair impact
- **Social Intelligence** — 37+ signals from Trump, Powell, Musk, Buffett with trading conclusions
- **Watchlist** — Personal watchlist for assets, events, and indicators

## Premium Key

Enter `ADMIN` in the premium activation modal for lifetime access to pro trading signals.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Monorepo | pnpm workspaces |
| Frontend | React 19 + Vite + TypeScript + Tailwind CSS v4 |
| Backend | Express 5 + TypeScript |
| Database | PostgreSQL + Drizzle ORM |
| Charts | TradingView lightweight-charts v5 |
| API Codegen | Orval (OpenAPI → React Query hooks) |
| Validation | Zod v4 |
| Build | esbuild |

## Project Structure

```
├── artifacts/
│   ├── api-server/         # Express 5 REST API
│   └── market-screener/    # React + Vite frontend
├── lib/
│   ├── api-client/         # Generated API hooks (Orval)
│   ├── api-client-react/   # React Query wrappers
│   ├── api-spec/           # OpenAPI specification
│   └── db/                 # Drizzle ORM schema + migrations
└── pnpm-workspace.yaml
```

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 9+
- PostgreSQL 15+

### Setup

```bash
# Install dependencies
pnpm install

# Set up environment
export DATABASE_URL="postgresql://user:pass@localhost:5432/globalpulse"
export SESSION_SECRET="your-session-secret"

# Push database schema
pnpm --filter @workspace/db run push

# Start API server (port from $PORT or 3001)
pnpm --filter @workspace/api-server run dev

# Start frontend (port from $PORT or 5173)
pnpm --filter @workspace/market-screener run dev
```

## API Routes

| Route | Description |
|-------|-----------|
| `GET /api/market-data` | Market assets by category |
| `GET /api/stocks` | Stock screener (NSE + US) |
| `GET /api/economic-indicators` | Economic indicators |
| `GET /api/economic-events` | Economic calendar |
| `GET /api/geopolitical` | Geopolitical events |
| `GET /api/news` | Financial news feed |
| `GET /api/social` | Social intelligence posts |
| `GET /api/forex-calendar` | Forex calendar with pair impact |
| `GET /api/ipo` | IPO listings |
| `GET /api/usd-signal` | USD direction signal |
| `GET /api/indicator/signals/:symbol` | Pro indicator signals |
| `GET /api/indicator/ohlc/:symbol` | Raw OHLC data |
| `GET /api/watchlist` | Watchlist CRUD |
