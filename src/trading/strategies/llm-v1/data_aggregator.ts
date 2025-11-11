import { atr, ema, macd, rsi } from '../../technical-indicators';
import { OHLCVData } from '../../types';

export interface TechnicalIndicators {
    ema20: number;
    macd: number;
    rsi7: number;
    rsi14: number;
}

export interface IntraDaySeries {
    prices: number[];
    ema20: number[];
    macd: number[];
    rsi7: number[];
    rsi14: number[];
}

export interface LongerTermContext {
    ema20: number;
    ema50: number;
    atr3: number;
    atr14: number;
    currentVolume: number;
    avgVolume: number;
    macd: number[];
    rsi14: number[];
}

export interface CoinMarketData {
    symbol: string;
    currentPrice: number;
    currentEma20: number;
    currentMacd: number;
    currentRsi7: number;
    intraDaySeries: IntraDaySeries;
    longerTermContext: LongerTermContext;
    openInterest?: {
        latest: number;
        average: number;
    };
    fundingRate?: number;
}

/**
 * Aggregates technical indicators for a given price series
 */
export class DataAggregator {
    /**
     * Calculate technical indicators from OHLCV data
     */
    static calculateIndicators(candles: OHLCVData[]): TechnicalIndicators | null {
        if (candles.length < 20) {
            return null;
        }

        const closes = candles.map((c) => c.close);

        const emaValues = ema({ period: 20, values: closes });
        const currentEma20 = emaValues[emaValues.length - 1];

        const macdValues = macd({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
        const currentMacd = macdValues[macdValues.length - 1];

        const rsi7Values = rsi({ period: 7, values: closes });
        const rsi14Values = rsi({ period: 14, values: closes });

        return {
            ema20: currentEma20,
            macd: currentMacd?.histogram || 0,
            rsi7: rsi7Values[rsi7Values.length - 1],
            rsi14: rsi14Values[rsi14Values.length - 1]
        };
    }

    /**
     * Get intraday series (last N candles with indicators)
     */
    static getIntraDaySeries(candles: OHLCVData[], count: number = 10): IntraDaySeries | null {
        if (candles.length < count + 20) {
            return null;
        }

        // Get last N candles
        const recentCandles = candles.slice(-count);
        const prices = recentCandles.map((c) => c.close);

        // Calculate indicators over the full dataset up to each point
        const ema20Array: number[] = [];
        const macdArray: number[] = [];
        const rsi7Array: number[] = [];
        const rsi14Array: number[] = [];

        for (let i = 0; i < count; i++) {
            const subset = candles.slice(0, candles.length - count + i + 1);
            const indicators = this.calculateIndicators(subset);

            if (indicators) {
                ema20Array.push(indicators.ema20);
                macdArray.push(indicators.macd);
                rsi7Array.push(indicators.rsi7);
                rsi14Array.push(indicators.rsi14);
            }
        }

        return {
            prices,
            ema20: ema20Array,
            macd: macdArray,
            rsi7: rsi7Array,
            rsi14: rsi14Array
        };
    }

    /**
     * Calculate longer-term context (e.g., 4-hour timeframe data)
     */
    static getLongerTermContext(candles: OHLCVData[], lookback: number = 10): LongerTermContext | null {
        if (candles.length < 50) {
            return null;
        }

        const closes = candles.map((c) => c.close);
        const highs = candles.map((c) => c.high);
        const lows = candles.map((c) => c.low);
        const volumes = candles.map((c) => c.volume);

        const ema20Values = ema({ period: 20, values: closes });
        const ema50Values = ema({ period: 50, values: closes });

        const atr3Values = atr({ low: lows, high: highs, close: closes, period: 3 });
        const atr14Values = atr({ low: lows, high: highs, close: closes, period: 14 });

        const currentVolume = volumes[volumes.length - 1];
        const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;

        const macdHistory = macd({
            values: closes,
            fastPeriod: 12,
            slowPeriod: 26,
            signalPeriod: 9,
            SimpleMAOscillator: false,
            SimpleMASignal: false
        });
        const recentMacd = macdHistory.slice(-lookback).map((m) => m?.histogram || 0);

        // RSI history
        const rsi14Full = rsi({ period: 14, values: closes });
        const recentRsi14 = rsi14Full.slice(-lookback);

        return {
            ema20: ema20Values[ema20Values.length - 1],
            ema50: ema50Values[ema50Values.length - 1],
            atr3: atr3Values[atr3Values.length - 1],
            atr14: atr14Values[atr14Values.length - 1],
            currentVolume,
            avgVolume,
            macd: recentMacd,
            rsi14: recentRsi14
        };
    }

    /**
     * Mock Open Interest data (replace with real API later)
     */
    static getMockOpenInterest(_currentPrice: number): { latest: number; average: number } {
        // Generate mock data based on price (for now)
        // const baseOI = currentPrice > 50000 ? 30000 : 400000;
        return {
            latest: 29611.97, // baseOI + Math.random() * 1000,
            average: 29621.55 //baseOI
        };
    }

    /**
     * Mock Funding Rate data (replace with real API later)
     */
    static getMockFundingRate(): number {
        // Generate small random funding rate between -0.0001 and 0.0001
        return 1.25 / 100000; //(Math.random() - 0.5) * 0.0002;
    }

    /**
     * Aggregate all market data for a coin
     */
    static aggregateCoinData(symbol: string, intraDayCandles: OHLCVData[], longerTermCandles: OHLCVData[]): CoinMarketData | null {
        if (intraDayCandles.length < 30 || longerTermCandles.length < 50) {
            return null;
        }

        const currentIndicators = this.calculateIndicators(intraDayCandles);
        const intraDaySeries = this.getIntraDaySeries(intraDayCandles, 10);
        const longerTermContext = this.getLongerTermContext(longerTermCandles, 10);

        if (!currentIndicators || !intraDaySeries || !longerTermContext) {
            return null;
        }

        const currentPrice = intraDayCandles[intraDayCandles.length - 1].close;

        return {
            symbol,
            currentPrice,
            currentEma20: currentIndicators.ema20,
            currentMacd: currentIndicators.macd,
            currentRsi7: currentIndicators.rsi7,
            intraDaySeries,
            longerTermContext,
            openInterest: this.getMockOpenInterest(currentPrice),
            fundingRate: this.getMockFundingRate()
        };
    }
}
