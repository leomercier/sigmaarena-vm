import { createHash } from 'crypto';
import fs, { mkdirSync } from 'fs';
import ora from 'ora';
import path from 'path';
import { getExchangeTokenOHLCVs } from '../../providers/ccxt/ohlcv';
import { OHLCVExchangeInputData } from '../../providers/ccxt/types';
import { SandboxResult } from '../../sandbox/manager';
import { SimulationRunner } from '../../trading/simulation/sandbox_runner';
import { SimulationConfig } from '../../trading/simulation/simulation_config';
import { TradingConfig } from '../../trading/types';

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
        timeTo: exchangeConfig.timeTo,
        config: path.resolve(resolvedConfigPath)
    });

    const cacheKey = createHash('sha256').update(cacheKeySeed).digest('hex').slice(0, 16);
    const cacheDir = path.join('./.cache', 'ohlcv');
    const cacheFilePath = path.join(cacheDir, `${cacheKey}.json`);

    spinner.start('Checking OHLCV cache');

    let ohlcvData;
    let cacheHit = false;

    if (fs.existsSync(cacheFilePath)) {
        try {
            const cachedPayload = fs.readFileSync(cacheFilePath, 'utf8');
            ohlcvData = JSON.parse(cachedPayload);
            cacheHit = true;

            const cachedCount = Array.isArray(ohlcvData) ? ohlcvData.length : 'cached';
            spinner.succeed(`Loaded OHLCV data from cache (${cachedCount} entries)`);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            spinner.fail(`Cache read failed, fetching fresh data: ${message}`);

            try {
                fs.unlinkSync(cacheFilePath);
            } catch {
                // If we can't delete the cache file, carry on and overwrite after refetch.
            }
        }
    } else {
        spinner.succeed('Cache miss; fetching fresh OHLCV data');
    }

    if (!cacheHit) {
        spinner.start(`Fetching OHLCV data for ${ohlcvInputData.symbol} from ${ohlcvInputData.exchangeId}`);

        try {
            ohlcvData = await getExchangeTokenOHLCVs(ohlcvInputData);
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            spinner.fail(`Failed to fetch OHLCV data: ${message}`);

            return { errorCode: 1 };
        }

        const candleCount = Array.isArray(ohlcvData) ? ohlcvData.length : 'requested';
        spinner.succeed(`Fetched ${candleCount} OHLCV entries`);

        spinner.start('Caching OHLCV dataset for future runs');

        try {
            mkdirSync(cacheDir, { recursive: true });
            fs.writeFileSync(cacheFilePath, JSON.stringify(ohlcvData));

            spinner.succeed('OHLCV dataset cached');
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            spinner.fail(`Failed to write OHLCV cache: ${message}`);
        }
    }

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

    spinner.start('Writing simulation artifacts to ./results');
    mkdirSync(path.join('./results'), { recursive: true });

    try {
        const report = result.report;
        if (report) {
            fs.writeFileSync(path.join('./results/trade_report.md'), report);
            console.log('Trade report saved to ./results/trade_report.md');
        }

        const trades = result.trades;
        if (trades) {
            fs.writeFileSync(path.join('./results/trades.md'), JSON.stringify(trades, null, 4));
            console.log('Trades saved to ./results/trades.md');
        }

        fs.writeFileSync(path.join('./results/simulation_result.json'), JSON.stringify(result, null, 4));
        console.log('Simulation result saved to ./results/simulation_result.json');
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        spinner.fail(`Failed to write simulation artifacts: ${message}`);

        return { errorCode: 1 };
    }

    spinner.succeed('Simulation artifacts written to ./results');

    return { errorCode: 0, result: outcome };
}
