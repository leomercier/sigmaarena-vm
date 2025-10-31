import * as fs from 'fs';
import { TradeRecord, WalletBalance } from '../types';

interface PositionSnapshot {
    token: string;
    amount: number;
    entryPrice: number;
    leverage: number;
    marginUsed: number;
    unrealizedPnL: number;
}

interface TradeReportEntry {
    tradeNumber: number;
    timestamp: string;
    action: 'buy' | 'sell';
    token: string;
    type: 'spot' | 'futures';
    leverage: number;

    // Trade details
    requestedAmount: number;
    filledAmount: number;
    requestedPrice?: number;
    executionPrice: number;
    slippage: number;

    // Capital usage
    capitalRequired: number;
    capitalUsed: number;
    marginUsed?: number;
    marginReturned?: number;

    // Balance tracking
    baseTokenBefore: number;
    baseTokenAfter: number;
    baseTokenChange: number;

    // Liquidated balance (if all positions were closed)
    liquidatedBalanceBefore: number;
    liquidatedBalanceAfter: number;
    liquidatedBalanceChange: number;

    // Token balance in base token equivalent
    tokenBalanceInBaseBefore: number;
    tokenBalanceInBaseAfter: number;
    tokenBalanceInBaseChange: number;

    tokenBalanceBefore: number;
    tokenBalanceAfter: number;
    tokenBalanceChange: number;

    // Position tracking (futures)
    positionBefore?: string;
    positionAfter?: string;
    realizedPnL?: number;
    unrealizedPnLBefore?: number;
    unrealizedPnLAfter?: number;

    // Portfolio value
    portfolioValueBefore: number;
    portfolioValueAfter: number;
    portfolioChange: number;
    portfolioChangePercent: number;

    // Actual gain/loss for this trade
    actualGainLoss: number;
    actualGainLossPercent: number;

    // Cumulative metrics
    cumulativePnL: number;
    cumulativePnLPercent: number;
}

interface TradeReportSummary {
    totalTrades: number;
    buyTrades: number;
    sellTrades: number;
    spotTrades: number;
    futuresTrades: number;

    totalCapitalDeployed: number;
    maxCapitalUsed: number;
    avgCapitalPerTrade: number;

    totalSlippage: number;
    avgSlippage: number;

    profitableTrades: number;
    losingTrades: number;
    winRate: number;

    totalProfit: number;
    totalLoss: number;
    largestWin: number;
    largestLoss: number;

    finalPnL: number;
    finalPnLPercent: number;
}

export class TradeReportGenerator {
    private baseToken: string;
    private initialWallet: WalletBalance;
    private currentWallet: WalletBalance;
    private currentPositions: Map<string, PositionSnapshot>;
    private currentPrices: Map<string, number>;
    private reportEntries: TradeReportEntry[] = [];
    private tradeNumber: number = 0;
    private initialPortfolioValue: number = 0;
    private cumulativePnL: number = 0;
    private lastLiquidatedBalance: number = 0; // Track the last liquidated balance

    constructor(baseToken: string, initialWallet: WalletBalance, initialPrices: Record<string, number>) {
        this.baseToken = baseToken;
        this.initialWallet = { ...initialWallet };
        this.currentWallet = { ...initialWallet };
        this.currentPositions = new Map();
        this.currentPrices = new Map(Object.entries(initialPrices));
        this.initialPortfolioValue = this.calculatePortfolioValue();
        this.lastLiquidatedBalance = this.initialPortfolioValue; // Initialize with starting balance
    }

    /**
     * Update current price for a token
     */
    updatePrice(token: string, price: number): void {
        this.currentPrices.set(token, price);
    }

