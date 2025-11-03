import { ExchangeSettings, WalletBalance } from '../types';

interface CommittedBalances {
    [token: string]: number;
}

export interface Position {
    token: string;
    amount: number; // Positive for long, negative for short
    entryPrice: number;
    leverage: number;
    marginUsed: number;
}

/**
 * Validates wallet operations and manages available balances
 */
export class WalletValidator {
    private wallet: WalletBalance;
    private committed: CommittedBalances;
    private baseToken: string;
    private exchangeSettings: ExchangeSettings;
    private positions: Map<string, Position>; // Track futures positions

    constructor(initialWallet: WalletBalance, baseToken: string, exchangeSettings: ExchangeSettings) {
        this.wallet = { ...initialWallet };
        this.committed = {};
        this.baseToken = baseToken;
        this.exchangeSettings = exchangeSettings;
        this.positions = new Map();
    }

    getAvailableBalance(token: string): number {
        const total = this.wallet[token] || 0;
        const committed = this.committed[token] || 0;

        return Math.max(0, total - committed);
    }

    /**
     * Get full wallet state
     */
    getWallet(): WalletBalance {
        return { ...this.wallet };
    }

    /**
     * Get all open futures positions
     */
    getPositions(): Map<string, Position> {
        return new Map(this.positions);
    }

    /**
     * Calculate unrealized PnL for a position
     */
    getUnrealizedPnL(token: string, currentPrice: number): number {
        const position = this.positions.get(token);
        if (!position) return 0;

        const priceDiff = currentPrice - position.entryPrice;
        const pnl = position.amount * priceDiff;

        return pnl;
    }

    /**
     * Get total unrealized PnL across all positions
     */
    getTotalUnrealizedPnL(currentPrices: Record<string, number>): number {
        let totalPnL = 0;

        for (const [token] of this.positions) {
            const currentPrice = currentPrices[token];
            if (currentPrice !== undefined) {
                totalPnL += this.getUnrealizedPnL(token, currentPrice);
            }
        }

        return totalPnL;
    }

    canBuy(token: string, amount: number, price: number, leverage: number, isFutures: boolean): { valid: boolean; reason?: string } {
        // Check if token is valid
        if (token === this.baseToken) {
            return { valid: false, reason: `Cannot buy base token ${this.baseToken}` };
        }

        // Check exchange settings
        if (isFutures && !this.exchangeSettings.futuresEnabled) {
            return { valid: false, reason: 'Futures trading not enabled' };
        }

        if (!isFutures && !this.exchangeSettings.spotEnabled) {
            return { valid: false, reason: 'Spot trading not enabled' };
        }

        // Check leverage
        const allowedLeverage = isFutures ? this.exchangeSettings.futuresLeverageOptions : this.exchangeSettings.spotLeverageOptions;

        if (!allowedLeverage.includes(leverage)) {
            return {
                valid: false,
                reason: `Leverage ${leverage}x not allowed for ${isFutures ? 'futures' : 'spot'}`
            };
        }

        // Calculate required capital (margin for futures, full cost for spot)
        const requiredCapital = isFutures ? (amount * price) / leverage : amount * price;
        const availableBase = this.getAvailableBalance(this.baseToken);

        if (availableBase < requiredCapital) {
            return {
                valid: false,
                reason: `Insufficient ${this.baseToken}. Need ${requiredCapital.toFixed(6)}, have ${availableBase.toFixed(6)}`
            };
        }

        return { valid: true };
    }

