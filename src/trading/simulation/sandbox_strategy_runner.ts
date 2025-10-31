import { readFileSync } from 'fs';
import path from 'path';
import { Trading } from '../trading_class';
import { OHLCVData, PnLResult, TradingConfig } from '../types';
import { SimulationTradeExecutor, SimulationTradeExecutorParams } from './simulation_trade_executor';

export interface SandboxStrategyRunnerConfig {
    tradeExecutorParams: SimulationTradeExecutorParams;
    tradingConfig: TradingConfig;
}

export class SandboxStrategyRunner {
    private config: SandboxStrategyRunnerConfig;

    constructor(config: SandboxStrategyRunnerConfig) {
        this.config = config;
    }

    async runSimulation(userFilename: string, ohlcvData: OHLCVData[]): Promise<PnLResult> {
        try {
            const executor = new SimulationTradeExecutor(this.config.tradeExecutorParams);
            this.injectTradeFunctions(executor);

            const strategyClass = await this.loadStrategy(userFilename);
            const strategy: Trading = new strategyClass();

            try {
                await strategy.initialize(this.config.tradingConfig);
            } catch (err) {
                console.error('Error in strategy initialize():', err);
                throw err;
            }

            for (const ohlcv of ohlcvData) {
                executor.updateCurrentDate(new Date(ohlcv.timestamp));
                executor.updatePrice(ohlcv.symbol, ohlcv.close);

                executor.processOrders();

                try {
                    await strategy.analyze({ ohlcv });
                } catch (err) {
                    console.error('Error in strategy analyze():', err);
                }
            }

            executor.processOrders();

            try {
                await strategy.closeSession();
            } catch (err) {
                console.error('Error in strategy closeSession():', err);
            }

            // Process orders one more time after closeSession in case the strategy placed closing trades
            executor.processOrders();

            const finalPrices: Record<string, number> = {};
            for (const token of this.config.tradingConfig.tradableTokens) {
                const lastOHLCV = [...ohlcvData].reverse().find((d) => d.symbol === token);
                if (lastOHLCV) {
                    finalPrices[token] = lastOHLCV.close;
                }
            }

            const pnlResult = this.calculatePnL(executor, finalPrices);

            return pnlResult;
        } catch (err) {
            console.error('Simulation failed:', err);
            throw err;
        }
    }

    private injectTradeFunctions(executor: SimulationTradeExecutor): void {
        const tradeFunctions = executor.getTradeFunctions();

        (global as any).buy = tradeFunctions.buy;
        (global as any).sell = tradeFunctions.sell;
        (global as any).getOrderStatus = tradeFunctions.getOrderStatus;
        (global as any).getCurrentPrice = tradeFunctions.getCurrentPrice;
    }

    private async loadStrategy(userFilename: string): Promise<any> {
        const userStrategy = await import(userFilename);
        return userStrategy.default;
    }

    private calculatePnL(executor: SimulationTradeExecutor, finalPrices: Record<string, number>): PnLResult {
        const initialWallet = this.config.tradingConfig.walletBalance;
        const baseToken = this.config.tradeExecutorParams.baseToken;

        executor.closeAllPositions(finalPrices);

        const finalWallet = executor.getWallet();
        const trades = executor.getTradeRecords();

        // Calculate initial value (convert all assets to base token)
        let initialValue = initialWallet[baseToken] || 0;
        for (const [token, amount] of Object.entries(initialWallet)) {
            if (token !== baseToken && amount > 0) {
                const price = finalPrices[token] || 0;
                initialValue += amount * price;
            }
        }

        // Calculate final value
        let finalValue = finalWallet[baseToken] || 0;

        // Check for any remaining token balances (shouldn't happen after closeAllPositions)
        for (const [token, amount] of Object.entries(finalWallet)) {
            if (token !== baseToken && amount > 0) {
                const price = finalPrices[token] || 0;
                finalValue += amount * price;
                console.warn(`Warning: Found remaining ${token} balance after closing positions: ${amount}`);
            }
        }

        const pnl = finalValue - initialValue;
        const pnlPercentage = initialValue > 0 ? (pnl / initialValue) * 100 : 0;

        return {
            initialValue,
            finalValue,
            pnl,
            pnlPercentage,
            trades,
            baseToken
        };
    }
}
