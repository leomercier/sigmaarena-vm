import { v4 as uuidv4 } from 'uuid';
import { OrderStatusResult, PriceResult, TradeFunctions, TradeOptions, TradeResult } from '../trade_functions';
import { ExchangeSettings, WalletBalance } from '../types';
import { OrderBook } from './order_book';
import { OrderProcessor } from './order_processor';
import { PriceOracle } from './price_oracle';
import { applyFill, createSimulatedOrder, openOrder, rejectOrder, scheduleOrderFill } from './simulated_order';
import { SimulationConfig, createSimulationConfig } from './simulation_config';
import { WalletValidator } from './wallet_validator';

export interface SimulationTradeExecutorParams {
    initialWallet: WalletBalance;
    baseToken: string;
    exchangeSettings: ExchangeSettings;
    initialPrices: Record<string, number>;
    config?: Partial<SimulationConfig>;
}

/**
 * Simulation trade executor. Provides trade function implementations for simulation mode.
 */
export class SimulationTradeExecutor {
    private config: SimulationConfig;
    private orderBook: OrderBook;
    private priceOracle: PriceOracle;
    private walletValidator: WalletValidator;
    private orderProcessor: OrderProcessor;
    private baseToken: string;
    private currentDate: Date = new Date();

    constructor(params: SimulationTradeExecutorParams) {
        this.config = createSimulationConfig(params.config);
        this.baseToken = params.baseToken;

        this.orderBook = new OrderBook();
        this.priceOracle = new PriceOracle(params.initialPrices, this.config.priceVolatility, this.config.randomSeed);
        this.walletValidator = new WalletValidator(params.initialWallet, params.baseToken, params.exchangeSettings);
        this.orderProcessor = new OrderProcessor(this.config, this.orderBook, this.priceOracle, this.walletValidator);
    }

    getTradeFunctions(): TradeFunctions {
        return {
            buy: this.buy.bind(this),
            sell: this.sell.bind(this),
            getOrderStatus: this.getOrderStatus.bind(this),
            getCurrentPrice: this.getCurrentPrice.bind(this)
        };
    }

    private async buy(token: string, amount: number, options: TradeOptions): Promise<TradeResult> {
        const validation = this.walletValidator.canBuy(
            token,
            amount,
            this.getCurrentPriceValue(token) || 0,
            options.leverage || 1,
            options.isFutures || false
        );

        if (!validation.valid) {
            return {
                success: false,
                error: validation.reason
            };
        }

        // Check for order failure
        if (this.orderProcessor.shouldOrderFail(options.orderType)) {
            return {
                success: false,
                error: 'Order rejected by exchange'
            };
        }

        const orderId = uuidv4();
        const order = createSimulatedOrder(
            orderId,
            'buy',
            token,
            this.baseToken,
            amount,
            options.orderType,
            options.limitPrice,
            options.leverage || 1,
            options.isFutures || false,
            this.currentDate.getTime()
        );

        this.orderBook.addOrder(order);

        const price = options.limitPrice || this.getCurrentPriceValue(token) || 0;
        this.walletValidator.commitForBuy(amount, price, options.leverage || 1);

        let updatedOrder = order;

        if (this.config.orderFillStrategy === 'immediate') {
            const executionPrice = this.priceOracle.getExecutionPrice(token, 'buy', this.config.slippagePercentage || 0);

            if (!executionPrice) {
                updatedOrder = rejectOrder(order, `No price available for ${token}`, this.currentDate.getTime());
                this.orderBook.updateOrder(updatedOrder);

                return {
                    success: false,
                    error: `No price available for ${token}`
                };
            }

            updatedOrder = applyFill(order, amount, executionPrice, this.currentDate.getTime());
            this.orderBook.updateOrder(updatedOrder);

            this.walletValidator.executeBuy(token, amount, executionPrice, options.leverage || 1);

            const slippage = options.limitPrice
                ? Math.abs((executionPrice - options.limitPrice) / options.limitPrice)
                : this.config.slippagePercentage || 0;

            return {
                success: true,
                orderId,
                status: 'filled',
                requestedAmount: amount,
                filledAmount: amount,
                remainingAmount: 0,
                requestedPrice: options.limitPrice,
                executionPrice,
                slippage,
                timestamp: this.currentDate.getTime()
            };
        } else if (this.config.orderFillStrategy === 'delayed') {
            const fillTime = this.currentDate.getTime() + (this.config.fillDelayMs || 0);
            updatedOrder = scheduleOrderFill(order, fillTime, this.currentDate.getTime());
            this.orderBook.updateOrder(updatedOrder);

            return {
                success: true,
                orderId,
                status: 'open',
                requestedAmount: amount,
                filledAmount: 0,
                remainingAmount: amount,
                requestedPrice: options.limitPrice,
                timestamp: this.currentDate.getTime()
            };
        } else {
            updatedOrder = openOrder(order, this.currentDate.getTime());
            this.orderBook.updateOrder(updatedOrder);

            return {
                success: true,
                orderId,
                status: 'open',
                requestedAmount: amount,
                filledAmount: 0,
                remainingAmount: amount,
                requestedPrice: options.limitPrice,
                timestamp: Date.now()
            };
        }
    }

