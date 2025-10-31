import { BuyFunction, GetCurrentPriceFunction, GetOrderStatusFunction, SellFunction } from '../trade_functions';
import { Trading } from '../trading_class';
import { AnalysisData, WalletBalance } from '../types';

// These will be injected by the session manager into the sandbox
declare const buy: BuyFunction;
declare const sell: SellFunction;
declare const getOrderStatus: GetOrderStatusFunction;
declare const getCurrentPrice: GetCurrentPriceFunction;

interface MACrossoverConfig {
    shortPeriod: number;
    longPeriod: number;
    positionSizePercent: number; // Percentage of balance to use per trade (0-1)

    // Futures trading settings
    useFutures: boolean;
    futuresLeverage: number; // Leverage to use for futures trades
    trendStrengthThreshold: number; // Minimum trend strength to use futures (0-1)
}

/**
 * Moving Average Crossover Strategy with Futures Trading
 *
 * Buy Signal: Short MA crosses above Long MA (Golden Cross)
 * Sell Signal: Short MA crosses below Long MA (Death Cross)
 *
 * This is a trend-following strategy that aims to capture major price movements.
 *
 * Trading Modes:
 * - SPOT: Used for weaker trends or when futures disabled
 * - FUTURES with LEVERAGE: Used for strong trends to amplify returns
 *
 * Trend strength is measured by the separation between short and long MAs.
 * Stronger trends (larger MA separation) justify higher risk via futures trading.
 */
class MovingAverageCrossover extends Trading {
    private macConfig: MACrossoverConfig = {
        shortPeriod: 10,
        longPeriod: 50,
        positionSizePercent: 0.2, // Use 20% of balance per trade

        useFutures: true,
        futuresLeverage: 5,
        trendStrengthThreshold: 0.5
    };

    private walletBalance: WalletBalance = {};
    private pendingOrders: Set<string> = new Set();

    // Store price history for each token
    private priceHistory: Map<string, number[]> = new Map();

    // Track previous MA values to detect crossovers
    private previousShortMA: Map<string, number> = new Map();
    private previousLongMA: Map<string, number> = new Map();

    // Track current positions to avoid over-trading
    private positions: Map<string, number> = new Map();

    // Track whether current positions are futures or spot
    private positionTypes: Map<string, 'spot' | 'futures'> = new Map();
    private positionLeverages: Map<string, number> = new Map();

    /**
     * Initialize strategy
     */
    protected async onInitialize(): Promise<void> {
        this.walletBalance = { ...this.config.walletBalance };

        // Validate futures settings
        if (this.macConfig.useFutures && !this.config.exchangeSettings.futuresEnabled) {
            console.warn('Futures trading requested but not enabled by exchange. Using spot only.');
            this.macConfig.useFutures = false;
        }

        // Validate leverage
        if (this.macConfig.useFutures) {
            const availableLeverages = this.config.exchangeSettings.futuresLeverageOptions;
            if (!availableLeverages.includes(this.macConfig.futuresLeverage)) {
                console.warn(`Leverage ${this.macConfig.futuresLeverage}x not available. Available: ${availableLeverages.join(', ')}`);
                // Use the closest available leverage
                this.macConfig.futuresLeverage = availableLeverages.reduce((prev, curr) =>
                    Math.abs(curr - this.macConfig.futuresLeverage) < Math.abs(prev - this.macConfig.futuresLeverage) ? curr : prev
                );
                console.log(`Using leverage: ${this.macConfig.futuresLeverage}x`);
            }
        }

        console.log('Moving Average Crossover Strategy (Spot + Futures) Initialized');
        console.log(`Short MA: ${this.macConfig.shortPeriod} periods`);
        console.log(`Long MA: ${this.macConfig.longPeriod} periods`);
        console.log(`Position Size: ${this.macConfig.positionSizePercent * 100}%`);
        console.log(`Futures Enabled: ${this.macConfig.useFutures}`);
        if (this.macConfig.useFutures) {
            console.log(`Futures Leverage: ${this.macConfig.futuresLeverage}x`);
            console.log(`Trend Strength Threshold: ${this.macConfig.trendStrengthThreshold * 100}%`);
        }
        console.log('Base token:', this.config.baseToken);
        console.log('Tradable tokens:', this.config.tradableTokens);
        console.log('Initial balance:', this.walletBalance);
    }

