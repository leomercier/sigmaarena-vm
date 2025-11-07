import { InferenceMode, Provider, SessionUsageReport, UsageRecord, UserUsageReport } from '../types';
import { SessionStore } from './session_store';

/**
 * Tracks detailed usage statistics per session and user.
 */
export class UsageTracker {
    private sessionUsage: Map<string, UsageRecord[]>;
    private sessionStore: SessionStore;

    constructor(sessionStore: SessionStore) {
        this.sessionUsage = new Map();
        this.sessionStore = sessionStore;
    }

    recordUsage(
        sessionId: string,
        requestId: string,
        provider: Provider,
        model: string,
        mode: InferenceMode,
        promptTokens: number,
        completionTokens: number,
        cost: number,
        toolCallsCount: number,
        durationMs: number
    ): void {
        const record: UsageRecord = {
            requestId,
            timestamp: new Date(),
            provider,
            model,
            mode,
            tokens: {
                prompt: promptTokens,
                completion: completionTokens,
                total: promptTokens + completionTokens
            },
            cost,
            toolCallsCount,
            durationMs
        };

        if (!this.sessionUsage.has(sessionId)) {
            this.sessionUsage.set(sessionId, []);
        }

        this.sessionUsage.get(sessionId)!.push(record);
    }

    getSessionReport(sessionId: string): SessionUsageReport {
        const session = this.sessionStore.getSession(sessionId);
        const records = this.sessionUsage.get(sessionId) ?? [];

        const totalCost = records.reduce((sum, record) => sum + record.cost, 0);
        const aggregatesByModel = this.aggregateByModel(records);

        return {
            userId: session.userId,
            sessionId: session.sessionId,
            totalCost,
            remainingBudget: session.budget - session.usedBudget,
            requestCount: records.length,
            requests: records,
            aggregatesByModel
        };
    }

    getUserReport(userId: string): UserUsageReport {
        const userSessions = this.sessionStore.getUserSessions(userId);
        const sessions: Array<{ sessionId: string; totalCost: number; requestCount: number }> = [];

        let totalCost = 0;
        let totalRequests = 0;

        for (const session of userSessions) {
            const records = this.sessionUsage.get(session.sessionId) ?? [];
            const sessionCost = records.reduce((sum, record) => sum + record.cost, 0);

            sessions.push({
                sessionId: session.sessionId,
                totalCost: sessionCost,
                requestCount: records.length
            });

            totalCost += sessionCost;
            totalRequests += records.length;
        }

        return {
            userId,
            sessions,
            totalCost,
            totalRequests
        };
    }

    private aggregateByModel(records: UsageRecord[]): Record<string, { requests: number; tokens: number; cost: number }> {
        const aggregates: Record<string, { requests: number; tokens: number; cost: number }> = {};

        for (const record of records) {
            const modelKey = `${record.provider}:${record.model}`;

            if (!aggregates[modelKey]) {
                aggregates[modelKey] = {
                    requests: 0,
                    tokens: 0,
                    cost: 0
                };
            }

            aggregates[modelKey].requests += 1;
            aggregates[modelKey].tokens += record.tokens.total;
            aggregates[modelKey].cost += record.cost;
        }

        return aggregates;
    }

    clearSessionUsage(sessionId: string): void {
        this.sessionUsage.delete(sessionId);
    }

    clearAll(): void {
        this.sessionUsage.clear();
    }

    getTrackedSessionCount(): number {
        return this.sessionUsage.size;
    }

    /**
     * Clean up usage data for sessions that no longer exist. Should be called periodically to prevent memory leaks.
     */
    cleanupOrphanedSessions(): void {
        const sessionIds = Array.from(this.sessionUsage.keys());

        for (const sessionId of sessionIds) {
            try {
                this.sessionStore.getSession(sessionId);
            } catch {
                // Session no longer exists, remove usage data
                this.sessionUsage.delete(sessionId);
            }
        }
    }
}
