import config from '../config/config';
import { getErrorMetadata } from './errors';
import { logWarning } from './logging';

const colors = {
    info: '#2eb886',
    warning: '#ffcc00',
    error: '#ff0000'
};

export class Slack {
    static sendSimpleMessage(message: string, channel?: string): void {
        Slack.sendMessage('info', message, {}, channel);
    }

    static sendMessage(type: 'info' | 'warning' | 'error', message: string, data?: Record<string, any>, channel?: string): void {
        if (!config.slackApiToken || (!config.slackChannel && !channel)) {
            return;
        }

        const attachments: any[] = [];

        if (data && Object.keys(data).length > 0) {
            const jsonFormatted = '```' + JSON.stringify(data, null, 4) + '```';
            attachments.push({
                fallback: 'Payload',
                pretext: '',
                title: '',
                title_link: '',
                text: jsonFormatted,
                mrkdwn_in: ['text'],
                color: colors[type],
                collapsed_by_default: false,
                is_attachment_collapsible: true,
                attachment_type: 'default'
            });
        }

        const payload = {
            channel: channel || config.slackChannel,
            text: message,
            unfurl_links: false,
            unfurl_media: false,
            attachments: attachments
        };

        try {
            fetch('https://slack.com/api/chat.postMessage', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${config.slackApiToken}`
                },
                body: JSON.stringify(payload)
            }).catch((err) => {
                logWarning('Failed to send Slack notification', { slack: false, ...getErrorMetadata(err) });
            });
        } catch (err) {
            logWarning('Error creating Slack notification', { slack: false, ...getErrorMetadata(err as Error) });
        }
    }
}
