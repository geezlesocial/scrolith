import { AIConfig } from '../../types';

const DEFAULT_AI_CONFIG: AIConfig = {
    providers: {
        google: {
            provider: 'google',
            api_key: ((import.meta.env as Record<string, unknown>)['VITE_GEMINI_API_KEY'] as string) || '',
            apiKey: ((import.meta.env as Record<string, unknown>)['VITE_GEMINI_API_KEY'] as string) || '',
            enabled: true,
            model: 'gemini-3-flash-preview'
        },
        openai: {
            provider: 'openai',
            api_key: '',
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
        max_tokens: 1024,
        maxTokens: 1024,
        temperature: 0.7
    },
    cost_control: {
        enabled: false,
        monthly_limit_usd: 0,
        current_spend_usd: 0
    },
    costControl: {
        enabled: false,
        monthlyLimitUSD: 0,
        currentSpendUSD: 0
    }
};

const STORAGE_KEY = 'Scrolith_ai_config';

export const AIConfigManager = {
    normalizeConfig: (raw?: Partial<AIConfig> | null): AIConfig => {
        const parsed = raw || {};
        const merged: AIConfig = {
            ...DEFAULT_AI_CONFIG,
            ...parsed,
            providers: {
                google: { ...DEFAULT_AI_CONFIG.providers.google, ...(parsed as any).providers?.google },
                openai: { ...DEFAULT_AI_CONFIG.providers.openai, ...(parsed as any).providers?.openai }
            },
            routing: {
                ...DEFAULT_AI_CONFIG.routing,
                ...(parsed as any).routing
            },
            safety: {
                ...DEFAULT_AI_CONFIG.safety,
                ...(parsed as any).safety
            },
            cost_control: {
                ...DEFAULT_AI_CONFIG.cost_control,
                ...(parsed as any).cost_control
            },
            costControl: {
                ...DEFAULT_AI_CONFIG.costControl,
                ...(parsed as any).costControl
            }
        };

        // Bridge provider keys
        if ((merged.providers.google as any).apiKey && !(merged.providers.google as any).api_key) {
            (merged.providers.google as any).api_key = (merged.providers.google as any).apiKey;
        }
        if ((merged.providers.google as any).api_key && !(merged.providers.google as any).apiKey) {
            (merged.providers.google as any).apiKey = (merged.providers.google as any).api_key;
        }
        if ((merged.providers.openai as any).apiKey && !(merged.providers.openai as any).api_key) {
            (merged.providers.openai as any).api_key = (merged.providers.openai as any).apiKey;
        }
        if ((merged.providers.openai as any).api_key && !(merged.providers.openai as any).apiKey) {
            (merged.providers.openai as any).apiKey = (merged.providers.openai as any).api_key;
        }

        // Bridge safety keys
        if ((merged.safety as any).maxTokens !== undefined && (merged.safety as any).max_tokens === undefined) {
            (merged.safety as any).max_tokens = (merged.safety as any).maxTokens;
        }
        if ((merged.safety as any).max_tokens !== undefined && (merged.safety as any).maxTokens === undefined) {
            (merged.safety as any).maxTokens = (merged.safety as any).max_tokens;
        }

        // Bridge cost control keys
        const cc = merged.cost_control || ({} as any);
        const ccCamel = merged.costControl || ({} as any);
        if (ccCamel.enabled !== undefined && cc.enabled === undefined) cc.enabled = ccCamel.enabled;
        if (cc.enabled !== undefined && ccCamel.enabled === undefined) ccCamel.enabled = cc.enabled;
        if (ccCamel.monthlyLimitUSD !== undefined && cc.monthly_limit_usd === undefined) {
            cc.monthly_limit_usd = ccCamel.monthlyLimitUSD;
        }
        if (cc.monthly_limit_usd !== undefined && ccCamel.monthlyLimitUSD === undefined) {
            ccCamel.monthlyLimitUSD = cc.monthly_limit_usd;
        }
        if (ccCamel.currentSpendUSD !== undefined && cc.current_spend_usd === undefined) {
            cc.current_spend_usd = ccCamel.currentSpendUSD;
        }
        if (cc.current_spend_usd !== undefined && ccCamel.currentSpendUSD === undefined) {
            ccCamel.currentSpendUSD = cc.current_spend_usd;
        }
        merged.cost_control = cc;
        merged.costControl = ccCamel;

        return merged;
    },

    getConfig: (): AIConfig => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return AIConfigManager.normalizeConfig(parsed);
            }
        } catch (e) {
            console.error('Failed to parse AI config', e);
        }
        return AIConfigManager.normalizeConfig(DEFAULT_AI_CONFIG);
    },

    saveConfig: (config: AIConfig): void => {
        const normalized = AIConfigManager.normalizeConfig(config);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
    },

    getProviderKey: (provider: 'google' | 'openai'): string => {
        const config = AIConfigManager.getConfig();
        const providerCfg: any = config.providers[provider];
        return providerCfg?.apiKey || providerCfg?.api_key || '';
    },

    getFeatureProvider: (feature: keyof AIConfig['routing']): 'google' | 'openai' => {
        const config = AIConfigManager.getConfig();
        const preferred = config.routing[feature];
        // Fallback logic could be added here if preferred provider is disabled
        return preferred;
    }
};

