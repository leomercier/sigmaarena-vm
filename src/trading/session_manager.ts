import { TradeFunctions } from './trade_functions';
import { AnalysisData, PnLResult, TradingConfig, TradingSession } from './types';

/**
 * Session manager interface
 * Handles the lifecycle of a trading session and coordinates between
 * the user script, trade functions, and data feeds
 */
export interface SessionManager {
    /**
     * Initialize a trading session with a user script
     *
     * @param userScript - The user's trading strategy instance
     * @param config - Trading configuration
     */
    initializeSession(userScript: TradingSession, config: TradingConfig): Promise<void>;

    /**
     * Feed new data to the user script for analysis
     *
     * @param data - Latest market/trading data
     */
    feedData(data: AnalysisData): Promise<void>;

    /**
     * Close the trading session. Triggers final liquidation and PnL calculation.
     */
    closeSession(): Promise<PnLResult>;

    /**
     * Get the trade functions that will be injected into user script
     * Different implementations for simulation vs live mode
     */
    getTradeFunctions(): TradeFunctions;
}

/**
 * Configuration for creating a session manager
 */
export interface SessionManagerConfig {
    /** Execution mode determines which trade function implementation to use */
    mode: 'simulation' | 'live';
}