    /**
     * Record a trade and update internal state
     */
    recordTrade(
        trade: TradeRecord,
        walletBefore: WalletBalance,
        walletAfter: WalletBalance,
        positionsBefore: Map<string, any>,
        positionsAfter: Map<string, any>
    ): void {
        this.tradeNumber++;

        // Liq Before should be the last recorded Liq After (chaining trades)
        const liquidatedBalanceBefore = this.lastLiquidatedBalance;

        // Calculate liquidated balance AFTER using TRADE execution price (not current market price)
        // This ensures that opening a position shows no immediate gain/loss
        const liquidatedBalanceAfter = this.calculateLiquidatedBalanceAtPrice(walletAfter, positionsAfter, trade.token, trade.executionPrice);
        const liquidatedBalanceChange = liquidatedBalanceAfter - liquidatedBalanceBefore;

        // Update last liquidated balance for next trade
        this.lastLiquidatedBalance = liquidatedBalanceAfter;

        const portfolioValueBefore = this.calculatePortfolioValueWithWallet(walletBefore, positionsBefore);

        // Update current state
        this.currentWallet = { ...walletAfter };
        this.currentPositions = new Map(positionsAfter);

        const portfolioValueAfter = this.calculatePortfolioValue();

        const baseTokenBefore = walletBefore[this.baseToken] || 0;
        const baseTokenAfter = walletAfter[this.baseToken] || 0;
        const baseTokenChange = baseTokenAfter - baseTokenBefore;

        const tokenBalanceBefore = walletBefore[trade.token] || 0;
        const tokenBalanceAfter = walletAfter[trade.token] || 0;
        const tokenBalanceChange = tokenBalanceAfter - tokenBalanceBefore;

        // Calculate token balance in base token equivalent using EXECUTION PRICE
        // This ensures consistency - we value tokens at the price they were just traded at
        const tokenBalanceInBaseBefore = tokenBalanceBefore * trade.executionPrice;
        const tokenBalanceInBaseAfter = tokenBalanceAfter * trade.executionPrice;
        const tokenBalanceInBaseChange = tokenBalanceInBaseAfter - tokenBalanceInBaseBefore;

        // Calculate capital metrics
        const capitalRequired = trade.isFutures
            ? (trade.filledAmount * trade.executionPrice) / trade.leverage
            : trade.filledAmount * trade.executionPrice;

        // For spot: capitalUsed is the actual amount spent/received
        // For futures: capitalUsed is just the margin (not the full position value)
        const capitalUsed = trade.isFutures ? capitalRequired : Math.abs(baseTokenChange);
        const marginUsed = trade.isFutures ? capitalRequired : undefined;

        // Calculate margin returned and realized PnL for futures
        let marginReturned: number | undefined;
        let realizedPnL: number | undefined;
        let unrealizedPnLBefore: number | undefined;
        let unrealizedPnLAfter: number | undefined;

        if (trade.isFutures) {
            const positionBefore = positionsBefore.get(trade.token);
            const positionAfter = positionsAfter.get(trade.token);

            if (positionBefore) {
                // Use execution price for calculating unrealized PnL to be consistent
                unrealizedPnLBefore = positionBefore.amount * (trade.executionPrice - positionBefore.entryPrice);
            }

            if (positionAfter) {
                // Use execution price for calculating unrealized PnL to be consistent
                unrealizedPnLAfter = positionAfter.amount * (trade.executionPrice - positionAfter.entryPrice);
            }

            // Check if a position was closed or reduced
            if (positionBefore && (!positionAfter || Math.abs(positionAfter.amount) < Math.abs(positionBefore.amount))) {
                // Position was closed or reduced - calculate realized PnL
                const closedAmount = positionBefore.amount - (positionAfter?.amount || 0);

                if (trade.action === 'sell' && positionBefore.amount > 0) {
                    // Closing long position
                    realizedPnL = closedAmount * (trade.executionPrice - positionBefore.entryPrice);
                    marginReturned = (closedAmount * positionBefore.entryPrice) / positionBefore.leverage;
                } else if (trade.action === 'buy' && positionBefore.amount < 0) {
                    // Closing short position
                    realizedPnL = Math.abs(closedAmount) * (positionBefore.entryPrice - trade.executionPrice);
                    marginReturned = (Math.abs(closedAmount) * positionBefore.entryPrice) / positionBefore.leverage;
                }
            }
        }

        // Portfolio changes
        const portfolioChange = portfolioValueAfter - portfolioValueBefore;
        const portfolioChangePercent = (portfolioChange / portfolioValueBefore) * 100;

        // Actual gain/loss: This is the real money gained or lost
        // For spot: it's the change in base token balance
        // For futures: it's the realized PnL (if any) plus change in unrealized PnL
        let actualGainLoss: number;

        if (trade.isFutures) {
            // For futures, the actual gain/loss is:
            // - Realized PnL (if position was closed)
            // - Change in unrealized PnL (if position still open or changed)
            const unrealizedChange = (unrealizedPnLAfter || 0) - (unrealizedPnLBefore || 0);
            actualGainLoss = (realizedPnL || 0) + unrealizedChange;

            // Special case: if opening a new position, the only loss should be from slippage/fees
            // Detect this case: no position before, position after, and no realized PnL
            if (!positionsBefore.get(trade.token) && positionsAfter.get(trade.token) && !realizedPnL) {
                // Opening position - loss is only from slippage
                // Calculate expected: margin used should equal what we paid
                const expectedLoss = 0; // Ideally no loss when opening
                // Any deviation from 0 is slippage/fees
                actualGainLoss = liquidatedBalanceChange; // Show the actual change
            }
        } else {
            // For spot trades, actual gain/loss is the immediate balance change
            // (minus the capital deployed for buys, or plus proceeds for sells)
            if (trade.action === 'buy') {
                // When buying spot, we spend base token but gain token value
                // The "gain/loss" is 0 at execution (assuming fair price)
                // But show any slippage
                actualGainLoss = liquidatedBalanceChange;
            } else {
                // When selling spot, we gain base token
                // The "gain/loss" is 0 at execution (assuming fair price)
                // But show any slippage
                actualGainLoss = liquidatedBalanceChange;
            }
        }

        const actualGainLossPercent = portfolioValueBefore > 0 ? (actualGainLoss / portfolioValueBefore) * 100 : 0;

        // Cumulative PnL based on liquidated balance change
        this.cumulativePnL += liquidatedBalanceChange;
        const cumulativePnLPercent = (this.cumulativePnL / this.initialPortfolioValue) * 100;

        // Position tracking for futures
        let positionBefore: string | undefined;
        let positionAfter: string | undefined;

        if (trade.isFutures) {
            const posBefore = positionsBefore.get(trade.token);
            if (posBefore) {
                const unrealizedPnL = unrealizedPnLBefore || 0;
                positionBefore = `${posBefore.amount > 0 ? 'LONG' : 'SHORT'} ${Math.abs(posBefore.amount).toFixed(6)} @ ${posBefore.entryPrice.toFixed(2)} (PnL: ${unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)})`;
            }

            const posAfter = positionsAfter.get(trade.token);
            if (posAfter) {
                const unrealizedPnL = unrealizedPnLAfter || 0;
                positionAfter = `${posAfter.amount > 0 ? 'LONG' : 'SHORT'} ${Math.abs(posAfter.amount).toFixed(6)} @ ${posAfter.entryPrice.toFixed(2)} (PnL: ${unrealizedPnL >= 0 ? '+' : ''}${unrealizedPnL.toFixed(2)})`;
            } else {
                positionAfter = 'CLOSED';
            }
        }

        const entry: TradeReportEntry = {
            tradeNumber: this.tradeNumber,
            timestamp: new Date(trade.timestamp).toISOString(),
            action: trade.action,
            token: trade.token,
            type: trade.isFutures ? 'futures' : 'spot',
            leverage: trade.leverage,

            requestedAmount: trade.requestedAmount,
            filledAmount: trade.filledAmount,
            requestedPrice: trade.requestedPrice,
            executionPrice: trade.executionPrice,
            slippage: trade.slippage || 0,

            capitalRequired,
            capitalUsed,
            marginUsed,
            marginReturned,

            baseTokenBefore,
            baseTokenAfter,
            baseTokenChange,

            liquidatedBalanceBefore,
            liquidatedBalanceAfter,
            liquidatedBalanceChange,

            tokenBalanceInBaseBefore,
            tokenBalanceInBaseAfter,
            tokenBalanceInBaseChange,

            tokenBalanceBefore,
            tokenBalanceAfter,
            tokenBalanceChange,

            positionBefore,
            positionAfter,
            realizedPnL,
            unrealizedPnLBefore,
            unrealizedPnLAfter,

            portfolioValueBefore,
            portfolioValueAfter,
            portfolioChange,
            portfolioChangePercent,

            actualGainLoss,
            actualGainLossPercent,

            cumulativePnL: this.cumulativePnL,
            cumulativePnLPercent
        };

        // Debug log for first few trades
        if (this.tradeNumber <= 3) {
            console.log(`\n=== Trade #${this.tradeNumber} Debug ===`);
            console.log(`Action: ${trade.action} ${trade.filledAmount} ${trade.token} @ ${trade.executionPrice}`);
            console.log(`Type: ${trade.isFutures ? 'futures' : 'spot'}, Leverage: ${trade.leverage}x`);
            console.log(`Base: ${baseTokenBefore.toFixed(2)} → ${baseTokenAfter.toFixed(2)} (Δ ${baseTokenChange.toFixed(2)})`);
            console.log(`Margin Used: ${marginUsed?.toFixed(2) || 'N/A'}`);
            console.log(`Position Before:`, positionsBefore.get(trade.token) || 'None');
            console.log(`Position After:`, positionsAfter.get(trade.token) || 'None');
            console.log(`Unrealized PnL: ${unrealizedPnLBefore?.toFixed(2) || '0'} → ${unrealizedPnLAfter?.toFixed(2) || '0'}`);
            console.log(
                `Liquidated: ${liquidatedBalanceBefore.toFixed(2)} → ${liquidatedBalanceAfter.toFixed(2)} (Δ ${liquidatedBalanceChange.toFixed(2)})`
            );
            console.log(`Expected liquidated after: ${(baseTokenAfter + (unrealizedPnLAfter || 0)).toFixed(2)}`);
        }

        this.reportEntries.push(entry);
    }

