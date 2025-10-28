import { delays } from '../utils/delays';
import { SIMULATION_PRESETS } from './simulation/simulation_config';
import { SimulationTradeExecutor } from './simulation/simulation_trade_executor';
import { OHLCVData, PnLResult, TradingConfig, TradingSession, WalletBalance } from './types';

/**
 * Example: Run a trading strategy simulation
 */
async function runSimulation() {
    const initialWallet: WalletBalance = {
        USDC: 10000,
        BTC: 0,
        ETH: 0
    };

    const baseToken = 'USDC';
    const tradableTokens = ['BTC', 'ETH'];

    const exchangeSettings = {
        spotEnabled: true,
        futuresEnabled: false,
        spotLeverageOptions: [1, 2, 3],
        futuresLeverageOptions: [1, 5, 10, 20]
    };

    const initialPrices = {
        BTC: 100000,
        ETH: 4000
    };

    const executor = new SimulationTradeExecutor(initialWallet, baseToken, exchangeSettings, initialPrices, SIMULATION_PRESETS.PERFECT_EXECUTION);

    const tradeFunctions = executor.getTradeFunctions();

    const tradingConfig: TradingConfig = {
        baseToken,
        tradableTokens,
        walletBalance: initialWallet,
        exchangeSettings
    };

    // 5. Load user strategy (in real implementation, this comes from sandbox)
    // For this example, we'll simulate loading the strategy
    const userStrategy = await loadUserStrategy(tradeFunctions);

    await userStrategy.initialize(tradingConfig);
    console.log('Strategy initialized');

    // 7. Generate or load OHLCV data
    const ohlcvData = generateMockOHLCVData();

    // 8. Run the simulation loop
    console.log('Running simulation with', ohlcvData.length, 'data points');

    for (const ohlcv of ohlcvData) {
        executor.updatePrice(ohlcv.symbol, ohlcv.close);

        executor.processOrders();

        await userStrategy.analyze({ ohlcv });
    }

    console.log('Closing session...');
    await userStrategy.closeSession();

    executor.processOrders();

    const finalPrices = {
        BTC: ohlcvData.find((d) => d.symbol === 'BTC')?.close || initialPrices.BTC,
        ETH: ohlcvData.find((d) => d.symbol === 'ETH')?.close || initialPrices.ETH
    };

    const pnlResult = calculatePnL(executor, initialWallet, initialPrices, finalPrices, baseToken);

    displayResults(pnlResult);

    return pnlResult;
}

/**
 * Load user strategy (simulated - in real impl this comes from sandbox)
 */
async function loadUserStrategy(tradeFunctions: any): Promise<TradingSession> {
    // In real implementation:
    // 1. Sandbox copies user strategy file
    // 2. Sandbox injects trade functions as globals or modules:
    //    sandbox.globals.buy = tradeFunctions.buy
    //    sandbox.globals.sell = tradeFunctions.sell
    //    sandbox.globals.getOrderStatus = tradeFunctions.getOrderStatus
    //    sandbox.globals.getCurrentPrice = tradeFunctions.getCurrentPrice
    // 3. Sandbox imports/requires the user module
    // 4. Returns the default export (strategy instance)

    // For this example, we'll just import directly
    // In real code: const strategy = await sandbox.import('./user-strategy.ts');

    // Mock: Inject into global scope (simulating sandbox injection)
    (global as any).buy = tradeFunctions.buy;
    (global as any).sell = tradeFunctions.sell;
    (global as any).getOrderStatus = tradeFunctions.getOrderStatus;
    (global as any).getCurrentPrice = tradeFunctions.getCurrentPrice;

    // Import the user strategy
    const strategyModule = await import('./strategies/mock_strategy');
    return strategyModule.default;
}

function generateMockOHLCVData(): OHLCVData[] {
    const data: OHLCVData[] = [];
    let btcPrice = 100000;
    let ethPrice = 4000;

    const startTime = Date.now();

    // Generate 100 data points (simulating 100 minutes of trading)
    for (let i = 0; i < 100; i++) {
        btcPrice += (Math.random() - 0.5) * 500;
        data.push({
            timestamp: startTime + i * delays.oneMinute,
            open: btcPrice - 50,
            high: btcPrice + 100,
            low: btcPrice - 100,
            close: btcPrice,
            volume: Math.random() * 1000,
            symbol: 'BTC'
        });

        // Random walk for ETH (every other tick)
        if (i % 2 === 0) {
            ethPrice += (Math.random() - 0.5) * 50;
            data.push({
                timestamp: startTime + i * delays.oneMinute,
                open: ethPrice - 10,
                high: ethPrice + 20,
                low: ethPrice - 20,
                close: ethPrice,
                volume: Math.random() * 5000,
                symbol: 'ETH'
            });
        }
    }

    return data;
}

/**
 * Calculate PnL from simulation results
 */
function calculatePnL(
    executor: SimulationTradeExecutor,
    initialWallet: WalletBalance,
    initialPrices: Record<string, number>,
    finalPrices: Record<string, number>,
    baseToken: string
): PnLResult {
    const finalWallet = executor.getWallet();
    const trades = executor.getTradeRecords();

    // Calculate initial portfolio value
    let initialValue = initialWallet[baseToken] || 0;
    for (const [token, amount] of Object.entries(initialWallet)) {
        if (token !== baseToken && amount > 0) {
            initialValue += amount * (initialPrices[token] || 0);
        }
    }

    // Calculate final portfolio value
    let finalValue = finalWallet[baseToken] || 0;
    for (const [token, amount] of Object.entries(finalWallet)) {
        if (token !== baseToken && amount > 0) {
            finalValue += amount * (finalPrices[token] || 0);
        }
    }

    const pnl = finalValue - initialValue;
    const pnlPercentage = (pnl / initialValue) * 100;

    return {
        initialValue,
        finalValue,
        pnl,
        pnlPercentage,
        trades,
        baseToken
    };
}

function displayResults(result: PnLResult): void {
    console.log('\n=== SIMULATION RESULTS ===');
    console.log(`Initial Value: ${result.initialValue.toFixed(2)} ${result.baseToken}`);
    console.log(`Final Value: ${result.finalValue.toFixed(2)} ${result.baseToken}`);
    console.log(`PnL: ${result.pnl.toFixed(2)} ${result.baseToken} (${result.pnlPercentage.toFixed(2)}%)`);
    console.log(`Total Trades: ${result.trades.length}`);

    console.log('\n=== TRADE SUMMARY ===');
    const buys = result.trades.filter((t) => t.action === 'buy');
    const sells = result.trades.filter((t) => t.action === 'sell');
    console.log(`Buys: ${buys.length}`);
    console.log(`Sells: ${sells.length}`);

    if (result.trades.length > 0) {
        console.log('\n=== RECENT TRADES ===');
        result.trades.slice(-5).forEach((trade) => {
            console.log(
                `${trade.action.toUpperCase()} ${trade.filledAmount.toFixed(4)} ${trade.token} ` +
                    `@ ${trade.executionPrice.toFixed(2)} ${result.baseToken}`
            );
        });
    }
}

runSimulation()
    .then(() => console.log('\nSimulation complete!'))
    .catch((error) => console.error('Simulation failed:', error));