    canSell(token: string, amount: number, isFutures: boolean): { valid: boolean; reason?: string } {
        // Check if token is valid
        if (token === this.baseToken) {
            return { valid: false, reason: `Cannot sell base token ${this.baseToken}` };
        }

        // Check exchange settings
        if (isFutures && !this.exchangeSettings.futuresEnabled) {
            return { valid: false, reason: 'Futures trading not enabled' };
        }

        if (!isFutures && !this.exchangeSettings.spotEnabled) {
            return { valid: false, reason: 'Spot trading not enabled' };
        }

        if (isFutures) {
            // For futures, check if we have an existing long position to close or can open short
            const position = this.positions.get(token);

            if (position && position.amount > 0) {
                // Closing long position
                if (amount > position.amount) {
                    return {
                        valid: false,
                        reason: `Cannot sell ${amount} ${token}. Only ${position.amount} in long position.`
                    };
                }
            } else {
                // Opening short position or adding to short - need margin
                // This will be validated in commitForSell
            }

            return { valid: true };
        } else {
            // For spot, check actual token balance
            const available = this.getAvailableBalance(token);

            if (available < amount) {
                return {
                    valid: false,
                    reason: `Insufficient ${token}. Need ${amount.toFixed(6)}, have ${available.toFixed(6)}`
                };
            }
        }

        return { valid: true };
    }

    /**
     * Commit balance for a pending buy order
     */
    commitForBuy(amount: number, price: number, leverage: number, isFutures: boolean): void {
        const requiredCapital = isFutures ? (amount * price) / leverage : amount * price;
        this.committed[this.baseToken] = (this.committed[this.baseToken] || 0) + requiredCapital;
    }

    /**
     * Commit balance for a pending sell order
     */
    commitForSell(token: string, amount: number, price: number, leverage: number, isFutures: boolean): void {
        if (isFutures) {
            const position = this.positions.get(token);

            if (position && position.amount > 0) {
                // Closing long position - no additional commitment needed
                // The margin is already committed in the position
            } else {
                // Opening/adding to short position - need margin
                const margin = (amount * price) / leverage;
                this.committed[this.baseToken] = (this.committed[this.baseToken] || 0) + margin;
            }
        } else {
            // Spot trading - commit the actual tokens
            this.committed[token] = (this.committed[token] || 0) + amount;
        }
    }

    /**
     * Release committed balance (order cancelled/rejected)
     */
    releaseCommitment(token: string, amount: number): void {
        this.committed[token] = Math.max(0, (this.committed[token] || 0) - amount);
    }

    /**
     * Execute a buy (update wallet, release commitment)
     */
    executeBuy(token: string, amount: number, price: number, leverage: number, isFutures: boolean): void {
        const requiredCapital = (amount * price) / leverage;

        if (isFutures) {
            // Futures: manage position
            const existingPosition = this.positions.get(token);

            if (existingPosition && existingPosition.amount < 0) {
                // Closing short position
                const closeAmount = Math.min(amount, Math.abs(existingPosition.amount));
                const remainingShort = existingPosition.amount + closeAmount;

                // Calculate PnL on closed portion
                const pnl = closeAmount * (existingPosition.entryPrice - price);
                const marginReturned = (closeAmount * existingPosition.entryPrice) / existingPosition.leverage;

                // Return margin plus PnL
                this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) + marginReturned + pnl;

                if (Math.abs(remainingShort) < 0.0000001) {
                    // Position fully closed
                    this.positions.delete(token);
                } else {
                    // Update short position
                    existingPosition.amount = remainingShort;
                    existingPosition.marginUsed = (Math.abs(remainingShort) * existingPosition.entryPrice) / existingPosition.leverage;
                }

                // If there's remaining buy amount, open long
                const remainingBuy = amount - closeAmount;
                if (remainingBuy > 0.0000001) {
                    const margin = (remainingBuy * price) / leverage;
                    this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) - margin;
                    this.positions.set(token, {
                        token,
                        amount: remainingBuy,
                        entryPrice: price,
                        leverage,
                        marginUsed: margin
                    });
                }
            } else if (existingPosition) {
                // Adding to long position - calculate average entry
                const totalAmount = existingPosition.amount + amount;
                const totalCost = existingPosition.amount * existingPosition.entryPrice + amount * price;
                const avgEntry = totalCost / totalAmount;
                const totalMargin = existingPosition.marginUsed + requiredCapital;

                this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) - requiredCapital;

