import z from 'zod';
import { ToolDefinition } from '../../types';

export const thinkTool: ToolDefinition = {
    name: 'think',

    description: [
        'Use this tool to think deeply about a problem, evaluate your approach, and reflect on the task. ',
        'This allows you to reason through complex problems step-by-step before providing a final answer. ',
        'The thinking process is internal and not shown to the user.'
    ].join(' '),

    inputSchema: z.object({
        thought: z.string().describe('Your internal thought process, reasoning, or reflection on the task'),
        evaluation: z.string().optional().describe('Evaluation of different approaches or considerations for solving the problem'),
        conclusion: z.string().optional().describe('Your conclusion or decision on how to proceed')
    }),

    execute: async (_args) => {
        return {
            status: 'acknowledged',
            message: 'Thought process recorded. Continue with your response.',
            timestamp: new Date().toISOString()
        };
    }
};
