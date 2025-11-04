import { v4 as uuidv4 } from 'uuid';
import { TradeReportGenerator } from '../reporting/trade_report_generator';
import { OrderStatusResult, PriceResult, ProfitTargetOption, StopLossOption, TradeFunctions, TradeOptions, TradeResult } from '../trade_functions';
import { ExchangeSettings, TradeRecord, WalletBalance } from '../types';
import { OrderBook } from './order_book';
import { OrderProcessor } from './order_processor';
import { PositionMonitor, PositionTriggerEvent } from './position_monitor';
import { PriceOracle } from './price_oracle';
import { applyFill, createSimulatedOrder, openOrder, rejectOrder, scheduleOrderFill, SimulatedOrder } from './simulated_order';
import { createSimulationConfig, SimulationConfig } from './simulation_config';
import { ProfitTargetConfig, StopLossConfig, WalletValidator } from './wallet_validator';

export interface SimulationTradeExecutorParams {
    initialWallet: WalletBalance;
    baseToken: string;
    currentDate: Date | string;
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
    private positionMonitor: PositionMonitor;
    private baseToken: string;
    private currentDate: Date;
    private reportGenerator: TradeReportGenerator;
    private triggeredPositions: PositionTriggerEvent[] = [];

    constructor(params: SimulationTradeExecutorParams) {
        this.config = createSimulationConfig(params.config);
        this.baseToken = params.baseToken;
        this.currentDate = new Date(params.currentDate);

        this.reportGenerator = new TradeReportGenerator(this.baseToken, params.initialWallet, params.initialPrices);

        this.orderBook = new OrderBook();
        this.priceOracle = new PriceOracle(params.initialPrices, this.config.priceVolatility, this.currentDate, this.config.randomSeed);
        this.walletValidator = new WalletValidator(params.initialWallet, params.baseToken, params.exchangeSettings);
        this.orderProcessor = new OrderProcessor(this.config, this.orderBook, this.priceOracle, this.walletValidator);
        this.positionMonitor = new PositionMonitor(this.walletValidator, this.priceOracle, (event) => {
            this.triggeredPositions.push(event);
        });
    }

    getTradeFunctions(): TradeFunctions {
        return {
            buy: this.buy.bind(this),
            sell: this.sell.bind(this),
            getOrderStatus: this.getOrderStatus.bind(this),
            getCurrentPrice: this.getCurrentPrice.bind(this)
        };
    }

    private parseStopLoss(stopLoss: StopLossOption | undefined): StopLossConfig | undefined {
        if (!stopLoss) {
            return undefined;
        }

        if (stopLoss.percentage !== undefined) {
            return { type: 'percentage', value: stopLoss.percentage };
        } else if (stopLoss.price !== undefined) {
            return { type: 'price', value: stopLoss.price };
        }

        return undefined;
    }

    private parseProfitTarget(profitTarget: ProfitTargetOption | undefined): ProfitTargetConfig | undefined {
        if (!profitTarget) {
            return undefined;
        }

        if (profitTarget.percentage !== undefined) {
            return { type: 'percentage', value: profitTarget.percentage };
        } else if (profitTarget.price !== undefined) {
            return { type: 'price', value: profitTarget.price };
        }

        return undefined;
    }

