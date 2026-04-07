# GlobalPulse — Hosting & Deployment Guide

## Option 1: Replit (Easiest)

Already configured. Just click **Deploy** in the Replit workspace.

- Replit handles TLS, domain, health checks, and builds automatically
- Your app gets a `.replit.app` domain or you can connect a custom domain
- PostgreSQL database is included
- Environment secrets are managed through Replit's UI

## Option 2: Railway

1. Push code to a GitHub repo
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a PostgreSQL plugin
4. Set environment variables:
   - `DATABASE_URL` — auto-set by Railway's PostgreSQL plugin
   - `SESSION_SECRET` — any random string
   - `NODE_ENV` — `production`
5. Set build command: `pnpm install && pnpm run build`
6. Set start command: `node artifacts/api-server/dist/index.js`
7. The frontend is served as static files from the API server in production

## Option 3: Render

1. Push code to GitHub
2. Create a **Web Service** on [render.com](https://render.com)
3. Add a PostgreSQL database from Render dashboard
4. Set environment variables: `DATABASE_URL`, `SESSION_SECRET`, `NODE_ENV=production`
5. Build command: `pnpm install && pnpm run build`
6. Start command: `node artifacts/api-server/dist/index.js`

## Option 4: VPS (DigitalOcean, Hetzner, AWS EC2)

```bash
# 1. Install Node.js 20+ and PostgreSQL
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs postgresql

# 2. Install pnpm
npm install -g pnpm

# 3. Clone your repo
git clone https://github.com/your-user/globalpulse.git
cd globalpulse

# 4. Install dependencies
pnpm install

# 5. Set up PostgreSQL
sudo -u postgres createdb globalpulse
sudo -u postgres psql -c "ALTER USER postgres PASSWORD 'your-password';"

# 6. Set environment variables
export DATABASE_URL="postgresql://postgres:your-password@localhost:5432/globalpulse"
export SESSION_SECRET="$(openssl rand -hex 32)"
export NODE_ENV=production
export PORT=3000

# 7. Push database schema
pnpm --filter @workspace/db run push

# 8. Build
pnpm run build

# 9. Start with PM2
npm install -g pm2
pm2 start artifacts/api-server/dist/index.js --name globalpulse
pm2 save
pm2 startup
```

### Reverse Proxy (Nginx)

```nginx
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### SSL with Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## Option 5: Docker

Create a `Dockerfile`:

```dockerfile
FROM node:20-slim
RUN npm install -g pnpm
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm run build
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "artifacts/api-server/dist/index.js"]
```

```bash
docker build -t globalpulse .
docker run -d -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e SESSION_SECRET="..." \
  -e PORT=3000 \
  globalpulse
```

## Option 6: Vercel + Supabase

1. Frontend: Deploy `artifacts/market-screener` as a Vite app on Vercel
2. Backend: Deploy `artifacts/api-server` as a separate Vercel serverless function or on Railway/Render
3. Database: Use Supabase PostgreSQL (free tier available)
4. Set `VITE_API_URL` in Vercel env vars to point to your API URL

## Environment Variables Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `SESSION_SECRET` | Yes | Random string for session signing |
| `PORT` | No | Server port (default: 3000) |
| `NODE_ENV` | No | `production` or `development` |

## Database Setup

After setting `DATABASE_URL`, push the schema:

```bash
pnpm --filter @workspace/db run push
```

This creates all required tables automatically using Drizzle ORM.
