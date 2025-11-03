import { BuyFunction, GetCurrentPriceFunction, GetOrderStatusFunction, SellFunction } from '../trade_functions';
import { Trading } from '../trading_class';
import { AnalysisData, WalletBalance } from '../types';

// These will be injected by the session manager into the sandbox
declare const buy: BuyFunction;
declare const sell: SellFunction;
declare const getOrderStatus: GetOrderStatusFunction;
declare const getCurrentPrice: GetCurrentPriceFunction;

interface RSIBBStrategyConfig {
    // RSI settings
    rsiPeriod: number;
    rsiOversold: number;
    rsiOverbought: number;

    // Bollinger Bands settings
    bbPeriod: number;
    bbStdDev: number;

    // Volume settings
    volumePeriod: number;
    volumeThreshold: number; // Multiplier for average volume

    // Position sizing
    positionSizePercent: number;

    // Futures trading settings
    useFutures: boolean;
    futuresLeverage: number;
    confidenceThresholdForFutures: number; // 0-1, how many signals must align
}

interface TokenData {
    prices: number[];
    volumes: number[];
    rsiValues: number[];
    lastRSI?: number;
    bbUpper?: number;
    bbMiddle?: number;
    bbLower?: number;
}

/**
 * RSI + Bollinger Bands Multi-Indicator Strategy
 *
 * This strategy combines multiple technical indicators for high-probability trades:
 *
 * BUY SIGNALS (all must align):
 * 1. RSI < oversold threshold (default: 30) - Price is oversold
 * 2. Price touches or breaks below lower Bollinger Band - Extreme deviation
 * 3. Volume > average volume - Confirmation of move
 *
 * SELL SIGNALS (all must align):
 * 1. RSI > overbought threshold (default: 70) - Price is overbought
 * 2. Price touches or breaks above upper Bollinger Band - Extreme deviation
 * 3. Volume > average volume - Confirmation of move
 *
 * FUTURES USAGE:
 * - Uses futures with leverage when 3/3 indicators align (high confidence)
 * - Uses spot when 2/3 indicators align (medium confidence)
 * - No trade when <2 indicators align (low confidence)
 */
class RSIBollingerBandsStrategy extends Trading {
    private strategyConfig: RSIBBStrategyConfig = {
        // RSI settings
        rsiPeriod: 14,
        rsiOversold: 30,
        rsiOverbought: 70,

        // Bollinger Bands settings
        bbPeriod: 20,
        bbStdDev: 2,

        // Volume settings
        volumePeriod: 20,
        volumeThreshold: 1.5, // Volume must be 1.5x average

        // Position sizing
        positionSizePercent: 0.15, // 15% per trade

        // Futures settings
        useFutures: true,
        futuresLeverage: 3,
        confidenceThresholdForFutures: 1.0 // All 3 indicators must align
    };

    private walletBalance: WalletBalance = {};
    private pendingOrders: Set<string> = new Set();

    // Store data for each token
    private tokenData: Map<string, TokenData> = new Map();

    // Track positions
    private positions: Map<string, number> = new Map();
    private positionTypes: Map<string, 'spot' | 'futures'> = new Map();
    private positionLeverages: Map<string, number> = new Map();

    /**
     * Initialize strategy
     */
    protected async onInitialize(): Promise<void> {
        this.walletBalance = { ...this.config.walletBalance };

        // Validate futures settings
        if (this.strategyConfig.useFutures && !this.config.exchangeSettings.futuresEnabled) {
            console.warn('Futures trading requested but not enabled. Using spot only.');
            this.strategyConfig.useFutures = false;
        }

        // Validate leverage
        if (this.strategyConfig.useFutures) {
            const availableLeverages = this.config.exchangeSettings.futuresLeverageOptions;
            if (!availableLeverages.includes(this.strategyConfig.futuresLeverage)) {
                console.warn(`Leverage ${this.strategyConfig.futuresLeverage}x not available. Available: ${availableLeverages.join(', ')}`);
                this.strategyConfig.futuresLeverage = availableLeverages.reduce((prev, curr) =>
                    Math.abs(curr - this.strategyConfig.futuresLeverage) < Math.abs(prev - this.strategyConfig.futuresLeverage) ? curr : prev
                );
                console.log(`Using leverage: ${this.strategyConfig.futuresLeverage}x`);
            }
        }

        console.log('RSI + Bollinger Bands Strategy Initialized');
        console.log(
            `RSI Period: ${this.strategyConfig.rsiPeriod} | Oversold: ${this.strategyConfig.rsiOversold} | Overbought: ${this.strategyConfig.rsiOverbought}`
        );
        console.log(`Bollinger Bands: ${this.strategyConfig.bbPeriod} periods, ${this.strategyConfig.bbStdDev} std dev`);
        console.log(`Volume Threshold: ${this.strategyConfig.volumeThreshold}x average`);
        console.log(`Position Size: ${this.strategyConfig.positionSizePercent * 100}%`);
        console.log(`Futures: ${this.strategyConfig.useFutures} | Leverage: ${this.strategyConfig.futuresLeverage}x`);
        console.log('Base token:', this.config.baseToken);
        console.log('Initial balance:', this.walletBalance);
    }

