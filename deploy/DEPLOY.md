# GlobalPulse Intelligence — Deployment Guide

Frontend → **Netlify** | Backend → **Render** | Database → **Render PostgreSQL**

---

## Overview

| Service | Provider | Cost |
|---------|----------|------|
| Frontend (React SPA) | Netlify | Free |
| Backend API + WebSockets | Render | Free (spins down after 15min idle) |
| PostgreSQL Database | Render | Free (90-day free trial, then $7/mo) |

---

## 1. API Keys to Obtain First

Before deploying, collect these keys (all have free tiers):

| Key | Where to Get | Required? |
|-----|-------------|-----------|
| `FINNHUB_API_KEY` | https://finnhub.io/register → Dashboard → API Key | Yes |
| `TWELVE_DATA_API_KEY` | https://twelvedata.com/register → Dashboard | Yes |
| `OPENAI_API_KEY` | https://platform.openai.com/api-keys | Optional (AI signals fall back to rule-based) |
| VAPID keys | Run `npx web-push generate-vapid-keys` | Optional (push notifications) |

---

## 2. Deploy Backend to Render

### Option A — Render Blueprint (fastest, 1-click)

1. Go to https://dashboard.render.com → **New** → **Blueprint**
2. Connect your GitHub repo (push this codebase there first)
3. Render detects `render.yaml` and creates:
   - A **PostgreSQL** database named `globalpulse-db`
   - A **Web Service** named `globalpulse-api`
4. Click **Apply** — Render builds and deploys automatically
5. Once deployed, go to the Web Service → **Environment** tab and add:

```
FINNHUB_API_KEY      = <your key>
TWELVE_DATA_API_KEY  = <your key>
OPENAI_API_KEY       = <your key>          ← optional
VAPID_PUBLIC_KEY     = <generated key>     ← optional
VAPID_PRIVATE_KEY    = <generated key>     ← optional
VAPID_CONTACT_EMAIL  = admin@yourdomain.com ← optional
```

> `DATABASE_URL` and `PORT` are auto-injected by Render — do not set them manually.

6. Click **Save Changes** → the service restarts with all keys loaded
7. Copy your backend URL — it looks like: `https://globalpulse-api.onrender.com`

### Option B — Manual Web Service

1. Go to https://dashboard.render.com → **New** → **Web Service**
2. Connect your repo
3. Fill in:
   - **Root Directory**: `.` (repo root)
   - **Runtime**: Node
   - **Build Command**:
     ```
     npm install -g pnpm && pnpm install --frozen-lockfile && pnpm --filter @workspace/api-server run build
     ```
   - **Start Command**:
     ```
     node --enable-source-maps artifacts/api-server/dist/index.mjs
     ```
   - **Health Check Path**: `/api/market-data/summary`
4. Under **Environment Variables**, add all vars from `.env.example`
5. Create a **PostgreSQL** database separately:
   - **New** → **PostgreSQL** → name it `globalpulse-db`
   - Copy the **Internal Database URL** and set it as `DATABASE_URL` in your web service

---

## 3. Initialize the Database

The app auto-runs `db:push` and seeds on first start. If you need to create tables manually:

1. In Render dashboard → your PostgreSQL instance → **Shell** tab
2. Paste the contents of `schema.sql` and run it

Or connect locally:
```bash
psql "$DATABASE_URL" -f schema.sql
```

---

## 4. Deploy Frontend to Netlify

### Option A — Netlify UI (recommended)

1. Go to https://app.netlify.com → **Add new site** → **Import an existing project**
2. Connect your GitHub repo
3. Set build settings:
   - **Base directory**: `artifacts/market-screener`
   - **Build command**: `npm install -g pnpm && pnpm install --frozen-lockfile && pnpm run build:netlify`
   - **Publish directory**: `dist/public`
4. Under **Site configuration** → **Environment variables**, add:
   ```
   VITE_API_URL = https://globalpulse-api.onrender.com
   ```
   (Use your actual Render backend URL from Step 2)
5. Click **Deploy site**

> The `netlify.toml` file in the repo root handles redirects (SPA routing) and caching headers automatically.

### Option B — Netlify CLI

```bash
npm install -g netlify-cli

# In the repo root
cd artifacts/market-screener
VITE_API_URL=https://globalpulse-api.onrender.com pnpm run build:netlify

netlify deploy --prod --dir=dist/public
```

---

