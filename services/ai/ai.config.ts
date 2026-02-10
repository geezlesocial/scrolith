
import { AIConfig } from '../../types';

const DEFAULT_AI_CONFIG: AIConfig = {
    providers: {
        google: {
            provider: 'google',
            apiKey: process.env.API_KEY || '',
            enabled: true,
            model: 'gemini-3-flash-preview'
        },
        openai: {
            provider: 'openai',
            apiKey: '',
            enabled: false,
            model: 'gpt-4o-mini'
        }
    },
    routing: {
        support_chat: 'google',
        seo_tags: 'google',
        semantic_search: 'google',
        content_moderation: 'google'
    },
    safety: {
        maxTokens: 1024,
        temperature: 0.7
    }
};

const STORAGE_KEY = 'scrolith_ai_config';

export const AIConfigManager = {
    getConfig: (): AIConfig => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Merge with default to ensure new keys exist
                return { 
                    ...DEFAULT_AI_CONFIG, 
                    ...parsed,
                    providers: {
                        google: { ...DEFAULT_AI_CONFIG.providers.google, ...parsed.providers?.google },
                        openai: { ...DEFAULT_AI_CONFIG.providers.openai, ...parsed.providers?.openai }
                    }
                };
            }
        } catch (e) {
            console.error('Failed to parse AI config', e);
        }
        return DEFAULT_AI_CONFIG;
    },

    saveConfig: (config: AIConfig): void => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    },

    getProviderKey: (provider: 'google' | 'openai'): string => {
        const config = AIConfigManager.getConfig();
        return config.providers[provider]?.apiKey || '';
    },

    getFeatureProvider: (feature: keyof AIConfig['routing']): 'google' | 'openai' => {
        const config = AIConfigManager.getConfig();
        const preferred = config.routing[feature];
        // Fallback logic could be added here if preferred provider is disabled
        return preferred;
    }
};
