import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const PRIMARY_URL = process.env.DATABASE_URL;
const BACKUP_URL = process.env.DATABASE_BACKUP_URL;

if (!PRIMARY_URL && !BACKUP_URL) {
  throw new Error(
    "No database URL configured. Set DATABASE_URL (CockroachDB primary) and optionally DATABASE_BACKUP_URL (Neon backup).",
  );
}

// ── Pool configuration ─────────────────────────────────────────
const primaryPool: pg.Pool | null = PRIMARY_URL
  ? new Pool({
      connectionString: PRIMARY_URL,
      connectionTimeoutMillis: 8_000,
      idleTimeoutMillis: 30_000,
      max: 5,
    })
  : null;

const backupPool: pg.Pool | null = BACKUP_URL
  ? new Pool({
      connectionString: BACKUP_URL,
      connectionTimeoutMillis: 12_000,
      idleTimeoutMillis: 30_000,
      max: 5,
    })
  : null;

// ── Health state ───────────────────────────────────────────────
let primaryHealthy = !!primaryPool;
let lastPrimaryRetryAt = 0;
const PRIMARY_RETRY_MS = 5 * 60 * 1000; // retry primary every 5 min

function logDb(msg: string) {
  console.log(`[DB] ${msg}`);
}

// ── Resilient connect ──────────────────────────────────────────
async function resilientConnect(): Promise<pg.PoolClient> {
  const now = Date.now();

  if (primaryPool && primaryHealthy) {
    try {
      const client = await primaryPool.connect();
      return client;
    } catch (err) {
      logDb(
        `Primary (CockroachDB) connect failed — switching to backup. Reason: ${(err as Error).message}`,
      );
      primaryHealthy = false;
      lastPrimaryRetryAt = now;
    }
  }

  // Periodically retry primary in case it recovered
  if (primaryPool && !primaryHealthy && now - lastPrimaryRetryAt > PRIMARY_RETRY_MS) {
    logDb("Retrying primary (CockroachDB) connection…");
    try {
      const client = await primaryPool.connect();
      logDb("Primary (CockroachDB) is back online — switching back from backup.");
      primaryHealthy = true;
      return client;
    } catch {
      lastPrimaryRetryAt = now;
    }
  }

  if (backupPool) {
    const label = primaryPool ? "backup (Neon)" : "database (Neon)";
    try {
      const client = await backupPool.connect();
      return client;
    } catch (err) {
      logDb(`${label} also failed: ${(err as Error).message}`);
    }
  }

  // Last resort: reattempt primary even if marked unhealthy
  if (primaryPool) {
    logDb("Both pools failed — forcing primary reconnect as last resort…");
    const client = await primaryPool.connect();
    primaryHealthy = true;
    return client;
  }

  throw new Error("[DB] All database connections are unavailable.");
}

// ── Proxy pool (duck-typed so drizzle-orm uses our resilient connect) ──
const proxyPool = new Proxy(
  (backupPool ?? primaryPool) as pg.Pool,
  {
    get(target, prop) {
      if (prop === "connect") return resilientConnect;
      if (prop === "end") {
        return async () => {
          await Promise.allSettled([
            primaryPool?.end(),
            backupPool?.end(),
          ]);
        };
      }
      const value = (target as any)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  },
);

// ── Startup health check ───────────────────────────────────────
(async () => {
  if (primaryPool) {
    try {
      const client = await primaryPool.connect();
      client.release();
      logDb("Connected to primary database (CockroachDB). Backup (Neon) is on standby.");
    } catch (err) {
      logDb(
        `Primary (CockroachDB) unavailable at startup — using backup (Neon). Reason: ${(err as Error).message}`,
      );
      primaryHealthy = false;
      lastPrimaryRetryAt = Date.now();
    }
  } else {
    logDb("No primary URL set — using backup (Neon) only.");
  }
})();

// ── Exports ────────────────────────────────────────────────────
export const pool = proxyPool;
export const db = drizzle(proxyPool, { schema });
export * from "./schema";
