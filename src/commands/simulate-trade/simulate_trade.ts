import { createHash } from 'crypto';
import fs, { mkdirSync } from 'fs';
import ora from 'ora';
import path from 'path';
import config from '../../config/config';
import { getExchangeTokenOHLCVs } from '../../providers/ccxt/ohlcv';
import { OHLCVExchangeInputData } from '../../providers/ccxt/types';
import { SandboxResult } from '../../sandbox/manager';
import { SimulationRunner } from '../../trading/simulation/sandbox_runner';
import { SimulationConfig } from '../../trading/simulation/simulation_config';
import { OHLCVData, TradingConfig } from '../../trading/types';
import { getErrorMetadata } from '../../utils/errors';
import { logError, logWarning } from '../../utils/logging';

export interface SimulateExchangeConfig {
    exchangeId: string;
    exchangeType: 'spot' | 'futures';
    address: string;
    symbol: string;
    timeFrom: string;
    timeTo: string;
    intervalType: string;
}

export async function simulateTrade(args: string[]): Promise<{ errorCode: number; result?: SandboxResult }> {
    if (args.length < 2) {
        console.error('Usage: npx sigmaarena-vm simulate-trade <config.json> <strategy.ts> <save-results>');
        return { errorCode: 1 };
    }

    const spinner = ora();

    const configPath = args[0];
    const strategyPath = args[1];
    const saveResults = args.length >= 3 ? args[2].toLowerCase() === 'true' : false;

    const resolvedConfigPath = path.resolve(process.cwd(), configPath);
    const strategyFilename = path.resolve(process.cwd(), strategyPath);

    spinner.start('Validating configuration and strategy paths');
    if (!fs.existsSync(resolvedConfigPath)) {
        spinner.fail(`Config file not found: ${resolvedConfigPath}`);
        return { errorCode: 1 };
    }

    if (!fs.existsSync(strategyFilename)) {
        spinner.fail(`Strategy file not found: ${strategyFilename}`);
        return { errorCode: 1 };
    }
    spinner.succeed('Configuration and strategy paths validated');

    spinner.start('Loading configuration and strategy source');

    let configContent: any;

    try {
        configContent = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        spinner.fail(`Failed to parse configuration JSON: ${message}`);

        return { errorCode: 1 };
    }

    spinner.succeed('Configuration loaded');

    if (!configContent.tradingConfig || !configContent.simulationConfig || !configContent.exchangeConfig) {
        spinner.fail('Config file must contain tradingConfig, simulationConfig, and exchangeConfig sections');
        return { errorCode: 1 };
    }

    const tradingConfig: TradingConfig = configContent.tradingConfig;
    const simulationConfig: SimulationConfig = configContent.simulationConfig;
    const exchangeConfig = configContent.exchangeConfig;

    spinner.start('Loading OHLCV data for the specified exchange configuration');

    const ohlcvData = await loadOHLCVData(exchangeConfig);
    if (!ohlcvData) {
        spinner.fail('Failed to load OHLCV data for the specified exchange configuration');
        return { errorCode: 1 };
    }

    spinner.succeed('OHLCV data loaded');

    spinner.start('Running simulation with provided strategy');

    let outcome;

    try {
        outcome = await SimulationRunner.runSimulation({ strategyFilename, tradingConfig, simulationConfig, ohlcvData });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        spinner.fail(`Simulation failed: ${message}`);

        return { errorCode: 1 };
    }
    spinner.succeed('Simulation completed');

    if (!saveResults) {
        return { errorCode: 0, result: outcome };
    }

    const result = outcome.result;
    if (!result) {
        return { errorCode: 1 };
    }

    result.trades?.forEach((trade: Record<string, any>) => {
        trade.timestamp = new Date(trade.timestamp).toISOString();
    });

    if (config.resultsFolder) {
        spinner.start(`Writing simulation artifacts to ${config.resultsFolder}`);
        mkdirSync(path.join(config.resultsFolder), { recursive: true });

        try {
            const report = result.report;
            if (report) {
                fs.writeFileSync(path.join(config.resultsFolder, 'trade_report.md'), report);
                console.log(`Trade report saved to ${path.join(config.resultsFolder, 'trade_report.md')}`);
            }

            const trades = result.trades;
            if (trades) {
                fs.writeFileSync(path.join(config.resultsFolder, 'trades.md'), JSON.stringify(trades, null, 4));
                console.log(`Trades saved to ${path.join(config.resultsFolder, 'trades.md')}`);
            }

            fs.writeFileSync(path.join(config.resultsFolder, 'simulation_result.json'), JSON.stringify(result, null, 4));
            console.log(`Simulation result saved to ${path.join(config.resultsFolder, 'simulation_result.json')}`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            spinner.fail(`Failed to write simulation artifacts: ${message}`);

            return { errorCode: 1 };
        }

        spinner.succeed(`Simulation artifacts written to ${config.resultsFolder}`);
    }

    return { errorCode: 0, result: outcome };
}

export async function loadOHLCVData(exchangeConfig: SimulateExchangeConfig): Promise<OHLCVData[] | null> {
    const ohlcvInputData: OHLCVExchangeInputData = {
        exchangeId: exchangeConfig.exchangeId,
        exchangeType: exchangeConfig.exchangeType,
        address: exchangeConfig.address,
        symbol: exchangeConfig.symbol,
        timeFrom: new Date(exchangeConfig.timeFrom),
        timeTo: new Date(exchangeConfig.timeTo),
        intervalType: exchangeConfig.intervalType
    };

    const cacheKeySeed = JSON.stringify({
        exchangeId: exchangeConfig.exchangeId,
        exchangeType: exchangeConfig.exchangeType,
        address: exchangeConfig.address,
        symbol: exchangeConfig.symbol,
        intervalType: exchangeConfig.intervalType,
        timeFrom: exchangeConfig.timeFrom,
        timeTo: exchangeConfig.timeTo
    });

    let ohlcvData: OHLCVData[] | null = null;
    let cacheDir: string | null = null;
    let cacheFilePath: string | null = null;

    if (config.cacheFolder) {
        const cacheKey = createHash('sha256').update(cacheKeySeed).digest('hex').slice(0, 16);
        cacheDir = path.join(config.cacheFolder, 'ohlcv');
        cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);

        if (fs.existsSync(cacheFilePath)) {
            try {
                const cachedPayload = fs.readFileSync(cacheFilePath, 'utf8');
                return JSON.parse(cachedPayload);
            } catch (err) {
                logWarning('Failed to read OHLCV cache, refetching data', getErrorMetadata(err as Error));

                try {
                    fs.unlinkSync(cacheFilePath);
                } catch (unlinkErr) {
                    logWarning('Failed to delete corrupted OHLCV cache file', getErrorMetadata(unlinkErr as Error));
                }
            }
        }
    }

    try {
        ohlcvData = await getExchangeTokenOHLCVs(ohlcvInputData);
    } catch (err) {
        logError('Failed to fetch OHLCV data', getErrorMetadata(err as Error));
        return null;
    }

    if (cacheDir && cacheFilePath) {
        try {
            mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cacheFilePath, JSON.stringify(ohlcvData));
        } catch (err) {
            logWarning('Failed to write OHLCV cache file', getErrorMetadata(err as Error));
        }
    }

    return ohlcvData;
}
