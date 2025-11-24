import dotenv from 'dotenv';

dotenv.config({ quiet: true });

interface Config {
    slackApiToken: string;
    slackChannel: string;

    exchangeConfigs: Record<string, string>;

    llmBaseUrl: string;

    userId: string;

    sandboxWorkspaceFolder: string;

    developmentConfig: DevelopmentConfig;
}

export interface DevelopmentConfig {
    enabled: boolean;
    logRawToConsole: boolean;
}

const config: Config = {
    slackApiToken: process.env.SLACK_API_TOKEN || '',
    slackChannel: process.env.SLACK_CHANNEL || '',

    exchangeConfigs: getExchangeConfigs(),

    llmBaseUrl: process.env.LLM_BASE_URL || '',

    userId: process.env.USER_ID || 'sigmaarena_vm_user',

    sandboxWorkspaceFolder: process.env.SANDBOX_WORKSPACE_FOLDER || '',

    developmentConfig: {
        enabled: process.env.DEVELOPMENT_ENABLED === 'true',
        logRawToConsole: process.env.DEVELOPMENT_LOG_RAW_TO_CONSOLE === 'true'
    }
};

function getExchangeConfigs(): Record<string, string> {
    const exchangeConfigs: Record<string, string> = {};

    const exchangeKeys = Object.keys(process.env).filter((key) => key.startsWith('EXCHANGE_'));

    for (const key of exchangeKeys) {
        const exchangeName = key.split('_')[1];
        if (!exchangeName) {
            continue;
        }

        const exchangeConfig = process.env[key];
        if (!exchangeConfig) {
            continue;
        }

        exchangeConfigs[exchangeName.toLowerCase()] = exchangeConfig;
    }

    return exchangeConfigs;
}

export default config;
