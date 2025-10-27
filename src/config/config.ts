import dotenv from 'dotenv';

dotenv.config({ quiet: true });

interface Config {
    slackApiToken: string;
    slackChannel: string;

    developmentConfig: DevelopmentConfig;
}

export interface DevelopmentConfig {
    enabled: boolean;
    logRawToConsole: boolean;
}

const config: Config = {
    slackApiToken: process.env.SLACK_API_TOKEN || '',
    slackChannel: process.env.SLACK_CHANNEL || '',

    developmentConfig: {
        enabled: process.env.DEVELOPMENT_ENABLED === 'true',
        logRawToConsole: process.env.DEVELOPMENT_LOG_RAW_TO_CONSOLE === 'true'
    }
};

export default config;
