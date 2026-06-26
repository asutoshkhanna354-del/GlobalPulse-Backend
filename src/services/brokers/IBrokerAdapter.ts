export interface Position {
  tradingSymbol: string;
  exchange: string;
  productType: string;
  quantity: number;
  averagePrice: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

export interface Order {
  exchangeOrderId?: string;
  tradingSymbol: string;
  exchange: string;
  transactionType: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL-M";
  productType: string;
  quantity: number;
  price?: number;
  triggerPrice?: number;
  status: string;
  statusMessage?: string;
  averagePrice?: number;
  filledQuantity: number;
  orderTimestamp?: Date;
}

export interface FundDetails {
  availableMargin: number;
  usedMargin: number;
  openingBalance: number;
}

export interface PlaceOrderParams {
  tradingSymbol: string;
  exchange: string;
  transactionType: "BUY" | "SELL";
  orderType: "MARKET" | "LIMIT" | "SL" | "SL-M";
  productType: "MIS" | "NRML" | "CNC";
  quantity: number;
  price?: number;
  triggerPrice?: number;
  tag?: string;
}

export interface ModifyOrderParams {
  exchangeOrderId: string;
  orderType?: "MARKET" | "LIMIT" | "SL" | "SL-M";
  quantity?: number;
  price?: number;
  triggerPrice?: number;
}

export interface IBrokerAdapter {
  brokerId: string;
  
  // Authentication
  getLoginUrl(): string;
  generateSession(requestToken: string): Promise<{ accessToken: string; refreshToken?: string; tokenExpiresAt?: Date }>;
  renewSession?(refreshToken: string): Promise<{ accessToken: string; refreshToken?: string; tokenExpiresAt?: Date }>;

  // Profile & Funds
  getFunds(): Promise<FundDetails>;
  getProfile(): Promise<any>;

  // Portfolio
  getPositions(): Promise<Position[]>;
  getHoldings(): Promise<any[]>;

  // Orders
  getOrders(): Promise<Order[]>;
  placeOrder(params: PlaceOrderParams): Promise<string>; // returns exchange order id or local order id
  modifyOrder(params: ModifyOrderParams): Promise<boolean>;
  cancelOrder(exchangeOrderId: string): Promise<boolean>;

  // Market Data
  getLTP(instrumentTokens: string[]): Promise<Record<string, number>>;
}