    /**
     * Calculate liquidated balance - what the base token balance would be if all positions were closed
     */
    private calculateLiquidatedBalance(wallet: WalletBalance, positions: Map<string, any>): number {
        let balance = wallet[this.baseToken] || 0;

        // Add value from spot tokens
        for (const [token, amount] of Object.entries(wallet)) {
            if (token !== this.baseToken && amount > 0) {
                const price = this.currentPrices.get(token) || 0;
                balance += amount * price;
            }
        }

        // Add margin locked in positions plus unrealized PnL
        for (const [token, position] of positions) {
            const currentPrice = this.currentPrices.get(token) || position.entryPrice;
            const unrealizedPnL = position.amount * (currentPrice - position.entryPrice);

            // Add back the margin locked in the position plus any unrealized gains/losses
            balance += position.marginUsed + unrealizedPnL;
        }

        return balance;
    }

    /**
     * Calculate liquidated balance at a specific price for a token
     * This is used during trade recording to value positions at execution price
     */
    private calculateLiquidatedBalanceAtPrice(
        wallet: WalletBalance,
        positions: Map<string, any>,
        tradedToken: string,
        executionPrice: number
    ): number {
        let balance = wallet[this.baseToken] || 0;

        // Add value from spot tokens
        for (const [token, amount] of Object.entries(wallet)) {
            if (token !== this.baseToken && amount > 0) {
                // Use execution price for the traded token, current price for others
                const price = token === tradedToken ? executionPrice : this.currentPrices.get(token) || 0;
                balance += amount * price;
            }
        }

        // Add unrealized PnL from positions AND the margin locked in them
        for (const [token, position] of positions) {
            // Use execution price for the traded token position, current price for others
            const currentPrice = token === tradedToken ? executionPrice : this.currentPrices.get(token) || position.entryPrice;
            const unrealizedPnL = position.amount * (currentPrice - position.entryPrice);

            // CRITICAL: Add back the margin that's locked in the position
            // When we open a position, we remove margin from base token, but it's still "ours"
            // liquidated balance should include: base token + margin in positions + unrealized PnL
            balance += position.marginUsed + unrealizedPnL;
        }

        return balance;
    }

