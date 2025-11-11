import { z } from 'zod';

/**
 * Schema for individual trading action
 */
export const TradingActionSchema = z.object({
    symbol: z.string().describe('The trading symbol (e.g., BTC, ETH)'),
    action: z.enum(['buy', 'sell', 'hold', 'close']).describe('Trading action to take'),
    confidence: z.number().min(0).max(1).describe('Confidence level 0-1'),
    reasoning: z.string().describe('Brief explanation for this decision'),

    // Position sizing (only for buy/sell)
    quantity: z.number().optional().describe('Amount to trade (optional for hold/close)'),
    leverage: z.number().min(1).max(20).optional().describe('Leverage to use (1-20x)'),

    // Risk management
    stopLossPercentage: z.number().optional().describe('Stop loss as percentage below entry'),
    profitTargetPercentage: z.number().optional().describe('Profit target as percentage above entry'),

    // Additional context
    entryPrice: z.number().optional().describe('Expected entry price'),
    invalidationCondition: z.string().optional().describe('Condition that invalidates the trade thesis')
});

export type TradingAction = z.infer<typeof TradingActionSchema>;

/**
 * Schema for market analysis
 */
export const MarketAnalysisSchema = z.object({
    trend: z.enum(['bullish', 'bearish', 'neutral', 'consolidating']).describe('Overall market trend'),
    sentiment: z.string().describe('Brief market sentiment summary'),
    keyLevels: z
        .object({
            support: z.array(z.number()).describe('Key support levels'),
            resistance: z.array(z.number()).describe('Key resistance levels')
        })
        .optional(),
    volatility: z.enum(['low', 'medium', 'high']).describe('Current volatility assessment')
});

export type MarketAnalysis = z.infer<typeof MarketAnalysisSchema>;

/**
 * Schema for risk assessment
 */
export const RiskAssessmentSchema = z.object({
    currentRiskLevel: z.enum(['low', 'medium', 'high', 'extreme']).describe('Overall portfolio risk level'),
    exposurePercentage: z.number().describe('Current exposure as percentage of capital'),
    recommendedExposure: z.number().describe('Recommended exposure percentage'),
    warnings: z.array(z.string()).describe('Any risk warnings or concerns')
});

export type RiskAssessment = z.infer<typeof RiskAssessmentSchema>;

/**
 * Complete LLM response schema
 */
export const LLMTradingResponseSchema = z.object({
    timestamp: z.string().describe('ISO timestamp of the analysis'),

    // Market overview
    marketAnalysis: MarketAnalysisSchema.describe('Overall market analysis'),

    // Trading decisions
    actions: z.array(TradingActionSchema).describe('Trading actions for each symbol'),

    // Risk management
    riskAssessment: RiskAssessmentSchema.describe('Risk assessment and recommendations'),

    // Portfolio management
    portfolioAdjustments: z
        .object({
            shouldReduceExposure: z.boolean().describe('Whether to reduce overall exposure'),
            shouldIncreaseExposure: z.boolean().describe('Whether to increase overall exposure'),
            reasoning: z.string().describe('Reasoning for portfolio adjustments')
        })
        .optional(),

    // Summary
    summary: z.string().describe('Brief summary of the overall trading plan'),

    // Confidence
    overallConfidence: z.number().min(0).max(1).describe('Overall confidence in this analysis')
});

export type LLMTradingResponse = z.infer<typeof LLMTradingResponseSchema>;

/**
 * Simplified schema for text-based responses
 * Use when generateObject is not available or for simpler prompts
 */
export const SimpleTradingDecisionSchema = z.object({
    symbol: z.string(),
    decision: z.enum(['buy', 'sell', 'hold', 'close']),
    confidence: z.number().min(0).max(1),
    reason: z.string()
});

export type SimpleTradingDecision = z.infer<typeof SimpleTradingDecisionSchema>;

/**
 * Validation helper functions
 */
export class ResponseValidator {
    /**
     * Validate that trading actions are consistent with current positions
     */
    static validateActions(actions: TradingAction[], currentPositions: Map<string, boolean>): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        for (const action of actions) {
            const hasPosition = currentPositions.get(action.symbol);

            // Can't close if no position
            if (action.action === 'close' && !hasPosition) {
                errors.push(`Cannot close ${action.symbol} - no open position`);
            }

            // Warn about buying when already in position
            if (action.action === 'buy' && hasPosition) {
                errors.push(`Warning: Buying ${action.symbol} when position already exists`);
            }

            // Validate quantity for buy/sell
            if ((action.action === 'buy' || action.action === 'sell') && !action.quantity) {
                errors.push(`${action.action} action for ${action.symbol} missing quantity`);
            }

            // Validate leverage
            if (action.leverage && (action.leverage < 1 || action.leverage > 20)) {
                errors.push(`Invalid leverage ${action.leverage} for ${action.symbol}`);
            }

            // Validate percentages
            if (action.stopLossPercentage && action.stopLossPercentage <= 0) {
                errors.push(`Invalid stop loss percentage for ${action.symbol}`);
            }

            if (action.profitTargetPercentage && action.profitTargetPercentage <= 0) {
                errors.push(`Invalid profit target percentage for ${action.symbol}`);
            }
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate risk assessment values
     */
    static validateRiskAssessment(risk: RiskAssessment): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        if (risk.exposurePercentage < 0 || risk.exposurePercentage > 100) {
            errors.push(`Invalid exposure percentage: ${risk.exposurePercentage}`);
        }

        if (risk.recommendedExposure < 0 || risk.recommendedExposure > 100) {
            errors.push(`Invalid recommended exposure: ${risk.recommendedExposure}`);
        }

        return {
            valid: errors.length === 0,
            errors
        };
    }

    static sanitizeResponse(response: LLMTradingResponse): LLMTradingResponse {
        response.overallConfidence = Math.max(0, Math.min(1, response.overallConfidence));

        if (response.riskAssessment) {
            response.riskAssessment.exposurePercentage = Math.max(0, Math.min(100, response.riskAssessment.exposurePercentage));
            response.riskAssessment.recommendedExposure = Math.max(0, Math.min(100, response.riskAssessment.recommendedExposure));
        }

        if (!response.actions) {
            return response;
        }

        for (const action of response.actions) {
            action.confidence = Math.max(0, Math.min(1, action.confidence));

            if (action.leverage) {
                action.leverage = Math.max(1, Math.min(20, Math.round(action.leverage)));
            }

            if (action.stopLossPercentage) {
                action.stopLossPercentage = Math.max(0.1, Math.min(50, action.stopLossPercentage));
            }

            if (action.profitTargetPercentage) {
                action.profitTargetPercentage = Math.max(0.1, Math.min(200, action.profitTargetPercentage));
            }
        }

        return response;
    }
}
