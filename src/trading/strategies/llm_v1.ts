import { ActionExecutor, ExecutionResult } from './llm-v1/action_executor';
import { LLMTradingResponse } from './llm-v1/llm_response_schema';
import { LLMStrategyBase, LLMStrategyConfig } from './llm-v1/llm_strategy_base';

export default class LLMStrategy extends LLMStrategyBase {
    protected getStrategyConfig(): LLMStrategyConfig {
        return {
            llmProvider: 'openai',
            llmModel: 'gpt-5-nano',
            updateIntervalMinutes: 15,
            maxTokens: 10000,
            minConfidence: 0.6,
            maxPositions: 2,
            enableDebugLogging: true
        };
    }

    protected async onStrategyInitialize(): Promise<void> {
        console.log('=== Example LLM Strategy Initialized ===');
        console.log('LLM Model:', this.strategyConfig.llmModel);
        console.log('Update Interval:', this.strategyConfig.updateIntervalMinutes, 'minutes');
        console.log('Min Confidence:', this.strategyConfig.minConfidence);
        console.log('Max Positions:', this.strategyConfig.maxPositions);
        console.log('=======================================\n');

        await this.logPortfolio();
    }

    /**
     * Execute trading actions from LLM response
     */
    protected async executeActions(response: LLMTradingResponse): Promise<void> {
        console.log('\n=== LLM Trading Decision ===');
        console.log('Market Analysis:', response.marketAnalysis.trend);
        console.log('Overall Confidence:', response.overallConfidence.toFixed(2));
        console.log('Summary:', response.summary);
        console.log('\nRisk Assessment:');
        console.log('  Current Risk:', response.riskAssessment.currentRiskLevel);
        console.log('  Exposure:', response.riskAssessment.exposurePercentage.toFixed(1) + '%');
        console.log('  Recommended:', response.riskAssessment.recommendedExposure.toFixed(1) + '%');

        if (response.riskAssessment.warnings.length > 0) {
            console.log('\n  ⚠️ Warnings:');
            response.riskAssessment.warnings.forEach((w) => console.log('    -', w));
        }

        console.log('\n--- Proposed Actions ---');
        for (const action of response.actions) {
            console.log(`\n${action.symbol}:`);
            console.log(`  Action: ${action.action.toUpperCase()}`);
            console.log(`  Confidence: ${action.confidence.toFixed(2)}`);
            console.log(`  Reasoning: ${action.reasoning}`);

            if (action.quantity) {
                console.log(`  Quantity: ${action.quantity.toFixed(4)}`);
            }
            if (action.leverage) {
                console.log(`  Leverage: ${action.leverage}x`);
            }
            if (action.stopLossPercentage) {
                console.log(`  Stop Loss: ${action.stopLossPercentage.toFixed(1)}%`);
            }
            if (action.profitTargetPercentage) {
                console.log(`  Profit Target: ${action.profitTargetPercentage.toFixed(1)}%`);
            }
        }

        const filteredActions = this.filterActions(response);

        console.log('\n--- Executing Actions ---');
        const results = await ActionExecutor.executeActions(filteredActions, this.strategyConfig.minConfidence, this.strategyConfig.maxPositions);

        const summary = ActionExecutor.summarizeResults(results);
        console.log(summary);

        await this.logPortfolio();

        await this.postExecutionAnalysis(results, response);
    }

    /**
     * Filter actions based on custom strategy rules
     * Override this in subclasses for custom filtering logic
     */
    protected filterActions(response: LLMTradingResponse): any[] {
        // Example filters:

        // 1. Skip trades if overall confidence is too low
        if (response.overallConfidence < 0.5) {
            console.log('⚠️  Overall confidence too low, skipping all trades');
            return [];
        }

        // 2. Skip new positions if portfolio adjustment suggests reducing exposure
        if (response.portfolioAdjustments?.shouldReduceExposure) {
            console.log('⚠️  Portfolio adjustment suggests reducing exposure');
            return response.actions.filter((a) => a.action === 'close' || a.action === 'hold');
        }

        // 3. Filter out actions for coins with extreme risk
        if (response.riskAssessment.currentRiskLevel === 'extreme') {
            console.log('⚠️  Extreme risk level detected, only allowing close actions');
            return response.actions.filter((a) => a.action === 'close');
        }

        // Return all actions if no filters apply
        return response.actions;
    }

    /**
     * Post-execution analysis
     * Track performance and adjust strategy parameters if needed
     */
    protected async postExecutionAnalysis(results: ExecutionResult[], response: LLMTradingResponse): Promise<void> {
        const executedCount = results.filter((r) => r.executed).length;

        if (executedCount === 0) {
            console.log('\nℹ️  No trades executed this round');
            return;
        }

        console.log('\n--- Post-Execution Analysis ---');

        // Calculate execution rate
        const executionRate = executedCount / response.actions.length;
        console.log(`Execution Rate: ${(executionRate * 100).toFixed(1)}%`);

        // Check if we should adjust confidence threshold
        if (executionRate < 0.3 && this.strategyConfig.minConfidence! > 0.5) {
            console.log('💡 Low execution rate - consider lowering confidence threshold');
        } else if (executionRate > 0.8 && this.strategyConfig.minConfidence! < 0.8) {
            console.log('💡 High execution rate - consider raising confidence threshold');
        }

        // Log time until next LLM query
        const nextQueryMinutes = this.strategyConfig.updateIntervalMinutes;
        console.log(`\n⏰ Next LLM query in ~${nextQueryMinutes} minutes`);
    }

    protected async handleError(error: any): Promise<void> {
        console.error('\n❌ Error in LLM strategy:', error.message || error);

        // In case of error, consider closing positions if risk is high
        const portfolio = await this.getPortfolioSummary();
        const exposurePercentage = (portfolio.totalExposure / portfolio.baseBalance) * 100;

        if (exposurePercentage > 80) {
            console.log('⚠️  High exposure detected during error - consider manual intervention');
        }

        // Log error details if debug is enabled
        if (this.strategyConfig.enableDebugLogging && error.stack) {
            console.error('Stack trace:', error.stack);
        }
    }

    async closeSession(): Promise<void> {
        console.log('\n=== Closing LLM Strategy Session ===');

        await this.logPortfolio();
        await this.closeAllPositions();

        console.log('\nSession closed successfully');
        console.log('Total invocations:', this.invocationCount);
        console.log('Minutes trading:', this.getMinutesTrading());
    }
}
