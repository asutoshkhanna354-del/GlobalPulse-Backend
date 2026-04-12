import {
  pgTable,
  text,
  serial,
  timestamp,
  real,
  integer,
  boolean,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const marketAssetsTable = pgTable("market_assets", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: real("price").notNull(),
  change: real("change").notNull(),
  changePercent: real("change_percent").notNull(),
  volume: text("volume"),
  marketCap: text("market_cap"),
  currency: text("currency").notNull().default("USD"),
  country: text("country"),
  flag: text("flag"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export const insertMarketAssetSchema = createInsertSchema(marketAssetsTable).omit({ id: true });
export type InsertMarketAsset = z.infer<typeof insertMarketAssetSchema>;
export type MarketAsset = typeof marketAssetsTable.$inferSelect;

export const economicIndicatorsTable = pgTable("economic_indicators", {
  id: serial("id").primaryKey(),
  country: text("country").notNull(),
  countryCode: text("country_code").notNull(),
  flag: text("flag").notNull(),
  indicator: text("indicator").notNull(),
  value: real("value").notNull(),
  unit: text("unit").notNull(),
  previousValue: real("previous_value"),
  change: real("change"),
  period: text("period").notNull(),
  trend: text("trend").notNull(),
  impact: text("impact").notNull(),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export const insertEconomicIndicatorSchema = createInsertSchema(economicIndicatorsTable).omit({ id: true });
export type InsertEconomicIndicator = z.infer<typeof insertEconomicIndicatorSchema>;
export type EconomicIndicator = typeof economicIndicatorsTable.$inferSelect;

export const economicEventsTable = pgTable("economic_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  country: text("country").notNull(),
  flag: text("flag").notNull(),
  indicator: text("indicator").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
  forecast: real("forecast"),
  previous: real("previous"),
  actual: real("actual"),
  unit: text("unit").notNull(),
  impact: text("impact").notNull(),
  released: boolean("released").notNull().default(false),
});

export const insertEconomicEventSchema = createInsertSchema(economicEventsTable).omit({ id: true });
export type InsertEconomicEvent = z.infer<typeof insertEconomicEventSchema>;
export type EconomicEvent = typeof economicEventsTable.$inferSelect;

export const geopoliticalEventsTable = pgTable("geopolitical_events", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description").notNull(),
  region: text("region").notNull(),
  countries: text("countries").array().notNull(),
  type: text("type").notNull(),
  severity: text("severity").notNull(),
  marketImpact: text("market_impact").notNull(),
  marketConclusion: text("market_conclusion").notNull().default(""),
  affectedMarkets: text("affected_markets").array().notNull().default([]),
  affectedAssets: text("affected_assets").array().notNull(),
  sources: text("sources").array().notNull().default([]),
  startDate: text("start_date").notNull(),
  status: text("status").notNull(),
  casualtiesReported: boolean("casualties_reported").notNull().default(false),
  economicLoss: text("economic_loss"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export const insertGeopoliticalEventSchema = createInsertSchema(geopoliticalEventsTable).omit({ id: true });
export type InsertGeopoliticalEvent = z.infer<typeof insertGeopoliticalEventSchema>;
export type GeopoliticalEvent = typeof geopoliticalEventsTable.$inferSelect;

export const newsItemsTable = pgTable("news_items", {
  id: serial("id").primaryKey(),
  headline: text("headline").notNull(),
  summary: text("summary").notNull(),
  source: text("source").notNull(),
  category: text("category").notNull(),
  impact: text("impact").notNull(),
  sentiment: text("sentiment").notNull(),
  region: text("region"),
  affectedAssets: text("affected_assets").array().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
  marketConclusion: text("market_conclusion").notNull(),
  isBreaking: boolean("is_breaking").notNull().default(false),
});

export const insertNewsItemSchema = createInsertSchema(newsItemsTable).omit({ id: true });
export type InsertNewsItem = z.infer<typeof insertNewsItemSchema>;
export type NewsItem = typeof newsItemsTable.$inferSelect;

export const socialPostsTable = pgTable("social_posts", {
  id: serial("id").primaryKey(),
  influencer: text("influencer").notNull(),
  handle: text("handle").notNull(),
  platform: text("platform").notNull(),
  content: text("content").notNull(),
  source: text("source").notNull(),
  sourceUrl: text("source_url"),
  category: text("category").notNull(),
  marketImpact: text("market_impact").notNull(),
  affectedAssets: text("affected_assets").array().notNull(),
  tradingConclusion: text("trading_conclusion").notNull(),
  sentiment: text("sentiment").notNull(),
  usdImpact: text("usd_impact"),
  isBreaking: boolean("is_breaking").notNull().default(false),
  publishedAt: timestamp("published_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertSocialPostSchema = createInsertSchema(socialPostsTable).omit({ id: true });
export type InsertSocialPost = z.infer<typeof insertSocialPostSchema>;
export type SocialPost = typeof socialPostsTable.$inferSelect;

export const ipoListingsTable = pgTable("ipo_listings", {
  id: serial("id").primaryKey(),
  companyName: text("company_name").notNull(),
  symbol: text("symbol"),
  market: text("market").notNull().default("india"),
  exchange: text("exchange").notNull().default("NSE"),
  issueSize: text("issue_size"),
  priceRange: text("price_range"),
  openDate: text("open_date"),
  closeDate: text("close_date"),
  listingDate: text("listing_date"),
  lotSize: integer("lot_size"),
  ipoType: text("ipo_type").notNull().default("mainboard"),
  status: text("status").notNull().default("upcoming"),
  gmp: real("gmp"),
  subscriptionQib: real("subscription_qib"),
  subscriptionHni: real("subscription_hni"),
  subscriptionRetail: real("subscription_retail"),
  subscriptionTotal: real("subscription_total"),
  industry: text("industry"),
  revenue: text("revenue"),
  profit: text("profit"),
  companyDescription: text("company_description"),
  prosText: text("pros_text"),
  consText: text("cons_text"),
  recommendationListing: text("recommendation_listing"),
  recommendationLongTerm: text("recommendation_long_term"),
  totalScore: integer("total_score"),
  listingPrice: real("listing_price"),
  listingGainPercent: real("listing_gain_percent"),
  currentPrice: real("current_price"),
  sourceUrl: text("source_url"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export const insertIpoListingSchema = createInsertSchema(ipoListingsTable).omit({ id: true });
export type InsertIpoListing = z.infer<typeof insertIpoListingSchema>;
export type IpoListing = typeof ipoListingsTable.$inferSelect;

export const usdSignalsTable = pgTable("usd_signals", {
  id: serial("id").primaryKey(),
  direction: text("direction").notNull(),
  confidence: integer("confidence").notNull(),
  summary: text("summary").notNull(),
  factors: text("factors").array().notNull(),
  dxyValue: real("dxy_value"),
  goldPrice: real("gold_price"),
  oilPrice: real("oil_price"),
  vixValue: real("vix_value"),
  fedSignal: text("fed_signal"),
  geopoliticalRisk: text("geopolitical_risk"),
  nextUpdate: timestamp("next_update", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUsdSignalSchema = createInsertSchema(usdSignalsTable).omit({ id: true });
export type InsertUsdSignal = z.infer<typeof insertUsdSignalSchema>;
export type UsdSignal = typeof usdSignalsTable.$inferSelect;

export const forexCalendarTable = pgTable("forex_calendar", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  currency: text("currency").notNull(),
  impact: text("impact").notNull(),
  eventDate: timestamp("event_date", { withTimezone: true }).notNull(),
  actual: text("actual"),
  forecast: text("forecast"),
  previous: text("previous"),
  affectedPairs: text("affected_pairs").array(),
  conclusion: text("conclusion"),
  directionSignal: text("direction_signal"),
  sourceUrl: text("source_url"),
  lastUpdated: timestamp("last_updated", { withTimezone: true }).notNull().defaultNow(),
});

export const insertForexCalendarSchema = createInsertSchema(forexCalendarTable).omit({ id: true });
export type InsertForexCalendar = z.infer<typeof insertForexCalendarSchema>;
export type ForexCalendar = typeof forexCalendarTable.$inferSelect;

export const niftyAnalysisTable = pgTable("nifty_analysis", {
  id: serial("id").primaryKey(),
  analysisType: text("analysis_type").notNull(),
  direction: text("direction").notNull(),
  confidence: integer("confidence").notNull(),
  niftyPrice: real("nifty_price"),
  niftyChange: real("nifty_change"),
  summary: text("summary").notNull(),
  outlook: text("outlook").notNull(),
  supportLevels: text("support_levels").array().notNull().default([]),
  resistanceLevels: text("resistance_levels").array().notNull().default([]),
  keyFactors: text("key_factors").array().notNull().default([]),
  demandZones: text("demand_zones").array().notNull().default([]),
  supplyZones: text("supply_zones").array().notNull().default([]),
  candlePattern: text("candle_pattern"),
  trendStrength: text("trend_strength"),
  callPutRecommendation: text("call_put_recommendation"),
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  timeframe: text("timeframe"),
  nextAnalysisAt: timestamp("next_analysis_at", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertNiftyAnalysisSchema = createInsertSchema(niftyAnalysisTable).omit({ id: true });
export type InsertNiftyAnalysis = z.infer<typeof insertNiftyAnalysisSchema>;
export type NiftyAnalysis = typeof niftyAnalysisTable.$inferSelect;

export const bitcoinAnalysisTable = pgTable("bitcoin_analysis", {
  id: serial("id").primaryKey(),
  analysisType: text("analysis_type").notNull(),
  direction: text("direction").notNull(),
  confidence: integer("confidence").notNull(),
  btcPrice: real("btc_price"),
  btcChange: real("btc_change"),
  summary: text("summary").notNull(),
  outlook: text("outlook").notNull(),
  supportLevels: text("support_levels").array().notNull().default([]),
  resistanceLevels: text("resistance_levels").array().notNull().default([]),
  keyFactors: text("key_factors").array().notNull().default([]),
  demandZones: text("demand_zones").array().notNull().default([]),
  supplyZones: text("supply_zones").array().notNull().default([]),
  candlePattern: text("candle_pattern"),
  trendStrength: text("trend_strength"),
  tradeRecommendation: text("trade_recommendation"),
  targetPrice: real("target_price"),
  stopLoss: real("stop_loss"),
  timeframe: text("timeframe"),
  nextAnalysisAt: timestamp("next_analysis_at", { withTimezone: true }),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBitcoinAnalysisSchema = createInsertSchema(bitcoinAnalysisTable).omit({ id: true });
export type InsertBitcoinAnalysis = z.infer<typeof insertBitcoinAnalysisSchema>;
export type BitcoinAnalysis = typeof bitcoinAnalysisTable.$inferSelect;

export const watchlistTable = pgTable("watchlist", {
  id: serial("id").primaryKey(),
  symbol: text("symbol").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(),
  notes: text("notes"),
  addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWatchlistSchema = createInsertSchema(watchlistTable).omit({ id: true, addedAt: true });
export type InsertWatchlist = z.infer<typeof insertWatchlistSchema>;
export type Watchlist = typeof watchlistTable.$inferSelect;

export const botTradesTable = pgTable("bot_trades", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  symbol: text("symbol").notNull(),
  symbolLabel: text("symbol_label").notNull(),
  direction: text("direction").notNull(),
  entryPrice: real("entry_price").notNull(),
  targetPrice: real("target_price").notNull(),
  stopLoss: real("stop_loss").notNull(),
  currentPrice: real("current_price"),
  pnl: real("pnl"),
  pnlPercent: real("pnl_percent"),
  status: text("status").notNull().default("open"),
  tradeType: text("trade_type").notNull().default("SWING"),
  confidence: integer("confidence").notNull(),
  reasoning: text("reasoning").notNull(),
  lotSize: real("lot_size").notNull().default(1),
  riskPercent: real("risk_percent").notNull().default(1),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  closeReason: text("close_reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotTradeSchema = createInsertSchema(botTradesTable).omit({ id: true, createdAt: true });
export type InsertBotTrade = z.infer<typeof insertBotTradeSchema>;
export type BotTrade = typeof botTradesTable.$inferSelect;

export const botSettingsTable = pgTable("bot_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  isRunning: boolean("is_running").notNull().default(true),
  riskPercent: real("risk_percent").notNull().default(1),
  maxOpenTrades: integer("max_open_trades").notNull().default(5),
  enabledAssets: text("enabled_assets").array().notNull().default(["BTCUSD", "XAUUSD", "XAGUSD", "EURUSD", "NIFTY50"]),
  enableScalp: boolean("enable_scalp").notNull().default(true),
  enableIntraday: boolean("enable_intraday").notNull().default(true),
  enableSwing: boolean("enable_swing").notNull().default(true),
  virtualBalance: real("virtual_balance").notNull().default(10000),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBotSettingsSchema = createInsertSchema(botSettingsTable).omit({ id: true, updatedAt: true });
export type InsertBotSettings = z.infer<typeof insertBotSettingsSchema>;
export type BotSettings = typeof botSettingsTable.$inferSelect;

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  endpoint: text("endpoint").notNull(),
  p256dhKey: text("p256dh_key").notNull(),
  authKey: text("auth_key").notNull(),
  symbol: text("symbol").notNull(),
  symbolLabel: text("symbol_label").notNull(),
  browserFingerprint: text("browser_fingerprint").notNull(),
  lastNotifiedAt: timestamp("last_notified_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertPushSubscriptionSchema = createInsertSchema(pushSubscriptionsTable).omit({ id: true, createdAt: true });
export type InsertPushSubscription = z.infer<typeof insertPushSubscriptionSchema>;
export type PushSubscription = typeof pushSubscriptionsTable.$inferSelect;

export const brokerConnectionsTable = pgTable("broker_connections", {
  id: serial("id").primaryKey(),
  userId: integer("user_id"),
  broker: text("broker").notNull(),
  label: text("label").notNull(),
  apiKey: text("api_key").notNull(),
  apiSecret: text("api_secret"),
  accessToken: text("access_token"),
  accountId: text("account_id"),
  environment: text("environment").notNull().default("paper"),
  isActive: boolean("is_active").notNull().default(true),
  connectedAt: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertBrokerConnectionSchema = createInsertSchema(brokerConnectionsTable).omit({ id: true, connectedAt: true });
export type InsertBrokerConnection = z.infer<typeof insertBrokerConnectionSchema>;
export type BrokerConnection = typeof brokerConnectionsTable.$inferSelect;

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const userSessionsTable = pgTable("user_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  token: text("token").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export type UserSession = typeof userSessionsTable.$inferSelect;
