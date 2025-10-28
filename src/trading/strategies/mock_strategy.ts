import { BuyFunction, GetCurrentPriceFunction, GetOrderStatusFunction, SellFunction } from '../trade_functions';
import { Trading } from '../trading_class';
import { AnalysisData, WalletBalance } from '../types';

// These will be injected by the session manager into the sandbox
declare const buy: BuyFunction;
declare const sell: SellFunction;
declare const getOrderStatus: GetOrderStatusFunction;
declare const getCurrentPrice: GetCurrentPriceFunction;

/**
 * Simple random trading strategy (for demonstration only)
 * Maintains internal wallet state and tracks pending orders
 */
class RandomStrategy extends Trading {
    private tradeCount: number = 0;
    private maxTrades: number = 10;

    private walletBalance: WalletBalance = {};

    private pendingOrders: Set<string> = new Set();

    /**
     * Custom initialization
     */
    protected async onInitialize(): Promise<void> {
        // Initialize internal wallet state
        this.walletBalance = { ...this.config.walletBalance };

        console.log('Random strategy initialized');
        console.log('Base token:', this.config.baseToken);
        console.log('Tradable tokens:', this.config.tradableTokens);
        console.log('Initial balance:', this.walletBalance);
    }

    /**
     * Analyze market data and make trading decisions
     */
    async analyze(data: AnalysisData): Promise<void> {
        await this.checkPendingOrders();

        // Simple example: randomly decide to buy, sell, or hold
        if (!data.ohlcv) {
            return;
        }

        const { close: currentPrice, symbol } = data.ohlcv;

        // Stop after max trades
        if (this.tradeCount >= this.maxTrades) {
            return;
        }

        // Only trade if this token is in our tradable list
        if (!this.getTradableTokens().includes(symbol)) {
            return;
        }

        // Random decision: 0 = hold, 1 = buy, 2 = sell
        const decision = Math.floor(Math.random() * 3);

        if (decision === 1) {
            await this.attemptBuy(symbol, currentPrice);
        } else if (decision === 2) {
            await this.attemptSell(symbol, currentPrice);
        }
    }

    /**
     * Attempt to buy tokens
     */
    private async attemptBuy(token: string, currentPrice: number): Promise<void> {
        const baseBalance = this.getBalance(this.getBaseToken(), this.walletBalance);

        // Use 10% of base token balance
        const amountToSpend = baseBalance * 0.1;
        const amountToBuy = amountToSpend / currentPrice;

        if (!this.canAfford(amountToBuy, currentPrice, this.walletBalance)) {
            return;
        }

        try {
            // Place a market order
            const result = await buy(token, amountToBuy, {
                orderType: 'market',
                leverage: 1,
                isFutures: false
            });

            if (result.success && result.orderId) {
                console.log(`Buy order placed: ${result.orderId}`);
                console.log(`Requested ${amountToBuy} ${token} at market price`);

                // If order is filled immediately, update wallet
                if (result.status === 'filled' && result.filledAmount && result.executionPrice) {
                    this.updateWalletAfterBuy(token, result.filledAmount, result.executionPrice);
                    this.tradeCount++;

                    if (result.slippage) {
                        console.log(`Slippage: ${result.slippage.toFixed(2)}%`);
                    }
                } else {
                    // Track pending order
                    this.pendingOrders.add(result.orderId);
                }
            } else {
                console.error('Buy failed:', result.error);
            }
        } catch (err) {
            console.error('Error executing buy:', err);
        }
    }

