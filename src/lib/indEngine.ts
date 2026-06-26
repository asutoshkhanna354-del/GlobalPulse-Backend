import { db } from "@workspace/db";
import { brokerConnectionsTable, botTradesTable, botSettingsTable } from "@workspace/db";
import { logger } from "./logger.js";
import { eq } from "drizzle-orm";
import { NotificationEngine } from "../services/core/NotificationEngine.js";
import { BrokerFactory } from "../services/brokers/BrokerFactory.js";
import { OptionChainEngine } from "../services/trading/OptionChainEngine.js";
import { RiskEngine } from "../services/trading/RiskEngine.js";
import Cerebras from '@cerebras/cerebras_cloud_sdk';
import { PlaceOrderParams } from "../services/brokers/IBrokerAdapter.js";

let indLoopTimer: NodeJS.Timeout | null = null;
let initialized = false;

// Initialize Cerebras Client
const cerebras = new Cerebras({
  apiKey: process.env['CEREBRAS_API_KEY_ALGO'] || process.env['CEREBRAS_API_KEY_ALGO_FALLBACK']
});

async function getAISignal(marketContext: string, model: string = 'gpt-oss-120b'): Promise<{ direction: "BUY" | "SELL" | "HOLD"; confidence: number }> {
  try {
    const completion = await cerebras.chat.completions.create({
      messages: [
        { role: "system", content: "You are a quantitative AI trading model. Based on market context, reply with a JSON object: { \"direction\": \"BUY\" | \"SELL\" | \"HOLD\", \"confidence\": number (0-100) }." },
        { role: "user", content: marketContext }
      ],
      model: model,
      max_completion_tokens: 1024,
      temperature: 0.2,
      top_p: 1,
      stream: false,
    });
    const res = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(res);
    return {
      direction: parsed.direction || "HOLD",
      confidence: parsed.confidence || 0
    };
  } catch (err) {
    logger.error("[ind-bot] Failed to fetch AI signal from Cerebras");
    return { direction: "HOLD", confidence: 0 };
  }
}

async function runIndCycleForBroker(brokerId: number, userId: number) {
  try {
    const [broker] = await db.select().from(brokerConnectionsTable).where(eq(brokerConnectionsTable.id, brokerId)).limit(1);
    if (!broker || !broker.isActive) return;

    logger.info(`[ind-bot] Running cycle for user ${userId} on broker ${broker.broker}`);

    // Fetch user settings
    const [settings] = await db.select().from(botSettingsTable).where(eq(botSettingsTable.userId, userId)).limit(1);
    const riskPercent = settings?.riskPercent ?? 2;
    const model = settings?.model ?? 'gpt-oss-120b';

    // 1. Initialize Broker Adapter
    const adapter = BrokerFactory.getAdapter(broker.broker, {
      client_id: broker.accountId || "",
      access_token: broker.accessToken || "",
      api_key: broker.apiKey || "",
      api_secret: broker.apiSecret || ""
    });

    // 2. Fetch Funds & Market Data
    const funds = await adapter.getFunds();
    const ltpMap = await adapter.getLTP(["NIFTY_50_MOCK_TOKEN"]);
    const currentSpotPrice = ltpMap["NIFTY_50_MOCK_TOKEN"] || 22100;

    // 3. Fetch AI Signal
    const signal = await getAISignal(`Live NIFTY spot price is ${currentSpotPrice}. Institutional OI is bullish. Global markets are stable.`, model);
    if (signal.direction === "HOLD" || signal.confidence < 60) return;

    // 4. Resolve Strike via Option Chain
    const optionType = signal.direction === "BUY" ? "CE" : "PE";
    const contract = await OptionChainEngine.resolveContract("NIFTY", optionType, currentSpotPrice);
    if (!contract) return;

    // 5. Risk Engine Validation
    const orderParams: PlaceOrderParams = {
      tradingSymbol: contract.tradingSymbol,
      exchange: "NFO",
      transactionType: "BUY", // Always buying options in this strategy
      orderType: "MARKET",
      productType: "MIS",
      quantity: contract.lotSize
    };

    // Assume average premium is ~150 rupees
    const projectedPremiumLTP = 150; 
    const risk = await RiskEngine.validateOrder(orderParams, funds.availableMargin, projectedPremiumLTP, riskPercent);

    if (!risk.allowed || risk.quantityAllowed < contract.lotSize) {
      logger.warn(`[ind-bot] Trade blocked by Risk Engine: ${risk.reason}`);
      return;
    }

    orderParams.quantity = risk.quantityAllowed;

    // 6. Execute Trade
    let executionStatus = broker.environment;
    let orderId = "";
    
    if (broker.environment === "paper") {
      orderId = `PAPER_${Date.now()}`;
      logger.info(`[ind-bot] Paper trade generated: ${orderId}`);
    } else {
      try {
        orderId = await adapter.placeOrder(orderParams);
        logger.info(`[ind-bot] Live trade placed on exchange: ${orderId}`);
      } catch (err) {
        logger.error(`[ind-bot] LIVE Broker execution failed. Aborting trade entry. Error: ${err}`);
        await NotificationEngine.notifyUser(userId, `IND AutoTrade Error`, `Trade failed to execute on broker ${broker.broker}: ${err}`, "TRADE_EXECUTION");
        return; // Abort saving the trade to DB since it didn't execute
      }
    }

    // 7. Record & Notify
    const [trade] = await db.insert(botTradesTable).values({
      userId,
      symbol: contract.tradingSymbol,
      symbolLabel: contract.tradingSymbol,
      direction: signal.direction, // Logical direction for underlying
      entryPrice: projectedPremiumLTP,
      targetPrice: projectedPremiumLTP * 1.5,
      stopLoss: projectedPremiumLTP * 0.8,
      currentPrice: projectedPremiumLTP,
      pnl: 0,
      pnlPercent: 0,
      status: "open",
      tradeType: "INTRADAY",
      confidence: signal.confidence,
      reasoning: `AI matched NIFTY spot ${currentSpotPrice}. Selected ${contract.strikePrice} ${optionType}.`,
      lotSize: risk.quantityAllowed,
      riskPercent
    }).returning();

    await NotificationEngine.notifyUser(userId, `IND AutoTrade Execution`, `Bought ${risk.quantityAllowed} qty of ${contract.tradingSymbol}. Execution: ${executionStatus.toUpperCase()}`, "TRADE_EXECUTION");

  } catch (err) {
    logger.error(`[ind-bot] runIndCycleForBroker(${brokerId}): ${err}`);
  }
}

async function runIndCycleForAllBrokers() {
  try {
    const activeBrokers = await db.select().from(brokerConnectionsTable).where(eq(brokerConnectionsTable.isActive, true));
    for (const broker of activeBrokers) {
      if (broker.userId) {
        await runIndCycleForBroker(broker.id, broker.userId);
      }
    }
  } catch (err) {
    logger.error(`[ind-bot] runIndCycleForAllBrokers: ${err}`);
  }
}

export async function startIndEngine() {
  if (initialized) return;
  initialized = true;
  logger.info("[ind-bot] IND AutoTrade engine starting");
  await runIndCycleForAllBrokers();
  indLoopTimer = setInterval(async () => {
    await runIndCycleForAllBrokers();
  }, 5 * 60 * 1000); 
}

export async function stopIndEngine() {
  if (indLoopTimer) { clearInterval(indLoopTimer); indLoopTimer = null; }
  initialized = false;
  logger.info("[ind-bot] IND AutoTrade engine stopped");
}
