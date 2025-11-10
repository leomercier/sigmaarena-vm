import zodToJsonSchema from 'zod-to-json-schema';

export class LLMFunctions {
    private userId: string;
    private sessionId: string;
    private llmBaseUrl: string;

    constructor(userId: string, sessionId: string, llmBaseUrl: string) {
        this.userId = userId;
        this.sessionId = sessionId;
        this.llmBaseUrl = llmBaseUrl;
    }

    async generateText(provider: string, model: string, messages: any[], tools?: string[], maxTokens?: number): Promise<any> {
        const body: Record<string, any> = {
            userId: this.userId,
            sessionId: this.sessionId,
            provider: provider,
            model: model,
            mode: 'generateText',
            messages: messages
        };

        if (tools) {
            body['tools'] = tools;
        }

        if (maxTokens) {
            body['maxTokens'] = maxTokens;
        }

        const resp = await fetch(`${this.llmBaseUrl}/api/inference`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(errText || `LLM request failed with status ${resp.status}`);
        }

        const response = await resp.json();

        return response;
    }

    async generateObject(provider: string, model: string, messages: any[], schema?: any, maxTokens?: number): Promise<any> {
        const body: Record<string, any> = {
            userId: this.userId,
            sessionId: this.sessionId,
            provider: provider,
            model: model,
            mode: 'generateObject',
            schema: zodToJsonSchema(schema),
            messages: messages
        };

        if (maxTokens) {
            body['maxTokens'] = maxTokens;
        }

        const resp = await fetch(`${this.llmBaseUrl}/api/inference`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!resp.ok) {
            const errText = await resp.text().catch(() => '');
            throw new Error(errText || `LLM request failed with status ${resp.status}`);
        }

        const response = await resp.json();

        return response;
    }
}

let llmFunctionsInstance: LLMFunctions | null = null;

export function getLLMFunctionsInstance(userId: string, sessionId: string, llmBaseUrl: string): LLMFunctions {
    if (llmFunctionsInstance) {
        return llmFunctionsInstance;
    }

    llmFunctionsInstance = new LLMFunctions(userId, sessionId, llmBaseUrl);

    return llmFunctionsInstance;
}