    private async buy(token: string, amount: number, options: TradeOptions): Promise<TradeResult> {
        const price = options.limitPrice || this.getCurrentPriceValue(token) || 0;
        const validation = this.walletValidator.canBuy(token, amount, price, options.leverage || 1, options.isFutures || false);

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

        this.walletValidator.commitForBuy(amount, price, options.leverage || 1, options.isFutures || false);

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

            const walletBefore = this.walletValidator.getWallet();
            const positionsBefore = new Map(this.walletValidator.getPositions());

            updatedOrder = applyFill(order, amount, executionPrice, this.currentDate.getTime());
            this.orderBook.updateOrder(updatedOrder);

            const stopLoss = this.parseStopLoss(options.stopLoss);
            const profitTarget = this.parseProfitTarget(options.profitTarget);

            this.walletValidator.executeBuy(
                token,
                amount,
                executionPrice,
                options.leverage || 1,
                options.isFutures || false,
                stopLoss,
                profitTarget,
                this.currentDate.getTime()
            );

            const walletAfter = this.walletValidator.getWallet();
            const positionsAfter = this.walletValidator.getPositions();

            const tradeRecord = this.orderToTradeRecord(updatedOrder);
            this.reportGenerator.recordTrade(tradeRecord, walletBefore, walletAfter, positionsBefore, positionsAfter);

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
                timestamp: this.currentDate.getTime()
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

        const price = options.limitPrice || this.getCurrentPriceValue(token) || 0;
        this.walletValidator.commitForSell(token, amount, price, options.leverage || 1, options.isFutures || false);

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

            const walletBefore = this.walletValidator.getWallet();
            const positionsBefore = new Map(this.walletValidator.getPositions());

            updatedOrder = applyFill(order, amount, executionPrice, this.currentDate.getTime());
            this.orderBook.updateOrder(updatedOrder);

            this.walletValidator.executeSell(token, amount, executionPrice, options.leverage || 1, options.isFutures || false);

            const walletAfter = this.walletValidator.getWallet();
            const positionsAfter = this.walletValidator.getPositions();

            const tradeRecord = this.orderToTradeRecord(updatedOrder);
            this.reportGenerator.recordTrade(tradeRecord, walletBefore, walletAfter, positionsBefore, positionsAfter);

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
                timestamp: this.currentDate.getTime()
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

    private orderToTradeRecord(order: SimulatedOrder): TradeRecord {
        let slippage: number | undefined;
        if (order.requestedPrice && order.executionPrice) {
            slippage = Math.abs((order.executionPrice - order.requestedPrice) / order.requestedPrice);
        }

        return {
            id: order.id,
            timestamp: order.timestamp,
            action: order.action,
            token: order.token,
            requestedAmount: order.requestedAmount,
            filledAmount: order.filledAmount,
            requestedPrice: order.requestedPrice,
            executionPrice: order.executionPrice!,
            leverage: order.leverage,
            isFutures: order.isFutures,
            slippage
        };
    }

    closeAllPositions(finalPrices: Record<string, number>): void {
        this.walletValidator.closeAllPositions(finalPrices);
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
        this.reportGenerator.updatePrice(token, price);
    }

    updateCurrentDate(date: Date): void {
        this.currentDate = date;
        this.priceOracle.updateCurrentDate(date);
        this.walletValidator.updateCurrentDate(date);
    }

    /**
     * Process orders and check for position triggers (stop-loss / profit-target)
     */
    processOrders(): void {
        this.orderProcessor.processOrders(this.currentDate);

        const triggeredEvents = this.positionMonitor.checkPositions(this.currentDate);

        // Execute sell orders for triggered positions
        for (const event of triggeredEvents) {
            const position = this.walletValidator.getPosition(event.token);
            if (position) {
                this.executeAutomaticClose(event);
            }
        }
    }

    /**
     * Execute automatic position close due to stop-loss or profit target
     */
    private async executeAutomaticClose(event: PositionTriggerEvent): Promise<void> {
        const position = this.walletValidator.getPosition(event.token);
        if (!position) {
            return;
        }

        const isFutures = true; // Positions are tracked for futures only
        const amount = Math.abs(position.amount);

        const executionPrice = this.priceOracle.getExecutionPrice(event.token, 'sell', this.config.slippagePercentage || 0);

        if (!executionPrice) {
            console.error(`Cannot close position for ${event.token}: no price available`);
            return;
        }

        const walletBefore = this.walletValidator.getWallet();
        const positionsBefore = new Map(this.walletValidator.getPositions());

        this.walletValidator.executeSell(event.token, amount, executionPrice, position.leverage, isFutures);

        const walletAfter = this.walletValidator.getWallet();
        const positionsAfter = this.walletValidator.getPositions();

        const orderId = uuidv4();
        const order = createSimulatedOrder(
            orderId,
            'sell',
            event.token,
            this.baseToken,
            amount,
            'market',
            undefined,
            position.leverage,
            isFutures,
            this.currentDate.getTime()
        );

        const filledOrder = applyFill(order, amount, executionPrice, this.currentDate.getTime());
        this.orderBook.addOrder(filledOrder);

        const tradeRecord = this.orderToTradeRecord(filledOrder);
        this.reportGenerator.recordTrade(tradeRecord, walletBefore, walletAfter, positionsBefore, positionsAfter);

        console.log(`Position closed automatically at ${executionPrice.toFixed(2)}`);
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

    getReportGenerator(): TradeReportGenerator {
        return this.reportGenerator;
    }

    getPositionMonitor(): PositionMonitor {
        return this.positionMonitor;
    }

    getTriggeredPositions(): PositionTriggerEvent[] {
        return [...this.triggeredPositions];
    }
}
