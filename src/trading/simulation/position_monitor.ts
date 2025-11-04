import { PriceOracle } from './price_oracle';
import { WalletValidator } from './wallet_validator';

export interface PositionTriggerEvent {
    token: string;
    triggerType: 'stop-loss' | 'profit-target';
    entryPrice: number;
    triggerPrice: number;
    currentPrice: number;
    amount: number;
    pnl: number;
    pnlPercentage: number;
    timestamp: number;
}

/**
 * Monitors open positions and triggers stop-loss / profit-target orders automatically
 */
export class PositionMonitor {
    private walletValidator: WalletValidator;
    private priceOracle: PriceOracle;
    private onTrigger?: (event: PositionTriggerEvent) => void;

    constructor(walletValidator: WalletValidator, priceOracle: PriceOracle, onTrigger?: (event: PositionTriggerEvent) => void) {
        this.walletValidator = walletValidator;
        this.priceOracle = priceOracle;
        this.onTrigger = onTrigger;
    }

    /**
     * Check all positions for stop-loss and profit-target triggers
     * Returns array of tokens that should be closed
     */
    checkPositions(currentDate: Date): PositionTriggerEvent[] {
        const positions = this.walletValidator.getPositions();
        const triggeredEvents: PositionTriggerEvent[] = [];

        for (const [token, position] of positions) {
            // Skip positions without stop-loss or profit target
            if (!position.stopLoss && !position.profitTarget) {
                continue;
            }

            const priceResult = this.priceOracle.getCurrentPrice(token);
            if (!priceResult.success || !priceResult.price) {
                console.warn(`Cannot check position for ${token}: no price available`);
                continue;
            }

            const currentPrice = priceResult.price;
            const triggers = this.walletValidator.checkPositionTriggers(token, currentPrice);

            const entryPrice = position.entryPrice;

            // Check stop-loss
            if (triggers.stopLossTriggered) {
                const pnl = this.walletValidator.getUnrealizedPnL(token, currentPrice);
                const pnlPercentage = (pnl / position.marginUsed) * 100;

                const event: PositionTriggerEvent = {
                    token,
                    triggerType: 'stop-loss',
                    entryPrice: entryPrice,
                    triggerPrice: this.calculateTriggerPrice(position, 'stop-loss'),
                    currentPrice,
                    amount: Math.abs(position.amount),
                    pnl,
                    pnlPercentage,
                    timestamp: currentDate.getTime()
                };

                triggeredEvents.push(event);

                if (this.onTrigger) {
                    this.onTrigger(event);
                }

                console.log(`Stop-loss triggered: ${token}`);
                console.log(`  Entry: ${entryPrice.toFixed(2)} | Trigger: ${event.triggerPrice.toFixed(2)} | Current: ${currentPrice.toFixed(2)}`);
                console.log(`  P&L: ${pnl.toFixed(2)} (${pnlPercentage.toFixed(2)}%)`);
            }
            // Check profit target (only if stop-loss wasn't triggered)
            else if (triggers.profitTargetTriggered) {
                const pnl = this.walletValidator.getUnrealizedPnL(token, currentPrice);
                const pnlPercentage = (pnl / position.marginUsed) * 100;

                const event: PositionTriggerEvent = {
                    token,
                    triggerType: 'profit-target',
                    entryPrice: entryPrice,
                    triggerPrice: this.calculateTriggerPrice(position, 'profit-target'),
                    currentPrice,
                    amount: Math.abs(position.amount),
                    pnl,
                    pnlPercentage,
                    timestamp: currentDate.getTime()
                };

                triggeredEvents.push(event);

                if (this.onTrigger) {
                    this.onTrigger(event);
                }

                console.log(`Profit target hit: ${token}`);
                console.log(`  Entry: ${entryPrice.toFixed(2)} | Target: ${event.triggerPrice.toFixed(2)} | Current: ${currentPrice.toFixed(2)}`);
                console.log(`  P&L: ${pnl.toFixed(2)} (${pnlPercentage.toFixed(2)}%)`);
            }
        }

        return triggeredEvents;
    }

    private calculateTriggerPrice(position: any, triggerType: 'stop-loss' | 'profit-target'): number {
        const isLong = position.amount > 0;
        const config = triggerType === 'stop-loss' ? position.stopLoss : position.profitTarget;

        if (!config) {
            return 0;
        }

        if (config.type === 'percentage') {
            const percentageMove = config.value / 100;

            if (triggerType === 'stop-loss') {
                return isLong ? position.entryPrice * (1 - percentageMove) : position.entryPrice * (1 + percentageMove);
            } else {
                return isLong ? position.entryPrice * (1 + percentageMove) : position.entryPrice * (1 - percentageMove);
            }
        }

        return config.value;
    }
}
