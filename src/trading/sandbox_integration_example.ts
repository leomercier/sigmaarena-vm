/**
 * Example of how to integrate with your existing sandbox
 * This shows the pattern for injecting trade functions and running strategies
 */

import { SimulationTradeExecutor } from './simulation/simulation_trade_executor';
import { TradeFunctions } from './trade_functions';
import { TradingConfig, OHLCVData, PnLResult } from './types';

/**
 * Interface for your sandbox (adapt to your actual implementation)
 */
interface Sandbox {
    // Copy file into sandbox
    copyFile(filename: string, content: string): void;

    // Inject global variables/functions
    injectGlobal(name: string, value: any): void;

    // Import a module from sandbox
    importModule<T>(modulePath: string): Promise<T>;

    // Execute code
    execute(code: string): Promise<any>;
}

/**
 * Strategy runner that integrates with sandbox
 */
export class SandboxStrategyRunner {
    private sandbox: Sandbox;
    private executor: SimulationTradeExecutor;

    constructor(sandbox: Sandbox, executor: SimulationTradeExecutor) {
        this.sandbox = sandbox;
        this.executor = executor;
    }

    /**
     * Inject trade functions into sandbox
     */
    private injectTradeFunctions(tradeFunctions: TradeFunctions): void {
        // Make trade functions available as globals in sandbox
        this.sandbox.injectGlobal('buy', tradeFunctions.buy);
        this.sandbox.injectGlobal('sell', tradeFunctions.sell);
        this.sandbox.injectGlobal('getOrderStatus', tradeFunctions.getOrderStatus);
        this.sandbox.injectGlobal('getCurrentPrice', tradeFunctions.getCurrentPrice);
    }

    /**
     * Load user strategy file into sandbox
     */
    async loadStrategy(strategyCode: string, filename: string = 'user-strategy.ts') {
        // Copy the strategy file into sandbox
        this.sandbox.copyFile(filename, strategyCode);

        // Import and return the module
        const module = await this.sandbox.importModule<any>(`./${filename}`);
        return module.default; // Assuming strategy exports default
    }

    /**
     * Run a complete simulation
     */
    async runSimulation(strategyCode: string, config: TradingConfig, ohlcvData: OHLCVData[]): Promise<PnLResult> {
        try {
            // 1. Get trade functions from executor
            const tradeFunctions = this.executor.getTradeFunctions();

            // 2. Inject into sandbox
            this.injectTradeFunctions(tradeFunctions);

            // 3. Load user strategy
            const strategy = await this.loadStrategy(strategyCode);

            // 4. Initialize strategy
            await strategy.initialize(config);

            // 5. Run simulation loop
            for (const ohlcv of ohlcvData) {
                // Update prices in executor
                this.executor.updatePrice(ohlcv.symbol, ohlcv.close);

                // Process pending orders
                this.executor.processOrders();

                // Feed data to strategy (wrap in try-catch to handle user errors)
                try {
                    await strategy.analyze({ ohlcv });
                } catch (error) {
                    console.error('Error in strategy analyze():', error);
                    // Continue execution even if user strategy throws
                }
            }

            // 6. Close session
            try {
                await strategy.closeSession();
            } catch (error) {
                console.error('Error in strategy closeSession():', error);
            }

            // Final order processing
            this.executor.processOrders();

            // 7. Calculate PnL
            const finalPrices: Record<string, number> = {};
            for (const token of config.tradableTokens) {
                const lastOHLCV = [...ohlcvData].reverse().find((d) => d.symbol === token);
                if (lastOHLCV) {
                    finalPrices[token] = lastOHLCV.close;
                }
            }

            const pnlResult = this.calculatePnL(config.walletBalance, finalPrices, config.baseToken);

            return pnlResult;
        } catch (error) {
            console.error('Simulation failed:', error);
            throw error;
        }
    }

