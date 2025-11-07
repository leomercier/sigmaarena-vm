import { getCurrentTimeTool } from '../ai/tools/current_time';
import { thinkTool } from '../ai/tools/think';
import { ToolDefinition } from '../types';

/**
 * Registry of pre-defined tools available to LLM inference calls.
 */
export class ToolRegistry {
    private tools: Map<string, ToolDefinition>;

    constructor() {
        this.tools = new Map();
        this.registerDefaultTools();
    }

    private registerDefaultTools(): void {
        this.registerTool(thinkTool);
        this.registerTool(getCurrentTimeTool);
    }

    registerTool(tool: ToolDefinition): void {
        this.tools.set(tool.name, tool);
    }

    getTool(name: string): ToolDefinition | undefined {
        return this.tools.get(name);
    }

    getTools(names: string[]): ToolDefinition[] {
        const tools: ToolDefinition[] = [];

        for (const name of names) {
            const tool = this.tools.get(name);
            if (tool) {
                tools.push(tool);
            }
        }

        return tools;
    }

    getAvailableToolNames(): string[] {
        return Array.from(this.tools.keys());
    }

    hasTool(name: string): boolean {
        return this.tools.has(name);
    }

    toAISDKFormat(toolNames: string[]): Record<string, any> {
        const tools: Record<string, any> = {};

        for (const name of toolNames) {
            const tool = this.tools.get(name);
            if (tool) {
                tools[name] = {
                    description: tool.description,
                    inputSchema: tool.inputSchema,
                    execute: tool.execute
                };
            }
        }

        return tools;
    }

    validateTools(toolNames: string[]): { valid: boolean; missing: string[] } {
        const missing: string[] = [];

        for (const name of toolNames) {
            if (!this.tools.has(name)) {
                missing.push(name);
            }
        }

        return {
            valid: missing.length === 0,
            missing
        };
    }
}
