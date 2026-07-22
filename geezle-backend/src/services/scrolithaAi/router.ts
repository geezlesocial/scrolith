/**
 * Phase 33.0 + 33.3 — Deterministic model routing + fallback chains.
 * Priority: NATIVE → OLLAMA → GEMINI → OPENAI → MOCK
 */
import type { AICapabilityId, AIProviderId, ModelRouteDecision, PrivacyLevel } from './types';

export type RouteInput = {
  capability: AICapabilityId;
  privacyLevel: PrivacyLevel;
  externalConsent: boolean;
  preferInternal?: boolean;
  preferNative?: boolean;
  structured?: boolean;
  contextChars?: number;
  locale?: string;
  providerHealth?: Partial<Record<AIProviderId, 'operational' | 'degraded' | 'unavailable' | 'disabled'>>;
  maxTokens?: number;
  timeoutMs?: number;
  /** When true, never use Gemini/OpenAI even if consent present */
  localFirst?: boolean;
};

const DEFAULT_MODELS: Record<AIProviderId, string> = {
  NATIVE: 'scrolitha-native-33.3',
  OLLAMA: process.env.SCROLITHA_OLLAMA_MODEL || process.env.SCROLITHA_CORE_MODEL || 'qwen3:14b',
  GEMINI: process.env.SCROLITHA_GEMINI_MODEL || 'gemini-pro',
  OPENAI: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  MOCK: 'mock-foundation',
  DISABLED: 'disabled'
};

/** Capabilities well-served by native heuristics without LLM */
const NATIVE_PREFERRED: Set<AICapabilityId> = new Set([
  'INTENT_DETECTION',
  'TASK_PLANNING',
  'COPILOT_CONTEXT',
  'SKILL_INVOCATION',
  'PLATFORM_TOOL_PLAN',
  'TEXT_CLASSIFICATION',
  'FEED_RELEVANCE_SCORING',
  'SEMANTIC_SEARCH_PREPARATION',
  'SEMANTIC_QUERY_EXPANSION',
  'SEARCH_QUERY_SUGGESTION',
  'NOTIFICATION_PRIORITIZATION',
  'RECOMMENDATION_REASONING',
  'INTEREST_INFERENCE'
]);

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

  const forceInternal =
    Boolean(input.preferInternal) ||
    Boolean(input.localFirst) ||
    input.privacyLevel === 'HIGHLY_SENSITIVE' ||
    (input.privacyLevel === 'SENSITIVE' && !input.externalConsent);

  const preferNative =
    input.preferNative !== false &&
    (Boolean(input.preferNative) || NATIVE_PREFERRED.has(input.capability));

  const chain: Array<{ provider: AIProviderId; model: string }> = [];

  const pushIfHealthy = (provider: AIProviderId) => {
    const h = healthOf(health, provider);
    if (h === 'unavailable' || h === 'disabled') return;
    if (chain.some((c) => c.provider === provider)) return;
    chain.push({ provider, model: DEFAULT_MODELS[provider] });
  };

  // 1) Native Scrolitha intelligence first
  if (preferNative) pushIfHealthy('NATIVE');

  // 2) Local Ollama / core
  pushIfHealthy('OLLAMA');

  // 3–4) External only with consent and not forceInternal
  if (!forceInternal && input.externalConsent) {
    pushIfHealthy('GEMINI');
    pushIfHealthy('OPENAI');
  }

  // 5) MOCK testing / last resort
  if (!chain.length) {
    pushIfHealthy('MOCK');
  } else if (healthOf(health, 'MOCK') !== 'disabled') {
    // keep mock as ultimate fallback for generation-heavy paths when providers fail
    if (!forceInternal || !chain.some((c) => c.provider === 'NATIVE' || c.provider === 'OLLAMA')) {
      /* already have internal */
    }
    if (!chain.some((c) => c.provider === 'MOCK')) {
      chain.push({ provider: 'MOCK', model: DEFAULT_MODELS.MOCK });
    }
  }

  // Ensure native is first when preferNative and present
  if (preferNative) {
    const ni = chain.findIndex((c) => c.provider === 'NATIVE');
    if (ni > 0) {
      const [n] = chain.splice(ni, 1);
      chain.unshift(n);
    } else if (ni < 0) {
      chain.unshift({ provider: 'NATIVE', model: DEFAULT_MODELS.NATIVE });
    }
  }

  const primary = chain[0] || { provider: 'MOCK' as AIProviderId, model: DEFAULT_MODELS.MOCK };
  const fallbacks = chain.slice(1);

  let reason = 'native_first_local_priority';
  if (forceInternal) reason = 'privacy_internal_only+native_first';
  if (preferNative) reason += '+native_preferred_capability';
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
