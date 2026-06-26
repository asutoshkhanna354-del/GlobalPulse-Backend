import { pgTable, serial, text, integer, boolean, timestamp, real, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

export const indBrokersTable = pgTable("ind_brokers", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  brokerId: text("broker_id").notNull(), // 'zerodha', 'angelone', etc.
  clientId: text("client_id").notNull(),
  apiKey: text("api_key").notNull(),
  apiSecret: text("api_secret").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenExpiresAt: timestamp("token_expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIndBrokerSchema = createInsertSchema(indBrokersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIndBroker = z.infer<typeof insertIndBrokerSchema>;
export type IndBroker = typeof indBrokersTable.$inferSelect;

export const indOrdersTable = pgTable("ind_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  brokerAccountId: integer("broker_account_id").notNull(),
  exchangeOrderId: text("exchange_order_id"),
  tradingSymbol: text("trading_symbol").notNull(),
  exchange: text("exchange").notNull(),
  transactionType: text("transaction_type").notNull(), // BUY / SELL
  orderType: text("order_type").notNull(), // MARKET / LIMIT / SL / SL-M
  productType: text("product_type").notNull(), // MIS / NRML / CNC
  quantity: integer("quantity").notNull(),
  price: real("price"),
  triggerPrice: real("trigger_price"),
  status: text("status").notNull(), // OPEN, COMPLETE, CANCELLED, REJECTED
  statusMessage: text("status_message"),
  averagePrice: real("average_price"),
  filledQuantity: integer("filled_quantity").notNull().default(0),
  orderTimestamp: timestamp("order_timestamp", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIndOrderSchema = createInsertSchema(indOrdersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIndOrder = z.infer<typeof insertIndOrderSchema>;
export type IndOrder = typeof indOrdersTable.$inferSelect;

export const indPositionsTable = pgTable("ind_positions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  brokerAccountId: integer("broker_account_id").notNull(),
  tradingSymbol: text("trading_symbol").notNull(),
  exchange: text("exchange").notNull(),
  productType: text("product_type").notNull(),
  quantity: integer("quantity").notNull(), // positive for long, negative for short
  averagePrice: real("average_price").notNull(),
  realizedPnl: real("realized_pnl").notNull().default(0),
  unrealizedPnl: real("unrealized_pnl").notNull().default(0),
  targetPrice: real("target_price"),
  stopLossPrice: real("stop_loss_price"),
  trailingStopLoss: real("trailing_stop_loss"),
  isClosed: boolean("is_closed").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIndPositionSchema = createInsertSchema(indPositionsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIndPosition = z.infer<typeof insertIndPositionSchema>;
export type IndPosition = typeof indPositionsTable.$inferSelect;

export const indSettingsTable = pgTable("ind_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  isActive: boolean("is_active").notNull().default(false),
  activeBrokerAccountId: integer("active_broker_account_id"),
  riskPerTradePercent: real("risk_per_trade_percent").notNull().default(1),
  maxDailyDrawdownPercent: real("max_daily_drawdown_percent").notNull().default(5),
  maxOpenTrades: integer("max_open_trades").notNull().default(3),
  tradeNiftyOptions: boolean("trade_nifty_options").notNull().default(true),
  tradeBankNiftyOptions: boolean("trade_banknifty_options").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIndSettingsSchema = createInsertSchema(indSettingsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIndSettings = z.infer<typeof insertIndSettingsSchema>;
export type IndSettings = typeof indSettingsTable.$inferSelect;
