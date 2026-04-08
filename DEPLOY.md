# GlobalPulse Intelligence — Self-Hosting Guide
## Netlify (Frontend) + Render (Backend + PostgreSQL)

---

## What You Need Before Starting

| Account | Free? | Sign up at |
|---------|-------|-----------|
| GitHub | Free | github.com |
| Render | Free tier available | render.com |
| Netlify | Free tier available | netlify.com |
| Finnhub | Free | finnhub.io/register |
| Twelve Data | Free | twelvedata.com/register |
| OpenAI | Pay-per-use | platform.openai.com/api-keys |

---

## Step 1 — Push Code to GitHub

1. Create a new **private** GitHub repository (e.g. `globalpulse`)
2. Push this entire project folder to it:

```bash
git init
git add .
git commit -m "GlobalPulse Intelligence"
git remote add origin https://github.com/YOUR_USERNAME/globalpulse.git
git push -u origin main
```

---

## Step 2 — Set Up PostgreSQL on Render

1. Go to **render.com** → Sign in → **New** → **PostgreSQL**
2. Fill in:
   - **Name**: `globalpulse-db`
   - **Region**: Singapore (or closest to you)
   - **Plan**: Free
3. Click **Create Database**
4. Wait ~1 min. Then click the database → copy the **External Database URL**
5. Keep this URL handy — you'll need it in Step 3

### Create the Database Tables

After the database is ready:

1. In Render, click your database → **PSQL Command** tab → copy the `psql` command shown
2. Run it in your terminal — it opens a PostgreSQL shell
3. Paste and run the full contents of **`schema.sql`** (included in this package)

Alternatively, use any PostgreSQL client (DBeaver, TablePlus, pgAdmin) with the External Database URL, then run the `schema.sql` file.

---

## Step 3 — Deploy Backend on Render

### Option A — One-Click with render.yaml (easiest)

1. Go to **render.com** → **New** → **Blueprint**
2. Connect your GitHub repo
3. Render auto-detects `render.yaml` and sets up everything
4. After the deploy, click your service → **Environment** tab → add:
   - `FINNHUB_API_KEY` = your key
   - `TWELVE_DATA_API_KEY` = your key
   - `OPENAI_API_KEY` = your key (starts with `sk-proj-...`)
5. Click **Save Changes** — Render restarts with the new keys

### Option B — Manual Setup

1. **New** → **Web Service** → connect your GitHub repo
2. Fill in:
   - **Name**: `globalpulse-api`
   - **Runtime**: Node
   - **Build Command**:
     ```
     npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build
     ```
   - **Start Command**:
     ```
     node artifacts/api-server/dist/index.mjs
     ```
   - **Plan**: Free
3. Under **Environment Variables**, add:

   | Key | Value |
   |-----|-------|
   | `DATABASE_URL` | External DB URL from Step 2 |
   | `FINNHUB_API_KEY` | Your Finnhub key |
   | `TWELVE_DATA_API_KEY` | Your Twelve Data key |
   | `OPENAI_API_KEY` | Your OpenAI key |
   | `NODE_ENV` | `production` |
   | `PORT` | `8080` |

4. Click **Create Web Service**

Your backend URL will look like: `https://globalpulse-api.onrender.com`

**Test it:** Open `https://globalpulse-api.onrender.com/api/health` — should return `{"status":"ok"}`

---

## Step 4 — Deploy Frontend on Netlify

1. Go to **netlify.com** → **Add new site** → **Import an existing project**
2. Connect GitHub → select your repo
3. Netlify auto-detects `netlify.toml`. Build settings:
   - **Build command**: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/market-screener run build`
   - **Publish directory**: `artifacts/market-screener/dist`
4. Under **Environment variables** (before clicking Deploy), add:

   | Key | Value |
   |-----|-------|
   | `VITE_API_URL` | Your Render backend URL e.g. `https://globalpulse-api.onrender.com` |

5. Click **Deploy site**

Your frontend URL will look like: `https://globalpulse-intelligence.netlify.app`

---

## Step 5 — Get Your API Keys

### Finnhub (US stocks, forex, crypto WebSocket streaming)
1. Register free at **https://finnhub.io/register**
2. Dashboard → **API Key** → copy it
3. Free tier includes full WebSocket access

