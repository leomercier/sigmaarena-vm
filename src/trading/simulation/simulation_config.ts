export type OrderFillStrategy = 'immediate' | 'delayed' | 'gradual' | 'never';

export interface SimulationConfig {
    orderFillStrategy: OrderFillStrategy;

    /** Delay in ms before orders fill (for 'delayed' strategy) */
    fillDelayMs?: number;

    /** Percentage of order filled in gradual fills (0-1) */
    partialFillPercentage?: number;

    /** Interval for gradual fills in ms */
    gradualFillIntervalMs?: number;

    // Failure simulation
    /** Probability of order failure (0-1) */
    orderFailureRate?: number;

    /** Auto-cancel orders after this duration in ms */
    cancellationAfterMs?: number;

    // Price simulation
    /** Slippage percentage for market orders (0-1, e.g., 0.01 = 1%) */
    slippagePercentage?: number;

    /** Price volatility for random price movements (0-1) */
    priceVolatility?: number;

    // Market conditions
    /** Whether market orders always succeed (ignore failure rate) */
    marketOrdersAlwaysSucceed?: boolean;

    /** Probability that limit orders will fill (0-1) */
    limitOrderFillProbability?: number;

    // Determinism
    /** Random seed for reproducible results */
    randomSeed?: number;
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
    orderFillStrategy: 'immediate',
    fillDelayMs: 0,
    partialFillPercentage: 1.0,
    gradualFillIntervalMs: 1000,
    orderFailureRate: 0,
    slippagePercentage: 0,
    priceVolatility: 0,
    marketOrdersAlwaysSucceed: true,
    limitOrderFillProbability: 1.0
};

export const SIMULATION_PRESETS = {
    /**
     * Perfect execution - no slippage, instant fills
     */
    PERFECT_EXECUTION: {
        orderFillStrategy: 'immediate' as OrderFillStrategy,
        slippagePercentage: 0,
        orderFailureRate: 0,
        marketOrdersAlwaysSucceed: true,
        limitOrderFillProbability: 1.0
    },

    /**
     * Realistic market conditions
     */
    REALISTIC: {
        orderFillStrategy: 'delayed' as OrderFillStrategy,
        fillDelayMs: 1000,
        slippagePercentage: 0.005, // 0.5% slippage
        orderFailureRate: 0.02, // 2% failure rate
        priceVolatility: 0.001, // 0.1% volatility
        marketOrdersAlwaysSucceed: true,
        limitOrderFillProbability: 0.7
    },

    /**
     * High volatility and failures
     */
    CHAOTIC: {
        orderFillStrategy: 'delayed' as OrderFillStrategy,
        fillDelayMs: 2000,
        slippagePercentage: 0.02, // 2% slippage
        orderFailureRate: 0.2, // 20% failure rate
        priceVolatility: 0.05, // 5% volatility
        cancellationAfterMs: 5000,
        marketOrdersAlwaysSucceed: false,
        limitOrderFillProbability: 0.3
    },

    /**
     * Gradual order fills
     */
    GRADUAL_FILLS: {
        orderFillStrategy: 'gradual' as OrderFillStrategy,
        partialFillPercentage: 0.3, // 30% per interval
        gradualFillIntervalMs: 500,
        slippagePercentage: 0.002,
        orderFailureRate: 0.05
    },

    /**
     * Orders never fill (testing pending state handling)
     */
    NO_FILLS: {
        orderFillStrategy: 'never' as OrderFillStrategy,
        orderFailureRate: 0
    }
} as const;

/**
 * Helper to merge config with defaults
 */
export function createSimulationConfig(partial?: Partial<SimulationConfig>): SimulationConfig {
    return {
        ...DEFAULT_SIMULATION_CONFIG,
        ...partial
    };
}
