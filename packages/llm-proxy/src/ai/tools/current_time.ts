import z from 'zod';
import { ToolDefinition } from '../../types';

export const getCurrentTimeTool: ToolDefinition = {
    name: 'get_current_time',

    description: 'Get the current date and time in ISO format or a specified timezone.',

    inputSchema: z.object({
        timezone: z.string().optional().default('UTC').describe('Optional timezone (e.g., "America/New_York", "Europe/London")'),
        format: z
            .enum(['iso', 'unix', 'readable'])
            .optional()
            .default('iso')
            .describe('Format: "iso" for ISO string, "unix" for Unix timestamp, "readable" for human-readable')
    }),

    execute: async (args) => {
        const now = new Date();
        const timezone = args.timezone || 'UTC';
        const format = args.format || 'iso';

        let formattedTime: string | number;

        if (format === 'unix') {
            formattedTime = Math.floor(now.getTime() / 1000);
        } else if (format === 'readable') {
            formattedTime = now.toLocaleString('en-US', {
                timeZone: timezone,
                dateStyle: 'full',
                timeStyle: 'long'
            });
        } else {
            formattedTime = now.toISOString();
        }

        return {
            time: formattedTime,
            timezone,
            format
        };
    }
};
