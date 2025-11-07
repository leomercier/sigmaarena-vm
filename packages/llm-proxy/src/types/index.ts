import { z } from 'zod';

export interface Session {
    userId: string;
    sessionId: string;
    createdAt: Date;
    budget: number;
    usedBudget: number;
}

export const createSessionSchema = z.object({
    userId: z.string().min(1),
    sessionId: z.string().min(1),
    budget: z.number().positive().optional()
});

export type CreateSessionRequest = z.infer<typeof createSessionSchema>;

export type InferenceMode = 'generateText' | 'generateObject';
export type Provider = 'openai' | 'anthropic' | 'fireworks' | 'deepseek' | 'togetherai';

export interface InferenceMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

export const inferenceRequestSchema = z.object({
    userId: z.string().min(1),
    sessionId: z.string().min(1),

    provider: z.enum(['openai', 'anthropic', 'fireworks', 'deepseek', 'togetherai']),
    model: z.string().min(1),
    mode: z.enum(['generateText', 'generateObject']),

    messages: z.array(
        z.object({
            role: z.enum(['system', 'user', 'assistant']),
            content: z.string()
        })
    ),

    schema: z.record(z.any()).optional(), // For generateObject mode
    tools: z.array(z.string()).optional(), // Tool names from ToolRegistry

    maxTokens: z.number().int().positive().optional(),
    temperature: z.number().min(0).max(2).optional()
});

export type InferenceRequest = z.infer<typeof inferenceRequestSchema>;

export interface InferenceResponse {
    requestId: string;
    content: string | object; // string for text, object for generateObject
    usage: {
        promptTokens: number;
        completionTokens: number;
        totalTokens: number;
    };
    cost: number;
    remainingBudget: number;
    toolCalls?: ToolCall[];
}

export interface ToolCall {
    id: string;
    name: string;
    arguments: Record<string, any>;
}

export interface ToolDefinition {
    name: string;
    description: string;

    inputSchema: z.ZodObject<any>;

    execute: (args: Record<string, any>) => Promise<any>;
}

export interface UsageRecord {
    requestId: string;
    timestamp: Date;

    provider: Provider;
    model: string;
    mode: InferenceMode;

    tokens: {
        prompt: number;
        completion: number;
        total: number;
    };
    cost: number;

    toolCallsCount: number;
    durationMs: number;
}

export interface SessionUsageReport {
    userId: string;
    sessionId: string;

    totalCost: number;
    remainingBudget: number;
    requestCount: number;
    requests: UsageRecord[];

    aggregatesByModel: Record<
        string,
        {
            requests: number;
            tokens: number;
            cost: number;
        }
    >;
}

export interface UserUsageReport {
    userId: string;
    sessions: Array<{
        sessionId: string;
        totalCost: number;
        requestCount: number;
    }>;
    totalCost: number;
    totalRequests: number;
}

export interface ModelPricing {
    input: number; // Cost per 1K tokens
    output: number; // Cost per 1K tokens
}

export interface PricingConfig {
    models: Record<string, ModelPricing>;
}

export class ProxyError extends Error {
    constructor(
        message: string,
        public statusCode: number = 500,
        public code?: string
    ) {
        super(message);
        this.name = 'ProxyError';
    }
}

export class BudgetExceededError extends ProxyError {
    constructor(sessionId: string, available: number) {
        super(`Budget exceeded for session ${sessionId}. Available: $${available.toFixed(4)}`, 402, 'BUDGET_EXCEEDED');
    }
}

export class SessionNotFoundError extends ProxyError {
    constructor(sessionId: string) {
        super(`Session not found: ${sessionId}`, 404, 'SESSION_NOT_FOUND');
    }
}

export class RateLimitError extends ProxyError {
    constructor(message: string) {
        super(message, 429, 'RATE_LIMIT_EXCEEDED');
    }
}

export class ModelNotConfiguredError extends ProxyError {
    constructor(provider: string, model: string) {
        super(`Model not configured: ${provider}:${model}. Check pricing.json for available models.`, 400, 'MODEL_NOT_CONFIGURED');
    }
}