    /**
     * Main analysis function
     */
    async analyze(data: AnalysisData): Promise<void> {
        await this.checkPendingOrders();

        if (!data.ohlcv) {
            return;
        }

        const { close: currentPrice, volume, symbol } = data.ohlcv;

        if (!this.getTradableTokens().includes(symbol)) {
            return;
        }

        // Initialize token data if needed
        if (!this.tokenData.has(symbol)) {
            this.tokenData.set(symbol, {
                prices: [],
                volumes: [],
                rsiValues: []
            });
        }

        const tokenData = this.tokenData.get(symbol)!;

        // Add current data
        tokenData.prices.push(currentPrice);
        tokenData.volumes.push(volume);

        // Keep data within limits
        const maxLength = Math.max(this.strategyConfig.rsiPeriod, this.strategyConfig.bbPeriod, this.strategyConfig.volumePeriod) + 20;
        if (tokenData.prices.length > maxLength) {
            tokenData.prices.shift();
            tokenData.volumes.shift();
            if (tokenData.rsiValues.length > maxLength) {
                tokenData.rsiValues.shift();
            }
        }

        // Need enough data to calculate indicators
        const minDataPoints = Math.max(this.strategyConfig.rsiPeriod, this.strategyConfig.bbPeriod, this.strategyConfig.volumePeriod) + 1;
        if (tokenData.prices.length < minDataPoints) {
            console.log(`${symbol}: Collecting data... (${tokenData.prices.length}/${minDataPoints})`);
            return;
        }

        // Calculate indicators
        const rsi = this.calculateRSI(tokenData.prices, this.strategyConfig.rsiPeriod);
        const bb = this.calculateBollingerBands(tokenData.prices, this.strategyConfig.bbPeriod, this.strategyConfig.bbStdDev);
        const avgVolume = this.calculateAverageVolume(tokenData.volumes, this.strategyConfig.volumePeriod);

        // Store for reference
        tokenData.rsiValues.push(rsi);
        tokenData.lastRSI = rsi;
        tokenData.bbUpper = bb.upper;
        tokenData.bbMiddle = bb.middle;
        tokenData.bbLower = bb.lower;

        // Check if we have a position
        const hasPosition = (this.positions.get(symbol) || 0) > 0;

        // Analyze signals
        const signals = this.analyzeSignals(currentPrice, volume, rsi, bb, avgVolume);

        // Trading logic: Only buy if no position, only sell if we have a position
        if (!hasPosition && signals.buySignals >= 2) {
            const confidence = signals.buySignals / 3;
            console.log(`🟢 ${symbol}: BUY SIGNAL detected! Confidence: ${(confidence * 100).toFixed(0)}% (${signals.buySignals}/3 indicators)`);
            console.log(
                `   RSI: ${signals.rsiOversold ? '✓' : '✗'} | BB: ${signals.belowBB ? '✓' : '✗'} | Volume: ${signals.highVolume ? '✓' : '✗'}`
            );
            await this.executeBuy(symbol, currentPrice, confidence);
        } else if (hasPosition && signals.sellSignals >= 2) {
            const confidence = signals.sellSignals / 3;
            console.log(`🔴 ${symbol}: SELL SIGNAL detected! Confidence: ${(confidence * 100).toFixed(0)}% (${signals.sellSignals}/3 indicators)`);
            console.log(
                `   RSI: ${signals.rsiOverbought ? '✓' : '✗'} | BB: ${signals.aboveBB ? '✓' : '✗'} | Volume: ${signals.highVolume ? '✓' : '✗'}`
            );
            await this.executeSell(symbol);
        } else if (hasPosition) {
            // Also check for exit conditions even if full sell signals aren't met
            // Exit if RSI returns to neutral and price is above middle band (take profit)
            const shouldTakeProfit = rsi > 50 && currentPrice > bb.middle;
            // Exit if RSI is very low and we're losing (stop loss on continued weakness)
            const shouldStopLoss = rsi < 25 && currentPrice < bb.lower;

            if (shouldTakeProfit) {
                console.log(`💰 ${symbol}: Taking profit - RSI normalized (${rsi.toFixed(2)}) and price above middle BB`);
                await this.executeSell(symbol);
            } else if (shouldStopLoss) {
                console.log(`🛑 ${symbol}: Stop loss - Extreme oversold continues (RSI: ${rsi.toFixed(2)})`);
                await this.executeSell(symbol);
            }
        }
    }

