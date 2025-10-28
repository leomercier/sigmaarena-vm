import { PriceResult } from '../trade_functions';

interface PricePoint {
    price: number;
    timestamp: number;
}

/**
 * Seeded random number generator for deterministic results
 */
export class SeededRandom {
    private seed: number;

    constructor(seed: number) {
        this.seed = seed;
    }

    next(): number {
        this.seed = (this.seed * 9301 + 49297) % 233280;
        return this.seed / 233280;
    }
}

/**
 * Price oracle for managing token prices
 */
export class PriceOracle {
    private prices: Map<string, PricePoint>;
    private priceHistory: Map<string, PricePoint[]>;
    private volatility: number;
    private random: SeededRandom;

    constructor(initialPrices: Record<string, number>, volatility: number = 0, randomSeed?: number) {
        this.prices = new Map();
        this.priceHistory = new Map();
        this.volatility = volatility;
        this.random = new SeededRandom(randomSeed ?? Date.now());

        // Initialize prices
        const now = Date.now();

        for (const [token, price] of Object.entries(initialPrices)) {
            const pricePoint = { price, timestamp: now };
            this.prices.set(token, pricePoint);
            this.priceHistory.set(token, [pricePoint]);
        }
    }

    /**
     * Get current price for a token
     */
    getCurrentPrice(token: string): PriceResult {
        const pricePoint = this.prices.get(token);

        if (!pricePoint) {
            return {
                success: false,
                token,
                error: `No price data available for ${token}`
            };
        }

        // Apply volatility if configured
        const price = this.applyVolatility(pricePoint.price);

        return {
            success: true,
            token,
            price,
            bid: price * 0.9995, // Simulate bid / ask spread
            ask: price * 1.0005,
            timestamp: Date.now()
        };
    }

    /**
     * Update price for a token (e.g., from OHLCV data)
     */
    updatePrice(token: string, price: number): void {
        const pricePoint = { price, timestamp: Date.now() };
        this.prices.set(token, pricePoint);

        // Add to history
        const history = this.priceHistory.get(token) || [];
        history.push(pricePoint);

        this.priceHistory.set(token, history);
    }

    /**
     * Get execution price with slippage
     */
    getExecutionPrice(token: string, action: 'buy' | 'sell', slippagePercentage: number): number | undefined {
        const pricePoint = this.prices.get(token);
        if (!pricePoint) {
            return undefined;
        }

        let price = this.applyVolatility(pricePoint.price);

        // Apply slippage
        if (slippagePercentage > 0) {
            const slippage = 1 + this.random.next() * slippagePercentage;
            if (action === 'buy') {
                price *= slippage; // Buy higher
            } else {
                price /= slippage; // Sell lower
            }
        }

        return price;
    }

    /**
     * Apply volatility to price
     */
    private applyVolatility(basePrice: number): number {
        if (this.volatility === 0) {
            return basePrice;
        }

        // Random walk: -volatility to +volatility
        const change = (this.random.next() * 2 - 1) * this.volatility;
        return basePrice * (1 + change);
    }

    /**
     * Get historical price (for validation/PnL calculation)
     */
    getHistoricalPrice(token: string, timestamp: number): number | undefined {
        const history = this.priceHistory.get(token);
        if (!history || history.length === 0) {
            return undefined;
        }

        // Find closest price point before or at timestamp
        let closest = history[0];
        for (const point of history) {
            if (point.timestamp <= timestamp) {
                closest = point;
            } else {
                break;
            }
        }

        return closest.price;
    }

    /**
     * Get all current prices
     */
    getAllPrices(): Record<string, number> {
        const result: Record<string, number> = {};
        for (const [token, pricePoint] of this.prices.entries()) {
            result[token] = pricePoint.price;
        }

        return result;
    }
}