    /**
     * Calculate current portfolio value
     */
    private calculatePortfolioValue(): number {
        return this.calculatePortfolioValueWithWallet(this.currentWallet, this.currentPositions);
    }

    /**
     * Calculate portfolio value with specific wallet and positions
     */
    private calculatePortfolioValueWithWallet(wallet: WalletBalance, positions: Map<string, any>): number {
        let value = wallet[this.baseToken] || 0;

        // Add spot token values
        for (const [token, amount] of Object.entries(wallet)) {
            if (token !== this.baseToken && amount > 0) {
                const price = this.currentPrices.get(token) || 0;
                value += amount * price;
            }
        }

        // Add futures position values (margin + unrealized PnL)
        for (const [token, position] of positions) {
            const currentPrice = this.currentPrices.get(token) || position.entryPrice;
            const pnl = position.amount * (currentPrice - position.entryPrice);
            value += pnl; // Unrealized PnL
        }

        return value;
    }

    /**
     * Generate summary statistics
     */
    private generateSummary(): TradeReportSummary {
        const buyTrades = this.reportEntries.filter((e) => e.action === 'buy').length;
        const sellTrades = this.reportEntries.filter((e) => e.action === 'sell').length;
        const spotTrades = this.reportEntries.filter((e) => e.type === 'spot').length;
        const futuresTrades = this.reportEntries.filter((e) => e.type === 'futures').length;

        const capitalDeployed = this.reportEntries.reduce((sum, e) => sum + e.capitalUsed, 0);
        const maxCapital = Math.max(...this.reportEntries.map((e) => e.baseTokenBefore - e.capitalUsed));
        const avgCapital = capitalDeployed / this.reportEntries.length;

        const totalSlippage = this.reportEntries.reduce((sum, e) => sum + e.slippage, 0);
        const avgSlippage = totalSlippage / this.reportEntries.length;

        const profitableTrades = this.reportEntries.filter((e) => e.portfolioChange > 0).length;
        const losingTrades = this.reportEntries.filter((e) => e.portfolioChange < 0).length;
        const winRate = (profitableTrades / this.reportEntries.length) * 100;

        const totalProfit = this.reportEntries.filter((e) => e.portfolioChange > 0).reduce((sum, e) => sum + e.portfolioChange, 0);

        const totalLoss = this.reportEntries.filter((e) => e.portfolioChange < 0).reduce((sum, e) => sum + e.portfolioChange, 0);

        const largestWin = Math.max(...this.reportEntries.map((e) => e.portfolioChange), 0);
        const largestLoss = Math.min(...this.reportEntries.map((e) => e.portfolioChange), 0);

        const lastEntry = this.reportEntries[this.reportEntries.length - 1];
        const finalPnL = lastEntry?.cumulativePnL || 0;
        const finalPnLPercent = lastEntry?.cumulativePnLPercent || 0;

        return {
            totalTrades: this.reportEntries.length,
            buyTrades,
            sellTrades,
            spotTrades,
            futuresTrades,
            totalCapitalDeployed: capitalDeployed,
            maxCapitalUsed: maxCapital,
            avgCapitalPerTrade: avgCapital,
            totalSlippage,
            avgSlippage,
            profitableTrades,
            losingTrades,
            winRate,
            totalProfit,
            totalLoss,
            largestWin,
            largestLoss,
            finalPnL,
            finalPnLPercent
        };
    }

