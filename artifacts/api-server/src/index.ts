import app from "./app";
import { logger } from "./lib/logger";
import { refreshNewsIfStale } from "./lib/newsRefresh.js";
import { refreshMarketDataIfStale } from "./lib/marketRefresh.js";
import { refreshSocialIfStale } from "./lib/socialRefresh.js";
import { refreshIpoData } from "./lib/ipoRefresh.js";
import { refreshUsdSignal } from "./lib/usdSignalRefresh.js";
import { refreshForexCalendar } from "./lib/forexCalendarRefresh.js";
import { refreshNiftyComprehensive, refreshNiftyCandle30m } from "./lib/niftyAnalysisRefresh.js";
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  refreshMarketDataIfStale(true).then(() => {
    logger.info("Market data initial refresh done");
    refreshUsdSignal().then(r => logger.info(r, "USD signal initial refresh done")).catch(() => {});
  }).catch(() => {});
  refreshNewsIfStale(true).then(r => logger.info({ count: r.count }, "News initial refresh done")).catch(() => {});
  refreshSocialIfStale(true).then(r => logger.info({ count: r.count }, "Social intelligence initial refresh done")).catch(() => {});
  refreshIpoData().then(r => logger.info({ count: r.count }, "IPO data initial refresh done")).catch(() => {});
  refreshForexCalendar().then(r => logger.info({ count: r.count }, "Forex calendar initial refresh done")).catch(() => {});

  refreshNiftyComprehensive().then(r => logger.info(r, "Nifty comprehensive initial refresh done")).catch(() => {});
  setTimeout(() => {
    refreshNiftyCandle30m().then(r => logger.info(r, "Nifty 30m candle initial refresh done")).catch(() => {});
  }, 10000);

  refreshBtcComprehensive().then(r => logger.info(r, "BTC comprehensive initial refresh done")).catch(() => {});
  setTimeout(() => {
    refreshBtcCandle4h().then(r => logger.info(r, "BTC 4h candle initial refresh done")).catch(() => {});
  }, 15000);

  setInterval(() => refreshMarketDataIfStale(true).catch(() => {}), 60 * 1000);
  setInterval(() => refreshNewsIfStale(true).catch(() => {}), 60 * 1000);
  setInterval(() => refreshSocialIfStale(true).catch(() => {}), 60 * 1000);
  setInterval(() => refreshIpoData().catch(() => {}), 60 * 60 * 1000);
  setInterval(() => refreshUsdSignal().catch(() => {}), 60 * 60 * 1000);
  setInterval(() => refreshForexCalendar().catch(() => {}), 60 * 60 * 1000);
  setInterval(() => refreshNiftyComprehensive().catch(() => {}), 60 * 60 * 1000);
  setInterval(() => refreshBtcComprehensive().catch(() => {}), 60 * 60 * 1000);
  setInterval(() => refreshBtcCandle4h().catch(() => {}), 4 * 60 * 60 * 1000);

  setInterval(() => checkAndSendSignalNotifications().catch(() => {}), 2 * 60 * 1000);

  function scheduleNextNiftyCandle() {
    const now = Date.now();
    const istOffset = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now + istOffset);
    const minutes = istNow.getUTCMinutes();
    const remainder = minutes % 30;
    const minsToNextSlot = remainder === 0 ? 30 : 30 - remainder;
    const deliveryLeadMs = 5 * 60 * 1000;
    let delayMs = (minsToNextSlot * 60 * 1000) - deliveryLeadMs;
    if (delayMs < 60 * 1000) delayMs += 30 * 60 * 1000;
    logger.info({ nextRefreshInMin: (delayMs / 60000).toFixed(1) }, "Scheduling next Nifty 30m candle refresh");
    setTimeout(() => {
      refreshNiftyCandle30m().catch(() => {});
      scheduleNextNiftyCandle();
    }, delayMs);
  }
  scheduleNextNiftyCandle();
});
