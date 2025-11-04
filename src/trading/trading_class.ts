import {
    CanTradeFunction,
    ClosePositionFunction,
    GetAllPositionsFunction,
    GetAvailableBalanceFunction,
    GetCurrentPriceFunction,
    GetPortfolioFunction,
    GetPositionFunction,
    PortfolioSummary,
    PositionInfo,
    TradeResult
} from './trade_functions';
import { AnalysisData, TradingConfig, TradingSession } from './types';

// Declare injected functions
declare const getCurrentPrice: GetCurrentPriceFunction;
declare const getPosition: GetPositionFunction;
declare const getAllPositions: GetAllPositionsFunction;
declare const closePosition: ClosePositionFunction;
declare const getAvailableBalance: GetAvailableBalanceFunction;
declare const getPortfolio: GetPortfolioFunction;
declare const canTrade: CanTradeFunction;

/**
 * Enhanced Trading base class with convenience methods.
 * User strategies should extend this class and implement analyze().
 */
export abstract class Trading implements TradingSession {
    protected config!: TradingConfig;
    protected initialized: boolean = false;

    /**
     * Initialize the trading session
     */
    async initialize(config: TradingConfig): Promise<void> {
        this.config = config;
        this.initialized = true;

        await this.onInitialize();
    }

    /**
     * Hook for user-defined initialization logic
     */
    protected async onInitialize(): Promise<void> {
        // User implementation goes here
    }

    /**
     * Analyze market data and make trading decisions. Must be implemented by user strategies.
     */
    abstract analyze(data: AnalysisData): Promise<void>;

    /**
     * Close the session. Default implementation closes all positions.
     * Override if custom cleanup is needed.
     */
    async closeSession(): Promise<void> {
        await this.closeAllPositions();
    }

    protected async hasPosition(token: string): Promise<boolean> {
        const position = await getPosition(token);
        return position !== null;
    }

    protected async getPositionInfo(token: string): Promise<PositionInfo | null> {
        return await getPosition(token);
    }

    protected async getPositionPnL(token: string): Promise<{ pnl: number; pnlPercentage: number } | null> {
        const position = await getPosition(token);
        if (!position || position.unrealizedPnL === undefined || position.unrealizedPnLPercentage === undefined) {
            return null;
        }
        return {
            pnl: position.unrealizedPnL,
            pnlPercentage: position.unrealizedPnLPercentage
        };
    }

    protected async getTradableBalance(): Promise<number> {
        return await getAvailableBalance();
    }

    protected async getPortfolioSummary(): Promise<PortfolioSummary> {
        return await getPortfolio();
    }

    protected async closePositionByToken(token: string): Promise<TradeResult> {
        return await closePosition(token);
    }

    protected async closeAllPositions(): Promise<void> {
        const positions = await getAllPositions();

        console.log(`Closing ${positions.length} position(s)...`);

        for (const position of positions) {
            try {
                const result = await closePosition(position.token);
                if (result.success) {
                    console.log(`Closed ${position.token} at ${result.executionPrice?.toFixed(2)}`);
                } else {
                    console.error(`Failed to close ${position.token}: ${result.error}`);
                }
            } catch (error) {
                console.error(`Error closing ${position.token}:`, error);
            }
        }
    }

    protected async getPrice(token: string): Promise<number | null> {
        const result = await getCurrentPrice(token);
        return result.success && result.price ? result.price : null;
    }

    protected async canAffordToBuy(token: string, amount: number, price: number, leverage: number = 1, isFutures: boolean = false): Promise<boolean> {
        const validation = await canTrade('buy', token, amount, price, leverage, isFutures);
        return validation.valid;
    }

    protected async canSellToken(token: string, amount: number, isFutures: boolean = false): Promise<boolean> {
        const validation = await canTrade('sell', token, amount, 0, 1, isFutures);
        return validation.valid;
    }

    protected async logPortfolio(): Promise<void> {
        const portfolio = await getPortfolio();

        console.log('\nPortfolio Status:');
        console.log(`   Base Balance: ${portfolio.baseBalance.toFixed(2)} ${portfolio.baseToken}`);
        console.log(`   Total Value: ${portfolio.totalValue.toFixed(2)} ${portfolio.baseToken}`);
        console.log(`   Total Exposure: ${portfolio.totalExposure.toFixed(2)} ${portfolio.baseToken}`);
        console.log(
            `   Unrealized P&L: ${portfolio.unrealizedPnL.toFixed(2)} (${((portfolio.unrealizedPnL / portfolio.baseBalance) * 100).toFixed(2)}%)`
        );
        console.log(`   Open Positions: ${portfolio.positionCount}`);

        if (portfolio.positions.length > 0) {
            console.log('\n   Positions:');
            for (const pos of portfolio.positions) {
                const pnlSign = pos.unrealizedPnL && pos.unrealizedPnL >= 0 ? '+' : '';
                const type = pos.isLong ? 'LONG' : 'SHORT';
                console.log(`   - ${pos.token} (${type} ${pos.leverage}x): ${Math.abs(pos.amount).toFixed(4)} @ ${pos.entryPrice.toFixed(2)}`);
                if (pos.currentPrice && pos.unrealizedPnL !== undefined && pos.unrealizedPnLPercentage !== undefined) {
                    console.log(
                        `     Current: ${pos.currentPrice.toFixed(2)} | P&L: ${pnlSign}${pos.unrealizedPnL.toFixed(2)} (${pnlSign}${pos.unrealizedPnLPercentage.toFixed(2)}%)`
                    );
                }
            }
        }
        console.log('');
    }

    /**
     * Check if any position has exceeded a certain P&L threshold
     * Useful for implementing portfolio-wide stop-loss or profit taking
     */
    protected async getPositionsExceedingPnL(pnlPercentageThreshold: number, above: boolean = true): Promise<PositionInfo[]> {
        const positions = await getAllPositions();
        return positions.filter((pos) => {
            if (pos.unrealizedPnLPercentage === undefined) return false;
            return above ? pos.unrealizedPnLPercentage >= pnlPercentageThreshold : pos.unrealizedPnLPercentage <= pnlPercentageThreshold;
        });
    }

    /**
     * Get total portfolio exposure as a percentage of base balance
     */
    protected async getExposurePercentage(): Promise<number> {
        const portfolio = await getPortfolio();
        if (portfolio.baseBalance === 0) return 0;
        return (portfolio.totalExposure / portfolio.baseBalance) * 100;
    }

    /**
     * Check if total exposure is below a certain percentage
     * Useful for position sizing limits
     */
    protected async isWithinExposureLimit(maxExposurePercentage: number): Promise<boolean> {
        const exposurePercentage = await this.getExposurePercentage();
        return exposurePercentage <= maxExposurePercentage;
    }

    protected getBalance(token: string, walletBalance: Record<string, number>): number {
        return walletBalance[token] || 0;
    }

    protected canAfford(amount: number, price: number, walletBalance: Record<string, number>): boolean {
        const baseBalance = walletBalance[this.config.baseToken] || 0;
        const cost = amount * price;

        return baseBalance >= cost;
    }

    protected hasTokens(token: string, amount: number, walletBalance: Record<string, number>): boolean {
        const balance = walletBalance[token] || 0;

        return balance >= amount;
    }

    /**
     * Get the base token for this trading session
     */
    protected getBaseToken(): string {
        return this.config.baseToken;
    }

    /**
     * Get list of tradable tokens
     */
    protected getTradableTokens(): string[] {
        return this.config.tradableTokens;
    }
}
