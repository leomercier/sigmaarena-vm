import { OHLCVData } from '../../types';

/**
 * Simple in-memory store for candle data. Maintains rolling windows of intraday and longer-term candles.
 */
export class CandleStore {
    private intraDayCandles: Map<string, OHLCVData[]> = new Map();
    private longerTermCandles: Map<string, OHLCVData[]> = new Map();

    private aggregatingCandles: Map<string, OHLCVData[]> = new Map();
    private longerTermIntervalMinutes: number;
    private intraDayIntervalMinutes: number;

    private readonly INTRADAY_MAX = 100; // Keep last 100 intraday candles
    private readonly LONGER_TERM_MAX = 200; // Keep last 200 longer-term candles

    constructor(intraDayIntervalMinutes: number = 5, longerTermIntervalMinutes: number = 240) {
        this.intraDayIntervalMinutes = intraDayIntervalMinutes;
        this.longerTermIntervalMinutes = longerTermIntervalMinutes;
    }

    /**
     * Add a new intraday candle and potentially aggregate for longer-term
     */
    addIntraDayCandle(symbol: string, candle: OHLCVData): void {
        if (!this.intraDayCandles.has(symbol)) {
            this.intraDayCandles.set(symbol, []);
        }

        const candles = this.intraDayCandles.get(symbol)!;
        candles.push(candle);

        // Keep only the most recent candles
        if (candles.length > this.INTRADAY_MAX) {
            candles.shift();
        }

        // Also add to aggregating buffer for longer-term candles
        this.addToAggregationBuffer(symbol, candle);
    }

    /**
     * Add candle to aggregation buffer and create longer-term candle when ready
     */
    private addToAggregationBuffer(symbol: string, candle: OHLCVData): void {
        if (!this.aggregatingCandles.has(symbol)) {
            this.aggregatingCandles.set(symbol, []);
        }

        const buffer = this.aggregatingCandles.get(symbol)!;
        buffer.push(candle);

        // Calculate how many intraday candles make one longer-term candle
        const candlesPerLongerTerm = this.longerTermIntervalMinutes / this.intraDayIntervalMinutes;

        // If we have enough candles, create a longer-term candle
        if (buffer.length >= candlesPerLongerTerm) {
            const longerTermCandle = this.aggregateCandles(symbol, buffer);
            this.addLongerTermCandle(symbol, longerTermCandle);

            // Clear the buffer
            this.aggregatingCandles.set(symbol, []);
        }
    }

    /**
     * Aggregate multiple intraday candles into one longer-term candle
     */
    private aggregateCandles(symbol: string, candles: OHLCVData[]): OHLCVData {
        if (candles.length === 0) {
            throw new Error('Cannot aggregate empty candles array');
        }

        const open = candles[0].open;
        const close = candles[candles.length - 1].close;
        const high = Math.max(...candles.map((c) => c.high));
        const low = Math.min(...candles.map((c) => c.low));
        const volume = candles.reduce((sum, c) => sum + c.volume, 0);
        const timestamp = candles[0].timestamp;

        return {
            symbol,
            timestamp,
            open,
            high,
            low,
            close,
            volume
        };
    }

    /**
     * Add a new longer-term candle
     */
    addLongerTermCandle(symbol: string, candle: OHLCVData): void {
        if (!this.longerTermCandles.has(symbol)) {
            this.longerTermCandles.set(symbol, []);
        }

        const candles = this.longerTermCandles.get(symbol)!;
        candles.push(candle);

        // Keep only the most recent candles
        if (candles.length > this.LONGER_TERM_MAX) {
            candles.shift();
        }
    }

    /**
     * Get intraday candles for a symbol
     */
    getIntraDayCandles(symbol: string): OHLCVData[] {
        return this.intraDayCandles.get(symbol) || [];
    }

    /**
     * Get longer-term candles for a symbol
     */
    getLongerTermCandles(symbol: string): OHLCVData[] {
        return this.longerTermCandles.get(symbol) || [];
    }

    /**
     * Check if we have enough data for analysis
     */
    hasEnoughData(symbol: string, minIntraDay: number = 30, minLongerTerm: number = 50): boolean {
        const intraDayCount = this.intraDayCandles.get(symbol)?.length || 0;
        const longerTermCount = this.longerTermCandles.get(symbol)?.length || 0;

        return intraDayCount >= minIntraDay && longerTermCount >= minLongerTerm;
    }

    /**
     * Get the required number of intraday candles before trading can start
     */
    getRequiredIntraDayCandles(): number {
        // Need enough for indicators (20 for EMA) plus some history
        return 30;
    }

    /**
     * Get the required number of longer-term candles before trading can start
     */
    getRequiredLongerTermCandles(): number {
        // Need enough for 50-period EMA and other indicators
        return 50;
    }

    /**
     * Check if ready to start trading
     */
    isReadyToTrade(symbol: string): boolean {
        return this.hasEnoughData(symbol, this.getRequiredIntraDayCandles(), this.getRequiredLongerTermCandles());
    }

    /**
     * Initialize store with existing candle data
     */
    initializeFromData(symbol: string, intraDayData: OHLCVData[], longerTermData: OHLCVData[]): void {
        this.intraDayCandles.set(symbol, [...intraDayData]);
        this.longerTermCandles.set(symbol, [...longerTermData]);

        // Trim to max size
        const intraDayCandles = this.intraDayCandles.get(symbol)!;
        if (intraDayCandles.length > this.INTRADAY_MAX) {
            this.intraDayCandles.set(symbol, intraDayCandles.slice(-this.INTRADAY_MAX));
        }

        const longerTermCandles = this.longerTermCandles.get(symbol)!;
        if (longerTermCandles.length > this.LONGER_TERM_MAX) {
            this.longerTermCandles.set(symbol, longerTermCandles.slice(-this.LONGER_TERM_MAX));
        }
    }

    /**
     * Create a synthetic candle from current price (useful for updating intraday data)
     */
    static createSyntheticCandle(symbol: string, price: number, timestamp: number, volume: number = 100): OHLCVData {
        return {
            symbol,
            timestamp,
            open: price,
            high: price,
            low: price,
            close: price,
            volume
        };
    }

    /**
     * Clear all data for a symbol
     */
    clearSymbol(symbol: string): void {
        this.intraDayCandles.delete(symbol);
        this.longerTermCandles.delete(symbol);
    }

    /**
     * Clear all data
     */
    clearAll(): void {
        this.intraDayCandles.clear();
        this.longerTermCandles.clear();
    }

    /**
     * Get summary of stored data
     */
    getSummary(): { symbol: string; intraDayCount: number; longerTermCount: number }[] {
        const symbols = new Set([...this.intraDayCandles.keys(), ...this.longerTermCandles.keys()]);

        return Array.from(symbols).map((symbol) => ({
            symbol,
            intraDayCount: this.intraDayCandles.get(symbol)?.length || 0,
            longerTermCount: this.longerTermCandles.get(symbol)?.length || 0
        }));
    }
}
