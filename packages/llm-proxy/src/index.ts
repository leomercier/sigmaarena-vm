import express, { NextFunction, Request, Response } from 'express';
import { createRouter } from './api/routes';
import config from './config/config';
import { ProxyError } from './types';
import { getErrorMetadata } from './utils/errors';
import { logDebug, logError } from './utils/logging';

/**
 * Initialize and start the Express server
 */
export function startServer() {
    const app = express();

    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    app.use((req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();

        res.on('finish', () => {
            const duration = Date.now() - start;
            const logMessage = `${req.method} ${req.path} ${res.statusCode} ${duration}ms`;

            logDebug(logMessage);
        });

        next();
    });

    const apiRouter = createRouter();
    app.use('/api', apiRouter);

    app.get('/', (req: Request, res: Response) => {
        res.status(200).json({
            name: 'LLM Proxy Service',
            version: '1.0.0',
            status: 'running',
            endpoints: {
                health: '/api/health',
                session: {
                    create: 'POST /api/session',
                    get: 'GET /api/session/:sessionId'
                },
                inference: 'POST /api/inference',
                usage: {
                    session: 'GET /api/usage/session/:sessionId',
                    user: 'GET /api/usage/user/:userId',
                    summary: 'GET /api/usage/summary'
                }
            }
        });
    });

    app.use((req: Request, res: Response) => {
        res.status(404).json({
            error: 'Endpoint not found',
            code: 'NOT_FOUND',
            path: req.path
        });
    });

    app.use((err: Error, req: Request, res: Response, _next: NextFunction) => {
        logError('Global error handler', getErrorMetadata(err as Error));

        if (err instanceof ProxyError) {
            res.status(err.statusCode).json({
                error: err.message,
                code: err.code
            });
        } else if (err instanceof SyntaxError && 'body' in err) {
            res.status(400).json({
                error: 'Invalid JSON in request body',
                code: 'INVALID_JSON'
            });
        } else {
            res.status(500).json({
                error: 'Internal server error',
                code: 'INTERNAL_ERROR'
            });
        }
    });

    app.listen(config.port, () => {
        console.log('='.repeat(50));
        console.log('LLM Proxy Service Started');
        console.log('='.repeat(50));

        console.log(`Port: ${config.port}`);
        console.log(`Environment: ${config.nodeEnv}`);

        console.log(`Default Budget: $${config.defaultSessionBudget}`);
        console.log(`Max Sessions: ${config.maxSessions}`);
        console.log('='.repeat(50));

        console.log('Rate Limits:');
        console.log(`  Per User: ${config.rateLimitPerUserPerMin} req/min`);
        console.log(`  Per Session: ${config.rateLimitPerSessionPerMin} req/min`);
        console.log(`  Concurrent: ${config.maxConcurrentRequestsPerUser} per user`);
        console.log('='.repeat(50));

        console.log(`API Documentation: http://localhost:${config.port}/`);
        console.log(`Status Check: http://localhost:${config.port}/api/status`);
        console.log('='.repeat(50));
    });

    process.on('SIGTERM', () => {
        console.log('SIGTERM signal received: closing HTTP server');
        process.exit(0);
    });

    process.on('SIGINT', () => {
        console.log('SIGINT signal received: closing HTTP server');
        process.exit(0);
    });

    return app;
}

if (require.main === module) {
    startServer();
}
