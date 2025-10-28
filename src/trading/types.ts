export type ExecutionMode = 'simulation' | 'live';

export type WalletBalance = Record<string, number>;

export interface ExchangeSettings {
    spotEnabled: boolean;
    futuresEnabled: boolean;

    /** Available leverage options for spot trading (e.g., [1, 2, 3]) */
    spotLeverageOptions: number[];

    /** Available leverage options for futures trading (e.g., [1, 5, 10, 20, 50]) */
    futuresLeverageOptions: number[];
}

export interface TradingConfig {
    baseToken: string;
    tradableTokens: string[];
    walletBalance: WalletBalance;
    exchangeSettings: ExchangeSettings;
}

export interface OHLCVData {
    timestamp: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
    symbol: string;
}

export type TradeAction = 'buy' | 'sell';

export interface TradeRecord {
    id: string;
    timestamp: number;
    action: TradeAction;
    token: string;

    requestedAmount: number;
    filledAmount: number;

    requestedPrice?: number;
    executionPrice: number;

    leverage: number;
    isFutures: boolean;

    slippage?: number;
}

export interface AnalysisData {
    ohlcv?: OHLCVData;

    /** News events (future) */
    news?: any[];
}

/**
 * Trading session interface that user scripts must implement
 */
export interface TradingSession {
    /**
     * Initialize the trading session
     */
    initialize(config: TradingConfig): void | Promise<void>;

    /**
     * Analyze latest market data and make trading decisions
     */
    analyze(data: AnalysisData): void | Promise<void>;

    /**
     * Close the session and liquidate all positions to base currency
     */
    closeSession(): void | Promise<void>;
}

export interface PnLResult {
    baseToken: string;

    initialValue: number;
    finalValue: number;

    pnl: number;
    pnlPercentage: number;

    trades: TradeRecord[];
}
