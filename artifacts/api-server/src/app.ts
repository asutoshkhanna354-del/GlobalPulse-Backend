import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { seedDatabase } from "./lib/seed";
import { startBotEngine } from "./lib/botEngine";
import { runStartupMigrations } from "./lib/startupMigrations";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (_req, res) => res.json({ status: "ok", service: "GlobalPulse API" }));
app.use("/api", router);

// Run migrations immediately (may fail on primary DB if over quota)
// then retry after 4s to catch the failover window to backup DB
async function bootstrapDatabase() {
  await runStartupMigrations();
  // Wait for potential DB failover, then ensure tables again on backup DB
  await new Promise(r => setTimeout(r, 4000));
  await runStartupMigrations();
  // Now seed and start bot on whichever DB is active
  await seedDatabase().catch((err) => logger.warn({ err }, "Seed skipped (tables may be empty)"));
  await startBotEngine().catch((err) => logger.error({ err }, "Failed to start bot engine"));
}

bootstrapDatabase().catch((err) => logger.error({ err }, "Bootstrap failed"));

export default app;
