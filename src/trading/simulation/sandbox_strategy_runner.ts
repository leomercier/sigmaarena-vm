import { readFileSync } from 'fs';
import path from 'path';
import { getLLMFunctionsInstance } from '../llm_functions';
import { Trading } from '../trading_class';
import { LLMConfig, OHLCVData, PnLResult, TradingConfig } from '../types';
import { SimulationTradeExecutor, SimulationTradeExecutorParams } from './simulation_trade_executor';

export interface SandboxStrategyRunnerConfig {
    tradeExecutorParams: SimulationTradeExecutorParams;
    tradingConfig: TradingConfig;
    llmConfig: LLMConfig;
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

            this.injectLLMFunctions(this.config.llmConfig);

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

            const reportPath = '/app/output/trade_report.md';
            const reportGenerator = executor.getReportGenerator();

            if (reportGenerator && reportPath) {
                const ext = path.extname(reportPath).toLowerCase();
                let format: 'csv' | 'json' | 'markdown' = 'markdown';

                if (ext === '.csv') {
                    format = 'csv';
                } else if (ext === '.json') {
                    format = 'json';
                } else if (ext === '.md' || ext === '.markdown') {
                    format = 'markdown';
                }

                reportGenerator.saveReport(reportPath, format);

                const summary = reportGenerator.getSummary();
                console.log('\n=== Trade Report Summary ===');
                console.log(`Total Trades: ${summary.totalTrades}`);
                console.log(`Win Rate: ${summary.winRate.toFixed(2)}%`);
                console.log(`Final PnL: ${summary.finalPnL.toFixed(2)} ${pnlResult.baseToken} (${summary.finalPnLPercent.toFixed(2)}%)`);
                console.log(`Report saved to: ${reportPath}\n`);

                pnlResult.report = readFileSync(reportPath, 'utf-8');
            }

            return pnlResult;
        } catch (err) {
            console.error('Simulation failed:', err);
            throw err;
        }
    }

    private injectTradeFunctions(executor: SimulationTradeExecutor): void {
        const tradeFunctions = executor.getTradeFunctions();

        // Core trading functions
        (global as any).buy = tradeFunctions.buy;
        (global as any).sell = tradeFunctions.sell;
        (global as any).getOrderStatus = tradeFunctions.getOrderStatus;
        (global as any).getCurrentPrice = tradeFunctions.getCurrentPrice;

        // Position management functions
        (global as any).getPosition = tradeFunctions.getPosition;
        (global as any).getAllPositions = tradeFunctions.getAllPositions;
        (global as any).closePosition = tradeFunctions.closePosition;

        // Wallet query functions
        (global as any).getAvailableBalance = tradeFunctions.getAvailableBalance;
        (global as any).getWallet = tradeFunctions.getWallet;
        (global as any).getPortfolio = tradeFunctions.getPortfolio;

        // Order management functions
        (global as any).getOpenOrders = tradeFunctions.getOpenOrders;

        // Validation functions
        (global as any).canTrade = tradeFunctions.canTrade;
    }

    private injectLLMFunctions(llmConfig: LLMConfig): void {
        if (!llmConfig.llmBaseUrl || !llmConfig.userId || !llmConfig.sessionId) {
            return;
        }

        const llmFunctionsInstance = getLLMFunctionsInstance(llmConfig.userId, llmConfig.sessionId, llmConfig.llmBaseUrl);

        (global as any).generateText = llmFunctionsInstance.generateText.bind(llmFunctionsInstance);
        (global as any).generateObject = llmFunctionsInstance.generateObject.bind(llmFunctionsInstance);
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
