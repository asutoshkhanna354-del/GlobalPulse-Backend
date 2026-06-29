import http from "http";
import app from "./app";
import { logger } from "./lib/logger";
import { initPriceStream } from "./lib/priceStream.js";
import { refreshNewsIfStale } from "./lib/newsRefresh.js";
import { refreshMarketDataIfStale } from "./lib/marketRefresh.js";
import { refreshSocialIfStale } from "./lib/socialRefresh.js";
import { refreshIpoData } from "./lib/ipoRefresh.js";
import { refreshUsdSignal } from "./lib/usdSignalRefresh.js";
import { refreshForexCalendar } from "./lib/forexCalendarRefresh.js";
import { refreshNiftyComprehensive } from "./lib/niftyAnalysisRefresh.js";
import { refreshBtcComprehensive, refreshBtcCandle4h } from "./lib/bitcoinAnalysisRefresh.js";
import { checkAndSendSignalNotifications } from "./lib/signalNotifier.js";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Use an HTTP server so we can attach WebSocket server to the same port
const httpServer = http.createServer(app);

httpServer.listen(port, (err?: Error) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  // Start real-time WebSocket price streaming
  initPriceStream(httpServer);

  refreshMarketDataIfStale(true).then(() => {
    logger.info("Market data initial refresh done");
    refreshUsdSignal().then(r => logger.info(r, "USD signal initial refresh done")).catch(() => {});
  }).catch(() => {});
  refreshNewsIfStale(true).then(r => logger.info({ count: r.count }, "News initial refresh done")).catch(() => {});
  refreshSocialIfStale(true).then(r => logger.info({ count: r.count }, "Social intelligence initial refresh done")).catch(() => {});
  refreshIpoData().then(r => logger.info({ count: r.count }, "IPO data initial refresh done")).catch(() => {});
  refreshForexCalendar().then(r => logger.info({ count: r.count }, "Forex calendar initial refresh done")).catch(() => {});

  refreshBtcComprehensive().then(r => logger.info(r, "BTC comprehensive initial refresh done")).catch(() => {});
  setTimeout(() => {
    refreshBtcCandle4h().then(r => logger.info(r, "BTC 4h candle initial refresh done")).catch(() => {});
  }, 15000);

  // Initial refresh for Nifty if market is open
  refreshNiftyComprehensive().then(r => logger.info(r, "Nifty comprehensive initial refresh done")).catch(() => {});
  setTimeout(() => {
    refreshNiftyCandle30m().then(r => logger.info(r, "Nifty 30m candle initial refresh done")).catch(() => {});
  }, 20000);

  // Exact Indian Market Scheduler for Nifty (Checks every minute)
  setInterval(() => {
    const now = Date.now();
    const istDate = new Date(now + 5.5 * 60 * 60 * 1000);
    const day = istDate.getUTCDay();
    const isWeekend = day === 0 || day === 6;
    if (isWeekend) return;

    const hours = istDate.getUTCHours();
    const minutes = istDate.getUTCMinutes();
    const totalMinutes = hours * 60 + minutes;

    // Trigger exactly at these minute marks (+1 minute for API data availability)
    // 9:21 (561) - Market Open first analysis
    // Comprehensive: every 60 min (9:21, 10:21, 11:21, 12:21, 13:21, 14:21, 15:21)
    const targetComp = [561, 621, 681, 741, 801, 861, 921];

    if (targetComp.includes(totalMinutes)) {
      logger.info(`[NIFTY SCHEDULE] Triggering comprehensive analysis at exact market time: ${hours}:${minutes} IST`);
      refreshNiftyComprehensive().catch(() => {});
    }
  }, 60 * 1000);

  setInterval(() => refreshMarketDataIfStale(true).catch(() => {}), 60 * 1000);
  setInterval(() => refreshNewsIfStale(true).catch(() => {}), 60 * 1000);
  setInterval(() => refreshSocialIfStale(true).catch(() => {}), 60 * 1000);
  setInterval(() => refreshIpoData().catch(() => {}), 60 * 60 * 1000);
  setInterval(() => refreshUsdSignal().catch(() => {}), 60 * 60 * 1000);
  setInterval(() => refreshForexCalendar().catch(() => {}), 60 * 60 * 1000);
  setInterval(() => refreshBtcCandle4h().catch(() => {}), 4 * 60 * 60 * 1000);

  setInterval(() => checkAndSendSignalNotifications().catch(() => {}), 2 * 60 * 1000);
});
