import fs from 'fs';
import { join } from 'path';
import { OHLCVExchangeInputData } from '../../providers/ccxt/types';
import { SandboxManager, SandboxResult } from '../../sandbox/manager';
import { delays } from '../../utils/delays';
import { OHLCVData, TradingConfig } from '../types';
import { SandboxStrategyRunnerConfig } from './sandbox_strategy_runner';
import { SimulationConfig } from './simulation_config';

export class SimulationRunner {
    static async runSimulation(
        strategyCode: string,
        tradingConfig: TradingConfig,
        simulationConfig: SimulationConfig,
        ohlcvData: OHLCVData[]
    ): Promise<SandboxResult> {
        const sandboxManager = new SandboxManager();

        await sandboxManager.initialize();
        await sandboxManager.buildImage();

        const strategyRunnerConfig: SandboxStrategyRunnerConfig = {
            tradeExecutorParams: {
                initialWallet: tradingConfig.walletBalance,
                baseToken: tradingConfig.baseToken,
                exchangeSettings: tradingConfig.exchangeSettings,
                initialPrices: {},
                config: simulationConfig
            },
            tradingConfig: tradingConfig
        };

        // Prepare files to inject into the sandbox
        const files: Record<string, string> = {
            'simulation/simulation_trade_executor.ts': fs.readFileSync(join(__dirname, './simulation_trade_executor.ts'), 'utf-8'),
            'simulation/sandbox_strategy_runner.ts': fs.readFileSync(join(__dirname, './sandbox_strategy_runner.ts'), 'utf-8'),
            'simulation/order_book.ts': fs.readFileSync(join(__dirname, './order_book.ts'), 'utf-8'),
            'simulation/price_oracle.ts': fs.readFileSync(join(__dirname, './price_oracle.ts'), 'utf-8'),
            'simulation/order_processor.ts': fs.readFileSync(join(__dirname, './order_processor.ts'), 'utf-8'),
            'simulation/wallet_validator.ts': fs.readFileSync(join(__dirname, './wallet_validator.ts'), 'utf-8'),
            'simulation/simulation_config.ts': fs.readFileSync(join(__dirname, './simulation_config.ts'), 'utf-8'),
            'simulation/simulated_order.ts': fs.readFileSync(join(__dirname, './simulated_order.ts'), 'utf-8'),
            'reporting/trade_report_generator.ts': fs.readFileSync(join(__dirname, '../reporting/trade_report_generator.ts'), 'utf-8'),
            'types.ts': fs.readFileSync(join(__dirname, '../types.ts'), 'utf-8'),
            'trading_class.ts': fs.readFileSync(join(__dirname, '../trading_class.ts'), 'utf-8'),
            'trade_functions.ts': fs.readFileSync(join(__dirname, '../trade_functions.ts'), 'utf-8'),
            'strategies/strategy.ts': strategyCode,
            'config.json': JSON.stringify(strategyRunnerConfig),
            'ohlcv_data.json': JSON.stringify(ohlcvData)
        };

        const result = await sandboxManager.executeScript({
            script: `
                import { SandboxStrategyRunner } from './simulation/sandbox_strategy_runner';
                import config from './config.json';
                import ohlcvData from './ohlcv_data.json';
                import { join } from 'path';

                export async function runScript() {
                    const strategyFilename = join(__dirname, './strategies/strategy.ts');
                    const strategyRunner = new SandboxStrategyRunner(config);
                    const result = await strategyRunner.runSimulation(strategyFilename, ohlcvData);

                    return result;
                }
            `,
            files,
            injectedFunctions: {
                logInfo: (message: string) => {
                    console.log('[INFO]', message);
                },
                logError: (message: string) => {
                    console.error('[ERROR]', message);
                }
            }
        });

        return result;
    }
}

async function runStrategyInSandbox() {
    const strategyCode = fs.readFileSync(join(__dirname, '../strategies/rsi.ts'), 'utf-8');
    const tradingConfig: TradingConfig = {
        walletBalance: { USDC: 10000, BTC: 0, ETH: 0 },
        baseToken: 'USDC',
        tradableTokens: ['BTCUSDC', 'ETHUSDC'],
        exchangeSettings: {
            spotEnabled: true,
            futuresEnabled: true,
            spotLeverageOptions: [1, 2, 3],
            futuresLeverageOptions: [1, 2, 3, 4, 5, 10]
        }
    };
    const simulationConfig: SimulationConfig = {
        orderFillStrategy: 'immediate',
        slippagePercentage: 0.005
    };

    const timeTo = new Date();
    const timeFrom = new Date(timeTo.getTime() - 20 * delays.oneDay);

    const ohlcvInputData: OHLCVExchangeInputData = {
        exchangeId: 'mexc',
        exchangeType: 'spot',
        address: `mexc-usdc`,
        symbol: `ETHUSDC`,
        timeFrom: timeFrom,
        timeTo: timeTo,
        intervalType: '5m'
    };

    const ohlcvData = await getExchangeTokenOHLCVs(ohlcvInputData);
    fs.writeFileSync(join('./ohlcv_data.json'), JSON.stringify(ohlcvData, null, 4));

    // const ohlcvData: OHLCVData[] = JSON.parse(fs.readFileSync(join('./ohlcv_data.json'), 'utf-8'));

    const result = await SimulationRunner.runSimulation(strategyCode, tradingConfig, simulationConfig, ohlcvData);
    result.result?.trades?.forEach((trade: Record<string, any>) => {
        trade.timestamp = new Date(trade.timestamp).toISOString();
    });

    const report = result.result?.report;
    if (report) {
        fs.writeFileSync(join('./trade_report.md'), report);
        delete result.result.report;
    }

    console.log('Simulation result', JSON.stringify(result, null, 4));
    console.log('Trades count', result.result?.trades?.length || 0);
    console.log('Futures trades count', result.result?.trades?.filter((t: any) => t.isFutures).length || 0);
}

runStrategyInSandbox()
    .then(() => {
        console.log('Strategy run completed');
    })
    .catch((err) => {
        console.error('Error running strategy in sandbox:', err);
    });
