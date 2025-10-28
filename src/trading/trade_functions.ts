export type OrderType = 'market' | 'limit';

export type OrderStatus = 'pending' | 'open' | 'filled' | 'partial' | 'cancelled' | 'rejected';

export interface TradeOptions {
    orderType: OrderType;
    limitPrice?: number;
    leverage?: number;
    isFutures?: boolean;
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
 * Buy a specified amount of a token
 *
 * @param token - Token symbol to buy
 * @param amount - Amount to buy
 * @param options - Trade options (order type, price, leverage, etc.)
 * @returns Trade result with order details
 */
export type BuyFunction = (token: string, amount: number, options: TradeOptions) => Promise<TradeResult>;

/**
 * Sell a specified amount of a token
 *
 * @param token - Token symbol to sell
 * @param amount - Amount to sell
 * @param options - Trade options (order type, price, leverage, etc.)
 * @returns Trade result with order details
 */
export type SellFunction = (token: string, amount: number, options: TradeOptions) => Promise<TradeResult>;

/**
 * Get the status of an existing order
 *
 * @param orderId - Order ID to query
 * @returns Order status information
 */
export type GetOrderStatusFunction = (orderId: string) => Promise<OrderStatusResult>;

/**
 * Get the current market price for a token
 *
 * @param token - Token symbol to query
 * @returns Current price information
 */
export type GetCurrentPriceFunction = (token: string) => Promise<PriceResult>;

/**
 * Trade functions provided to user scripts
 */
export interface TradeFunctions {
    buy: BuyFunction;
    sell: SellFunction;
    getOrderStatus: GetOrderStatusFunction;
    getCurrentPrice: GetCurrentPriceFunction;
}