    /**
     * Generate and save the report to a file
     */
    saveReport(outputPath: string, format: 'csv' | 'json' | 'markdown' = 'markdown'): void {
        const summary = this.generateSummary();

        switch (format) {
            case 'csv':
                this.saveCSVReport(outputPath, summary);
                break;
            case 'json':
                this.saveJSONReport(outputPath, summary);
                break;
            case 'markdown':
                this.saveMarkdownReport(outputPath, summary);
                break;
        }

        console.log(`Trade report saved to: ${outputPath}`);
    }

    /**
     * Save report as CSV
     */
    private saveCSVReport(outputPath: string, summary: TradeReportSummary): void {
        const headers = [
            'Trade #',
            'Timestamp',
            'Action',
            'Token',
            'Type',
            'Leverage',
            'Requested Amount',
            'Filled Amount',
            'Requested Price',
            'Execution Price',
            'Slippage %',
            'Capital Required',
            'Capital Used',
            'Margin Used',
            'Margin Returned',
            'Base Before',
            'Base After',
            'Base Change',
            'Liquidated Before',
            'Liquidated After',
            'Liquidated Change',
            'Token Balance (Base) Before',
            'Token Balance (Base) After',
            'Token Balance (Base) Change',
            'Token Before',
            'Token After',
            'Token Change',
            'Position Before',
            'Position After',
            'Realized PnL',
            'Unrealized PnL Before',
            'Unrealized PnL After',
            'Portfolio Before',
            'Portfolio After',
            'Portfolio Change',
            'Portfolio Change %',
            'Actual Gain/Loss',
            'Actual Gain/Loss %',
            'Cumulative PnL',
            'Cumulative PnL %'
        ].join(',');

        const rows = this.reportEntries.map((e) =>
            [
                e.tradeNumber,
                e.timestamp,
                e.action.toUpperCase(),
                e.token,
                e.type,
                e.leverage,
                e.requestedAmount.toFixed(6),
                e.filledAmount.toFixed(6),
                e.requestedPrice?.toFixed(2) || '',
                e.executionPrice.toFixed(2),
                (e.slippage * 100).toFixed(4),
                e.capitalRequired.toFixed(2),
                e.capitalUsed.toFixed(2),
                e.marginUsed?.toFixed(2) || '',
                e.marginReturned?.toFixed(2) || '',
                e.baseTokenBefore.toFixed(2),
                e.baseTokenAfter.toFixed(2),
                e.baseTokenChange.toFixed(2),
                e.liquidatedBalanceBefore.toFixed(2),
                e.liquidatedBalanceAfter.toFixed(2),
                e.liquidatedBalanceChange.toFixed(2),
                e.tokenBalanceInBaseBefore.toFixed(2),
                e.tokenBalanceInBaseAfter.toFixed(2),
                e.tokenBalanceInBaseChange.toFixed(2),
                e.tokenBalanceBefore.toFixed(6),
                e.tokenBalanceAfter.toFixed(6),
                e.tokenBalanceChange.toFixed(6),
                e.positionBefore || '',
                e.positionAfter || '',
                e.realizedPnL?.toFixed(2) || '',
                e.unrealizedPnLBefore?.toFixed(2) || '',
                e.unrealizedPnLAfter?.toFixed(2) || '',
                e.portfolioValueBefore.toFixed(2),
                e.portfolioValueAfter.toFixed(2),
                e.portfolioChange.toFixed(2),
                e.portfolioChangePercent.toFixed(4),
                e.actualGainLoss.toFixed(2),
                e.actualGainLossPercent.toFixed(4),
                e.cumulativePnL.toFixed(2),
                e.cumulativePnLPercent.toFixed(4)
            ].join(',')
        );

        const csv = [headers, ...rows].join('\n');
        fs.writeFileSync(outputPath, csv);
    }