    /**
     * Attempt to sell tokens
     */
    private async attemptSell(token: string, currentPrice: number): Promise<void> {
        const tokenBalance = this.getBalance(token, this.walletBalance);

        // Sell 10% of holdings
        const amountToSell = tokenBalance * 0.1;

        if (!this.hasTokens(token, amountToSell, this.walletBalance)) {
            return;
        }

        try {
            // Place a market order
            const result = await sell(token, amountToSell, {
                orderType: 'market',
                leverage: 1,
                isFutures: false
            });

            if (result.success && result.orderId) {
                console.log(`Sell order placed: ${result.orderId}`);
                console.log(`Requested ${amountToSell} ${token} at market price`);

                // If order is filled immediately, update wallet
                if (result.status === 'filled' && result.filledAmount && result.executionPrice) {
                    this.updateWalletAfterSell(token, result.filledAmount, result.executionPrice);
                    this.tradeCount++;

                    if (result.slippage) {
                        console.log(`Slippage: ${result.slippage.toFixed(2)}%`);
                    }
                } else {
                    // Track pending order
                    this.pendingOrders.add(result.orderId);
                }
            } else {
                console.error('Sell failed:', result.error);
            }
        } catch (error) {
            console.error('Error executing sell:', error);
        }
    }

    /**
     * Check status of pending orders and update wallet accordingly
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

                // Handle filled or partially filled orders
                if (status.status === 'filled' || status.status === 'partial') {
                    if (status.executionPrice && status.filledAmount > 0) {
                        if (status.action === 'buy') {
                            this.updateWalletAfterBuy(status.token, status.filledAmount, status.executionPrice);
                        } else {
                            this.updateWalletAfterSell(status.token, status.filledAmount, status.executionPrice);
                        }

                        console.log(`Order ${orderId} ${status.status}: ${status.filledAmount} ${status.token}`);
                    }
                }

                // Remove completed or cancelled orders
                if (status.status === 'filled' || status.status === 'cancelled' || status.status === 'rejected') {
                    ordersToRemove.push(orderId);
                }
            } catch (error) {
                console.error(`Error checking order ${orderId}:`, error);
            }
        }

        // Clean up tracked orders
        ordersToRemove.forEach((orderId) => this.pendingOrders.delete(orderId));
    }

    /**
     * Update internal wallet after a buy
     */
    private updateWalletAfterBuy(token: string, amount: number, price: number): void {
        const cost = amount * price;
        const baseToken = this.getBaseToken();

        this.walletBalance[baseToken] = (this.walletBalance[baseToken] || 0) - cost;
        this.walletBalance[token] = (this.walletBalance[token] || 0) + amount;
    }

    /**
     * Update internal wallet after a sell
     */
    private updateWalletAfterSell(token: string, amount: number, price: number): void {
        const proceeds = amount * price;
        const baseToken = this.getBaseToken();

        this.walletBalance[token] = (this.walletBalance[token] || 0) - amount;
        this.walletBalance[baseToken] = (this.walletBalance[baseToken] || 0) + proceeds;
    }

    /**
     * Close session by liquidating all positions to base token
     */
    async closeSession(): Promise<void> {
        console.log('Closing session - liquidating all positions');

        const baseToken = this.getBaseToken();

        // Liquidate all non-base tokens
        for (const token of Object.keys(this.walletBalance)) {
            if (token === baseToken) {
                continue;
            }

            const balance = this.walletBalance[token];
            if (balance <= 0) {
                continue;
            }

            try {
                // Get current price
                const priceResult = await getCurrentPrice(token);

                if (!priceResult.success || !priceResult.price) {
                    console.error(`Failed to get price for ${token}`);
                    continue;
                }

                // Sell all holdings
                const result = await sell(token, balance, {
                    orderType: 'market',
                    leverage: 1,
                    isFutures: false
                });

                if (result.success) {
                    console.log(`Liquidated ${balance} ${token}`);

                    if (result.status === 'filled' && result.filledAmount && result.executionPrice) {
                        this.updateWalletAfterSell(token, result.filledAmount, result.executionPrice);
                    }
                } else {
                    console.error(`Failed to liquidate ${token}:`, result.error);
                }
            } catch (err) {
                console.error(`Error liquidating ${token}:`, err);
            }
        }

        console.log('Final balance:', this.walletBalance);
    }
}

export default new RandomStrategy();
