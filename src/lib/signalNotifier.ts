import { db, pushSubscriptionsTable } from "@workspace/db";
import { computeSignals, fetchOHLC } from "./indicator.js";
import { sendSignalNotification } from "./pushNotification.js";
import { logger } from "./logger.js";

const YAHOO_MAP: Record<string, string> = {
  SPX: "^GSPC", NDX: "^NDX", DJI: "^DJI", DAX: "^GDAXI", FTSE: "^FTSE",
  N225: "^N225", HSI: "^HSI", SSEC: "000001.SS", CAC40: "^FCHI", VIX: "^VIX",
  EURUSD: "EURUSD=X", GBPUSD: "GBPUSD=X", USDJPY: "USDJPY=X", DXY: "DX-Y.NYB",
  USDCNY: "USDCNY=X", XAUUSD: "GC=F", XAGUSD: "SI=F", USOIL: "CL=F",
  BRENT: "BZ=F", NATGAS: "NG=F", COPPER: "HG=F",
  BTCUSD: "BTC-USD", ETHUSD: "ETH-USD", SOLUSD: "SOL-USD", BNBUSD: "BNB-USD",
  NIFTY50: "^NSEI", SENSEX: "^BSESN",
};

const INR_SYMBOLS = new Set(["NIFTY50", "SENSEX"]);

const lastNotifiedSignalTime: Map<string, number> = new Map();

export async function checkAndSendSignalNotifications(): Promise<void> {
  try {
    const rows = await db
      .selectDistinct({ symbol: pushSubscriptionsTable.symbol, symbolLabel: pushSubscriptionsTable.symbolLabel })
      .from(pushSubscriptionsTable);

    if (rows.length === 0) return;

    for (const row of rows) {
      try {
        const yahooSymbol = YAHOO_MAP[row.symbol.toUpperCase()] || row.symbol;
        const bars = await fetchOHLC(yahooSymbol, "3mo", "1h");
        if (!bars.length) continue;

        const result = computeSignals(bars);
        if (!result.signals.length) continue;

        const lastSignal = result.signals[result.signals.length - 1];
        const prevNotifiedTime = lastNotifiedSignalTime.get(row.symbol) ?? 0;

        if (lastSignal.timestamp <= prevNotifiedTime) continue;
        if ((lastSignal.type !== "buy" && lastSignal.type !== "sell")) continue;

        const ageMs = Date.now() - lastSignal.timestamp;
        if (ageMs > 3 * 60 * 60 * 1000) continue;

        const currency = INR_SYMBOLS.has(row.symbol.toUpperCase()) ? "INR" : "USD";
        const sent = await sendSignalNotification(
          lastSignal.type,
          row.symbol,
          row.symbolLabel,
          lastSignal.confidence,
          lastSignal.price,
          currency,
        );

        if (sent > 0) {
          lastNotifiedSignalTime.set(row.symbol, lastSignal.timestamp);
          logger.info({ symbol: row.symbol, signalType: lastSignal.type, sent }, "Signal notifications sent");
        }
      } catch (err) {
        logger.warn({ err, symbol: row.symbol }, "Error checking signal for symbol");
      }
    }
  } catch (err) {
    logger.error({ err }, "Error in signal notification check");
  }
}