    private async sell(token: string, amount: number, options: TradeOptions): Promise<TradeResult> {
        const validation = this.walletValidator.canSell(token, amount, options.isFutures || false);

        if (!validation.valid) {
            return {
                success: false,
                error: validation.reason
            };
        }

        if (this.orderProcessor.shouldOrderFail(options.orderType)) {
            return {
                success: false,
                error: 'Order rejected by exchange'
            };
        }

        const orderId = uuidv4();
        const order = createSimulatedOrder(
            orderId,
            'sell',
            token,
            this.baseToken,
            amount,
            options.orderType,
            options.limitPrice,
            options.leverage || 1,
            options.isFutures || false,
            this.currentDate.getTime()
        );

        this.orderBook.addOrder(order);

        this.walletValidator.commitForSell(token, amount);

        let updatedOrder = order;

        if (this.config.orderFillStrategy === 'immediate') {
            const executionPrice = this.priceOracle.getExecutionPrice(token, 'sell', this.config.slippagePercentage || 0);

            if (!executionPrice) {
                updatedOrder = rejectOrder(order, `No price available for ${token}`, this.currentDate.getTime());
                this.orderBook.updateOrder(updatedOrder);

                return {
                    success: false,
                    error: `No price available for ${token}`
                };
            }

            updatedOrder = applyFill(order, amount, executionPrice, this.currentDate.getTime());
            this.orderBook.updateOrder(updatedOrder);

            this.walletValidator.executeSell(token, amount, executionPrice);

            const slippage = options.limitPrice
                ? Math.abs((executionPrice - options.limitPrice) / options.limitPrice)
                : this.config.slippagePercentage || 0;

            return {
                success: true,
                orderId,
                status: 'filled',
                requestedAmount: amount,
                filledAmount: amount,
                remainingAmount: 0,
                requestedPrice: options.limitPrice,
                executionPrice,
                slippage,
                timestamp: Date.now()
            };
        } else if (this.config.orderFillStrategy === 'delayed') {
            const fillTime = Date.now() + (this.config.fillDelayMs || 0);
            updatedOrder = scheduleOrderFill(order, fillTime, this.currentDate.getTime());
            this.orderBook.updateOrder(updatedOrder);

            return {
                success: true,
                orderId,
                status: 'open',
                requestedAmount: amount,
                filledAmount: 0,
                remainingAmount: amount,
                requestedPrice: options.limitPrice,
                timestamp: Date.now()
            };
        } else {
            updatedOrder = openOrder(order, this.currentDate.getTime());
            this.orderBook.updateOrder(updatedOrder);

            return {
                success: true,
                orderId,
                status: 'open',
                requestedAmount: amount,
                filledAmount: 0,
                remainingAmount: amount,
                requestedPrice: options.limitPrice,
                timestamp: Date.now()
            };
        }
    }

    private async getOrderStatus(orderId: string): Promise<OrderStatusResult> {
        const order = this.orderBook.getOrder(orderId);

        if (!order) {
            return {
                success: false,
                orderId,
                status: 'rejected',
                token: '',
                action: 'buy',
                requestedAmount: 0,
                filledAmount: 0,
                remainingAmount: 0,
                error: `Order ${orderId} not found`
            };
        }

        return {
            success: true,
            orderId: order.id,
            status: order.status,
            token: order.token,
            action: order.action,
            requestedAmount: order.requestedAmount,
            filledAmount: order.filledAmount,
            remainingAmount: order.remainingAmount,
            executionPrice: order.executionPrice
        };
    }

    private async getCurrentPrice(token: string): Promise<PriceResult> {
        return this.priceOracle.getCurrentPrice(token);
    }

    private getCurrentPriceValue(token: string): number | undefined {
        const result = this.priceOracle.getCurrentPrice(token);
        return result.success ? result.price : undefined;
    }

    updatePrice(token: string, price: number): void {
        this.priceOracle.updatePrice(token, price);
    }

    updateCurrentDate(date: Date): void {
        this.currentDate = date;
    }

    processOrders(): void {
        this.orderProcessor.processOrders(this.currentDate);
    }

    getWallet(): WalletBalance {
        return this.walletValidator.getWallet();
    }

    getTradeRecords() {
        return this.orderBook.getTradeRecords();
    }

    getOrderBook(): OrderBook {
        return this.orderBook;
    }
}
