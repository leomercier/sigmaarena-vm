import { TradeResult } from '../../trade_functions';
import { TradingAction } from './llm_response_schema';

declare const buy: any;
declare const sell: any;
declare const closePosition: any;
declare const getPosition: any;
declare const getCurrentPrice: any;
declare const getAvailableBalance: any;

export interface ExecutionResult {
    action: TradingAction;
    executed: boolean;
    tradeResult?: TradeResult;
    error?: string;
    skippedReason?: string;
}

/**
 * Executes trading actions from LLM responses. Handles the translation from LLM recommendations to actual trades.
 */
export class ActionExecutor {
    static async executeAction(action: TradingAction, minConfidence: number = 0.6): Promise<ExecutionResult> {
        if (action.confidence < minConfidence) {
            return {
                action,
                executed: false,
                skippedReason: `Confidence ${action.confidence.toFixed(2)} below threshold ${minConfidence}`
            };
        }

        try {
            switch (action.action) {
                case 'buy':
                    return await this.executeBuy(action);

                case 'sell':
                    return await this.executeSell(action);

                case 'close':
                    return await this.executeClose(action);

                case 'hold':
                    return {
                        action,
                        executed: false,
                        skippedReason: 'Action is hold - no trade needed'
                    };

                default:
                    return {
                        action,
                        executed: false,
                        error: `Unknown action: ${action.action}`
                    };
            }
        } catch (err: any) {
            return {
                action,
                executed: false,
                error: err.message || 'Unknown error during execution'
            };
        }
    }

    private static async executeBuy(action: TradingAction): Promise<ExecutionResult> {
        if (!action.quantity) {
            return {
                action,
                executed: false,
                error: 'Buy action missing quantity'
            };
        }

        const existingPosition = await getPosition(action.symbol);
        if (existingPosition) {
            return {
                action,
                executed: false,
                skippedReason: 'Already have a position in ' + action.symbol
            };
        }

        const priceResult = await getCurrentPrice(action.symbol);
        if (!priceResult.success || !priceResult.price) {
            return {
                action,
                executed: false,
                error: 'Failed to get current price'
            };
        }

        const availableBalance = await getAvailableBalance();
        const leverage = action.leverage || 1;
        const requiredMargin = (action.quantity * priceResult.price) / leverage;

        if (requiredMargin > availableBalance) {
            return {
                action,
                executed: false,
                error: `Insufficient balance. Required: ${requiredMargin.toFixed(2)}, Available: ${availableBalance.toFixed(2)}`
            };
        }

        const tradeOptions: any = {
            orderType: 'market',
            leverage: leverage,
            isFutures: leverage > 1
        };

        if (action.stopLossPercentage) {
            tradeOptions.stopLoss = {
                percentage: action.stopLossPercentage
            };
        }

        if (action.profitTargetPercentage) {
            tradeOptions.profitTarget = {
                percentage: action.profitTargetPercentage
            };
        }

        const tradeResult = await buy(action.symbol, action.quantity, tradeOptions);

        return {
            action,
            executed: tradeResult.success,
            tradeResult,
            error: tradeResult.success ? undefined : tradeResult.error
        };
    }

    private static async executeSell(action: TradingAction): Promise<ExecutionResult> {
        if (!action.quantity) {
            return {
                action,
                executed: false,
                error: 'Sell action missing quantity'
            };
        }

        const leverage = action.leverage || 1;
        const tradeOptions: any = {
            orderType: 'market',
            leverage: leverage,
            isFutures: leverage > 1
        };

        if (action.stopLossPercentage) {
            tradeOptions.stopLoss = {
                percentage: action.stopLossPercentage
            };
        }

        if (action.profitTargetPercentage) {
            tradeOptions.profitTarget = {
                percentage: action.profitTargetPercentage
            };
        }

        const tradeResult = await sell(action.symbol, action.quantity, tradeOptions);

        return {
            action,
            executed: tradeResult.success,
            tradeResult,
            error: tradeResult.success ? undefined : tradeResult.error
        };
    }

    private static async executeClose(action: TradingAction): Promise<ExecutionResult> {
        const position = await getPosition(action.symbol);
        if (!position) {
            return {
                action,
                executed: false,
                skippedReason: 'No position to close for ' + action.symbol
            };
        }

        const tradeResult = await closePosition(action.symbol);

        return {
            action,
            executed: tradeResult.success,
            tradeResult,
            error: tradeResult.success ? undefined : tradeResult.error
        };
    }

    static async executeActions(actions: TradingAction[], minConfidence: number = 0.6, maxPositions?: number): Promise<ExecutionResult[]> {
        const results: ExecutionResult[] = [];
        let currentPositionCount = 0;

        // Sort actions by confidence (highest first)
        const sortedActions = [...actions].sort((a, b) => b.confidence - a.confidence);

        for (const action of sortedActions) {
            // Check position limit for new positions
            if (maxPositions && (action.action === 'buy' || action.action === 'sell')) {
                if (currentPositionCount >= maxPositions) {
                    results.push({
                        action,
                        executed: false,
                        skippedReason: `Max positions limit (${maxPositions}) reached`
                    });
                    continue;
                }
            }

            const result = await this.executeAction(action, minConfidence);
            results.push(result);

            // Update position count
            if (result.executed && (action.action === 'buy' || action.action === 'sell')) {
                currentPositionCount++;
            } else if (result.executed && action.action === 'close') {
                currentPositionCount = Math.max(0, currentPositionCount - 1);
            }

            await delay(100);
        }

        return results;
    }

    static summarizeResults(results: ExecutionResult[]): string {
        const executed = results.filter((r) => r.executed).length;
        const skipped = results.filter((r) => r.skippedReason).length;
        const failed = results.filter((r) => r.error).length;

        let summary = `\n=== Execution Summary ===\n`;
        summary += `Total actions: ${results.length}\n`;
        summary += `Executed: ${executed}\n`;
        summary += `Skipped: ${skipped}\n`;
        summary += `Failed: ${failed}\n\n`;

        for (const result of results) {
            const status = result.executed ? '✓' : '✗';
            summary += `${status} ${result.action.action.toUpperCase()} ${result.action.symbol}`;

            if (result.action.quantity) {
                summary += ` (${result.action.quantity.toFixed(4)})`;
            }

            summary += ` - Confidence: ${result.action.confidence.toFixed(2)}`;

            if (result.executed) {
                summary += ' [EXECUTED]';
            } else if (result.skippedReason) {
                summary += ` [SKIPPED: ${result.skippedReason}]`;
            } else if (result.error) {
                summary += ` [ERROR: ${result.error}]`;
            }

            summary += `\n`;
        }

        return summary;
    }
}

async function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
