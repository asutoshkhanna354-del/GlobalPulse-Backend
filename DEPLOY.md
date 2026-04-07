# GlobalPulse — Self-Hosting Deployment Guide

Deploy GlobalPulse (Global Market Intelligence Screener) on your own server or VPS.

---

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9 (`npm i -g pnpm`)
- **PostgreSQL** ≥ 15 (local or managed)
- A server with at least 1 GB RAM

---

## 1. Clone & Install

```bash
git clone <your-repo-url> globalpulse
cd globalpulse
pnpm install
```

---

## 2. Environment Variables

Create a `.env` file in the project root:

```env
# Database — PostgreSQL connection string (required)
DATABASE_URL=postgresql://user:password@localhost:5432/globalpulse

# OpenAI — for AI-powered signals & analysis (required)
AI_INTEGRATIONS_OPENAI_API_KEY=sk-...
AI_INTEGRATIONS_OPENAI_BASE_URL=https://api.openai.com/v1

# Server port — the API server + static files will run here
PORT=3000

# Frontend base path — use "/" for root deployment
BASE_PATH=/

# Session secret — random string for cookie signing (production)
SESSION_SECRET=replace-with-a-random-64-char-string

# Node environment
NODE_ENV=production

# Optional: log level (trace | debug | info | warn | error)
LOG_LEVEL=info
```

### Environment Variable Reference

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `AI_INTEGRATIONS_OPENAI_API_KEY` | Yes | OpenAI API key for signals/analysis |
| `AI_INTEGRATIONS_OPENAI_BASE_URL` | Yes | OpenAI API base URL |
| `PORT` | Yes | Port the server listens on |
| `BASE_PATH` | Yes | URL base path for the frontend (usually `/`) |
| `SESSION_SECRET` | Yes (prod) | Random secret for session signing |
| `NODE_ENV` | No | Set to `production` for optimized builds |
| `LOG_LEVEL` | No | Pino log level (default: `info`) |

---

## 3. Database Setup

```bash
# Push the schema to your PostgreSQL database
pnpm --filter @workspace/db run push
```

This creates all required tables (watchlist, IPOs, market data cache, etc.) using Drizzle ORM.

---

## 4. Build

```bash
# Build everything: API server, frontend, shared libraries
pnpm run build
```

This produces:
- **API server** → `artifacts/api-server/dist/index.mjs`
- **Frontend** → `artifacts/market-screener/dist/public/` (static HTML/JS/CSS)

---

## 5. Serve Static Frontend from API Server

For a unified single-process deployment, add static file serving to the API server.
Create or edit `artifacts/api-server/src/static.ts`:

```typescript
import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function serveStatic(app: express.Express) {
  const staticDir = path.resolve(__dirname, "../../market-screener/dist/public");
  app.use(express.static(staticDir));
  // SPA fallback — serve index.html for all non-API routes
  app.get("*", (req, res, next) => {
    if (req.path.startsWith("/api")) return next();
    res.sendFile(path.join(staticDir, "index.html"));
  });
}
```

Then in `artifacts/api-server/src/app.ts`, add after the API routes:

```typescript
import { serveStatic } from "./static";
// ... after app.use("/api", router);
if (process.env.NODE_ENV === "production") {
  serveStatic(app);
}
```

---

## 6. Run in Production

```bash
# Start the server
NODE_ENV=production node artifacts/api-server/dist/index.mjs
```

The app will be available at `http://localhost:3000` (or whatever `PORT` you set).

---

## 7. Process Manager (Recommended)

Use **PM2** to keep the server running and auto-restart on crashes:

```bash
npm i -g pm2

# Start with PM2
pm2 start artifacts/api-server/dist/index.mjs --name globalpulse

# Auto-start on system boot
pm2 startup
pm2 save

# View logs
pm2 logs globalpulse

# Restart after code updates
pm2 restart globalpulse
```

---

## 8. Reverse Proxy (Nginx)

For HTTPS and custom domains, put Nginx in front:

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    # Redirect HTTP to HTTPS
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;

    ssl_certificate     /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Get a free SSL certificate with:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

## 9. Docker (Alternative)

