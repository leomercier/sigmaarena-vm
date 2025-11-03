import { TradeRecord } from '../types';
import { SimulatedOrder } from './simulated_order';

/**
 * Order book manages all orders in the simulation
 */
export class OrderBook {
    private orders: Map<string, SimulatedOrder>;
    private orderHistory: SimulatedOrder[];

    constructor() {
        this.orders = new Map();
        this.orderHistory = [];
    }

    addOrder(order: SimulatedOrder): void {
        this.orders.set(order.id, order);
        this.orderHistory.push(order);
    }

    getOrder(orderId: string): SimulatedOrder | undefined {
        return this.orders.get(orderId);
    }

    updateOrder(order: SimulatedOrder): void {
        this.orders.set(order.id, order);

        // Update history (replace the order with same ID)
        const index = this.orderHistory.findIndex((o) => o.id === order.id);
        if (index >= 0) {
            this.orderHistory[index] = order;
        }
    }

    /**
     * Get all active orders (pending, open, partial)
     */
    getActiveOrders(): SimulatedOrder[] {
        return Array.from(this.orders.values()).filter((o) => o.status === 'pending' || o.status === 'open' || o.status === 'partial');
    }

    /**
     * Get all filled orders
     */
    getFilledOrders(): SimulatedOrder[] {
        return Array.from(this.orders.values()).filter((o) => o.status === 'filled');
    }

    /**
     * Convert filled orders to trade records
     */
    getTradeRecords(): TradeRecord[] {
        return this.getFilledOrders().map((order) => this.orderToTradeRecord(order));
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
}
