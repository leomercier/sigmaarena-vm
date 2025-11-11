import { z } from 'zod';
import { BollingerBands, RSI } from '../technical-indicators';
import { Trading } from '../trading_class';
import { AnalysisData, TradingConfig } from '../types';

declare const buy: any;
declare const sell: any;

declare const generateObject: (provider: string, model: string, messages: any[], schema?: any, maxTokens?: number) => Promise<any>;

/**
 * Simple RSI + Bollinger Bands strategy that uses LLM to evaluate trading signals
 * This is a basic example showing how to integrate LLM into a strategy
 * Based on rsi_v3.ts but with LLM-based signal evaluation
 */

// Define the schema for LLM response
const TradingSignalSchema = z.object({
    action: z.enum(['long', 'short', 'close_long', 'close_short', 'hold']).describe('Trading action to take'),
    confidence: z.number().min(0).max(1).describe('Confidence level 0-1'),
    reasoning: z.string().describe('Brief explanation for the decision')
});

type TradingSignal = z.infer<typeof TradingSignalSchema>;

interface Position {
    type: 'long' | 'short';
    entryPrice: number;
}

export default class RSILLMStrategy extends Trading {
    private rsiIndicator: RSI;
    private bbIndicator: BollingerBands;
    private position: Position | null = null;

    private readonly RSI_PERIOD = 14;
    private readonly BB_PERIOD = 20;
    private readonly BB_STD_DEV = 2;
    private readonly LEVERAGE = 5;
    private readonly MIN_CONFIDENCE = 0.7;

    // Price history for indicators
    private priceHistory: number[] = [];

    private inferenceErrorsCount: number = 0;
    private maxInferenceErrors: number = 2;

    constructor() {
        super();
        this.rsiIndicator = new RSI({ period: this.RSI_PERIOD, values: [] });
        this.bbIndicator = new BollingerBands({
            period: this.BB_PERIOD,
            stdDev: this.BB_STD_DEV,
            values: []
        });
    }

    async initialize(config: TradingConfig): Promise<void> {
        await super.initialize(config);

        console.log('RSI LLM Strategy initialized');
        console.log(`RSI Period: ${this.RSI_PERIOD}`);
        console.log(`Bollinger Bands: ${this.BB_PERIOD} period, ${this.BB_STD_DEV} std dev`);
        console.log(`Leverage: ${this.LEVERAGE}x`);
        console.log(`Min Confidence: ${this.MIN_CONFIDENCE}`);

        await this.logPortfolio();
    }

    async analyze(data: AnalysisData): Promise<void> {
        if (!data.ohlcv) {
            return;
        }

        const { symbol, close } = data.ohlcv;

        this.priceHistory.push(close);

        if (this.priceHistory.length > 100) {
            this.priceHistory.shift();
        }

        const rsiValue = this.rsiIndicator.nextValue(close);
        const bbValue = this.bbIndicator.nextValue(close);

        // Need enough data points
        if (!rsiValue || !bbValue) {
            return;
        }

        // Calculate trend
        const trend = this.calculateTrend();

        if (this.inferenceErrorsCount >= this.maxInferenceErrors) {
            console.log('Max LLM inference errors reached, skipping further analysis');
            return;
        }

        // Ask LLM to evaluate the signal
        const signal = await this.getLLMSignal(symbol, rsiValue, bbValue, close, trend);

        // Execute based on LLM's decision
        await this.executeSignal(signal, symbol, close);
    }

    /**
     * Calculate simple trend based on recent price action
     */
    private calculateTrend(): 'bullish' | 'bearish' | 'neutral' {
        if (this.priceHistory.length < 20) {
            return 'neutral';
        }

        const recent = this.priceHistory.slice(-20);
        const older = this.priceHistory.slice(-40, -20);

        if (older.length === 0) {
            return 'neutral';
        }

        const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
        const olderAvg = older.reduce((a, b) => a + b, 0) / older.length;

        const diff = ((recentAvg - olderAvg) / olderAvg) * 100;

        if (diff > 1) {
            return 'bullish';
        }

        if (diff < -1) {
            return 'bearish';
        }

        return 'neutral';
    }