    /**
     * Calculate RSI (Relative Strength Index)
     */
    private calculateRSI(prices: number[], period: number): number {
        if (prices.length < period + 1) {
            return 50; // Neutral
        }

        const changes: number[] = [];
        for (let i = 1; i < prices.length; i++) {
            changes.push(prices[i] - prices[i - 1]);
        }

        // Use only the last 'period' changes
        const recentChanges = changes.slice(-period);

        let avgGain = 0;
        let avgLoss = 0;

        for (const change of recentChanges) {
            if (change > 0) {
                avgGain += change;
            } else {
                avgLoss += Math.abs(change);
            }
        }

        avgGain /= period;
        avgLoss /= period;

        if (avgLoss === 0) {
            return 100;
        }

        const rs = avgGain / avgLoss;
        const rsi = 100 - 100 / (1 + rs);

        return rsi;
    }

    /**
     * Calculate Bollinger Bands
     */
    private calculateBollingerBands(prices: number[], period: number, stdDev: number): { upper: number; middle: number; lower: number } {
        if (prices.length < period) {
            const currentPrice = prices[prices.length - 1];
            return { upper: currentPrice, middle: currentPrice, lower: currentPrice };
        }

        const recentPrices = prices.slice(-period);

        // Calculate SMA (middle band)
        const sum = recentPrices.reduce((acc, price) => acc + price, 0);
        const sma = sum / period;

        // Calculate standard deviation
        const squaredDiffs = recentPrices.map((price) => Math.pow(price - sma, 2));
        const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
        const standardDeviation = Math.sqrt(variance);

        return {
            upper: sma + stdDev * standardDeviation,
            middle: sma,
            lower: sma - stdDev * standardDeviation
        };
    }

    /**
     * Calculate average volume
     */
    private calculateAverageVolume(volumes: number[], period: number): number {
        if (volumes.length < period) {
            return volumes[volumes.length - 1] || 0;
        }

        const recentVolumes = volumes.slice(-period);
        const sum = recentVolumes.reduce((acc, vol) => acc + vol, 0);
        return sum / period;
    }

    /**
     * Analyze all signals
     */
    private analyzeSignals(
        price: number,
        volume: number,
        rsi: number,
        bb: { upper: number; middle: number; lower: number },
        avgVolume: number
    ): {
        buySignals: number;
        sellSignals: number;
        rsiOversold: boolean;
        rsiOverbought: boolean;
        belowBB: boolean;
        aboveBB: boolean;
        highVolume: boolean;
    } {
        const rsiOversold = rsi < this.strategyConfig.rsiOversold;
        const rsiOverbought = rsi > this.strategyConfig.rsiOverbought;
        const belowBB = price <= bb.lower;
        const aboveBB = price >= bb.upper;
        const highVolume = volume >= avgVolume * this.strategyConfig.volumeThreshold;

        let buySignals = 0;
        let sellSignals = 0;

        // Buy signals
        if (rsiOversold) buySignals++;
        if (belowBB) buySignals++;
        if (highVolume) buySignals++; // Volume confirmation for buy

        // Sell signals
        if (rsiOverbought) sellSignals++;
        if (aboveBB) sellSignals++;
        if (highVolume) sellSignals++; // Volume confirmation for sell

        return {
            buySignals,
            sellSignals,
            rsiOversold,
            rsiOverbought,
            belowBB,
            aboveBB,
            highVolume
        };
    }

