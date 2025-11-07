import { Request, Response } from 'express';
import { ZodError } from 'zod';
import { SessionStore } from '../../services/session_store';
import { createSessionSchema, ProxyError } from '../../types';
import { getErrorMetadata } from '../../utils/errors';
import { logError } from '../../utils/logging';

/**
 * Controller for session management endpoints.
 */
export class SessionController {
    private sessionStore: SessionStore;

    constructor(sessionStore: SessionStore) {
        this.sessionStore = sessionStore;
    }

    /**
     * POST /api/session
     */
    async createSession(req: Request, res: Response): Promise<void> {
        try {
            const data = createSessionSchema.parse(req.body);

            try {
                const existingSession = this.sessionStore.getSession(data.sessionId);

                if (existingSession.userId !== data.userId) {
                    res.status(409).json({
                        error: 'Session id already exists for a different user',
                        code: 'SESSION_CONFLICT'
                    });

                    return;
                }

                res.status(200).json({
                    message: 'Session already exists',
                    session: {
                        userId: existingSession.userId,
                        sessionId: existingSession.sessionId,
                        budget: existingSession.budget,
                        usedBudget: existingSession.usedBudget,
                        remainingBudget: existingSession.budget - existingSession.usedBudget,
                        createdAt: existingSession.createdAt.toISOString()
                    }
                });

                return;
            } catch {
                // Session doesn't exist, proceed with creation
            }

            const session = this.sessionStore.createSession(data.userId, data.sessionId, data.budget);

            res.status(201).json({
                message: 'Session created successfully',
                session: {
                    userId: session.userId,
                    sessionId: session.sessionId,
                    budget: session.budget,
                    usedBudget: session.usedBudget,
                    remainingBudget: session.budget - session.usedBudget,
                    createdAt: session.createdAt.toISOString()
                }
            });
        } catch (err) {
            this.handleError(err, res);
        }
    }

    /**
     * GET /api/session/:sessionId
     */
    async getSession(req: Request, res: Response): Promise<void> {
        try {
            const { sessionId } = req.params;
            const userId = req.query.userId as string;

            if (!userId) {
                throw new ProxyError('Missing userId query parameter', 400, 'MISSING_USER_ID');
            }

            if (!this.sessionStore.validateSession(userId, sessionId)) {
                throw new ProxyError('Session not found or does not belong to user', 404, 'SESSION_NOT_FOUND');
            }

            const session = this.sessionStore.getSession(sessionId);

            res.status(200).json({
                session: {
                    userId: session.userId,
                    sessionId: session.sessionId,
                    budget: session.budget,
                    usedBudget: session.usedBudget,
                    remainingBudget: session.budget - session.usedBudget,
                    createdAt: session.createdAt.toISOString()
                }
            });
        } catch (err) {
            this.handleError(err, res);
        }
    }

    private handleError(err: unknown, res: Response): void {
        if (err instanceof ZodError) {
            res.status(400).json({
                error: 'Invalid request data',
                code: 'VALIDATION_ERROR',
                details: err.errors
            });
        } else if (err instanceof ProxyError) {
            res.status(err.statusCode).json({
                error: err.message,
                code: err.code
            });
        } else {
            logError('Unexpected error in session controller', getErrorMetadata(err as Error));

            res.status(500).json({
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    }
}
