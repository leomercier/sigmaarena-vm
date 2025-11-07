import config from '../config/config';
import { Session, SessionNotFoundError } from '../types';

/**
 * In-memory session storage with LRU eviction policy.
 * Maintains up to MAX_SESSIONS sessions, evicting least recently used when full.
 */
export class SessionStore {
    private sessions: Map<string, Session>;
    private accessOrder: string[];
    private readonly maxSessions: number;

    constructor() {
        this.sessions = new Map();
        this.accessOrder = [];
        this.maxSessions = config.maxSessions;
    }

    createSession(userId: string, sessionId: string, budget?: number): Session {
        const session: Session = {
            userId,
            sessionId,
            createdAt: new Date(),
            budget: budget ?? config.defaultSessionBudget,
            usedBudget: 0
        };

        // Check if we need to evict
        if (this.sessions.size >= this.maxSessions && !this.sessions.has(sessionId)) {
            this.evictLRU();
        }

        this.sessions.set(sessionId, session);

        this.updateAccessOrder(sessionId);

        return session;
    }

    getSession(sessionId: string): Session {
        const session = this.sessions.get(sessionId);

        if (!session) {
            throw new SessionNotFoundError(sessionId);
        }

        this.updateAccessOrder(sessionId);

        return session;
    }

    validateSession(userId: string, sessionId: string): boolean {
        const session = this.sessions.get(sessionId);

        if (!session) {
            return false;
        }

        return session.userId === userId;
    }

    updateBudget(sessionId: string, additionalCost: number): void {
        const session = this.getSession(sessionId);
        session.usedBudget += additionalCost;
    }

    getRemainingBudget(sessionId: string): number {
        const session = this.getSession(sessionId);
        return Math.max(0, session.budget - session.usedBudget);
    }

    hasSufficientBudget(sessionId: string, requiredAmount: number): boolean {
        return this.getRemainingBudget(sessionId) >= requiredAmount;
    }

    getUserSessions(userId: string): Session[] {
        const userSessions: Session[] = [];

        for (const session of this.sessions.values()) {
            if (session.userId === userId) {
                userSessions.push(session);
            }
        }

        return userSessions;
    }

    getSessionCount(): number {
        return this.sessions.size;
    }

    private updateAccessOrder(sessionId: string): void {
        const index = this.accessOrder.indexOf(sessionId);
        if (index > -1) {
            this.accessOrder.splice(index, 1);
        }

        // Add to end (most recently used)
        this.accessOrder.push(sessionId);
    }

    /**
     * Evict least recently used session
     */
    private evictLRU(): void {
        if (this.accessOrder.length === 0) {
            return;
        }

        const lruSessionId = this.accessOrder.shift();
        if (lruSessionId) {
            this.sessions.delete(lruSessionId);
        }
    }

    clear(): void {
        this.sessions.clear();
        this.accessOrder = [];
    }
}