    /**
     * Main analysis function - called for each new OHLCV data point
     */
    async analyze(data: AnalysisData): Promise<void> {
        // Check and process any pending orders first
        await this.checkPendingOrders();

        if (!data.ohlcv) {
            return;
        }

        const { close: currentPrice, symbol } = data.ohlcv;

        // Only trade tokens in our tradable list
        if (!this.getTradableTokens().includes(symbol)) {
            return;
        }

        // Add current price to history
        this.addPriceToHistory(symbol, currentPrice);

        // Get price history for this token
        const history = this.priceHistory.get(symbol) || [];

        // Need at least longPeriod data points to calculate MAs
        if (history.length < this.macConfig.longPeriod) {
            console.log(`${symbol}: Collecting data... (${history.length}/${this.macConfig.longPeriod})`);
            return;
        }

        // Calculate moving averages
        const shortMA = this.calculateMA(history, this.macConfig.shortPeriod);
        const longMA = this.calculateMA(history, this.macConfig.longPeriod);

        // Get previous MA values
        const prevShortMA = this.previousShortMA.get(symbol);
        const prevLongMA = this.previousLongMA.get(symbol);

        // Store current MAs for next iteration
        this.previousShortMA.set(symbol, shortMA);
        this.previousLongMA.set(symbol, longMA);

        // Need previous values to detect crossovers
        if (prevShortMA === undefined || prevLongMA === undefined) {
            console.log(`${symbol}: Short MA: ${shortMA.toFixed(2)}, Long MA: ${longMA.toFixed(2)}`);
            return;
        }

        // Detect crossover signals
        const goldenCross = prevShortMA <= prevLongMA && shortMA > longMA;
        const deathCross = prevShortMA >= prevLongMA && shortMA < longMA;

        // Calculate trend strength (% difference between MAs)
        const trendStrength = Math.abs(shortMA - longMA) / longMA;
        const isStrongTrend = trendStrength >= this.macConfig.trendStrengthThreshold;

        console.log(
            `${symbol}: Price: ${currentPrice.toFixed(2)}, Short MA: ${shortMA.toFixed(2)}, Long MA: ${longMA.toFixed(2)}, Trend: ${(trendStrength * 100).toFixed(2)}%`
        );

        // Execute trades based on signals
        if (goldenCross) {
            console.log(`🟢 ${symbol}: GOLDEN CROSS detected! Buy signal. Trend strength: ${(trendStrength * 100).toFixed(2)}%`);
            await this.executeBuy(symbol, currentPrice, isStrongTrend);
        } else if (deathCross) {
            console.log(`🔴 ${symbol}: DEATH CROSS detected! Sell signal. Trend strength: ${(trendStrength * 100).toFixed(2)}%`);
            await this.executeSell(symbol, currentPrice);
        }
    }

