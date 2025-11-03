import fs, { mkdirSync } from 'fs';
import path from 'path';
import { getExchangeTokenOHLCVs } from '../../providers/ccxt/ohlcv';
import { OHLCVExchangeInputData } from '../../providers/ccxt/types';
import { SimulationRunner } from '../../trading/simulation/sandbox_runner';
import { SimulationConfig } from '../../trading/simulation/simulation_config';
import { TradingConfig } from '../../trading/types';

export async function simulateTrade(args: string[]) {
    if (args.length !== 2) {
        console.error('Usage: npm run simulate-trade <config.json> <strategy.ts>');
        process.exit(1);
    }

    const [configPath, strategyPath] = args;
    const resolvedConfigPath = path.resolve(process.cwd(), configPath);
    const resolvedStrategyPath = path.resolve(process.cwd(), strategyPath);

    if (!fs.existsSync(resolvedConfigPath)) {
        console.error(`Config file not found: ${resolvedConfigPath}`);
        process.exit(1);
    }

    if (!fs.existsSync(resolvedStrategyPath)) {
        console.error(`Strategy file not found: ${resolvedStrategyPath}`);
        process.exit(1);
    }

    const configContent = JSON.parse(fs.readFileSync(resolvedConfigPath, 'utf8'));
    const strategyCode = fs.readFileSync(resolvedStrategyPath, 'utf8');

    if (!configContent.tradingConfig || !configContent.simulationConfig || !configContent.exchangeConfig) {
        console.error('Config file must contain tradingConfig, simulationConfig, and exchangeConfig sections');
        process.exit(1);
    }

    const tradingConfig: TradingConfig = configContent.tradingConfig;
    const simulationConfig: SimulationConfig = configContent.simulationConfig;

    const ohlcvInputData: OHLCVExchangeInputData = {
        exchangeId: configContent.exchangeConfig.exchangeId,
        exchangeType: configContent.exchangeConfig.exchangeType,
        address: configContent.exchangeConfig.address,
        symbol: configContent.exchangeConfig.symbol,
        timeFrom: new Date(configContent.exchangeConfig.timeFrom),
        timeTo: new Date(configContent.exchangeConfig.timeTo),
        intervalType: configContent.exchangeConfig.intervalType
    };

    const ohlcvData = await getExchangeTokenOHLCVs(ohlcvInputData);

    const result = await SimulationRunner.runSimulation(strategyCode, tradingConfig, simulationConfig, ohlcvData);
    result.result?.trades?.forEach((trade: Record<string, any>) => {
        trade.timestamp = new Date(trade.timestamp).toISOString();
    });

    mkdirSync(path.join('./results'), { recursive: true });

    const report = result.result?.report;
    if (report) {
        fs.writeFileSync(path.join('./results/trade_report.md'), report);
        console.log('Trade report saved to ./results/trade_report.md');

        delete result.result.report;
    }

    const trades = result.result?.trades;
    if (trades) {
        fs.writeFileSync(path.join('./results/trades.md'), JSON.stringify(trades, null, 4));
        console.log('Trades saved to ./results/trades.md');

        delete result.result.trades;
    }

    fs.writeFileSync(path.join('./results/simulation_result.json'), JSON.stringify(result, null, 4));
    console.log('Simulation result saved to ./results/simulation_result.json');
}
