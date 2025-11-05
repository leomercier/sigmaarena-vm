import { BollingerBands, RSI } from '../technical-indicators';
import { BuyFunction, GetAllPositionsFunction, GetWalletFunction, SellFunction } from '../trade_functions';
import { Trading } from '../trading_class';
import { AnalysisData } from '../types';

declare const buy: BuyFunction;
declare const sell: SellFunction;
declare const getAllPositions: GetAllPositionsFunction;
declare const getWallet: GetWalletFunction;

interface IndicatorValues {
    rsi: number;
    bbUpper: number;
    bbMiddle: number;
    bbLower: number;
    trend: 'up' | 'down' | 'neutral';
}

interface SpotPosition {
    amount: number;
    entryPrice: number;
}

export default class RSIBollingerStrategy extends Trading {
    private priceHistories: Map<string, number[]> = new Map();
    private spotPositions: Map<string, SpotPosition> = new Map();
    private readonly RSI_PERIOD = 14;
    private readonly BB_PERIOD = 20;
    private readonly BB_STD_DEV = 2;
    private readonly RSI_OVERSOLD = 25;
    private readonly RSI_OVERBOUGHT = 75;
    private readonly RSI_EXIT_LONG = 60;
    private readonly RSI_EXIT_SHORT = 40;
    private readonly POSITION_SIZE = 0.12;
    private readonly STOP_LOSS_PERCENT = 2.5;
    private readonly TAKE_PROFIT_PERCENT = 5;

    protected async onInitialize(): Promise<void> {
        for (const token of this.getTradableTokens()) {
            this.priceHistories.set(token, []);
        }
    }

    async analyze(data: AnalysisData): Promise<void> {
        if (!data.ohlcv) return;

        const { symbol, close } = data.ohlcv;
        const history = this.priceHistories.get(symbol);
        if (!history) return;

        history.push(close);
        if (history.length > Math.max(this.RSI_PERIOD, this.BB_PERIOD) + 50) {
            history.shift();
        }

        if (history.length < Math.max(this.RSI_PERIOD, this.BB_PERIOD) + 1) {
            return;
        }

        const indicators = this.calculateIndicators(history);
        if (!indicators) return;

        await this.evaluateSignals(symbol, close, indicators);
    }

    private calculateIndicators(prices: number[]): IndicatorValues | null {
        const rsi = RSI.lastValue(prices, this.RSI_PERIOD);
        if (rsi === undefined) return null;

        const bb = BollingerBands.lastValue(prices, this.BB_PERIOD, this.BB_STD_DEV);
        if (!bb) return null;

        const trend = this.calculateTrend(prices, 50);

        return {
            rsi,
            bbUpper: bb.upper,
            bbMiddle: bb.middle,
            bbLower: bb.lower,
            trend
        };
    }

    private async evaluateSignals(token: string, currentPrice: number, indicators: IndicatorValues): Promise<void> {
        const allPositions = await getAllPositions();
        const wallet = await getWallet();

        const futuresPosition = allPositions.find((p) => p.token === token && p.isShort);
        const tokenBalance = wallet[token] || 0;
        const spotPosition = this.spotPositions.get(token);

        if (futuresPosition) {
            const pnl = await this.getPositionPnL(token);
            if (pnl) {
                if (pnl.pnlPercentage <= -this.STOP_LOSS_PERCENT) {
                    await buy(token, Math.abs(futuresPosition.amount), {
                        orderType: 'market',
                        isFutures: true
                    });
                    return;
                }

                if (pnl.pnlPercentage >= this.TAKE_PROFIT_PERCENT) {
                    await buy(token, Math.abs(futuresPosition.amount), {
                        orderType: 'market',
                        isFutures: true
                    });
                    return;
                }
            }

            const priceBelowEntry = currentPrice < futuresPosition.entryPrice;
            const exitShort = indicators.rsi <= this.RSI_EXIT_SHORT || (currentPrice <= indicators.bbMiddle && priceBelowEntry);
            if (exitShort && priceBelowEntry) {
                await buy(token, Math.abs(futuresPosition.amount), {
                    orderType: 'market',
                    isFutures: true
                });
            }
            return;
        }

        if (tokenBalance > 0 && spotPosition) {
            const entryValue = spotPosition.amount * spotPosition.entryPrice;
            const currentValue = tokenBalance * currentPrice;
            const pnlPercent = ((currentValue - entryValue) / entryValue) * 100;

            if (pnlPercent <= -this.STOP_LOSS_PERCENT) {
                await sell(token, tokenBalance, {
                    orderType: 'market',
                    isFutures: false
                });
                this.spotPositions.delete(token);
                return;
            }

            if (pnlPercent >= this.TAKE_PROFIT_PERCENT) {
                await sell(token, tokenBalance, {
                    orderType: 'market',
                    isFutures: false
                });
                this.spotPositions.delete(token);
                return;
            }

            const priceAboveEntry = currentPrice > spotPosition.entryPrice;
            const exitLong = indicators.rsi >= this.RSI_EXIT_LONG || (currentPrice >= indicators.bbMiddle && priceAboveEntry);
            if (exitLong && priceAboveEntry) {
                await sell(token, tokenBalance, {
                    orderType: 'market',
                    isFutures: false
                });
                this.spotPositions.delete(token);
            }
            return;
        }

        const buySignal = currentPrice <= indicators.bbLower && indicators.rsi < this.RSI_OVERSOLD;
        const sellSignal = currentPrice >= indicators.bbUpper && indicators.rsi > this.RSI_OVERBOUGHT;

        if (buySignal && indicators.trend !== 'down') {
            const balance = await this.getTradableBalance();
            const amount = (balance * this.POSITION_SIZE) / currentPrice;

            if (amount > 0) {
                await buy(token, amount, {
                    orderType: 'market',
                    isFutures: false
                });
                this.spotPositions.set(token, {
                    amount: amount,
                    entryPrice: currentPrice
                });
            }
        } else if (sellSignal && indicators.trend !== 'up') {
            const balance = await this.getTradableBalance();
            const amount = (balance * this.POSITION_SIZE) / currentPrice;

            if (amount > 0) {
                await sell(token, amount, {
                    orderType: 'market',
                    isFutures: true
                });
            }
        }
    }

    private calculateTrend(prices: number[], period: number): 'up' | 'down' | 'neutral' {
        if (prices.length < period) return 'neutral';

        const recentPrices = prices.slice(-period);
        const sma = recentPrices.reduce((sum, price) => sum + price, 0) / period;
        const currentPrice = prices[prices.length - 1];

        const deviation = ((currentPrice - sma) / sma) * 100;

        if (deviation > 2) return 'up';
        if (deviation < -2) return 'down';
        return 'neutral';
    }
}
