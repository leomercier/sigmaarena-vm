import { BuyFunction, SellFunction, GetAllPositionsFunction, GetWalletFunction } from '../trade_functions';
import { Trading } from '../trading_class';
import { AnalysisData } from '../types';

declare const buy: BuyFunction;
declare const sell: SellFunction;
declare const getAllPositions: GetAllPositionsFunction;
declare const getWallet: GetWalletFunction;

interface IndicatorValues {
    emaFast: number;
    emaSlow: number;
    ema200: number;
    macd: number;
    macdSignal: number;
    macdHistogram: number;
    prevMacdHistogram: number;
    adx: number;
    atr: number;
    trend: 'bullish' | 'bearish' | 'neutral';
}

interface SpotPosition {
    amount: number;
    entryPrice: number;
    highestPrice: number;
    lowestPrice: number;
}

export default class EMAMACDStrategy extends Trading {
    private priceHistories: Map<string, number[]> = new Map();
    private highHistories: Map<string, number[]> = new Map();
    private lowHistories: Map<string, number[]> = new Map();
    private spotPositions: Map<string, SpotPosition> = new Map();

    // EMA periods
    private readonly EMA_FAST_PERIOD = 12;
    private readonly EMA_SLOW_PERIOD = 26;
    private readonly EMA_TREND_PERIOD = 200;

    // MACD parameters
    private readonly MACD_SIGNAL_PERIOD = 9;

    // ADX for trend strength
    private readonly ADX_PERIOD = 14;
    private readonly ADX_THRESHOLD = 25; // Only trade when trend is strong

    // Trading parameters
    private readonly POSITION_SIZE = 0.2;
    private readonly STOP_LOSS_PERCENT = 2.0;
    private readonly TAKE_PROFIT_PERCENT = 4.0;
    private readonly TRAILING_STOP_PERCENT = 1.5; // Activate after 2% gain
    private readonly TRAILING_STOP_ACTIVATION = 2.0;

    // Signal confirmation
    private readonly MIN_HISTOGRAM_CHANGE = 0.5; // Require momentum
    private readonly COOLDOWN_BARS = 5; // Prevent overtrading

    // EMA cache for efficient calculation
    private emaFastCache: Map<string, number> = new Map();
    private emaSlowCache: Map<string, number> = new Map();
    private ema200Cache: Map<string, number> = new Map();
    private macdCache: Map<string, number[]> = new Map();
    private lastTradeBar: Map<string, number> = new Map();
    private barCount: Map<string, number> = new Map();

    protected async onInitialize(): Promise<void> {
        for (const token of this.getTradableTokens()) {
            this.priceHistories.set(token, []);
            this.highHistories.set(token, []);
            this.lowHistories.set(token, []);
            this.macdCache.set(token, []);
            this.lastTradeBar.set(token, -999);
            this.barCount.set(token, 0);
        }
    }

    async analyze(data: AnalysisData): Promise<void> {
        if (!data.ohlcv) return;

        const { symbol, close, high, low } = data.ohlcv;
        const history = this.priceHistories.get(symbol);
        const highHistory = this.highHistories.get(symbol);
        const lowHistory = this.lowHistories.get(symbol);
        if (!history || !highHistory || !lowHistory) return;

        history.push(close);
        highHistory.push(high);
        lowHistory.push(low);

        // Increment bar count
        const currentBar = (this.barCount.get(symbol) || 0) + 1;
        this.barCount.set(symbol, currentBar);

        // Keep enough history for calculations
        const maxPeriod = Math.max(this.EMA_TREND_PERIOD, this.ADX_PERIOD) + 50;
        if (history.length > maxPeriod) {
            history.shift();
            highHistory.shift();
            lowHistory.shift();
        }

        // Need enough data for all indicators
        if (history.length < this.EMA_TREND_PERIOD) {
            return;
        }

        const indicators = this.calculateIndicators(symbol, history, highHistory, lowHistory);
        if (!indicators) return;

        await this.evaluateSignals(symbol, close, indicators, currentBar);
    }

