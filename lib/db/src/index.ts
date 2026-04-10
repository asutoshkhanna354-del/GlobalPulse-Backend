import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const PRIMARY_URL = process.env.DATABASE_URL;
const BACKUP_URL  = process.env.DATABASE_BACKUP_URL;

if (!PRIMARY_URL && !BACKUP_URL) {
  throw new Error(
    "No database URL configured. Set DATABASE_URL and optionally DATABASE_BACKUP_URL.",
  );
}

// ── Pool configuration ─────────────────────────────────────────────────────
const primaryPool: pg.Pool | null = PRIMARY_URL
  ? new Pool({ connectionString: PRIMARY_URL, connectionTimeoutMillis: 8_000, idleTimeoutMillis: 30_000, max: 5 })
  : null;

const backupPool: pg.Pool | null = BACKUP_URL
  ? new Pool({ connectionString: BACKUP_URL, connectionTimeoutMillis: 12_000, idleTimeoutMillis: 30_000, max: 5 })
  : null;

// ── Health state ───────────────────────────────────────────────────────────
let primaryHealthy     = !!primaryPool;
let lastPrimaryRetryAt = 0;
const PRIMARY_RETRY_MS = 5 * 60 * 1000;

function logDb(msg: string) { console.log(`[DB] ${msg}`); }

// Detect quota / plan-limit errors that should trigger failover
function isQuotaError(err: unknown): boolean {
  const msg = (err as Error)?.message ?? "";
  return (
    msg.includes("exceeded the data transfer quota") ||
    msg.includes("exceeded") ||
    msg.includes("quota") ||
    msg.includes("Upgrade your plan")
  );
}

// ── Wrapped client — intercepts query-level quota errors ──────────────────
function wrapClientForFailover(client: pg.PoolClient, fromPrimary: boolean): pg.PoolClient {
  if (!fromPrimary || !backupPool) return client;

  const originalQuery = client.query.bind(client) as (...args: any[]) => any;

  const wrapped = new Proxy(client, {
    get(target, prop) {
      if (prop !== "query") return (target as any)[prop];

      return async (...args: any[]) => {
        try {
          return await originalQuery(...args);
        } catch (err) {
          if (isQuotaError(err)) {
            logDb(
              `Primary (CockroachDB) quota exceeded — falling back to backup (Neon) for this query.`,
            );
            primaryHealthy     = false;
            lastPrimaryRetryAt = Date.now();
            client.release();

            // Run the same query on the backup pool
            const backupClient = await backupPool!.connect();
            try {
              const result = await (backupClient.query as any)(...args);
              backupClient.release();
              return result;
            } catch (backupErr) {
              backupClient.release();
              throw backupErr;
            }
          }
          throw err;
        }
      };
    },
  });

  return wrapped as unknown as pg.PoolClient;
}

// ── Resilient connect — tries primary, falls back to backup ───────────────
async function resilientConnect(): Promise<pg.PoolClient> {
  const now = Date.now();

  // Try to recover primary every 5 min
  if (primaryPool && !primaryHealthy && now - lastPrimaryRetryAt > PRIMARY_RETRY_MS) {
    logDb("Retrying primary (CockroachDB) connection…");
    try {
      const client = await primaryPool.connect();
      // Run a lightweight test query to detect quota before declaring healthy
      await (client as any).query("SELECT 1");
      logDb("Primary (CockroachDB) is back online — switching back from backup.");
      primaryHealthy = true;
      return wrapClientForFailover(client, true);
    } catch (err) {
      logDb(`Primary still unhealthy: ${(err as Error).message}`);
      lastPrimaryRetryAt = now;
      primaryHealthy = false;
    }
  }

  if (primaryPool && primaryHealthy) {
    try {
      const client = await primaryPool.connect();
      return wrapClientForFailover(client, true);
    } catch (err) {
      logDb(`Primary (CockroachDB) connect failed — switching to backup. Reason: ${(err as Error).message}`);
      primaryHealthy     = false;
      lastPrimaryRetryAt = now;
    }
  }

  if (backupPool) {
    try {
      const client = await backupPool.connect();
      return client;
    } catch (err) {
      logDb(`Backup (Neon) also failed: ${(err as Error).message}`);
    }
  }

  // Last resort
  if (primaryPool) {
    logDb("Both pools failed — forcing primary reconnect as last resort…");
    const client = await primaryPool.connect();
    primaryHealthy = true;
    return wrapClientForFailover(client, true);
  }

  throw new Error("[DB] All database connections are unavailable.");
}

// ── Proxy pool (duck-typed so drizzle-orm uses our resilient connect) ─────
const proxyPool = new Proxy(
  (backupPool ?? primaryPool) as pg.Pool,
  {
    get(target, prop) {
      if (prop === "connect") return resilientConnect;
      if (prop === "end") {
        return async () => {
          await Promise.allSettled([primaryPool?.end(), backupPool?.end()]);
        };
      }
      const value = (target as any)[prop];
      return typeof value === "function" ? value.bind(target) : value;
    },
  },
);

// ── Startup health check ───────────────────────────────────────────────────
(async () => {
  if (primaryPool) {
    try {
      const client = await primaryPool.connect();
      // Test a real query to catch quota errors at startup
      await (client as any).query("SELECT 1");
      client.release();
      logDb("Connected to primary database (CockroachDB). Backup (Neon) is on standby.");
    } catch (err) {
      const reason = (err as Error).message;
      if (isQuotaError(err)) {
        logDb(`Primary (CockroachDB) quota exceeded at startup — switching to backup (Neon). Reason: ${reason}`);
      } else {
        logDb(`Primary (CockroachDB) unavailable at startup — using backup (Neon). Reason: ${reason}`);
      }
      primaryHealthy     = false;
      lastPrimaryRetryAt = Date.now();
    }
  } else {
    logDb("No primary URL set — using backup (Neon) only.");
  }
})();

// ── Exports ────────────────────────────────────────────────────────────────
export const pool = proxyPool;
export const db   = drizzle(proxyPool, { schema });
export * from "./schema";