```dockerfile
FROM node:20-slim AS base
RUN npm i -g pnpm@9
WORKDIR /app

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY lib/ lib/
COPY artifacts/ artifacts/
COPY scripts/ scripts/

RUN pnpm install --frozen-lockfile
RUN pnpm run build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000
ENV BASE_PATH=/

CMD ["node", "artifacts/api-server/dist/index.mjs"]
```

```bash
docker build -t globalpulse .
docker run -d \
  --name globalpulse \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://user:pass@host:5432/globalpulse" \
  -e AI_INTEGRATIONS_OPENAI_API_KEY="sk-..." \
  -e AI_INTEGRATIONS_OPENAI_BASE_URL="https://api.openai.com/v1" \
  -e SESSION_SECRET="your-secret" \
  globalpulse
```

---

## 10. Data Refresh

The API server automatically runs background data refreshes on startup:

| Data Source | Interval | Description |
|---|---|---|
| Market prices | 60 seconds | Yahoo Finance + CoinGecko |
| News/RSS | 60 seconds | 10 RSS feeds (Reuters, Bloomberg, etc.) |
| Social signals | 60 seconds | Influencer signal aggregation |
| IPO data | 1 hour | IPO listings refresh |
| USD signal | 1 hour | OpenAI-powered USD direction analysis |
| Forex calendar | 1 hour | Forex economic calendar events |
| Nifty comprehensive | 1 hour | Full Nifty 50 outlook with support/resistance, demand/supply zones |
| Nifty 30m candle | 25 minutes | Periodic candle demand-supply analysis (arrives ~5 min before next 30m slot) |
| Bitcoin comprehensive | 1 hour | Full BTC outlook with support/resistance, demand/supply zones |
| Bitcoin 4h candle | 4 hours | Periodic 4-hour candle demand-supply analysis |

### AI Models Used

| Feature | Model | Description |
|---|---|---|
| USD Signal | `gpt-5.2` | Comprehensive USD direction analysis with all market data |
| Nifty Comprehensive | `gpt-5.2` | Full Nifty 50 outlook with Call/Put recommendations |
| Nifty 30m Candle | `gpt-5.2` | Periodic intraday demand-supply analysis |
| Bitcoin Comprehensive | `gpt-5.2` | Full BTC outlook with Long/Short recommendations |
| Bitcoin 4h Candle | `gpt-5.2` | Periodic crypto demand-supply analysis |
| Chart Signal Captions | `gpt-5-nano` | Short signal descriptions for chart overlays |

> **Note:** All timestamps in the UI display in IST (India Standard Time, UTC+5:30). The Nifty 30-min candle analysis is timed to arrive 5-10 minutes before each 30-minute candle slot so traders can position accordingly.

No cron jobs needed — all refresh logic runs inside the Node.js process.

---

## 11. Updating

```bash
git pull origin main
pnpm install
pnpm --filter @workspace/db run push   # apply any schema changes
pnpm run build
pm2 restart globalpulse                 # or: docker restart globalpulse
```

---

## Troubleshooting

| Issue | Solution |
|---|---|
| "Cannot connect to database" | Check `DATABASE_URL` — ensure PostgreSQL is running and the database exists |
| "OpenAI API error" | Verify `AI_INTEGRATIONS_OPENAI_API_KEY` is valid and has credits |
| Blank page on frontend | Ensure `BASE_PATH=/` is set and the build completed successfully |
| Port already in use | Change `PORT` or stop the conflicting process |
| No market data loading | Yahoo Finance may be rate-limiting; wait a few minutes for the next refresh cycle |

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│                   Nginx                      │
│              (SSL termination)               │
└──────────────────┬──────────────────────────┘
                   │
        ┌──────────▼──────────┐
        │   Express (Node.js)  │
        │   PORT=3000          │
        ├──────────────────────┤
        │  /api/*  → API routes│
        │  /*      → Static UI │
        └────┬───────────┬─────┘
             │           │
     ┌───────▼───┐  ┌────▼─────┐
     │ PostgreSQL │  │  OpenAI  │
     │  (Drizzle) │  │   API    │
     └────────────┘  └──────────┘
```
