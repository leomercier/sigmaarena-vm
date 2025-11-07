import { Request, Response } from 'express';
import { SessionStore } from '../../services/session_store';
import { UsageTracker } from '../../services/usage_tracker';
import { ProxyError } from '../../types';
import { getErrorMetadata } from '../../utils/errors';
import { logError } from '../../utils/logging';

/**
 * Controller for usage tracking and reporting endpoints.
 */
export class UsageController {
    private sessionStore: SessionStore;
    private usageTracker: UsageTracker;

    constructor(sessionStore: SessionStore, usageTracker: UsageTracker) {
        this.sessionStore = sessionStore;
        this.usageTracker = usageTracker;
    }

    /**
     * GET /api/usage/session/:sessionId
     */
    async getSessionUsage(req: Request, res: Response): Promise<void> {
        try {
            const { sessionId } = req.params;
            const userId = req.query.userId as string;

            if (!userId) {
                throw new ProxyError('Missing userId query parameter', 400, 'MISSING_USER_ID');
            }

            if (!this.sessionStore.validateSession(userId, sessionId)) {
                throw new ProxyError('Session not found or does not belong to user', 404, 'SESSION_NOT_FOUND');
            }

            const report = this.usageTracker.getSessionReport(sessionId);

            res.status(200).json({
                report: {
                    ...report,
                    requests: report.requests.map((r) => ({
                        ...r,
                        timestamp: r.timestamp.toISOString()
                    }))
                }
            });
        } catch (err) {
            this.handleError(err, res);
        }
    }

    /**
     * GET /api/usage/user/:userId
     */
    async getUserUsage(req: Request, res: Response): Promise<void> {
        try {
            const { userId } = req.params;

            const userSessions = this.sessionStore.getUserSessions(userId);

            if (userSessions.length === 0) {
                res.status(200).json({
                    report: {
                        userId,
                        sessions: [],
                        totalCost: 0,
                        totalRequests: 0
                    }
                });
                return;
            }

            const report = this.usageTracker.getUserReport(userId);

            res.status(200).json({
                report
            });
        } catch (err) {
            this.handleError(err, res);
        }
    }

    /**
     * GET /api/usage/summary
     */
    async getSummary(req: Request, res: Response): Promise<void> {
        try {
            const sessionCount = this.sessionStore.getSessionCount();
            const trackedSessionCount = this.usageTracker.getTrackedSessionCount();

            res.status(200).json({
                summary: {
                    totalSessions: sessionCount,
                    sessionsWithUsage: trackedSessionCount,
                    timestamp: new Date().toISOString()
                }
            });
        } catch (err) {
            this.handleError(err, res);
        }
    }

    private handleError(err: unknown, res: Response): void {
        if (err instanceof ProxyError) {
            res.status(err.statusCode).json({
                error: err.message,
                code: err.code
            });
        } else {
            logError('Unexpected error in usage controller', getErrorMetadata(err as Error));

            res.status(500).json({
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    }
}