    /**
     * Query LLM for trading signal evaluation
     */
    private async getLLMSignal(
        symbol: string,
        rsi: number,
        bb: { upper: number; middle: number; lower: number },
        price: number,
        trend: 'bullish' | 'bearish' | 'neutral'
    ): Promise<TradingSignal> {
        const prompt = this.buildPrompt(symbol, rsi, bb, price, trend);

        try {
            const maxTokens = 10000;
            const response = await generateObject(
                'openai',
                'gpt-4.1-mini',
                [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                TradingSignalSchema,
                maxTokens
            );

            const responseObject: TradingSignal = response.content;

            console.log(`\nLLM Signal for ${symbol}:`);
            console.log(`  Action: ${responseObject.action}`);
            console.log(`  Confidence: ${responseObject.confidence.toFixed(2)}`);
            console.log(`  Reasoning: ${responseObject.reasoning}`);

            return responseObject;
        } catch (err) {
            this.inferenceErrorsCount += 1;

            console.error('Error getting LLM signal:', err);

            return {
                action: 'hold',
                confidence: 0,
                reasoning: 'Error occurred, defaulting to hold'
            };
        }
    }

    /**
     * Build prompt for the LLM
     */
    private buildPrompt(
        symbol: string,
        rsi: number,
        bb: { upper: number; middle: number; lower: number },
        price: number,
        trend: 'bullish' | 'bearish' | 'neutral'
    ): string {
        const positionStr = this.position ? `${this.position.type.toUpperCase()} (entry: $${this.position.entryPrice.toFixed(2)})` : 'NONE';

        // Calculate price position relative to Bollinger Bands
        const bbPosition = ((price - bb.lower) / (bb.upper - bb.lower)) * 100;

        return `You are a cryptocurrency trading assistant using RSI and Bollinger Bands for futures trading.

            Current Market Data for ${symbol}:
            - Price: $${price.toFixed(2)}
            - RSI (14-period): ${rsi.toFixed(2)}
            - Bollinger Bands:
            * Upper: $${bb.upper.toFixed(2)}
            * Middle: $${bb.middle.toFixed(2)}
            * Lower: $${bb.lower.toFixed(2)}
            * Price Position: ${bbPosition.toFixed(1)}% (0%=lower band, 100%=upper band)
            - Trend: ${trend.toUpperCase()}
            - Current Position: ${positionStr}

            Trading Guidelines:
            - RSI < 30: Oversold (potential long signal)
            - RSI > 70: Overbought (potential short signal)
            - Price near lower band: Potential long entry
            - Price near upper band: Potential short entry
            - Consider trend for confirmation

            Your Task:
            Evaluate whether to open a LONG, open a SHORT, CLOSE existing position, or HOLD.

            Available Actions:
            - "long": Open a long position (only if no current position)
            - "short": Open a short position (only if no current position)
            - "close_long": Close existing long position (only if currently long)
            - "close_short": Close existing short position (only if currently short)
            - "hold": Do nothing

            Rules:
            1. Can only open new positions if no current position exists
            2. Can only close positions that are currently open
            3. Consider both RSI and Bollinger Bands together
            4. Factor in the trend for confirmation
            5. Provide confidence level (0-1) for your decision

            Respond with your trading decision.
        `;
    }

    /**
     * Execute the trading signal from LLM
     */
    private async executeSignal(signal: TradingSignal, symbol: string, price: number): Promise<void> {
        if (signal.confidence < this.MIN_CONFIDENCE) {
            console.log(`Confidence too low (${signal.confidence.toFixed(2)} < ${this.MIN_CONFIDENCE}), skipping trade`);
            return;
        }

        if (signal.action === 'long' && this.position) {
            console.log(`Cannot open long - already have ${this.position.type} position`);
            return;
        }

        if (signal.action === 'short' && this.position) {
            console.log(`Cannot open short - already have ${this.position.type} position`);
            return;
        }

        if (signal.action === 'close_long' && (!this.position || this.position.type !== 'long')) {
            console.log(`Cannot close long - no long position open`);
            return;
        }

        if (signal.action === 'close_short' && (!this.position || this.position.type !== 'short')) {
            console.log(`Cannot close short - no short position open`);
            return;
        }

        if (signal.action === 'long') {
            await this.openLong(symbol, price);
        } else if (signal.action === 'short') {
            await this.openShort(symbol, price);
        } else if (signal.action === 'close_long') {
            await this.closeLong(symbol);
        } else if (signal.action === 'close_short') {
            await this.closeShort(symbol);
        } else {
            console.log('Holding current position');
        }
    }

    private async openLong(symbol: string, price: number): Promise<void> {
        const balance = await this.getTradableBalance();
        const positionSize = (balance * 0.95) / price;

        console.log(`\nOpening LONG position for ${symbol}`);
        console.log(`   Amount: ${positionSize.toFixed(6)}`);
        console.log(`   Price: $${price.toFixed(2)}`);
        console.log(`   Leverage: ${this.LEVERAGE}x`);

        try {
            const result = await buy(symbol, positionSize, {
                orderType: 'market',
                leverage: this.LEVERAGE,
                isFutures: true,
                stopLoss: { percentage: 5 },
                profitTarget: { percentage: 10 }
            });

            if (result.success) {
                this.position = { type: 'long', entryPrice: price };
                console.log(`  Long position opened`);
            } else {
                console.log(`  Failed to open long: ${result.error}`);
            }
        } catch (error) {
            console.error(`  Error opening long:`, error);
        }
    }

    private async openShort(symbol: string, price: number): Promise<void> {
        const balance = await this.getTradableBalance();
        const positionSize = (balance * 0.95) / price;

        console.log(`\nOpening SHORT position for ${symbol}`);
        console.log(`   Amount: ${positionSize.toFixed(6)}`);
        console.log(`   Price: $${price.toFixed(2)}`);
        console.log(`   Leverage: ${this.LEVERAGE}x`);

        try {
            const result = await sell(symbol, positionSize, {
                orderType: 'market',
                leverage: this.LEVERAGE,
                isFutures: true,
                stopLoss: { percentage: 5 },
                profitTarget: { percentage: 10 }
            });

            if (result.success) {
                this.position = { type: 'short', entryPrice: price };
                console.log(`  Short position opened`);
            } else {
                console.log(`  Failed to open short: ${result.error}`);
            }
        } catch (err) {
            console.error(`  Error opening short:`, err);
        }
    }

    private async closeLong(symbol: string): Promise<void> {
        if (!this.position || this.position.type !== 'long') {
            return;
        }

        const positionInfo = await this.getPositionInfo(symbol);
        if (!positionInfo) {
            console.log(`  No position info found for ${symbol}`);
            this.position = null;
            return;
        }

        console.log(`\nClosing LONG position for ${symbol}`);

        try {
            const result = await this.closePositionByToken(symbol);

            if (result.success) {
                this.position = null;
                console.log(`  Long position closed`);
            } else {
                console.log(`  Failed to close long: ${result.error}`);
            }
        } catch (err) {
            console.error('  Error closing long:', err);
        }
    }

    private async closeShort(symbol: string): Promise<void> {
        if (!this.position || this.position.type !== 'short') {
            return;
        }

        const positionInfo = await this.getPositionInfo(symbol);
        if (!positionInfo) {
            console.log(`  No position info found for ${symbol}`);

            this.position = null;

            return;
        }

        console.log(`\nClosing SHORT position for ${symbol}`);

        try {
            const result = await this.closePositionByToken(symbol);

            if (result.success) {
                this.position = null;
                console.log(`  Short position closed`);
            } else {
                console.log(`  Failed to close short: ${result.error}`);
            }
        } catch (err) {
            console.error(`  Error closing short:`, err);
        }
    }

    async closeSession(): Promise<void> {
        console.log('\nClosing RSI LLM Strategy session...');

        await this.logPortfolio();
        await this.closeAllPositions();

        this.position = null;

        console.log('Session closed');
    }
}
