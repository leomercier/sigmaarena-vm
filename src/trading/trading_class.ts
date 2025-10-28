import { AnalysisData, TradingConfig, TradingSession } from './types';

/**
 * Base Trading class that user scripts can extend. This provides the structure and helper methods for trading strategies.
 */
export abstract class Trading implements TradingSession {
    protected config!: TradingConfig;
    protected initialized: boolean = false;

    /**
     * Initialize the trading session. Stores configuration and performs any setup needed.
     */
    async initialize(config: TradingConfig): Promise<void> {
        this.config = config;
        this.initialized = true;

        // User can override this method to add custom initialization
        await this.onInitialize();
    }

    /**
     * Hook for user-defined initialization logic. Override this in your trading strategy.
     */
    protected async onInitialize(): Promise<void> {
        // User implementation goes here
    }

    /**
     * Analyze market data and make trading decisions. Must be implemented by user scripts.
     */
    abstract analyze(data: AnalysisData): Promise<void>;

    /**
     * Close the session and liquidate positions to base token. User scripts should implement this to clean up positions
     */
    abstract closeSession(): Promise<void>;

    /**
     * Helper: Get current wallet balance for a specific token
     */
    protected getBalance(token: string, walletBalance: Record<string, number>): number {
        return walletBalance[token] || 0;
    }

    /**
     * Helper: Check if we have enough balance to buy
     *
     * @param amount - Amount of token to buy
     * @param price - Price per token
     * @param walletBalance - Current wallet state
     * @returns True if we have enough base token balance
     */
    protected canAfford(amount: number, price: number, walletBalance: Record<string, number>): boolean {
        const baseBalance = this.getBalance(this.config.baseToken, walletBalance);
        const cost = amount * price;

        return baseBalance >= cost;
    }

    /**
     * Helper: Check if we have enough tokens to sell
     */
    protected hasTokens(token: string, amount: number, walletBalance: Record<string, number>): boolean {
        const balance = this.getBalance(token, walletBalance);
        return balance >= amount;
    }

    /**
     * Helper: Get the base token for this trading session
     */
    protected getBaseToken(): string {
        return this.config.baseToken;
    }

    /**
     * Helper: Get list of tradable tokens
     */
    protected getTradableTokens(): string[] {
        return this.config.tradableTokens;
    }
}
