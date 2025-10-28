import { ExchangeSettings, WalletBalance } from '../types';

interface CommittedBalances {
    [token: string]: number;
}

/**
 * Validates wallet operations and manages available balances
 */
export class WalletValidator {
    private wallet: WalletBalance;
    private committed: CommittedBalances;
    private baseToken: string;
    private exchangeSettings: ExchangeSettings;

    constructor(initialWallet: WalletBalance, baseToken: string, exchangeSettings: ExchangeSettings) {
        this.wallet = { ...initialWallet };
        this.committed = {};
        this.baseToken = baseToken;
        this.exchangeSettings = exchangeSettings;
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

        // Calculate cost
        const cost = (amount * price) / leverage;
        const availableBase = this.getAvailableBalance(this.baseToken);

        if (availableBase < cost) {
            return {
                valid: false,
                reason: `Insufficient ${this.baseToken}. Need ${cost}, have ${availableBase}`
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

        // Check balance
        const available = this.getAvailableBalance(token);

        if (available < amount) {
            return {
                valid: false,
                reason: `Insufficient ${token}. Need ${amount}, have ${available}`
            };
        }

        return { valid: true };
    }

    /**
     * Commit balance for a pending buy order
     */
    commitForBuy(amount: number, price: number, leverage: number): void {
        const cost = (amount * price) / leverage;
        this.committed[this.baseToken] = (this.committed[this.baseToken] || 0) + cost;
    }

    /**
     * Commit balance for a pending sell order
     */
    commitForSell(token: string, amount: number): void {
        this.committed[token] = (this.committed[token] || 0) + amount;
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
    executeBuy(token: string, amount: number, price: number, leverage: number): void {
        const cost = (amount * price) / leverage;

        // Deduct base token
        this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) - cost;

        // Add purchased token
        this.wallet[token] = (this.wallet[token] || 0) + amount;

        // Release commitment
        this.releaseCommitment(this.baseToken, cost);
    }

    /**
     * Execute a sell (update wallet, release commitment)
     */
    executeSell(token: string, amount: number, price: number): void {
        const proceeds = amount * price;

        // Deduct sold token
        this.wallet[token] = (this.wallet[token] || 0) - amount;

        // Add base token
        this.wallet[this.baseToken] = (this.wallet[this.baseToken] || 0) + proceeds;

        // Release commitment
        this.releaseCommitment(token, amount);
    }
}