    /**
     * Execute buy order
     */
    private async executeBuy(token: string, currentPrice: number, confidence: number): Promise<void> {
        const baseBalance = this.getBalance(this.getBaseToken(), this.walletBalance);

        // Determine if we should use futures based on confidence
        const useFutures = this.strategyConfig.useFutures && confidence >= this.strategyConfig.confidenceThresholdForFutures;
        const leverage = useFutures ? this.strategyConfig.futuresLeverage : 1;
        const tradeType = useFutures ? 'FUTURES' : 'SPOT';

        const amountToSpend = baseBalance * this.strategyConfig.positionSizePercent;
        const amountToBuy = (amountToSpend * leverage) / currentPrice;

        if (!this.canAfford(amountToBuy / leverage, currentPrice, this.walletBalance)) {
            console.log(`Insufficient funds to buy ${token}`);
            return;
        }

        try {
            console.log(`Placing ${tradeType} buy order${useFutures ? ` with ${leverage}x leverage` : ''}...`);

            const result = await buy(token, amountToBuy, {
                orderType: 'market',
                leverage: leverage,
                isFutures: useFutures
            });

            if (result.success && result.orderId) {
                console.log(`Buy order placed: ${result.orderId}`);

                if (result.status === 'filled' && result.filledAmount && result.executionPrice) {
                    this.updateWalletAfterBuy(token, result.filledAmount, result.executionPrice, leverage);
                    this.positions.set(token, (this.positions.get(token) || 0) + result.filledAmount);
                    this.positionTypes.set(token, useFutures ? 'futures' : 'spot');
                    this.positionLeverages.set(token, leverage);

                    console.log(`✅ ${tradeType} buy filled: ${result.filledAmount.toFixed(6)} ${token} at ${result.executionPrice.toFixed(2)}`);
                    if (useFutures) {
                        console.log(`📊 Leverage: ${leverage}x | Exposure: ${(result.filledAmount * result.executionPrice).toFixed(2)}`);
                    }
                } else {
                    this.pendingOrders.add(result.orderId);
                }
            } else {
                console.error(`Buy failed: ${result.error}`);
            }
        } catch (err) {
            console.error(`Error executing buy: ${err}`);
        }
    }

    /**
     * Execute sell order
     */
    private async executeSell(token: string): Promise<void> {
        const tokenBalance = this.getBalance(token, this.walletBalance);

        if (tokenBalance <= 0) {
            console.log(`No ${token} holdings to sell`);
            return;
        }

        const positionType = this.positionTypes.get(token) || 'spot';
        const leverage = this.positionLeverages.get(token) || 1;
        const isFutures = positionType === 'futures';
        const amountToSell = tokenBalance;

        if (!this.hasTokens(token, amountToSell, this.walletBalance)) {
            console.log(`Insufficient ${token} to sell`);
            return;
        }

        try {
            console.log(`Closing ${positionType.toUpperCase()} position${isFutures ? ` (${leverage}x)` : ''}...`);

            const result = await sell(token, amountToSell, {
                orderType: 'market',
                leverage: leverage,
                isFutures: isFutures
            });

            if (result.success && result.orderId) {
                console.log(`Sell order placed: ${result.orderId}`);

                if (result.status === 'filled' && result.filledAmount && result.executionPrice) {
                    this.updateWalletAfterSell(token, result.filledAmount, result.executionPrice, leverage);
                    this.positions.set(token, Math.max(0, (this.positions.get(token) || 0) - result.filledAmount));

                    if (this.positions.get(token) === 0) {
                        this.positionTypes.delete(token);
                        this.positionLeverages.delete(token);
                    }

                    console.log(
                        `✅ ${positionType.toUpperCase()} sell filled: ${result.filledAmount.toFixed(6)} ${token} at ${result.executionPrice.toFixed(2)}`
                    );
                } else {
                    this.pendingOrders.add(result.orderId);
                }
            } else {
                console.error(`Sell failed: ${result.error}`);
            }
        } catch (err) {
            console.error(`Error executing sell: ${err}`);
        }
    }

