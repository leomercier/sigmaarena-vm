import { Router } from 'express';
import { CostCalculator } from '../services/cost_calculator';
import { SessionStore } from '../services/session_store';
import { ToolRegistry } from '../services/tool_registry';
import { UsageTracker } from '../services/usage_tracker';
import { InferenceController } from './controllers/inference';
import { SessionController } from './controllers/session';
import { UsageController } from './controllers/usage';
import { RateLimiter } from './middleware/rate_limiter';
import { SessionAuthMiddleware } from './middleware/session_auth';

export function createRouter(): Router {
    const router = Router();

    const sessionStore = new SessionStore();
    const costCalculator = new CostCalculator();
    const usageTracker = new UsageTracker(sessionStore);
    const toolRegistry = new ToolRegistry();

    // Initialize middleware
    const sessionAuth = new SessionAuthMiddleware(sessionStore);
    const rateLimiter = new RateLimiter();

    // Initialize controllers
    const sessionController = new SessionController(sessionStore);
    const inferenceController = new InferenceController(sessionStore, costCalculator, usageTracker, toolRegistry);
    const usageController = new UsageController(sessionStore, usageTracker);

    router.get('/status', (req, res) => {
        res.status(200).json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });

    // Session routes
    router.post('/session', sessionController.createSession.bind(sessionController));
    router.get('/session/:sessionId', sessionController.getSession.bind(sessionController));

    // Inference route (requires rate limiting and authentication)
    router.post(
        '/inference',
        rateLimiter.checkLimits.bind(rateLimiter),
        sessionAuth.authenticate.bind(sessionAuth),
        inferenceController.inference.bind(inferenceController)
    );

    // Usage routes (requires authentication via query params)
    router.get('/usage/session/:sessionId', usageController.getSessionUsage.bind(usageController));
    router.get('/usage/user/:userId', usageController.getUserUsage.bind(usageController));
    router.get('/usage/summary', usageController.getSummary.bind(usageController));

    return router;
}

export function createServices() {
    const sessionStore = new SessionStore();
    const costCalculator = new CostCalculator();
    const usageTracker = new UsageTracker(sessionStore);
    const toolRegistry = new ToolRegistry();

    return {
        sessionStore,
        costCalculator,
        usageTracker,
        toolRegistry
    };
}