## 5. Connect Frontend → Backend (CORS)

The backend allows all origins by default in production. If you want to lock it to your Netlify domain, set this env var on Render:

```
ALLOWED_ORIGINS = https://your-site.netlify.app
```

---

## 6. WebSocket Connection

The frontend connects to `VITE_API_URL` for:
- `wss://<your-render-url>/ws/prices` — real-time price stream
- `https://<your-render-url>/api/*` — REST endpoints

Both work on Render's free tier. Note: free Render services spin down after 15 minutes of inactivity — the first request after spin-down takes ~30 seconds.

To avoid spin-down on free tier, set up a free uptime monitor at https://uptimerobot.com pointing at:
```
https://globalpulse-api.onrender.com/api/market-data/summary
```
(Ping every 14 minutes)

---

## 7. Custom Domain (Optional)

**Netlify**: Site settings → Domain management → Add custom domain → Follow DNS instructions

**Render**: Web service → Settings → Custom domain → Add domain

---

## 8. Environment Variables Reference

### Backend (Render)

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes (auto) | PostgreSQL connection string — auto-set by Render |
| `PORT` | Yes (auto) | Server port — auto-set by Render to `10000` |
| `FINNHUB_API_KEY` | Yes | Finnhub API for US stocks, forex, global indices |
| `TWELVE_DATA_API_KEY` | Yes | Twelve Data for Indian markets (NSE/BSE) |
| `OPENAI_API_KEY` | Optional | AI signal analysis — falls back to rule-based if absent |
| `VAPID_PUBLIC_KEY` | Optional | Web push notification public key |
| `VAPID_PRIVATE_KEY` | Optional | Web push notification private key |
| `VAPID_CONTACT_EMAIL` | Optional | Contact email for push service |
| `NODE_ENV` | Yes | Set to `production` |
| `LOG_LEVEL` | Optional | `info` (default), `debug`, `warn`, `error` |

### Frontend (Netlify)

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_API_URL` | Yes | Your Render backend URL (e.g. `https://globalpulse-api.onrender.com`) |

---

## 9. Data Sources (No Extra Setup Needed)

These run automatically with no extra keys:

| Source | What it provides | Key needed? |
|--------|-----------------|-------------|
| **Binance WebSocket** | BTC, ETH, SOL, BNB, XRP real-time at exchange speed | No |
| **NSE Unofficial API** | Indian equities & indices at 300ms | No |
| **TradingView Scanner** | Gold, Silver, Oil, Commodities, Global indices @ 60s | No |
| **Finnhub WebSocket** | US stocks, forex | `FINNHUB_API_KEY` |
| **Twelve Data WebSocket** | Indian markets backup | `TWELVE_DATA_API_KEY` |

---

## 10. Verify Everything Works

After deploying, check these URLs:

```
https://globalpulse-api.onrender.com/api/market-data/summary   → JSON with market prices
https://globalpulse-api.onrender.com/api/news/breaking          → Latest news
https://your-site.netlify.app                                   → Live frontend
```

WebSocket test (in browser console on your Netlify site):
```javascript
const ws = new WebSocket('wss://globalpulse-api.onrender.com/ws/prices');
ws.onmessage = m => console.log(JSON.parse(m.data));
```
You should see price ticks within a few seconds.

---

## 11. Generating VAPID Keys (Push Notifications)

```bash
npx web-push generate-vapid-keys
```

Copy the output to Render environment variables:
```
VAPID_PUBLIC_KEY  = <Public Key from output>
VAPID_PRIVATE_KEY = <Private Key from output>
VAPID_CONTACT_EMAIL = your@email.com
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Render service shows "Build failed" | Check build logs — usually a missing `pnpm install` or Node version issue. Set `NODE_VERSION=20` in Render env |
| Frontend shows "Network Error" | Make sure `VITE_API_URL` is set correctly on Netlify and does **not** have a trailing slash |
| WebSocket not connecting | Render free tier may be sleeping — wait 30s and retry. Set up UptimeRobot |
| No live prices | Verify `FINNHUB_API_KEY` and `TWELVE_DATA_API_KEY` are set. Check Render logs for `[priceStream]` messages |
| Database connection error | Check `DATABASE_URL` format: `postgresql://user:pass@host:5432/dbname` |
| Push notifications not working | VAPID keys must be a matched keypair — regenerate with `npx web-push generate-vapid-keys` |
