import { GetAllPositionsFunction } from '../../trade_functions';
import { Trading } from '../../trading_class';
import { AnalysisData, OHLCVData } from '../../types';
import { CandleStore } from './candle_store';
import { CoinMarketData, DataAggregator } from './data_aggregator';
import { LLMTradingResponse, LLMTradingResponseSchema, ResponseValidator } from './llm_response_schema';
import { PromptBuilder, TradingContext } from './prompt_builder';

declare const getAllPositions: GetAllPositionsFunction;

declare const generateObject: (provider: string, model: string, messages: any[], schema?: any, maxTokens?: number) => Promise<any>;

/**
 * Configuration for LLM-based trading strategy
 */
export interface LLMStrategyConfig {
    llmProvider: string; // e.g., 'anthropic', 'openai'
    llmModel: string; // e.g., 'claude-3-sonnet', 'gpt-4'
    updateIntervalMinutes: number; // How often to query LLM
    maxTokens?: number; // Max tokens for LLM response
    minConfidence?: number; // Minimum confidence to execute trades
    maxPositions?: number; // Maximum concurrent positions
    enableDebugLogging?: boolean; // Enable verbose logging
}

/**
 * Base class for LLM-powered trading strategies
 * Handles data aggregation, prompt building, LLM querying, and response parsing
 */
export abstract class LLMStrategyBase extends Trading {
    protected candleStore: CandleStore;
    protected strategyConfig!: LLMStrategyConfig;

    protected invocationCount: number = 0;
    protected lastLLMQueryTime: number = 0;
    protected startTime: number = 0;
    protected isReady: boolean = false;
    protected stop: boolean = false;

    constructor() {
        super();
        this.candleStore = new CandleStore();
    }

    /**
     * Initialize with both trading config and LLM config
     */
    protected async onInitialize(): Promise<void> {
        this.startTime = Date.now();

        // Get strategy-specific configuration
        this.strategyConfig = this.getStrategyConfig();

        await this.onStrategyInitialize();
    }

    /**
     * Hook for strategy-specific initialization
     */
    protected async onStrategyInitialize(): Promise<void> {
        // Override in subclass if needed
    }

    /**
     * Get strategy configuration - must be implemented by subclass
     */
    protected abstract getStrategyConfig(): LLMStrategyConfig;

    /**
     * Main analyze method - orchestrates the LLM trading flow
     */
    async analyze(data: AnalysisData): Promise<void> {
        this.invocationCount++;

        if (this.stop) {
            return;
        }

        try {
            // Update candle store with latest data
            if (!data.ohlcv) {
                return;
            }

            this.updateCandleStore(data.ohlcv);

            // Check if we have enough data to start trading
            if (!this.isReady) {
                this.isReady = this.candleStore.isReadyToTrade(data.ohlcv.symbol);
                if (!this.isReady) {
                    return;
                }

                console.log('✓ Strategy ready to start trading - sufficient data collected');

                await this.logPortfolio();
            }

            // Check if it's time to query the LLM
            if (!this.shouldQueryLLM()) {
                if (this.strategyConfig.enableDebugLogging) {
                    console.log('Skipping LLM query - not enough time elapsed');
                }
                return;
            }

            // Aggregate market data
            const coinsData = await this.aggregateMarketData();
            if (coinsData.length === 0) {
                console.warn('No market data available for analysis');
                return;
            }

            // Build trading context
            const context = await this.buildTradingContext(coinsData);

            // Query LLM
            const llmResponse = await this.queryLLM(context);

            console.log(`\n=== LLM Trading Response (Invocation #${this.invocationCount}) ===`);
            console.log(JSON.stringify(llmResponse, null, 4));

            // Validate response
            const validation = this.validateResponse(llmResponse);
            if (!validation.valid) {
                console.error('LLM response validation failed:', validation.errors);
                return;
            }

            // Execute trading actions
            await this.executeActions(llmResponse);

            // Update last query time
            this.lastLLMQueryTime = Date.now();

            this.stop = true;
        } catch (err) {
            console.error('Error in LLM strategy analysis:', err);
            await this.handleError(err);
            this.stop = true;
        }
    }

