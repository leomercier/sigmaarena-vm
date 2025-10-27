import config from '../config/config';
import { Slack } from '../utils/slack';

export const loggingSlackChannel = '#war-room';

// Main logging function, which logs data to the console
export function logMessage(level: string, message: string, data?: Record<string, any>) {
    const developmentConfig = config.developmentConfig;

    if (developmentConfig && developmentConfig.logRawToConsole) {
        console.log(message);
        if (data) {
            console.log(JSON.stringify(data, null, 4));
        }

        return;
    }

    console.log(
        JSON.stringify({
            severity: level,
            message: message,
            payload: data || {},
            timestamp: new Date().toISOString()
        })
    );

    sendSlackMessage(level, message, data);
}

export function logError(message: string, data?: Record<string, any>) {
    logMessage('ERROR', message, data);
}

export function logWarning(message: string, data?: Record<string, any>) {
    logMessage('WARNING', message, data);
}

export function logInfo(message: string, data?: Record<string, any>) {
    logMessage('INFO', message, data);
}

export function logDebug(message: string, data?: Record<string, any>) {
    logMessage('DEBUG', message, data);
}

function sendSlackMessage(level: string, message: string, data?: Record<string, any>) {
    if (level !== 'ERROR' && level !== 'WARNING') {
        return;
    }

    if (data && data.slack === false) {
        return;
    }

    const slackType = level === 'ERROR' ? 'error' : 'warning';
    Slack.sendMessage(slackType, message, data, loggingSlackChannel);
}
