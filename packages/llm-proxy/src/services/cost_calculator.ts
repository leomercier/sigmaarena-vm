import pricingData from '../config/pricing.json';
import { ModelNotConfiguredError, ModelPricing, PricingConfig } from '../types';

/**
 * Calculates costs based on token usage and model pricing configuration.
 */
export class CostCalculator {
    private pricing: Map<string, ModelPricing>;

    constructor() {
        this.pricing = new Map();
        this.loadPricing();
    }

    private loadPricing(): void {
        const config = pricingData as PricingConfig;

        for (const [modelKey, pricing] of Object.entries(config.models)) {
            this.pricing.set(modelKey, pricing);
        }
    }

    calculateCost(provider: string, model: string, promptTokens: number, completionTokens: number): number {
        const modelKey = this.getModelKey(provider, model);
        const pricing = this.pricing.get(modelKey);

        if (!pricing) {
            throw new ModelNotConfiguredError(provider, model);
        }

        // Pricing is per 1K tokens
        const inputCost = (promptTokens / 1000) * pricing.input;
        const outputCost = (completionTokens / 1000) * pricing.output;

        return inputCost + outputCost;
    }

    isModelConfigured(provider: string, model: string): boolean {
        const modelKey = this.getModelKey(provider, model);
        return this.pricing.has(modelKey);
    }

    getConfiguredModels(): string[] {
        return Array.from(this.pricing.keys());
    }

    getModelPricing(provider: string, model: string): ModelPricing | null {
        const modelKey = this.getModelKey(provider, model);
        return this.pricing.get(modelKey) ?? null;
    }

    private getModelKey(provider: string, model: string): string {
        return `${provider}:${model}`;
    }

    reloadPricing(): void {
        this.pricing.clear();
        this.loadPricing();
    }
}