    protected updateCandleStore(ohlcv: OHLCVData): void {
        const symbol = ohlcv.symbol;

        if (!this.getTradableTokens().includes(symbol)) {
            return;
        }

        // Add to intraday candles (will automatically aggregate to longer-term)
        this.candleStore.addIntraDayCandle(symbol, ohlcv);
    }

    /**
     * Check if enough time has elapsed to query LLM again
     */
    protected shouldQueryLLM(): boolean {
        const elapsedMinutes = (Date.now() - this.lastLLMQueryTime) / 60000;
        return elapsedMinutes >= this.strategyConfig.updateIntervalMinutes;
    }

    /**
     * Aggregate market data for all tradable coins
     */
    protected async aggregateMarketData(): Promise<CoinMarketData[]> {
        const coinsData: CoinMarketData[] = [];
        const symbols = this.getTradableTokens();

        for (const symbol of symbols) {
            if (!this.candleStore.isReadyToTrade(symbol)) {
                continue;
            }

            const intraDayCandles = this.candleStore.getIntraDayCandles(symbol);
            const longerTermCandles = this.candleStore.getLongerTermCandles(symbol);

            const coinData = DataAggregator.aggregateCoinData(symbol, intraDayCandles, longerTermCandles);

            if (coinData) {
                coinsData.push(coinData);
            }
        }

        return coinsData;
    }

    /**
     * Build trading context from aggregated data
     */
    protected async buildTradingContext(coinsData: CoinMarketData[]): Promise<TradingContext> {
        const portfolio = await this.getPortfolioSummary();
        const positions = await getAllPositions();
        const minutesTrading = Math.floor((Date.now() - this.startTime) / 60000);

        return {
            currentTime: new Date().toISOString(),
            invocationCount: this.invocationCount,
            minutesTrading,
            coinsData,
            portfolio,
            positions
        };
    }

    /**
     * Query the LLM with trading context
     */
    protected async queryLLM(context: TradingContext): Promise<LLMTradingResponse> {
        const prompt = PromptBuilder.buildTradingPrompt(context);

        console.log(`\n=== LLM Trading Prompt (Invocation #${this.invocationCount}) ===`);
        console.log(prompt);

        if (this.strategyConfig.enableDebugLogging) {
            console.log('\n=== LLM Query ===');
            console.log('Prompt length:', prompt.length, 'characters');
        }

        const response = await generateObject(
            this.strategyConfig.llmProvider,
            this.strategyConfig.llmModel,
            [
                {
                    role: 'user',
                    content: prompt
                }
            ],
            LLMTradingResponseSchema,
            this.strategyConfig.maxTokens
        );

        console.log('\n=== LLM Raw Response ===');
        console.log(JSON.stringify(response, null, 4));

        const schemaObject: LLMTradingResponse = response.content;

        if (this.strategyConfig.enableDebugLogging) {
            console.log('LLM Response received');
            console.log('Overall confidence:', schemaObject?.overallConfidence);
            console.log('Actions:', schemaObject?.actions?.length);
        }

        // Sanitize response
        return ResponseValidator.sanitizeResponse(schemaObject);
    }

    /**
     * Validate LLM response
     */
    protected validateResponse(response: LLMTradingResponse): { valid: boolean; errors: string[] } {
        const errors: string[] = [];

        // Build current positions map
        const positionsMap = new Map<string, boolean>();
        for (const position of response.actions) {
            positionsMap.set(position.symbol, true);
        }

        // Validate actions
        const actionValidation = ResponseValidator.validateActions(response.actions, positionsMap);
        errors.push(...actionValidation.errors);

        // Validate risk assessment
        const riskValidation = ResponseValidator.validateRiskAssessment(response.riskAssessment);
        errors.push(...riskValidation.errors);

        return {
            valid: errors.length === 0,
            errors
        };
    }

    /**
     * Execute trading actions from LLM response
     * This is abstract - subclasses must implement their own execution logic
     */
    protected abstract executeActions(response: LLMTradingResponse): Promise<void>;

    /**
     * Handle errors during analysis
     */
    protected async handleError(error: any): Promise<void> {
        console.error('LLM Strategy Error:', error.message || error);
        // Override in subclass for custom error handling
    }

    /**
     * Get minutes since trading started
     */
    protected getMinutesTrading(): number {
        return Math.floor((Date.now() - this.startTime) / 60000);
    }
}
