GlobalPulse Intelligence — Deployment Package
=============================================

FOLDER STRUCTURE:
  backend/         → Deploy on Render (Node.js server)
  frontend/        → Deploy on Netlify (static site)

═══════════════════════════════════════════
STEP 1 — SET UP CockroachDB TABLES (once)
═══════════════════════════════════════════
1. Go to https://cockroachlabs.cloud → Databases → your cluster → Connect
2. Open SQL Shell or use any PostgreSQL client
3. Run the SQL in:  backend/setup_cockroachdb.sql
   (This creates all 13 tables. Safe to re-run — uses IF NOT EXISTS)

═══════════════════════════════════════════
STEP 2 — DEPLOY BACKEND ON RENDER
═══════════════════════════════════════════
Option A — GitHub repo (recommended):
  1. Push the contents of backend/ folder to a GitHub repo
  2. In Render → New Web Service → connect your repo
  3. Build Command:  echo "pre-built"
  4. Start Command:  node --enable-source-maps dist/index.mjs
  5. Region: Frankfurt (EU) — important for Binance WebSocket access

Option B — Manual deploy:
  Use Render's "Manual Deploy" with the dist/ folder

ENVIRONMENT VARIABLES to set on Render:
  ┌──────────────────────────┬────────────────────────────────────────────┐
  │ Variable                 │ Value                                      │
  ├──────────────────────────┼────────────────────────────────────────────┤
  │ NODE_ENV                 │ production                                 │
  │ PORT                     │ 10000                                      │
  │ DATABASE_URL             │ (CockroachDB URL — in .env file)          │
  │ DATABASE_BACKUP_URL      │ (Neon URL — in .env file)                 │
  │ GROQ_API_KEY             │ (in .env file)                            │
  │ FINNHUB_API_KEY          │ Your key from finnhub.io/dashboard        │
  │ TWELVE_DATA_API_KEY      │ Your key from twelvedata.com              │
  └──────────────────────────┴────────────────────────────────────────────┘
  NOTE: The .env file has all values filled in EXCEPT FINNHUB and TWELVE_DATA.
        Add those from your API dashboards.

UptimeRobot (keep Render from sleeping on free tier):
  → Ping: https://YOUR-RENDER-URL.onrender.com/api/market-data/summary
  → Every 14 minutes

═══════════════════════════════════════════
STEP 3 — DEPLOY FRONTEND ON NETLIFY
═══════════════════════════════════════════
1. Log in to app.netlify.com → Add new site → Deploy manually
2. Drag and drop the entire frontend/ folder
3. That's it — _redirects file auto-proxies /api/* to your Render backend

IMPORTANT: Edit frontend/_redirects BEFORE uploading if your Render URL
is different from:  https://globalpulse-backend.onrender.com
Replace that URL with your actual Render service URL.

═══════════════════════════════════════════
HOW THE DATABASE FAILOVER WORKS
═══════════════════════════════════════════
• On startup: Backend pings CockroachDB
  → If OK: "Connected to primary database (CockroachDB)"
  → If fail: "Primary unavailable — using backup (Neon)"
• Every 5 minutes: silently retries CockroachDB
  → If recovered: switches back automatically
• No restart needed — failover is fully automatic

═══════════════════════════════════════════
EXPECTED HARMLESS LOG NOISE
═══════════════════════════════════════════
• Finnhub 429 on startup → recovers in ~30s
• ForexFactory 403 → falls back to RSS feed
• TwelveData WS 1006 → free tier reconnects every ~60s (normal)
• Binance WS works on Frankfurt EU (NOT on US servers)
