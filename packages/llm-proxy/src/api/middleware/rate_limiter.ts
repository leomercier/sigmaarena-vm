import { NextFunction, Request, Response } from 'express';
import config from '../../config/config';
import { RateLimitError } from '../../types';
import { delays } from '../../utils/delays';

interface RateLimitEntry {
    count: number;
    resetTime: number;
}

interface ConcurrentRequestEntry {
    count: number;
}

/**
 * Rate limiter middleware with sliding window algorithm.
 * Enforces per-user and per-session rate limits, plus concurrent request limits.
 */
export class RateLimiter {
    private userLimits: Map<string, RateLimitEntry>;
    private sessionLimits: Map<string, RateLimitEntry>;
    private concurrentRequests: Map<string, ConcurrentRequestEntry>;

    private readonly userRateLimit: number;
    private readonly sessionRateLimit: number;
    private readonly maxConcurrentPerUser: number;
    private readonly windowMs: number = delays.oneMinute;

    constructor() {
        this.userLimits = new Map();
        this.sessionLimits = new Map();
        this.concurrentRequests = new Map();

        this.userRateLimit = config.rateLimitPerUserPerMin;
        this.sessionRateLimit = config.rateLimitPerSessionPerMin;
        this.maxConcurrentPerUser = config.maxConcurrentRequestsPerUser;

        // Cleanup stale entries every 5 minutes
        setInterval(() => this.cleanup(), delays.fiveMinutes);
    }

    /**
     * Check rate limits and concurrent request limits
     */
    checkLimits(req: Request, res: Response, next: NextFunction): void {
        try {
            const userId = req.userId || req.body?.userId || (req.query?.userId as string);
            const sessionId = req.sessionId || req.body?.sessionId || (req.query?.sessionId as string);

            if (!userId || !sessionId) {
                // If no auth info, let sessionAuth middleware handle it
                next();

                return;
            }

            this.checkConcurrentLimit(userId);

            this.checkUserRateLimit(userId);
            this.checkSessionRateLimit(sessionId);

            this.incrementUserLimit(userId);
            this.incrementSessionLimit(sessionId);
            this.incrementConcurrent(userId);

            res.on('finish', () => {
                this.decrementConcurrent(userId);
            });

            res.on('close', () => {
                this.decrementConcurrent(userId);
            });

            next();
        } catch (err) {
            if (err instanceof RateLimitError) {
                res.status(err.statusCode).json({
                    error: err.message,
                    code: err.code
                });
            } else {
                next(err);
            }
        }
    }

    private checkConcurrentLimit(userId: string): void {
        const entry = this.concurrentRequests.get(userId);
        const currentCount = entry?.count || 0;

        if (currentCount >= this.maxConcurrentPerUser) {
            throw new RateLimitError(`Concurrent request limit exceeded for user ${userId}. Maximum: ${this.maxConcurrentPerUser}`);
        }
    }

    private checkUserRateLimit(userId: string): void {
        const entry = this.userLimits.get(userId);
        const now = Date.now();

        if (entry && entry.resetTime > now) {
            if (entry.count >= this.userRateLimit) {
                const resetInSeconds = Math.ceil((entry.resetTime - now) / delays.oneSecond);
                throw new RateLimitError(`User rate limit exceeded. Limit: ${this.userRateLimit} requests/min. Try again in ${resetInSeconds}s`);
            }
        }
    }

    private checkSessionRateLimit(sessionId: string): void {
        const entry = this.sessionLimits.get(sessionId);
        const now = Date.now();

        if (entry && entry.resetTime > now) {
            if (entry.count >= this.sessionRateLimit) {
                const resetInSeconds = Math.ceil((entry.resetTime - now) / delays.oneSecond);
                throw new RateLimitError(
                    `Session rate limit exceeded. Limit: ${this.sessionRateLimit} requests/min. Try again in ${resetInSeconds}s`
                );
            }
        }
    }

    private incrementUserLimit(userId: string): void {
        const now = Date.now();
        const entry = this.userLimits.get(userId);

        if (!entry || entry.resetTime <= now) {
            this.userLimits.set(userId, {
                count: 1,
                resetTime: now + this.windowMs
            });
        } else {
            entry.count++;
        }
    }

    private incrementSessionLimit(sessionId: string): void {
        const now = Date.now();
        const entry = this.sessionLimits.get(sessionId);

        if (!entry || entry.resetTime <= now) {
            this.sessionLimits.set(sessionId, {
                count: 1,
                resetTime: now + this.windowMs
            });
        } else {
            entry.count++;
        }
    }

    private incrementConcurrent(userId: string): void {
        const entry = this.concurrentRequests.get(userId);

        if (!entry) {
            this.concurrentRequests.set(userId, { count: 1 });
        } else {
            entry.count++;
        }
    }

    private decrementConcurrent(userId: string): void {
        const entry = this.concurrentRequests.get(userId);

        if (entry) {
            entry.count = Math.max(0, entry.count - 1);

            if (entry.count === 0) {
                this.concurrentRequests.delete(userId);
            }
        }
    }

    private cleanup(): void {
        const now = Date.now();

        for (const [userId, entry] of this.userLimits.entries()) {
            if (entry.resetTime <= now) {
                this.userLimits.delete(userId);
            }
        }

        for (const [sessionId, entry] of this.sessionLimits.entries()) {
            if (entry.resetTime <= now) {
                this.sessionLimits.delete(sessionId);
            }
        }
    }

    getUserStats(userId: string): {
        requestsInWindow: number;
        maxRequests: number;
        concurrentRequests: number;
        maxConcurrent: number;
        resetTime?: number;
    } {
        const userLimit = this.userLimits.get(userId);
        const concurrent = this.concurrentRequests.get(userId);

        return {
            requestsInWindow: userLimit?.count || 0,
            maxRequests: this.userRateLimit,
            concurrentRequests: concurrent?.count || 0,
            maxConcurrent: this.maxConcurrentPerUser,
            resetTime: userLimit?.resetTime
        };
    }

    reset(): void {
        this.userLimits.clear();
        this.sessionLimits.clear();
        this.concurrentRequests.clear();
    }
}
