import { NextFunction, Request, Response } from 'express';
import { SessionStore } from '../../services/session_store';
import { ProxyError } from '../../types';

/**
 * Middleware to authenticate requests using userId and sessionId.
 * Validates that the session exists and belongs to the specified user.
 */
export class SessionAuthMiddleware {
    private sessionStore: SessionStore;

    constructor(sessionStore: SessionStore) {
        this.sessionStore = sessionStore;
    }

    authenticate(req: Request, res: Response, next: NextFunction): void {
        try {
            const userId = this.extractUserId(req);
            const sessionId = this.extractSessionId(req);

            if (!userId || !sessionId) {
                throw new ProxyError('Missing userId or sessionId in request', 401, 'MISSING_CREDENTIALS');
            }

            const isValid = this.sessionStore.validateSession(userId, sessionId);
            if (!isValid) {
                throw new ProxyError('Invalid session or session does not belong to user', 403, 'INVALID_SESSION');
            }

            req.userId = userId;
            req.sessionId = sessionId;

            next();
        } catch (err) {
            if (err instanceof ProxyError) {
                res.status(err.statusCode).json({
                    error: err.message,
                    code: err.code
                });
            } else {
                res.status(500).json({
                    error: 'Internal server error during authentication'
                });
            }
        }
    }

    private extractUserId(req: Request): string | undefined {
        return req.body?.userId || (req.query?.userId as string);
    }

    private extractSessionId(req: Request): string | undefined {
        return req.body?.sessionId || (req.query?.sessionId as string);
    }
}

/**
 * Extend Express Request type to include authenticated user data
 */
declare global {
    namespace Express {
        interface Request {
            userId?: string;
            sessionId?: string;
        }
    }
}
