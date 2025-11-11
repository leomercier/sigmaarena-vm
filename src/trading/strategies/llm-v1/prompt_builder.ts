import { PortfolioSummary, PositionInfo } from '../../trade_functions';
import { CoinMarketData } from './data_aggregator';

export interface TradingContext {
    currentTime: string;
    invocationCount: number;
    minutesTrading: number;
    coinsData: CoinMarketData[];
    portfolio: PortfolioSummary;
    positions: PositionInfo[];
}

export class PromptBuilder {
    private static buildCoinSection(coin: CoinMarketData): string {
        const { symbol, currentPrice, currentEma20, currentMacd, currentRsi7 } = coin;
        const { intraDaySeries, longerTermContext, openInterest, fundingRate } = coin;

        let section = `\nALL ${symbol} DATA\n`;
        section += `    current_price = ${currentPrice.toFixed(2)}, `;
        section += `current_ema20 = ${currentEma20.toFixed(3)}, `;
        section += `current_macd = ${currentMacd.toFixed(3)}, `;
        section += `current_rsi (7 period) = ${currentRsi7.toFixed(3)}\n`;

        if (openInterest && fundingRate !== undefined) {
            section += `    In addition, here is the latest ${symbol} open interest and funding rate for perps:\n`;
            section += `    Open Interest: Latest: ${openInterest.latest.toFixed(2)}  Average: ${openInterest.average.toFixed(2)}\n`;
            section += `    Funding Rate: ${fundingRate.toExponential(2)}\n`;
        }

        section += `\n    Intraday series (3-minute intervals, oldest → latest):\n`;
        section += `        Mid prices: ${this.formatArray(intraDaySeries.prices, 2)}\n`;
        section += `        EMA indicators (20-period): ${this.formatArray(intraDaySeries.ema20, 3)}\n`;
        section += `        MACD indicators: ${this.formatArray(intraDaySeries.macd, 3)}\n`;
        section += `        RSI indicators (7-Period): ${this.formatArray(intraDaySeries.rsi7, 3)}\n`;
        section += `        RSI indicators (14-Period): ${this.formatArray(intraDaySeries.rsi14, 3)}\n`;

        section += `\n    Longer-term context (4-hour timeframe):\n`;
        section += `        20-Period EMA: ${longerTermContext.ema20.toFixed(3)} vs. `;
        section += `50-Period EMA: ${longerTermContext.ema50.toFixed(3)}\n`;
        section += `        3-Period ATR: ${longerTermContext.atr3.toFixed(3)} vs. `;
        section += `14-Period ATR: ${longerTermContext.atr14.toFixed(3)}\n`;
        section += `        Current Volume: ${longerTermContext.currentVolume.toFixed(3)} vs. `;
        section += `Average Volume: ${longerTermContext.avgVolume.toFixed(3)}\n`;
        section += `        MACD indicators: ${this.formatArray(longerTermContext.macd, 3)}\n`;
        section += `        RSI indicators (14-Period): ${this.formatArray(longerTermContext.rsi14, 3)}\n`;

        return section;
    }

    private static formatArray(arr: number[], decimals: number = 3): string {
        return '[' + arr.map((n) => n.toFixed(decimals)).join(', ') + ']';
    }

    /**
     * Build account information section
     */
    private static buildAccountSection(portfolio: PortfolioSummary): string {
        const initialValue = 10000; // Assuming $10k starting capital
        const returnPercent = ((portfolio.totalValue - initialValue) / initialValue) * 100;

        let section = `\n\nHERE IS YOUR ACCOUNT INFORMATION & PERFORMANCE\n`;
        section += `    Current Total Return (percent): ${returnPercent.toFixed(1)}%\n`;
        section += `    Available Cash: ${portfolio.baseBalance.toFixed(2)}\n`;
        section += `    Current Account Value: ${portfolio.totalValue.toFixed(2)}\n`;

        return section;
    }

    private static buildPositionsSection(positions: PositionInfo[]): string {
        if (positions.length === 0) {
            return '\n\nNo current positions.\n';
        }

        let section = `\n\nCurrent live positions & performance:\n`;

        for (const pos of positions) {
            section += `{\n`;
            section += `    'symbol': '${pos.token}',\n`;
            section += `    'quantity': ${pos.amount.toFixed(2)},\n`;
            section += `    'entry_price': ${pos.entryPrice.toFixed(2)},\n`;
            section += `    'current_price': ${pos.currentPrice?.toFixed(2) || 'N/A'},\n`;
            section += `    'unrealized_pnl': ${pos.unrealizedPnL?.toFixed(2) || 'N/A'},\n`;
            section += `    'leverage': ${pos.leverage},\n`;

            if (pos.stopLoss) {
                section += `    'stop_loss': ${JSON.stringify(pos.stopLoss)},\n`;
            }
            if (pos.profitTarget) {
                section += `    'profit_target': ${JSON.stringify(pos.profitTarget)},\n`;
            }

            section += `    'is_long': ${pos.isLong}\n`;
            section += `}\n\n`;
        }

        return section;
    }

    static buildTradingPrompt(context: TradingContext): string {
        let prompt = `It has been ${context.minutesTrading} minutes since you started trading.\n\n`;
        prompt += `The current time is ${context.currentTime} and you've been invoked ${context.invocationCount} times.\n\n`;

        prompt += `Below, we are providing you with a variety of state data, price data, and predictive signals so you can discover alpha. `;
        prompt += `Below that is your current account information, value, performance, positions, etc.\n\n`;

        prompt += `ALL OF THE PRICE OR SIGNAL DATA BELOW IS ORDERED: OLDEST → NEWEST\n\n`;
        prompt += `Timeframes note: Unless stated otherwise in a section title, intraday series are provided at 3-minute intervals.\n\n`;

        prompt += `\nCURRENT MARKET STATE FOR ALL COINS\n`;

        for (const coin of context.coinsData) {
            prompt += this.buildCoinSection(coin);
        }

        prompt += this.buildAccountSection(context.portfolio);

        prompt += this.buildPositionsSection(context.positions);

        prompt += this.buildInstructions();

        return prompt;
    }

    private static buildInstructions(): string {
        let instructions = `\n\n--- TRADING INSTRUCTIONS ---\n\n`;
        instructions += `You are an expert cryptocurrency trader. Based on the market data and your current positions above, `;
        instructions += `provide trading recommendations.\n\n`;

        instructions += `Consider:\n`;
        instructions += `1. Technical indicators (EMA, MACD, RSI trends)\n`;
        instructions += `2. Market structure (higher timeframe context)\n`;
        instructions += `3. Risk management (position sizing, stop losses)\n`;
        instructions += `4. Open interest and funding rates for perpetual futures\n`;
        instructions += `5. Current portfolio exposure and diversification\n\n`;

        instructions += `Provide your analysis and trading decision in a structured format.\n`;

        return instructions;
    }
}