    /**
     * Check pending orders
     */
    private async checkPendingOrders(): Promise<void> {
        const ordersToRemove: string[] = [];

        for (const orderId of this.pendingOrders) {
            try {
                const status = await getOrderStatus(orderId);

                if (!status.success) {
                    console.error(`Failed to get status for order ${orderId}`);
                    continue;
                }

                if (status.status === 'filled' || status.status === 'partial') {
                    if (status.executionPrice && status.filledAmount > 0) {
                        const leverage = this.positionLeverages.get(status.token) || 1;

                        if (status.action === 'buy') {
                            this.updateWalletAfterBuy(status.token, status.filledAmount, status.executionPrice, leverage);
                            this.positions.set(status.token, (this.positions.get(status.token) || 0) + status.filledAmount);
                        } else {
                            this.updateWalletAfterSell(status.token, status.filledAmount, status.executionPrice, leverage);
                            this.positions.set(status.token, Math.max(0, (this.positions.get(status.token) || 0) - status.filledAmount));

                            if (this.positions.get(status.token) === 0) {
                                this.positionTypes.delete(status.token);
                                this.positionLeverages.delete(status.token);
                            }
                        }

                        console.log(`Order ${orderId} ${status.status}: ${status.filledAmount.toFixed(6)} ${status.token}`);
                    }
                }

                if (status.status === 'filled' || status.status === 'cancelled' || status.status === 'rejected') {
                    ordersToRemove.push(orderId);
                }
            } catch (error) {
                console.error(`Error checking order ${orderId}:`, error);
            }
        }

        ordersToRemove.forEach((orderId) => this.pendingOrders.delete(orderId));
    }

    /**
     * Update wallet after buy
     */
    private updateWalletAfterBuy(token: string, amount: number, price: number, leverage: number = 1): void {
        const cost = (amount * price) / leverage;
        const baseToken = this.getBaseToken();

        this.walletBalance[baseToken] = (this.walletBalance[baseToken] || 0) - cost;
        this.walletBalance[token] = (this.walletBalance[token] || 0) + amount;
    }

    /**
     * Update wallet after sell
     */
    private updateWalletAfterSell(token: string, amount: number, price: number, leverage: number = 1): void {
        const proceeds = (amount * price) / leverage;
        const baseToken = this.getBaseToken();

        this.walletBalance[token] = (this.walletBalance[token] || 0) - amount;
        this.walletBalance[baseToken] = (this.walletBalance[baseToken] || 0) + proceeds;
    }

    /**
     * Close session and liquidate all positions
     */
    async closeSession(): Promise<void> {
        console.log('Closing session - liquidating all positions');

        const baseToken = this.getBaseToken();

        for (const token of Object.keys(this.walletBalance)) {
            if (token === baseToken) {
                continue;
            }

            const balance = this.walletBalance[token];
            if (balance <= 0) {
                continue;
            }

            try {
                const priceResult = await getCurrentPrice(token);

                if (!priceResult.success || !priceResult.price) {
                    console.error(`Failed to get price for ${token}`);
                    continue;
                }

                const positionType = this.positionTypes.get(token) || 'spot';
                const leverage = this.positionLeverages.get(token) || 1;
                const isFutures = positionType === 'futures';

                console.log(`Liquidating ${balance.toFixed(6)} ${token} (${positionType.toUpperCase()}${isFutures ? ` ${leverage}x` : ''})`);

                const result = await sell(token, balance, {
                    orderType: 'market',
                    leverage: leverage,
                    isFutures: isFutures
                });

                if (result.success) {
                    if (result.status === 'filled' && result.filledAmount && result.executionPrice) {
                        this.updateWalletAfterSell(token, result.filledAmount, result.executionPrice, leverage);
                        console.log(`✅ Liquidated ${result.filledAmount.toFixed(6)} ${token} at ${result.executionPrice.toFixed(2)}`);
                    }
                } else {
                    console.error(`Failed to liquidate ${token}: ${result.error}`);
                }
            } catch (err) {
                console.error(`Error liquidating ${token}:`, err);
            }
        }

        console.log('Final balance:', this.walletBalance);
        console.log(`Final ${baseToken} value:`, this.walletBalance[baseToken]?.toFixed(2) || '0');
    }
}

export default RSIBollingerBandsStrategy;
