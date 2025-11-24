import fs from 'fs';
import path, { join } from 'path';
import { v4 as uuid } from 'uuid';
import config from '../../config/config';
import { getExchangeTokenOHLCVs } from '../../providers/ccxt/ohlcv';
import { OHLCVExchangeInputData } from '../../providers/ccxt/types';
import { SandboxManager, SandboxResult } from '../../sandbox/manager';
import { delays } from '../../utils/delays';
import { LLMConfig, OHLCVData, TradingConfig } from '../types';
import { SandboxStrategyRunnerConfig } from './sandbox_strategy_runner';
import { SimulationConfig } from './simulation_config';

export interface SimulationRunnerConfig {
    strategyFilename: string;
    tradingConfig: TradingConfig;
    simulationConfig: SimulationConfig;
    ohlcvData: OHLCVData[];
}

export class SimulationRunner {
    static async runSimulation(runnerConfig: SimulationRunnerConfig): Promise<SandboxResult> {
        const sandboxManager = new SandboxManager(config.dockerSocketPath);

        try {
            await sandboxManager.initialize();
            await sandboxManager.buildImage();

            const sessionId = uuid();
            const llmConfig: LLMConfig = {
                userId: config.userId || '',
                sessionId: sessionId,
                llmBaseUrl: config.llmBaseUrl || ''
            };
            await createSession(sessionId);

            const strategyRunnerConfig: SandboxStrategyRunnerConfig = {
                tradeExecutorParams: {
                    initialWallet: runnerConfig.tradingConfig.walletBalance,
                    baseToken: runnerConfig.tradingConfig.baseToken,
                    currentDate: new Date(runnerConfig.ohlcvData[0].timestamp),
                    exchangeSettings: runnerConfig.tradingConfig.exchangeSettings,
                    initialPrices: {},
                    config: runnerConfig.simulationConfig
                },
                tradingConfig: runnerConfig.tradingConfig,
                llmConfig: llmConfig
            };

            const filePaths: Record<string, string> = {
                'simulation/simulation_trade_executor.ts': './simulation_trade_executor.ts',
                'simulation/sandbox_strategy_runner.ts': './sandbox_strategy_runner.ts',
                'simulation/order_book.ts': './order_book.ts',
                'simulation/price_oracle.ts': './price_oracle.ts',
                'simulation/order_processor.ts': './order_processor.ts',
                'simulation/wallet_validator.ts': './wallet_validator.ts',
                'simulation/position_monitor.ts': './position_monitor.ts',
                'simulation/simulation_config.ts': './simulation_config.ts',
                'simulation/simulated_order.ts': './simulated_order.ts',
                'reporting/trade_report_generator.ts': '../reporting/trade_report_generator.ts',
                'types.ts': '../types.ts',
                'trading_class.ts': '../trading_class.ts',
                'trade_functions.ts': '../trade_functions.ts',
                'llm_functions.ts': '../llm_functions.ts'
            };

            const strategyCode = fs.readFileSync(runnerConfig.strategyFilename, 'utf-8');

            // Prepare files to inject into the sandbox
            const files: Record<string, string> = {
                'strategies/strategy.ts': strategyCode,
                'config.json': JSON.stringify(strategyRunnerConfig),
                'ohlcv_data.json': JSON.stringify(runnerConfig.ohlcvData)
            };

            for (const [destinationPath, sourcePath] of Object.entries(filePaths)) {
                files[destinationPath] = readFile(sourcePath);
            }

            const folders: Record<string, string> = {};
            folders[join(__dirname, '../technical-indicators')] = 'technical-indicators';

            const strategiesFolder = path.dirname(runnerConfig.strategyFilename);
            const strategyBaseFilename = path.basename(runnerConfig.strategyFilename, '.ts').replaceAll('_', '-');
            const strategyFolder = join(strategiesFolder, strategyBaseFilename);

            if (fs.existsSync(strategyFolder)) {
                folders[strategyFolder] = path.join('strategies', strategyBaseFilename);
            }

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
                workspaceFolder: config.sandboxWorkspaceFolder,
                allowedEndpoints: [config.llmBaseUrl],
                files,
                folders
            });

            return result;
        } finally {
            await sandboxManager.cleanup();
        }
    }
}

async function createSession(sessionId: string): Promise<void> {
    try {
        if (!config.userId || !config.llmBaseUrl) {
            return;
        }

        const body = {
            userId: config.userId,
            sessionId: sessionId
        };

        const baseUrl = config.llmBaseUrl.replace('host.docker.internal', 'localhost');
        const resp = await fetch(`${baseUrl}/api/session`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(errText || `LLM request failed with status ${resp.status}`);
        }
    } catch (err) {
        console.error('Error creating LLM session:', err);
    }
}

function readFile(filePath: string): string {
    return fs.readFileSync(join(__dirname, filePath), 'utf-8');
}

export async function runStrategyInSandbox() {
    const strategyFilename = join(__dirname, '../strategies/rsi_v3.ts');

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

    fs.mkdirSync(join('./results'), { recursive: true });

    const ohlcvData = await getExchangeTokenOHLCVs(ohlcvInputData);
    fs.writeFileSync(join('./results/ohlcv_data.json'), JSON.stringify(ohlcvData, null, 4));

    // const ohlcvData: OHLCVData[] = JSON.parse(fs.readFileSync(join('./results/ohlcv_data.json'), 'utf-8'));

    const outcome = await SimulationRunner.runSimulation({ strategyFilename, tradingConfig, simulationConfig, ohlcvData });
    const result = outcome.result;
    if (!result) {
        console.error('No result from simulation');
        return;
    }

    result.trades?.forEach((trade: Record<string, any>) => {
        trade.timestamp = new Date(trade.timestamp).toISOString();
    });

    const report = result.report;
    if (report) {
        fs.writeFileSync(join('./results/trade_report.md'), report);
    }

    const resultData = {
        baseToken: result.baseToken,
        finalValue: result.finalValue,
        initialValue: result.initialValue,
        pnl: result.pnl,
        pnlPercentage: result.pnlPercentage,
        trades: result.trades
    };

    console.log('Simulation result', JSON.stringify(resultData, null, 4));
    console.log('Trades count', result.trades?.length || 0);
    console.log('Futures trades count', result.trades?.filter((t: any) => t.isFutures).length || 0);
}

if (require.main === module) {
    runStrategyInSandbox()
        .then(() => {
            console.log('Strategy run completed');
        })
        .catch((err) => {
            console.error('Error running strategy in sandbox:', err);
        });
}
