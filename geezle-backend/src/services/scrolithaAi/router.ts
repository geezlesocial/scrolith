/**
 * Phase 33.0 — Deterministic model routing + fallback chains.
 */
import type { AICapabilityId, AIProviderId, ModelRouteDecision, PrivacyLevel } from './types';

export type RouteInput = {
  capability: AICapabilityId;
  privacyLevel: PrivacyLevel;
  externalConsent: boolean;
  preferInternal?: boolean;
  structured?: boolean;
  contextChars?: number;
  locale?: string;
  providerHealth?: Partial<Record<AIProviderId, 'operational' | 'degraded' | 'unavailable' | 'disabled'>>;
  maxTokens?: number;
  timeoutMs?: number;
};

const DEFAULT_MODELS: Record<AIProviderId, string> = {
  OLLAMA: process.env.SCROLITHA_OLLAMA_MODEL || process.env.SCROLITHA_CORE_MODEL || 'qwen3:14b',
  GEMINI: process.env.SCROLITHA_GEMINI_MODEL || 'gemini-pro',
  OPENAI: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  MOCK: 'mock-foundation',
  DISABLED: 'disabled'
};

function healthOf(
  map: RouteInput['providerHealth'],
  id: AIProviderId
): 'operational' | 'degraded' | 'unavailable' | 'disabled' {
  return map?.[id] || 'operational';
}

export function routeModel(input: RouteInput): ModelRouteDecision {
  const maxTokens = Math.min(4096, Math.max(64, Number(input.maxTokens || 1024)));
  const timeoutMs = Math.min(120_000, Math.max(3_000, Number(input.timeoutMs || 30_000)));
  const health = input.providerHealth || {};

  // PROHIBITED never routes to real providers (caller blocks earlier)
  if (input.privacyLevel === 'PROHIBITED') {
    return {
      provider: 'DISABLED',
      model: 'disabled',
      reason: 'privacy_prohibited',
      fallbackChain: [],
      maximumTokens: maxTokens,
      timeoutMs
    };
  }

  // Highly sensitive → internal only (Ollama/core)
  // Sensitive without external consent → internal only
  const forceInternal =
    Boolean(input.preferInternal) ||
    input.privacyLevel === 'HIGHLY_SENSITIVE' ||
    (input.privacyLevel === 'SENSITIVE' && !input.externalConsent);

  const chain: Array<{ provider: AIProviderId; model: string }> = [];

  const pushIfHealthy = (provider: AIProviderId) => {
    const h = healthOf(health, provider);
    if (h === 'unavailable' || h === 'disabled') return;
    chain.push({ provider, model: DEFAULT_MODELS[provider] });
  };

  if (forceInternal) {
    pushIfHealthy('OLLAMA');
    // No external fallbacks for forceInternal
    if (!chain.length) {
      chain.push({ provider: 'MOCK', model: DEFAULT_MODELS.MOCK });
    }
  } else {
    // Prefer internal first for cost/privacy, then Gemini, then OpenAI
    pushIfHealthy('OLLAMA');
    if (input.externalConsent) {
      pushIfHealthy('GEMINI');
      pushIfHealthy('OPENAI');
    }
    if (!chain.length) {
      chain.push({ provider: 'MOCK', model: DEFAULT_MODELS.MOCK });
    }
  }

  // Structured outputs: still same providers; mock used when calls disabled
  const primary = chain[0];
  const fallbacks = chain.slice(1);

  let reason = forceInternal ? 'privacy_internal_only' : 'default_cost_privacy_order';
  if (input.structured) reason += '+structured';
  if ((input.contextChars || 0) > 100_000) reason += '+large_context';

  return {
    provider: primary.provider,
    model: primary.model,
    reason,
    fallbackChain: fallbacks,
    maximumTokens: maxTokens,
    timeoutMs
  };
}

export default routeModel;
