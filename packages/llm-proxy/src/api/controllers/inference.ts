import { generateObject, generateText, jsonSchema, stepCountIs } from 'ai';
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ZodError } from 'zod';
import { getAiModel } from '../../ai/models';
import { CostCalculator } from '../../services/cost_calculator';
import { SessionStore } from '../../services/session_store';
import { ToolRegistry } from '../../services/tool_registry';
import { UsageTracker } from '../../services/usage_tracker';
import { BudgetExceededError, inferenceRequestSchema, InferenceResponse, ModelNotConfiguredError, ProxyError } from '../../types';
import { getErrorMetadata } from '../../utils/errors';
import { logError } from '../../utils/logging';

const tokensUsedCountWhenUsageIsMissing = 10000;

/**
 * Controller for LLM inference endpoints.
 */
export class InferenceController {
    private sessionStore: SessionStore;
    private costCalculator: CostCalculator;
    private usageTracker: UsageTracker;
    private toolRegistry: ToolRegistry;

    constructor(sessionStore: SessionStore, costCalculator: CostCalculator, usageTracker: UsageTracker, toolRegistry: ToolRegistry) {
        this.sessionStore = sessionStore;
        this.costCalculator = costCalculator;
        this.usageTracker = usageTracker;
        this.toolRegistry = toolRegistry;
    }

    /**
     * POST /api/inference
     */
    async inference(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        const requestId = uuidv4();

        try {
            const data = inferenceRequestSchema.parse(req.body);

            if (!this.costCalculator.isModelConfigured(data.provider, data.model)) {
                throw new ModelNotConfiguredError(data.provider, data.model);
            }

            if (data.tools && data.tools.length > 0) {
                const validation = this.toolRegistry.validateTools(data.tools);
                if (!validation.valid) {
                    throw new ProxyError(`Unknown tools: ${validation.missing.join(', ')}`, 400, 'INVALID_TOOLS');
                }
            }

            const remaining = this.sessionStore.getRemainingBudget(data.sessionId);
            if (remaining <= 0) {
                throw new BudgetExceededError(data.sessionId, remaining);
            }

            const model = getAiModel(data.provider, data.model, false);

            const tools = data.tools ? this.toolRegistry.toAISDKFormat(data.tools) : undefined;

            let result: any;
            let actualPromptTokens: number;
            let actualCompletionTokens: number;
            let content: string | object;

            if (data.mode === 'generateText') {
                result = await generateText({
                    model,
                    messages: data.messages,
                    tools,
                    stopWhen: stepCountIs(10),
                    maxOutputTokens: data.maxTokens
                });

                content = result.text;
            } else {
                if (!data.schema) {
                    throw new ProxyError('Schema is required for generateObject mode', 400, 'MISSING_SCHEMA');
                }

                const schemaObject = jsonSchema(data.schema);

                result = await generateObject({
                    model,
                    messages: data.messages,
                    schema: schemaObject,
                    mode: 'json',
                    maxOutputTokens: data.maxTokens
                });

                content = result.object;
            }

            actualPromptTokens = result.totalUsage?.inputTokens || result.usage?.inputTokens || tokensUsedCountWhenUsageIsMissing;
            actualCompletionTokens = result.totalUsage?.outputTokens || result.usage?.outputTokens || tokensUsedCountWhenUsageIsMissing;

            const actualCost = this.costCalculator.calculateCost(data.provider, data.model, actualPromptTokens, actualCompletionTokens);

            this.sessionStore.updateBudget(data.sessionId, actualCost);

            const durationMs = Date.now() - startTime;
            const toolCallsCount = result.toolCalls?.length || 0;

            this.usageTracker.recordUsage(
                data.sessionId,
                requestId,
                data.provider,
                data.model,
                data.mode,
                actualPromptTokens,
                actualCompletionTokens,
                actualCost,
                toolCallsCount,
                durationMs
            );

            const response: InferenceResponse = {
                requestId,
                content,
                usage: {
                    promptTokens: actualPromptTokens,
                    completionTokens: actualCompletionTokens,
                    totalTokens: actualPromptTokens + actualCompletionTokens
                },
                cost: actualCost,
                remainingBudget: this.sessionStore.getRemainingBudget(data.sessionId),
                toolCalls: result.toolCalls?.map((tc: any) => ({
                    id: tc.toolCallId,
                    name: tc.toolName,
                    arguments: tc.args
                }))
            };

            res.status(200).json(response);
        } catch (error) {
            this.handleError(error, res, requestId, Date.now() - startTime);
        }
    }

    private handleError(err: unknown, res: Response, requestId: string, durationMs: number): void {
        if (err instanceof ZodError) {
            res.status(400).json({
                requestId,
                error: 'Invalid request data',
                code: 'VALIDATION_ERROR',
                details: err.errors,
                durationMs
            });
        } else if (err instanceof BudgetExceededError) {
            res.status(err.statusCode).json({
                requestId,
                error: err.message,
                code: err.code,
                durationMs
            });
        } else if (err instanceof ProxyError) {
            res.status(err.statusCode).json({
                requestId,
                error: err.message,
                code: err.code,
                durationMs
            });
        } else {
            logError('Unexpected error in inference controller', getErrorMetadata(err as Error));

            res.status(500).json({
                requestId,
                error: 'Internal server error during inference',
                code: 'INTERNAL_ERROR',
                durationMs
            });
        }
    }
}