    private calculateIndicators(token: string, prices: number[], highs: number[], lows: number[]): IndicatorValues | null {
        const emaFast = this.calculateEMA(token, prices, this.EMA_FAST_PERIOD, 'fast');
        const emaSlow = this.calculateEMA(token, prices, this.EMA_SLOW_PERIOD, 'slow');
        const ema200 = this.calculateEMA(token, prices, this.EMA_TREND_PERIOD, 'trend');

        if (emaFast === null || emaSlow === null || ema200 === null) return null;

        const macd = emaFast - emaSlow;

        // Calculate MACD signal line (EMA of MACD)
        const macdHistory = this.macdCache.get(token) || [];
        macdHistory.push(macd);

        if (macdHistory.length > 50) {
            macdHistory.shift();
        }

        this.macdCache.set(token, macdHistory);

        if (macdHistory.length < this.MACD_SIGNAL_PERIOD) {
            return null;
        }

        const macdSignal = this.calculateSimpleEMA(macdHistory, this.MACD_SIGNAL_PERIOD);
        if (macdSignal === null) return null;

        const macdHistogram = macd - macdSignal;
        const prevMacdHistogram = macdHistory.length >= 2 ? macdHistory[macdHistory.length - 2] - macdSignal : 0;

        // Calculate ADX for trend strength
        const adx = this.calculateADX(prices, highs, lows, this.ADX_PERIOD);

        // Calculate ATR for dynamic stops
        const atr = this.calculateATR(prices, highs, lows, 14);

        // Determine trend based on multiple factors
        const trend = this.determineTrend(emaFast, emaSlow, ema200, macd, macdHistogram, adx);

        return {
            emaFast,
            emaSlow,
            ema200,
            macd,
            macdSignal,
            macdHistogram,
            prevMacdHistogram,
            adx,
            atr,
            trend
        };
    }

    private calculateEMA(token: string, prices: number[], period: number, cacheKey: 'fast' | 'slow' | 'trend'): number | null {
        if (prices.length < period) return null;

        const cache = cacheKey === 'fast' ? this.emaFastCache : cacheKey === 'slow' ? this.emaSlowCache : this.ema200Cache;
        const multiplier = 2 / (period + 1);
        const currentPrice = prices[prices.length - 1];

        // Initialize with SMA if no cached value
        if (!cache.has(token)) {
            const sma = prices.slice(-period).reduce((sum, price) => sum + price, 0) / period;
            cache.set(token, sma);
            return sma;
        }

        const previousEMA = cache.get(token)!;
        const ema = (currentPrice - previousEMA) * multiplier + previousEMA;
        cache.set(token, ema);

        return ema;
    }

    private calculateSimpleEMA(values: number[], period: number): number | null {
        if (values.length < period) return null;

        const multiplier = 2 / (period + 1);
        const recentValues = values.slice(-period);

        // Start with SMA
        let ema = recentValues.reduce((sum, val) => sum + val, 0) / period;

        // Calculate EMA for remaining values
        for (let i = period; i < values.length; i++) {
            ema = (values[i] - ema) * multiplier + ema;
        }

        return ema;
    }

    private calculateATR(prices: number[], highs: number[], lows: number[], period: number): number {
        if (prices.length < period + 1) return 0;

        const trueRanges: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            const high = highs[i];
            const low = lows[i];
            const prevClose = prices[i - 1];

            const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
            trueRanges.push(tr);
        }