    /**
     * Save report as JSON
     */
    private saveJSONReport(outputPath: string, summary: TradeReportSummary): void {
        const report = {
            summary,
            trades: this.reportEntries,
            metadata: {
                baseToken: this.baseToken,
                initialPortfolioValue: this.initialPortfolioValue,
                initialWallet: this.initialWallet,
                finalWallet: this.currentWallet,
                generatedAt: new Date().toISOString()
            }
        };

        fs.writeFileSync(outputPath, JSON.stringify(report, null, 2));
    }

    /**
     * Save report as Markdown
     */
    private saveMarkdownReport(outputPath: string, summary: TradeReportSummary): void {
        const lines: string[] = [];

        // Title
        lines.push('# Trading Strategy Report\n');
        lines.push(`**Generated:** ${new Date().toISOString()}\n`);
        lines.push(`**Base Token:** ${this.baseToken}\n`);

        // Summary Section
        lines.push('## Summary\n');
        lines.push('| Metric | Value |');
        lines.push('|--------|-------|');
        lines.push(`| Total Trades | ${summary.totalTrades} |`);
        lines.push(`| Buy Trades | ${summary.buyTrades} |`);
        lines.push(`| Sell Trades | ${summary.sellTrades} |`);
        lines.push(`| Spot Trades | ${summary.spotTrades} |`);
        lines.push(`| Futures Trades | ${summary.futuresTrades} |`);
        lines.push(`| Win Rate | ${summary.winRate.toFixed(2)}% |`);
        lines.push(`| Profitable Trades | ${summary.profitableTrades} |`);
        lines.push(`| Losing Trades | ${summary.losingTrades} |`);
        lines.push(`| **Final PnL** | **${summary.finalPnL.toFixed(2)} ${this.baseToken}** |`);
        lines.push(`| **Final PnL %** | **${summary.finalPnLPercent.toFixed(2)}%** |`);
        lines.push('');

        // Capital Usage
        lines.push('## Capital Usage\n');
        lines.push('| Metric | Value |');
        lines.push('|--------|-------|');
        lines.push(`| Total Capital Deployed | ${summary.totalCapitalDeployed.toFixed(2)} ${this.baseToken} |`);
        lines.push(`| Max Capital Used | ${summary.maxCapitalUsed.toFixed(2)} ${this.baseToken} |`);
        lines.push(`| Avg Capital Per Trade | ${summary.avgCapitalPerTrade.toFixed(2)} ${this.baseToken} |`);
        lines.push(`| Total Slippage | ${(summary.totalSlippage * 100).toFixed(4)}% |`);
        lines.push(`| Avg Slippage | ${(summary.avgSlippage * 100).toFixed(4)}% |`);
        lines.push('');

        // Performance Metrics
        lines.push('## Performance Metrics\n');
        lines.push('| Metric | Value |');
        lines.push('|--------|-------|');
        lines.push(`| Total Profit | ${summary.totalProfit.toFixed(2)} ${this.baseToken} |`);
        lines.push(`| Total Loss | ${summary.totalLoss.toFixed(2)} ${this.baseToken} |`);
        lines.push(`| Largest Win | ${summary.largestWin.toFixed(2)} ${this.baseToken} |`);
        lines.push(`| Largest Loss | ${summary.largestLoss.toFixed(2)} ${this.baseToken} |`);
        lines.push(`| Profit Factor | ${(summary.totalProfit / Math.abs(summary.totalLoss)).toFixed(2)} |`);
        lines.push('');

        // Detailed Trade Log
        lines.push('## Detailed Trade Log\n');
        lines.push('| # | Time | Action | Token | Type | Amount | Price | Token Value | Liq Before | Liq After | Cum PnL |');
        lines.push('|---|------|--------|-------|------|--------|-------|-------------|------------|-----------|---------|');

        for (const entry of this.reportEntries) {
            const time = new Date(entry.timestamp).toLocaleString();
            const action = entry.action.toUpperCase();
            const cumPnL = entry.cumulativePnL >= 0 ? `+${entry.cumulativePnL.toFixed(2)}` : entry.cumulativePnL.toFixed(2);

            lines.push(
                `| ${entry.tradeNumber} | ${time} | ${action} | ${entry.token} | ${entry.type} | ` +
                    `${entry.filledAmount.toFixed(4)} | ${entry.executionPrice.toFixed(2)} | ` +
                    `${entry.tokenBalanceInBaseAfter.toFixed(2)} | ${entry.liquidatedBalanceBefore.toFixed(2)} | ` +
                    `${entry.liquidatedBalanceAfter.toFixed(2)} | ${cumPnL} (${entry.cumulativePnLPercent.toFixed(2)}%) |`
            );
        }
        lines.push('');
        lines.push('**Note:** *Token Value* shows the wallet balance of the traded token converted to base token equivalent.\n');

        // Position Details (for futures trades)
        const futuresTrades = this.reportEntries.filter((e) => e.type === 'futures');
        if (futuresTrades.length > 0) {
            lines.push('## Futures Positions Detail\n');
            lines.push(
                '| # | Time | Action | Token | Leverage | Position Before | Position After | Realized PnL | Unrealized Before | Unrealized After |'
            );
            lines.push(
                '|---|------|--------|-------|----------|-----------------|----------------|--------------|-------------------|------------------|'
            );

            for (const entry of futuresTrades) {
                const time = new Date(entry.timestamp).toLocaleString();
                const realizedPnL =
                    entry.realizedPnL !== undefined
                        ? entry.realizedPnL >= 0
                            ? `+${entry.realizedPnL.toFixed(2)}`
                            : entry.realizedPnL.toFixed(2)
                        : '-';
                const unrealizedBefore =
                    entry.unrealizedPnLBefore !== undefined
                        ? entry.unrealizedPnLBefore >= 0
                            ? `+${entry.unrealizedPnLBefore.toFixed(2)}`
                            : entry.unrealizedPnLBefore.toFixed(2)
                        : '-';
                const unrealizedAfter =
                    entry.unrealizedPnLAfter !== undefined
                        ? entry.unrealizedPnLAfter >= 0
                            ? `+${entry.unrealizedPnLAfter.toFixed(2)}`
                            : entry.unrealizedPnLAfter.toFixed(2)
                        : '-';

                lines.push(
                    `| ${entry.tradeNumber} | ${time} | ${entry.action.toUpperCase()} | ${entry.token} | ` +
                        `${entry.leverage}x | ${entry.positionBefore || 'NONE'} | ${entry.positionAfter || 'NONE'} | ` +
                        `${realizedPnL} | ${unrealizedBefore} | ${unrealizedAfter} |`
                );
            }
            lines.push('');
        }

        // Balance Evolution
        lines.push('## Balance Evolution\n');
        lines.push(`| # | ${this.baseToken} Balance | Liquidated Balance | Cumulative PnL |`);
        lines.push('|---|----------------------|--------------------|----------------|');
        lines.push(`| 0 (Initial) | ${this.initialWallet[this.baseToken]?.toFixed(2) || '0.00'} | ${this.initialPortfolioValue.toFixed(2)} | 0.00 |`);

        for (const entry of this.reportEntries) {
            const cumPnL = entry.cumulativePnL >= 0 ? `+${entry.cumulativePnL.toFixed(2)}` : entry.cumulativePnL.toFixed(2);
            lines.push(`| ${entry.tradeNumber} | ${entry.baseTokenAfter.toFixed(2)} | ${entry.liquidatedBalanceAfter.toFixed(2)} | ${cumPnL} |`);
        }

        fs.writeFileSync(outputPath, lines.join('\n'));
    }

    /**
     * Get current report entries for inspection
     */
    getEntries(): TradeReportEntry[] {
        return [...this.reportEntries];
    }

    /**
     * Get summary without saving
     */
    getSummary(): TradeReportSummary {
        return this.generateSummary();
    }
}
