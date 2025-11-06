import dotenv from 'dotenv';
import OpenAI, { ClientOptions } from 'openai';

// Load environment variables from a `.env` file
dotenv.config({ quiet: true });

interface Config {
    port: number;
    nodeEnv: 'development' | 'production';

    openai: OpenAI;
    openaiHeaders: Record<string, string> | null;

    anthropicApiKey: string;
    fireworksApiKey: string;
    deepSeekApiKey: string;
    togetherAiApiKey: string;

    languageModelProvider: string;
    languageModelModelName: string;

    defaultSessionBudget: number;
    maxSessions: number;

    rateLimitPerUserPerMin: number;
    rateLimitPerSessionPerMin: number;
    maxConcurrentRequestsPerUser: number;

    slackApiToken: string;
    slackChannel: string;

    developmentConfig: DevelopmentConfig;
}

export interface DevelopmentConfig {
    enabled: boolean;
    logRawToConsole: boolean;
}

const config: Config = {
    port: process.env.PORT ? Number(process.env.PORT) : 3000,
    nodeEnv: (process.env.NODE_ENV as 'development' | 'production') || 'development',

    openai: createOpenaiInstance(),
    openaiHeaders: getOpenaiHeaders(),

    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    fireworksApiKey: process.env.FIREWORKS_API_KEY || '',
    deepSeekApiKey: process.env.DEEPSEEK_API_KEY || '',
    togetherAiApiKey: process.env.TOGETHER_AI_API_KEY || '',

    languageModelProvider: process.env.LANGUAGE_MODEL_PROVIDER || 'openai',
    languageModelModelName: process.env.LANGUAGE_MODEL_MODEL_NAME || 'gpt-5-mini',

    defaultSessionBudget: process.env.DEFAULT_SESSION_BUDGET ? Number(process.env.DEFAULT_SESSION_BUDGET) : 2.0,
    maxSessions: process.env.MAX_SESSIONS ? Number(process.env.MAX_SESSIONS) : 1000,

    rateLimitPerUserPerMin: process.env.RATE_LIMIT_PER_USER_PER_MIN ? Number(process.env.RATE_LIMIT_PER_USER_PER_MIN) : 100,
    rateLimitPerSessionPerMin: process.env.RATE_LIMIT_PER_SESSION_PER_MIN ? Number(process.env.RATE_LIMIT_PER_SESSION_PER_MIN) : 20,
    maxConcurrentRequestsPerUser: process.env.MAX_CONCURRENT_REQUESTS_PER_USER ? Number(process.env.MAX_CONCURRENT_REQUESTS_PER_USER) : 5,

    slackApiToken: process.env.SLACK_API_TOKEN || '',
    slackChannel: process.env.SLACK_CHANNEL || '',

    developmentConfig: {
        enabled: process.env.DEVELOPMENT_ENABLED === 'true',
        logRawToConsole: process.env.DEVELOPMENT_LOG_RAW_TO_CONSOLE === 'true'
    }
};

function createOpenaiInstance(): OpenAI {
    let openaiConfig: ClientOptions = {
        apiKey: process.env.OPENAI_API_KEY || ''
    };

    const baseUrl = process.env.OPENAI_BASE_URL;
    if (baseUrl) {
        openaiConfig.baseURL = baseUrl;
    }

    const headers = getOpenaiHeaders();
    if (headers) {
        openaiConfig.defaultHeaders = headers;
    }

    return new OpenAI(openaiConfig);
}

function getOpenaiHeaders(): Record<string, string> | null {
    const heliconeApiKey = process.env.HELICONE_API_KEY;
    if (heliconeApiKey) {
        return {
            'Helicone-Auth': `Bearer ${heliconeApiKey}`
        };
    }

    return null;
}

export default config;
