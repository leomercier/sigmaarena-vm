export type OrderType = 'market' | 'limit';

export type OrderStatus = 'pending' | 'open' | 'filled' | 'partial' | 'cancelled' | 'rejected';

/**
 * Stop-loss configuration
 * Can be specified as a percentage below entry (e.g., 5 = 5% below entry) or as an absolute price
 */
export interface StopLossOption {
    percentage?: number;
    price?: number;
}

/**
 * Profit target configuration
 * Can be specified as a percentage above entry (e.g., 10 = 10% profit target) or as an absolute price
 */
export interface ProfitTargetOption {
    percentage?: number;
    price?: number;
}

export interface TradeOptions {
    orderType: OrderType;
    limitPrice?: number;
    leverage?: number;
    isFutures?: boolean;
    stopLoss?: StopLossOption;
    profitTarget?: ProfitTargetOption;
}

export interface TradeResult {
    success: boolean;

    orderId?: string;
    error?: string;

    status?: OrderStatus;

    requestedAmount?: number;
    filledAmount?: number;
    remainingAmount?: number;

    requestedPrice?: number;
    executionPrice?: number;

    slippage?: number;

    timestamp?: number;
}

export interface OrderStatusResult {
    success: boolean;

    orderId: string;
    status: OrderStatus;
    error?: string;

    token: string;
    action: 'buy' | 'sell';

    requestedAmount: number;
    filledAmount: number;
    remainingAmount: number;

    executionPrice?: number;
}

export interface PriceResult {
    success: boolean;
    error?: string;

    token: string;

    price?: number;

    bid?: number;
    ask?: number;

    timestamp?: number;
}

/**
 * Position information
 */
export interface PositionInfo {
    token: string;
    amount: number; // Positive for long, negative for short
    entryPrice: number;
    currentPrice?: number;
    leverage: number;
    marginUsed: number;
    isLong: boolean;
    isShort: boolean;
    unrealizedPnL?: number;
    unrealizedPnLPercentage?: number;
    stopLoss?: { type: 'percentage' | 'price'; value: number };
    profitTarget?: { type: 'percentage' | 'price'; value: number };
    createdAt: number;
}

/**
 * Wallet balance information
 */
export interface WalletInfo {
    [token: string]: number;
}

/**
 * Portfolio summary
 */
export interface PortfolioSummary {
    baseToken: string;
    baseBalance: number;
    totalValue: number; // Total value in base token
    totalExposure: number; // Total exposure considering leverage
    positions: PositionInfo[];
    unrealizedPnL: number;
    positionCount: number;
}

/**
 * Order information
 */
export interface OrderInfo {
    orderId: string;
    token: string;
    action: 'buy' | 'sell';
    status: OrderStatus;
    requestedAmount: number;
    filledAmount: number;
    remainingAmount: number;
    executionPrice?: number;
}

// Core trading functions
export type BuyFunction = (token: string, amount: number, options: TradeOptions) => Promise<TradeResult>;
export type SellFunction = (token: string, amount: number, options: TradeOptions) => Promise<TradeResult>;
export type GetOrderStatusFunction = (orderId: string) => Promise<OrderStatusResult>;
export type GetCurrentPriceFunction = (token: string) => Promise<PriceResult>;

// New helper functions for simplified access
export type GetPositionFunction = (token: string) => Promise<PositionInfo | null>;
export type GetAllPositionsFunction = () => Promise<PositionInfo[]>;
export type ClosePositionFunction = (token: string) => Promise<TradeResult>;
export type GetAvailableBalanceFunction = (token?: string) => Promise<number>;
export type GetWalletFunction = () => Promise<WalletInfo>;
export type GetPortfolioFunction = () => Promise<PortfolioSummary>;
export type GetOpenOrdersFunction = (token?: string) => Promise<OrderInfo[]>;
export type CanTradeFunction = (
    action: 'buy' | 'sell',
    token: string,
    amount: number,
    price: number,
    leverage?: number,
    isFutures?: boolean
) => Promise<{ valid: boolean; reason?: string }>;

/**
 * Enhanced trade functions provided to user scripts
 */
export interface TradeFunctions {
    // Core trading
    buy: BuyFunction;
    sell: SellFunction;
    getOrderStatus: GetOrderStatusFunction;
    getCurrentPrice: GetCurrentPriceFunction;

    // Position management
    getPosition: GetPositionFunction;
    getAllPositions: GetAllPositionsFunction;
    closePosition: ClosePositionFunction;

    // Wallet queries
    getAvailableBalance: GetAvailableBalanceFunction;
    getWallet: GetWalletFunction;
    getPortfolio: GetPortfolioFunction;

    // Order management
    getOpenOrders: GetOpenOrdersFunction;

    // Validation
    canTrade: CanTradeFunction;
}
