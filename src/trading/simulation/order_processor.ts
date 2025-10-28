import { OrderBook } from './order_book';
import { PriceOracle, SeededRandom } from './price_oracle';
import { SimulatedOrder, applyFill, cancelOrder, rejectOrder } from './simulated_order';
import { SimulationConfig } from './simulation_config';
import { WalletValidator } from './wallet_validator';

/**
 * Processes orders according to simulation config
 */
export class OrderProcessor {
    private config: SimulationConfig;
    private orderBook: OrderBook;
    private priceOracle: PriceOracle;
    private walletValidator: WalletValidator;
    private random: SeededRandom;

    constructor(config: SimulationConfig, orderBook: OrderBook, priceOracle: PriceOracle, walletValidator: WalletValidator) {
        this.config = config;
        this.orderBook = orderBook;
        this.priceOracle = priceOracle;
        this.walletValidator = walletValidator;
        this.random = new SeededRandom(config.randomSeed ?? Date.now());
    }

    processOrders(): void {
        const activeOrders = this.orderBook.getActiveOrders();

        for (const order of activeOrders) {
            this.processOrder(order);
        }
    }

    private processOrder(order: SimulatedOrder): void {
        const now = Date.now();

        // Check for auto-cancellation
        if (this.shouldAutoCancelOrder(order, now)) {
            const updated = cancelOrder(order, 'Auto-cancelled after timeout');
            this.orderBook.updateOrder(updated);

            // Release committed balance
            if (order.action === 'buy') {
                const cost = (order.remainingAmount * (order.requestedPrice || 0)) / order.leverage;
                this.walletValidator.releaseCommitment(order.baseToken, cost);
            } else {
                this.walletValidator.releaseCommitment(order.token, order.remainingAmount);
            }

            return;
        }

        // Process based on fill strategy
        switch (this.config.orderFillStrategy) {
            case 'delayed':
                this.processDelayedOrder(order, now);
                break;
            case 'gradual':
                this.processGradualOrder(order, now);
                break;
            case 'never':
                // Orders stay pending forever
                break;
            default:
                // 'immediate' orders are filled when created
                break;
        }
    }

    private processDelayedOrder(order: SimulatedOrder, now: number): void {
        if (!order.scheduledFillTime) {
            return;
        }

        if (now >= order.scheduledFillTime) {
            this.fillOrder(order, order.remainingAmount);
        }
    }

    private processGradualOrder(order: SimulatedOrder, now: number): void {
        const intervalMs = this.config.gradualFillIntervalMs || 1000;
        const timeSinceLastUpdate = now - order.lastUpdatedAt;

        if (timeSinceLastUpdate < intervalMs) {
            return;
        }

        // Fill a percentage of remaining amount
        const fillPercentage = this.config.partialFillPercentage || 0.3;
        const fillAmount = order.remainingAmount * fillPercentage;

        this.fillOrder(order, fillAmount);
    }

    /**
     * Fill an order (fully or partially)
     */
    private fillOrder(order: SimulatedOrder, fillAmount: number): void {
        // Get execution price
        const executionPrice = this.priceOracle.getExecutionPrice(order.token, order.action, this.config.slippagePercentage || 0);

        if (!executionPrice) {
            const updated = rejectOrder(order, `No price available for ${order.token}`);
            this.orderBook.updateOrder(updated);
            return;
        }

        // Apply the fill
        const updated = applyFill(order, fillAmount, executionPrice);
        this.orderBook.updateOrder(updated);

        // Update wallet
        if (order.action === 'buy') {
            this.walletValidator.executeBuy(order.token, fillAmount, executionPrice, order.leverage);
        } else {
            this.walletValidator.executeSell(order.token, fillAmount, executionPrice);
        }
    }

    /**
     * Check if order should be auto-cancelled
     */
    private shouldAutoCancelOrder(order: SimulatedOrder, now: number): boolean {
        if (!this.config.cancellationAfterMs) {
            return false;
        }

        const age = now - order.createdAt;
        return age >= this.config.cancellationAfterMs;
    }

    /**
     * Check if order should fail based on failure rate
     */
    shouldOrderFail(orderType: string): boolean {
        const failureRate = this.config.orderFailureRate || 0;

        // Market orders may always succeed based on config
        if (orderType === 'market' && this.config.marketOrdersAlwaysSucceed) {
            return false;
        }

        return this.random.next() < failureRate;
    }

    /**
     * Check if limit order should fill
     */
    shouldLimitOrderFill(): boolean {
        const fillProbability = this.config.limitOrderFillProbability ?? 1.0;
        return this.random.next() < fillProbability;
    }
}