### Twelve Data (Indian NSE/BSE WebSocket backup)
1. Register free at **https://twelvedata.com/register**
2. Dashboard → **API Key** → copy it
3. Free tier: 800 API calls/day + WebSocket

### OpenAI (AI predictions — Nifty, BTC, USD signal, chart analysis)
1. Go to **https://platform.openai.com/api-keys**
2. Click **Create new secret key** → copy it
3. Add payment method + $5 credit minimum (Billing section)
4. Typical cost: ~$0.001–$0.003 per prediction call
5. The app runs 4 AI calls roughly every 30 minutes = very cheap

### VAPID Keys (Push Notifications — optional)
```bash
npx web-push generate-vapid-keys
```
Copy the public + private keys into Render environment variables:
- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_CONTACT_EMAIL` (any email)

---

## Step 6 — Verify Everything Works

1. Open your Netlify URL
2. Market Screener loads with live prices → green "Live Stream" pulsing dot
3. Click any symbol → chart opens with live candles and AI signals
4. NSE Indian stocks show at 300ms update speed
5. NIFTY, BANKNIFTY, FINNIFTY stream in real-time

---

## Architecture

```
Browser
  │
  ▼
Netlify (React + Vite frontend)
  │  REST → /api/*
  │  WebSocket → /ws/prices
  ▼
Render Web Service (Node.js, port 8080)
  ├── Finnhub WebSocket      → US stocks, forex, crypto (~1,600 ticks/5s)
  ├── Twelve Data WebSocket  → Indian NSE/BSE (backup)
  ├── NSE unofficial API     → All 51 NIFTY50 stocks @ 300ms + candle engine (1s/5s/1m)
  ├── TradingView scanner    → Gold, oil, indices, commodities @ 60s
  └── OpenAI GPT-4           → AI analysis (Nifty, BTC, USD, chart signals)
  │
  ▼
Render PostgreSQL
  └── 14 tables: market data, news, IPOs, Nifty/BTC analysis,
                 USD signals, forex calendar, watchlist, push subscriptions
```

---

## Troubleshooting

**Backend won't start**
- Check Render **Logs** tab
- Most common cause: `DATABASE_URL` not set or wrong
- Confirm: `PORT=8080` is in environment

**Frontend shows blank / API errors**
- Browser console → almost always `VITE_API_URL` wrong or missing
- Must use `https://` not `http://` in production
- No trailing slash: `https://globalpulse-api.onrender.com` ✓

**WebSocket not connecting**
- Render supports WebSockets on free tier
- Browser requires `wss://` (secure) when site is HTTPS — the app does this automatically

**AI shows "fallback analysis"**
- `OPENAI_API_KEY` missing, invalid, or out of credit
- Rule-based fallback still works, but add the key for full AI

**NSE data not updating**
- NSE blocks some cloud datacenter IPs intermittently
- Twelve Data WebSocket takes over as backup automatically
- No action needed

**Render free tier sleeps after 15 min inactivity**
- Set up a free uptime monitor at **uptimerobot.com**
- Create HTTP monitor → ping `https://globalpulse-api.onrender.com/api/health` every 5 minutes
- Or upgrade to Render Starter ($7/month) for always-on

---

## Environment Variables — Complete Reference

Set on **Render** (backend):

| Variable | Required | Where to get |
|----------|----------|-------------|
| `DATABASE_URL` | YES | Render PostgreSQL → External URL |
| `FINNHUB_API_KEY` | YES | finnhub.io → Dashboard |
| `TWELVE_DATA_API_KEY` | YES | twelvedata.com → Dashboard |
| `OPENAI_API_KEY` | YES | platform.openai.com/api-keys |
| `VAPID_PUBLIC_KEY` | Optional | `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | Optional | `npx web-push generate-vapid-keys` |
| `VAPID_CONTACT_EMAIL` | Optional | Any email address |
| `PORT` | Auto | Render sets this (use 8080) |
| `NODE_ENV` | Auto | Set to `production` |

Set on **Netlify** (frontend):

| Variable | Required | Value |
|----------|----------|-------|
| `VITE_API_URL` | YES | Your Render backend URL |
