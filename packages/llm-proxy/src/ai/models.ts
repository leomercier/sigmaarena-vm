import { AnthropicProvider, createAnthropic } from '@ai-sdk/anthropic';
import { createDeepSeek, DeepSeekProvider } from '@ai-sdk/deepseek';
import { createFireworks, FireworksProvider } from '@ai-sdk/fireworks';
import { createOpenAI, OpenAIProvider, OpenAIProviderSettings } from '@ai-sdk/openai';
import { LanguageModelV2 } from '@ai-sdk/provider';
import { createTogetherAI, TogetherAIProvider } from '@ai-sdk/togetherai';
import config from '../config/config';

const providers: Record<string, any> = {};

export function getDefaultLanguageModel(useHelicone: boolean): LanguageModelV2 {
    return getAiModel(config.languageModelProvider, config.languageModelModelName, useHelicone);
}

export function getAiModel(provider: string, modelName: string, useHelicone: boolean): LanguageModelV2 {
    switch (provider) {
        case 'openai':
            return getOpenAiModel(modelName, useHelicone);
        case 'anthropic':
            return getAnthropicAiModel(modelName);
        case 'fireworks':
            return getFireworksAiModel(modelName);
        case 'deepseek':
            return getDeepSeekAiModel(modelName);
        case 'togetherai':
            return getTogetherAiAiModel(modelName);
        default:
            throw new Error(`Unknown provider: ${provider} (${modelName})`);
    }
}

function getOpenAiModel(modelName: string, useHelicone: boolean): LanguageModelV2 {
    const providerName = 'openai' + (useHelicone ? '-helicone' : '');

    let instance: OpenAIProvider | null = null;

    if (providerName in providers) {
        instance = providers[providerName] as OpenAIProvider;
    } else {
        let options: OpenAIProviderSettings = {
            apiKey: config.openai.apiKey
        };

        if (useHelicone) {
            options.baseURL = config.openai.baseURL;
            options.headers = config.openaiHeaders || {};
        }

        instance = createOpenAI(options);
        providers[providerName] = instance;
    }

    return instance.chat(modelName);
}

function getAnthropicAiModel(modelName: string): LanguageModelV2 {
    const providerName = 'anthropic';
    let instance: AnthropicProvider | null = null;

    if (providerName in providers) {
        instance = providers[providerName] as AnthropicProvider;
    } else {
        instance = createAnthropic({
            apiKey: config.anthropicApiKey
        });

        providers[providerName] = instance;
    }

    return instance(modelName);
}

function getFireworksAiModel(modelName: string): LanguageModelV2 {
    const providerName = 'fireworks';
    let instance: FireworksProvider | null = null;

    if (providerName in providers) {
        instance = providers[providerName] as FireworksProvider;
    } else {
        instance = createFireworks({
            apiKey: config.fireworksApiKey
        });

        providers[providerName] = instance;
    }

    return instance.chatModel(modelName);
}

function getDeepSeekAiModel(modelName: string): LanguageModelV2 {
    const providerName = 'deepseek';
    let instance: DeepSeekProvider | null = null;

    if (providerName in providers) {
        instance = providers[providerName] as DeepSeekProvider;
    } else {
        instance = createDeepSeek({
            apiKey: config.deepSeekApiKey
        });

        providers[providerName] = instance;
    }

    return instance.chat(modelName);
}

function getTogetherAiAiModel(modelName: string): LanguageModelV2 {
    const providerName = 'togetherai';
    let instance: TogetherAIProvider | null = null;

    if (providerName in providers) {
        instance = providers[providerName] as TogetherAIProvider;
    } else {
        instance = createTogetherAI({
            apiKey: config.togetherAiApiKey
        });

        providers[providerName] = instance;
    }

    return instance.chatModel(modelName);
}