                existingPosition.amount = totalAmount;
                existingPosition.entryPrice = avgEntry;
                existingPosition.marginUsed = totalMargin;
            } else {
                // Open new long position
                this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) - requiredCapital;
                this.positions.set(token, {
                    token,
                    amount,
                    entryPrice: price,
                    leverage,
                    marginUsed: requiredCapital
                });
            }

            this.releaseCommitment(this.baseToken, requiredCapital);
        } else {
            // Spot trading: actually buy tokens
            const cost = amount * price;
            this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) - cost;
            this.wallet[token] = (this.wallet[token] || 0) + amount;
            this.releaseCommitment(this.baseToken, cost);
        }
    }

    /**
     * Execute a sell (update wallet, release commitment)
     */
    executeSell(token: string, amount: number, price: number, leverage: number, isFutures: boolean): void {
        if (isFutures) {
            // Futures: manage position
            const existingPosition = this.positions.get(token);

            if (existingPosition && existingPosition.amount > 0) {
                // Closing long position
                const closeAmount = Math.min(amount, existingPosition.amount);
                const remainingLong = existingPosition.amount - closeAmount;

                // Calculate PnL on closed portion
                const pnl = closeAmount * (price - existingPosition.entryPrice);
                const marginReturned = (closeAmount * existingPosition.entryPrice) / existingPosition.leverage;

                // Return margin plus PnL
                this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) + marginReturned + pnl;

                if (remainingLong < 0.0000001) {
                    // Position fully closed
                    this.positions.delete(token);
                } else {
                    // Update long position
                    existingPosition.amount = remainingLong;
                    existingPosition.marginUsed = (remainingLong * existingPosition.entryPrice) / existingPosition.leverage;
                }

                // If there's remaining sell amount, open short
                const remainingShort = amount - closeAmount;
                if (remainingShort > 0.0000001) {
                    const margin = (remainingShort * price) / leverage;
                    this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) - margin;

                    // Release the committed margin
                    this.releaseCommitment(this.baseToken, margin);

                    this.positions.set(token, {
                        token,
                        amount: -remainingShort, // Negative for short
                        entryPrice: price,
                        leverage,
                        marginUsed: margin
                    });
                }
            } else if (existingPosition) {
                // Adding to short position
                const totalAmount = existingPosition.amount - amount; // More negative
                const totalCost = Math.abs(existingPosition.amount) * existingPosition.entryPrice + amount * price;
                const avgEntry = totalCost / Math.abs(totalAmount);
                const margin = (amount * price) / leverage;
                const totalMargin = existingPosition.marginUsed + margin;

                this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) - margin;
                this.releaseCommitment(this.baseToken, margin);

                existingPosition.amount = totalAmount;
                existingPosition.entryPrice = avgEntry;
                existingPosition.marginUsed = totalMargin;
            } else {
                // Open new short position
                const margin = (amount * price) / leverage;
                this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) - margin;
                this.releaseCommitment(this.baseToken, margin);

                this.positions.set(token, {
                    token,
                    amount: -amount, // Negative for short
                    entryPrice: price,
                    leverage,
                    marginUsed: margin
                });
            }
        } else {
            // Spot trading: actually sell tokens
            const proceeds = amount * price;

            // Prevent negative balance
            const currentBalance = this.wallet[token] || 0;
            if (currentBalance < amount) {
                console.error(`Warning: Attempting to sell ${amount} ${token} but only have ${currentBalance}`);
                return;
            }

            this.wallet[token] = currentBalance - amount;
            this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) + proceeds;
            this.releaseCommitment(token, amount);
        }
    }

    /**
     * Close all positions (for session end)
     */
    closeAllPositions(currentPrices: Record<string, number>): void {
        for (const [token, position] of this.positions) {
            const currentPrice = currentPrices[token];
            if (!currentPrice) {
                console.warn(`No price available for ${token}, cannot close position`);
                continue;
            }

            const pnl = this.getUnrealizedPnL(token, currentPrice);

            // Return margin + PnL
            this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) + position.marginUsed + pnl;
        }

        this.positions.clear();
    }
}