        const recentTR = trueRanges.slice(-period);
        return recentTR.reduce((sum, tr) => sum + tr, 0) / period;
    }

    private calculateADX(prices: number[], highs: number[], lows: number[], period: number): number {
        if (prices.length < period + 1) return 0;

        const movements: { plusDM: number; minusDM: number; tr: number }[] = [];

        for (let i = 1; i < prices.length; i++) {
            const highDiff = highs[i] - highs[i - 1];
            const lowDiff = lows[i - 1] - lows[i];

            const plusDM = highDiff > lowDiff && highDiff > 0 ? highDiff : 0;
            const minusDM = lowDiff > highDiff && lowDiff > 0 ? lowDiff : 0;

            const tr = Math.max(highs[i] - lows[i], Math.abs(highs[i] - prices[i - 1]), Math.abs(lows[i] - prices[i - 1]));

            movements.push({ plusDM, minusDM, tr });
        }

        const recent = movements.slice(-period);
        const avgPlusDM = recent.reduce((sum, m) => sum + m.plusDM, 0) / period;
        const avgMinusDM = recent.reduce((sum, m) => sum + m.minusDM, 0) / period;
        const avgTR = recent.reduce((sum, m) => sum + m.tr, 0) / period;

        if (avgTR === 0) return 0;

        const plusDI = (avgPlusDM / avgTR) * 100;
        const minusDI = (avgMinusDM / avgTR) * 100;

        const diSum = plusDI + minusDI;
        if (diSum === 0) return 0;

        const dx = (Math.abs(plusDI - minusDI) / diSum) * 100;

        return dx;
    }

    private determineTrend(
        emaFast: number,
        emaSlow: number,
        ema200: number,
        macd: number,
        histogram: number,
        adx: number
    ): 'bullish' | 'bearish' | 'neutral' {
        // Weak trend - avoid trading
        if (adx < this.ADX_THRESHOLD) {
            return 'neutral';
        }

        const price = emaFast; // Use fast EMA as proxy for price
        const aboveLongTermTrend = price > ema200;
        const emaCrossover = emaFast > emaSlow;
        const macdPositive = macd > 0;
        const histogramPositive = histogram > 0;

        // Count bullish signals
        const bullishSignals = [aboveLongTermTrend, emaCrossover, macdPositive, histogramPositive].filter(Boolean).length;

        // Strong bullish: 3+ bullish signals
        if (bullishSignals >= 3) {
            return 'bullish';
        }

        // Strong bearish: 3+ bearish signals
        if (bullishSignals <= 1) {
            return 'bearish';
        }

        return 'neutral';
    }

    private async evaluateSignals(token: string, currentPrice: number, indicators: IndicatorValues, currentBar: number): Promise<void> {
        const allPositions = await getAllPositions();
        const wallet = await getWallet();

        const futuresPosition = allPositions.find((p) => p.token === token && p.isShort);
        const tokenBalance = wallet[token] || 0;
        const spotPosition = this.spotPositions.get(token);

        // Update position tracking
        if (spotPosition && tokenBalance > 0) {
            spotPosition.highestPrice = Math.max(spotPosition.highestPrice, currentPrice);
            spotPosition.lowestPrice = Math.min(spotPosition.lowestPrice, currentPrice);
        }

        // Manage existing positions
        if (futuresPosition) {
            await this.manageShortPosition(token, currentPrice, futuresPosition, indicators);
            return;
        }

        if (tokenBalance > 0 && spotPosition) {
            await this.manageLongPosition(token, currentPrice, tokenBalance, spotPosition, indicators);
            return;
        }

        // Check cooldown period
        const lastTrade = this.lastTradeBar.get(token) || -999;
        if (currentBar - lastTrade < this.COOLDOWN_BARS) {
            return;
        }

        // Look for new entry signals
        await this.evaluateEntrySignals(token, currentPrice, indicators, currentBar);
    }

    private async manageShortPosition(token: string, currentPrice: number, position: any, indicators: IndicatorValues): Promise<void> {
        const pnl = await this.getPositionPnL(token);

        // Stop loss check
        if (pnl && pnl.pnlPercentage <= -this.STOP_LOSS_PERCENT) {
            await buy(token, Math.abs(position.amount), {
                orderType: 'market',
                isFutures: true
            });
            console.log(`Short stopped out: ${pnl.pnlPercentage.toFixed(2)}%`);
            return;
        }

        // Take profit check
        if (pnl && pnl.pnlPercentage >= this.TAKE_PROFIT_PERCENT) {
            await buy(token, Math.abs(position.amount), {
                orderType: 'market',
                isFutures: true
            });
            console.log(`Short profit taken: +${pnl.pnlPercentage.toFixed(2)}%`);
            return;
        }

        // Exit on strong bullish reversal
        const histogramTurningUp = indicators.macdHistogram > indicators.prevMacdHistogram;
        const strongBullishSignal =
            indicators.trend === 'bullish' && indicators.emaFast > indicators.emaSlow && histogramTurningUp && indicators.macdHistogram > 0;

        if (strongBullishSignal) {
            await buy(token, Math.abs(position.amount), {
                orderType: 'market',
                isFutures: true
            });
            console.log(`Short closed on reversal`);
        }
    }

    private async manageLongPosition(
        token: string,
        currentPrice: number,
        tokenBalance: number,
        spotPosition: SpotPosition,
        indicators: IndicatorValues
    ): Promise<void> {
        const entryValue = spotPosition.amount * spotPosition.entryPrice;
        const currentValue = tokenBalance * currentPrice;
        const pnlPercent = ((currentValue - entryValue) / entryValue) * 100;

        // Trailing stop for profitable positions
        if (pnlPercent >= this.TRAILING_STOP_ACTIVATION) {
            const dropFromHigh = ((spotPosition.highestPrice - currentPrice) / spotPosition.highestPrice) * 100;
            if (dropFromHigh >= this.TRAILING_STOP_PERCENT) {
                await sell(token, tokenBalance, {
                    orderType: 'market',
                    isFutures: false
                });
                this.spotPositions.delete(token);
                console.log(`Trailing stop hit: +${pnlPercent.toFixed(2)}%`);
                return;
            }
        }

        // Stop loss check
        if (pnlPercent <= -this.STOP_LOSS_PERCENT) {
            await sell(token, tokenBalance, {
                orderType: 'market',
                isFutures: false
            });
            this.spotPositions.delete(token);
            console.log(`Long stopped out: ${pnlPercent.toFixed(2)}%`);
            return;
        }

        // Take profit check
        if (pnlPercent >= this.TAKE_PROFIT_PERCENT) {
            await sell(token, tokenBalance, {
                orderType: 'market',
                isFutures: false
            });
            this.spotPositions.delete(token);
            console.log(`Long profit taken: +${pnlPercent.toFixed(2)}%`);
            return;
        }

        // Exit on strong bearish reversal
        const histogramTurningDown = indicators.macdHistogram < indicators.prevMacdHistogram;
        const strongBearishSignal =
            indicators.trend === 'bearish' && indicators.emaFast < indicators.emaSlow && histogramTurningDown && indicators.macdHistogram < 0;

        if (strongBearishSignal && pnlPercent > 0) {
            await sell(token, tokenBalance, {
                orderType: 'market',
                isFutures: false
            });
            this.spotPositions.delete(token);
            console.log(`Long closed on reversal`);
        }
    }

    private async evaluateEntrySignals(token: string, currentPrice: number, indicators: IndicatorValues, currentBar: number): Promise<void> {
        // Only trade in strong trends
        if (indicators.adx < this.ADX_THRESHOLD) {
            return;
        }

        const balance = await this.getTradableBalance();
        const positionValue = balance * this.POSITION_SIZE;
        const amount = positionValue / currentPrice;

        if (amount <= 0) return;

        // MACD histogram must be accelerating
        const histogramAccelerating = Math.abs(indicators.macdHistogram) > Math.abs(indicators.prevMacdHistogram);

        // Bullish entry: Strong uptrend with momentum
        const bullishEntry =
            indicators.trend === 'bullish' &&
            indicators.emaFast > indicators.emaSlow &&
            indicators.emaFast > indicators.ema200 &&
            indicators.macdHistogram > this.MIN_HISTOGRAM_CHANGE &&
            indicators.macd > indicators.macdSignal &&
            histogramAccelerating &&
            indicators.adx >= this.ADX_THRESHOLD;

        // Bearish entry: Strong downtrend with momentum
        const bearishEntry =
            indicators.trend === 'bearish' &&
            indicators.emaFast < indicators.emaSlow &&
            indicators.emaFast < indicators.ema200 &&
            indicators.macdHistogram < -this.MIN_HISTOGRAM_CHANGE &&
            indicators.macd < indicators.macdSignal &&
            histogramAccelerating &&
            indicators.adx >= this.ADX_THRESHOLD;

        if (bullishEntry) {
            await buy(token, amount, {
                orderType: 'market',
                isFutures: false
            });
            this.spotPositions.set(token, {
                amount: amount,
                entryPrice: currentPrice,
                highestPrice: currentPrice,
                lowestPrice: currentPrice
            });
            this.lastTradeBar.set(token, currentBar);
            console.log(`LONG entry @ ${currentPrice.toFixed(2)} | ADX: ${indicators.adx.toFixed(1)} | Hist: ${indicators.macdHistogram.toFixed(4)}`);
        } else if (bearishEntry) {
            await sell(token, amount, {
                orderType: 'market',
                isFutures: true
            });
            this.lastTradeBar.set(token, currentBar);
            console.log(
                `SHORT entry @ ${currentPrice.toFixed(2)} | ADX: ${indicators.adx.toFixed(1)} | Hist: ${indicators.macdHistogram.toFixed(4)}`
            );
        }
    }

    async closeSession(): Promise<void> {
        console.log('Closing all positions...');
        await this.closeAllPositions();

        // Clear caches
        this.spotPositions.clear();
        this.emaFastCache.clear();
        this.emaSlowCache.clear();
        this.ema200Cache.clear();
        this.macdCache.clear();
        this.lastTradeBar.clear();
    }
}
