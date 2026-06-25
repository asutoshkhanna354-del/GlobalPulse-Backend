import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema";

const { Pool } = pg;

const PRIMARY_URL = process.env.DATABASE_URL;
const BACKUP_URL  = process.env.DATABASE_BACKUP_URL;

if (!PRIMARY_URL && !BACKUP_URL) {
  throw new Error("No database URL configured. Set DATABASE_URL and optionally DATABASE_BACKUP_URL.");
}

// ── Pool instances ────────────────────────────────────────────────────────────
const primaryPool: pg.Pool | null = PRIMARY_URL
  ? new Pool({ connectionString: PRIMARY_URL, connectionTimeoutMillis: 8_000, idleTimeoutMillis: 30_000, max: 5 })
  : null;

const backupPool: pg.Pool | null = BACKUP_URL
  ? new Pool({ connectionString: BACKUP_URL, connectionTimeoutMillis: 12_000, idleTimeoutMillis: 30_000, max: 5 })
  : null;

// ── Mutable active pool — ALL drizzle operations read this reference ──────────
// Switching this variable instantly redirects every query (connect + direct query)
let activePool: pg.Pool = primaryPool ?? backupPool!;

let primaryHealthy     = !!primaryPool;
let lastPrimaryRetryAt = 0;
const PRIMARY_RETRY_MS = 5 * 60 * 1000;

function logDb(msg: string) { console.log(`[DB] ${msg}`); }

function isQuotaError(err: unknown): boolean {
  const msg = String((err as Error)?.message ?? "");
  return msg.includes("exceeded") || msg.includes("quota") || msg.includes("Upgrade your plan");
}

function switchToBackup(reason: string) {
  if (!backupPool) return;
  primaryHealthy     = false;
  lastPrimaryRetryAt = Date.now();
  activePool         = backupPool;          // ← all future pool ops go to Neon
  logDb(`Switched to backup (Neon). Reason: ${reason}`);
}

// ── Resilient connect — used by drizzle for transaction sessions ──────────────
async function resilientConnect(): Promise<pg.PoolClient> {
  const now = Date.now();

  // Periodically retry primary
  if (primaryPool && !primaryHealthy && now - lastPrimaryRetryAt > PRIMARY_RETRY_MS) {
    logDb("Retrying primary (CockroachDB)…");
    try {
      const client = await primaryPool.connect();
      await client.query("SELECT count(*) FROM market_assets LIMIT 0");
      client.release();
      logDb("Primary (CockroachDB) is back — switching from backup.");
      primaryHealthy = true;
      activePool     = primaryPool;
    } catch (err) {
      logDb(`Primary still unhealthy: ${(err as Error).message}`);
      lastPrimaryRetryAt = now;
      if (isQuotaError(err)) switchToBackup((err as Error).message);
    }
  }

  try {
    return await activePool.connect();
  } catch (err) {
    if (primaryPool && primaryHealthy && isQuotaError(err)) {
      switchToBackup((err as Error).message);
      return await backupPool!.connect();
    }
    // Last resort: try the other pool
    const other = activePool === primaryPool ? backupPool : primaryPool;
    if (other) {
      logDb(`Active pool connect failed — trying other pool.`);
      return await other.connect();
    }
    throw err;
  }
}

// ── Proxy pool — ALL pg.Pool operations read activePool dynamically ───────────
// This means pool.query(), pool.connect(), pool.totalCount etc. all route
// through whichever pool is currently active (primary or backup).
const proxyPool = new Proxy({} as pg.Pool, {
  get(_, prop: string | symbol) {
    if (prop === "connect") return resilientConnect;
    if (prop === "end") {
      return async () => {
        await Promise.allSettled([primaryPool?.end(), backupPool?.end()]);
      };
    }
    const value = (activePool as any)[prop as string];
    return typeof value === "function" ? value.bind(activePool) : value;
  },
});

// ── Startup health check — uses a real-data query to detect quota errors ──────
(async () => {
  if (!primaryPool) {
    logDb("No primary URL — using backup (Neon) only.");
    return;
  }
  try {
    const client = await primaryPool.connect();
    try {
      // Real-data test: quota errors show up on actual table reads, not SELECT 1
      await client.query("SELECT 1 FROM information_schema.tables LIMIT 1");
    } finally {
      client.release();
    }
    logDb("Connected to primary (CockroachDB). Backup (Neon) is on standby.");
  } catch (err) {
    const reason = (err as Error).message;
    if (isQuotaError(err)) {
      logDb(`Primary quota exceeded at startup — switching to backup (Neon). Reason: ${reason}`);
    } else {
      logDb(`Primary unavailable at startup — switching to backup (Neon). Reason: ${reason}`);
    }
    switchToBackup(reason);
  }
})();

// ── Exports ───────────────────────────────────────────────────────────────────
export const pool = proxyPool;
export const db   = drizzle(proxyPool, { schema });
export * from "./schema";