    /**
     * Calculate PnL from executor state
     */
    private calculatePnL(initialWallet: Record<string, number>, finalPrices: Record<string, number>, baseToken: string): PnLResult {
        const finalWallet = this.executor.getWallet();
        const trades = this.executor.getTradeRecords();

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
        for (const [token, amount] of Object.entries(finalWallet)) {
            if (token !== baseToken && amount > 0) {
                const price = finalPrices[token] || 0;
                finalValue += amount * price;
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

    /**
     * Get current executor state for inspection
     */
    getExecutor(): SimulationTradeExecutor {
        return this.executor;
    }
}

/**
 * Example usage with your sandbox
 */
export async function exampleUsage() {
    // Assume you have your sandbox implementation
    const mySandbox: Sandbox = createYourSandbox();

    // Setup simulation executor
    const executor = new SimulationTradeExecutor(
        { USDC: 10000, BTC: 0, ETH: 0 },
        'USDC',
        {
            spotEnabled: true,
            futuresEnabled: false,
            spotLeverageOptions: [1, 2, 3],
            futuresLeverageOptions: []
        },
        { BTC: 50000, ETH: 3000 },
        {
            orderFillStrategy: 'immediate',
            slippagePercentage: 0.005
        }
    );

    // Create runner
    const runner = new SandboxStrategyRunner(mySandbox, executor);

    // Load strategy code (from file or string)
    const strategyCode = `
    import { Trading } from './trading-class';
    // ... user strategy code ...
    export default new MyStrategy();
  `;

    // Setup config
    const config = {
        mode: 'simulation' as const,
        baseToken: 'USDC',
        tradableTokens: ['BTC', 'ETH'],
        walletBalance: { USDC: 10000, BTC: 0, ETH: 0 },
        exchangeSettings: {
            spotEnabled: true,
            futuresEnabled: false,
            spotLeverageOptions: [1, 2, 3],
            futuresLeverageOptions: []
        }
    };

    // Generate or load OHLCV data
    const ohlcvData: OHLCVData[] = [
        /* ... your data ... */
    ];

    // Run simulation
    const result = await runner.runSimulation(strategyCode, config, ohlcvData);

    console.log('PnL:', result.pnl, result.baseToken);
    console.log('Return:', result.pnlPercentage.toFixed(2), '%');

    return result;
}

/**
 * Placeholder for your sandbox creation
 */
function createYourSandbox(): Sandbox {
    // Return your actual sandbox implementation
    throw new Error('Implement with your actual sandbox');
}

/**
 * Alternative: Direct function injection without sandbox
 * If your sandbox supports direct function binding
 */
export async function runWithDirectInjection(
    userStrategyModule: any,
    executor: SimulationTradeExecutor,
    config: TradingConfig,
    ohlcvData: OHLCVData[]
): Promise<PnLResult> {
    // Get trade functions
    const { buy, sell, getOrderStatus, getCurrentPrice } = executor.getTradeFunctions();

    // Option 1: If user module expects globals, set them
    (global as any).buy = buy;
    (global as any).sell = sell;
    (global as any).getOrderStatus = getOrderStatus;
    (global as any).getCurrentPrice = getCurrentPrice;

    // Option 2: If user module accepts functions as parameters
    // const strategy = userStrategyModule.create({ buy, sell, getOrderStatus, getCurrentPrice });

    // Get strategy instance
    const strategy = userStrategyModule.default || userStrategyModule;

    // Initialize
    await strategy.initialize(config);

    // Run loop
    for (const ohlcv of ohlcvData) {
        executor.updatePrice(ohlcv.symbol, ohlcv.close);
        executor.processOrders();

        try {
            await strategy.analyze({ ohlcv });
        } catch (error) {
            console.error('Strategy error:', error);
        }
    }

    // Close
    await strategy.closeSession();
    executor.processOrders();

    // Calculate PnL
    const finalPrices: Record<string, number> = {};
    for (const token of config.tradableTokens) {
        const lastData = [...ohlcvData].reverse().find((d) => d.symbol === token);
        if (lastData) {
            finalPrices[token] = lastData.close;
        }
    }

    const finalWallet = executor.getWallet();
    const trades = executor.getTradeRecords();

    let initialValue = config.walletBalance[config.baseToken] || 0;
    let finalValue = finalWallet[config.baseToken] || 0;

    for (const [token, amount] of Object.entries(finalWallet)) {
        if (token !== config.baseToken && amount > 0) {
            finalValue += amount * (finalPrices[token] || 0);
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
        baseToken: config.baseToken
    };
}
