import { OrderStatus, OrderType } from '../trade_functions';

/**
 * Internal order state for simulation
 */
export interface SimulatedOrder {
    id: string;
    timestamp: number;
    action: 'buy' | 'sell';

    token: string;
    baseToken: string;

    requestedAmount: number;
    filledAmount: number;
    remainingAmount: number;

    orderType: OrderType;
    requestedPrice?: number;
    executionPrice?: number;

    leverage: number;
    isFutures: boolean;

    status: OrderStatus;

    // Simulation-specific fields
    createdAt: number;
    lastUpdatedAt: number;
    scheduledFillTime?: number;
    fillProgress: number;
    totalCost: number;
    rejectionReason?: string;
    cancellationReason?: string;
}

export function createSimulatedOrder(
    id: string,
    action: 'buy' | 'sell',
    token: string,
    baseToken: string,
    amount: number,
    orderType: OrderType,
    requestedPrice: number | undefined,
    leverage: number,
    isFutures: boolean
): SimulatedOrder {
    const now = Date.now();

    return {
        id,
        timestamp: now,
        action,
        token,
        baseToken,
        requestedAmount: amount,
        filledAmount: 0,
        remainingAmount: amount,
        orderType,
        requestedPrice,
        executionPrice: undefined,
        leverage,
        isFutures,
        status: 'pending',
        createdAt: now,
        lastUpdatedAt: now,
        fillProgress: 0,
        totalCost: 0
    };
}

export function applyFill(order: SimulatedOrder, fillAmount: number, fillPrice: number): SimulatedOrder {
    const newFilledAmount = order.filledAmount + fillAmount;
    const newRemainingAmount = order.requestedAmount - newFilledAmount;

    // Calculate new average execution price
    const newTotalCost = order.totalCost + fillAmount * fillPrice;
    const newExecutionPrice = newTotalCost / newFilledAmount;

    // Determine new status
    let newStatus: OrderStatus;
    if (newRemainingAmount <= 0.0000001) {
        // Account for floating point
        newStatus = 'filled';
    } else if (newFilledAmount > 0) {
        newStatus = 'partial';
    } else {
        newStatus = order.status;
    }

    return {
        ...order,
        filledAmount: newFilledAmount,
        remainingAmount: Math.max(0, newRemainingAmount),
        executionPrice: newExecutionPrice,
        totalCost: newTotalCost,
        status: newStatus,
        lastUpdatedAt: Date.now(),
        fillProgress: newFilledAmount / order.requestedAmount
    };
}

export function rejectOrder(order: SimulatedOrder, reason: string): SimulatedOrder {
    return {
        ...order,
        status: 'rejected',
        rejectionReason: reason,
        lastUpdatedAt: Date.now()
    };
}

export function cancelOrder(order: SimulatedOrder, reason: string): SimulatedOrder {
    return {
        ...order,
        status: 'cancelled',
        cancellationReason: reason,
        lastUpdatedAt: Date.now()
    };
}

export function openOrder(order: SimulatedOrder): SimulatedOrder {
    return {
        ...order,
        status: 'open',
        lastUpdatedAt: Date.now()
    };
}

export function scheduleOrderFill(order: SimulatedOrder, fillTime: number): SimulatedOrder {
    return {
        ...order,
        scheduledFillTime: fillTime,
        status: 'open',
        lastUpdatedAt: Date.now()
    };
}