    /**
     * Execute a buy order with dynamic spot/futures selection
     */
    private async executeBuy(token: string, currentPrice: number, isStrongTrend: boolean): Promise<void> {
        const baseBalance = this.getBalance(this.getBaseToken(), this.walletBalance);

        // Determine trading mode
        const useFutures = this.macConfig.useFutures && isStrongTrend;
        const leverage = useFutures ? this.macConfig.futuresLeverage : 1;
        const tradeType = useFutures ? 'FUTURES' : 'SPOT';

        // Calculate position size
        const amountToSpend = baseBalance * this.macConfig.positionSizePercent;
        const amountToBuy = (amountToSpend * leverage) / currentPrice; // Leverage amplifies buying power

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
                console.log(`Requested ${amountToBuy.toFixed(6)} ${token} at market price (${tradeType})`);

                if (result.status === 'filled' && result.filledAmount && result.executionPrice) {
                    this.updateWalletAfterBuy(token, result.filledAmount, result.executionPrice, leverage);
                    this.positions.set(token, (this.positions.get(token) || 0) + result.filledAmount);
                    this.positionTypes.set(token, useFutures ? 'futures' : 'spot');
                    this.positionLeverages.set(token, leverage);

                    console.log(`✅ ${tradeType} buy filled: ${result.filledAmount.toFixed(6)} ${token} at ${result.executionPrice.toFixed(2)}`);
                    if (useFutures) {
                        console.log(`📊 Leverage: ${leverage}x | Effective exposure: ${(result.filledAmount * result.executionPrice).toFixed(2)}`);
                    }
                    if (result.slippage) {
                        console.log(`Slippage: ${(result.slippage * 100).toFixed(2)}%`);
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
     * Execute a sell order (closes both spot and futures positions)
     */
    private async executeSell(token: string, currentPrice: number): Promise<void> {
        const tokenBalance = this.getBalance(token, this.walletBalance);

        if (tokenBalance <= 0) {
            console.log(`No ${token} holdings to sell`);
            return;
        }

        // Get position info
        const positionType = this.positionTypes.get(token) || 'spot';
        const leverage = this.positionLeverages.get(token) || 1;
        const isFutures = positionType === 'futures';

        // Sell entire position
        const amountToSell = tokenBalance;

        if (!this.hasTokens(token, amountToSell, this.walletBalance)) {
            console.log(`Insufficient ${token} to sell`);
            return;
        }

        try {
            console.log(`Closing ${positionType.toUpperCase()} position${isFutures ? ` (${leverage}x leverage)` : ''}...`);

            const result = await sell(token, amountToSell, {
                orderType: 'market',
                leverage: leverage,
                isFutures: isFutures
            });

            if (result.success && result.orderId) {
                console.log(`Sell order placed: ${result.orderId}`);
                console.log(`Requested ${amountToSell.toFixed(6)} ${token} at market price`);

                if (result.status === 'filled' && result.filledAmount && result.executionPrice) {
                    this.updateWalletAfterSell(token, result.filledAmount, result.executionPrice, leverage);
                    this.positions.set(token, Math.max(0, (this.positions.get(token) || 0) - result.filledAmount));

                    // Clear position tracking if fully closed
                    if (this.positions.get(token) === 0) {
                        this.positionTypes.delete(token);
                        this.positionLeverages.delete(token);
                    }

                    console.log(
                        `✅ ${positionType.toUpperCase()} sell filled: ${result.filledAmount.toFixed(6)} ${token} at ${result.executionPrice.toFixed(2)}`
                    );
                    if (isFutures) {
                        console.log(`📊 Closed leveraged position | Leverage: ${leverage}x`);
                    }
                    if (result.slippage) {
                        console.log(`Slippage: ${(result.slippage * 100).toFixed(2)}%`);
                    }
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
     * Add price to history and maintain rolling window
     */
    private addPriceToHistory(symbol: string, price: number): void {
        if (!this.priceHistory.has(symbol)) {
            this.priceHistory.set(symbol, []);
        }

        const history = this.priceHistory.get(symbol)!;
        history.push(price);

        // Keep only the data we need (long period + some buffer)
        const maxLength = this.macConfig.longPeriod + 10;
        if (history.length > maxLength) {
            history.shift();
        }
    }

    /**
     * Calculate Simple Moving Average
     */
    private calculateMA(prices: number[], period: number): number {
        if (prices.length < period) {
            return 0;
        }

        const slice = prices.slice(-period);
        const sum = slice.reduce((acc, price) => acc + price, 0);
        return sum / period;
    }

    /**
     * Check status of pending orders and update wallet
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
                        // Get leverage from order (default to 1 if not tracked)
                        const leverage = this.positionLeverages.get(status.token) || 1;

                        if (status.action === 'buy') {
                            this.updateWalletAfterBuy(status.token, status.filledAmount, status.executionPrice, leverage);
                            this.positions.set(status.token, (this.positions.get(status.token) || 0) + status.filledAmount);
                        } else {
                            this.updateWalletAfterSell(status.token, status.filledAmount, status.executionPrice, leverage);
                            this.positions.set(status.token, Math.max(0, (this.positions.get(status.token) || 0) - status.filledAmount));

                            // Clear position tracking if fully closed
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
     * Update wallet after buy (handles leverage)
     */
    private updateWalletAfterBuy(token: string, amount: number, price: number, leverage: number = 1): void {
        const cost = (amount * price) / leverage; // Actual cost is reduced by leverage
        const baseToken = this.getBaseToken();

        this.walletBalance[baseToken] = (this.walletBalance[baseToken] || 0) - cost;
        this.walletBalance[token] = (this.walletBalance[token] || 0) + amount;
    }

    /**
     * Update wallet after sell (handles leverage)
     */
    private updateWalletAfterSell(token: string, amount: number, price: number, leverage: number = 1): void {
        const proceeds = (amount * price) / leverage; // Proceeds adjusted for leverage
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

                // Get position details
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

export default MovingAverageCrossover;
