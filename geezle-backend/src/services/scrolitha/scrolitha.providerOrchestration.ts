/**
 * AI Provider orchestration — health, timeouts, retries, fallback, routing.
 * Does not hardcode a single vendor; discovers capabilities from runtime.
 */
import { resolveScrolithaLlmRuntime, type ScrolithaLlmRuntime } from './scrolitha.ollama';
import { enterpriseCache } from './scrolitha.enterpriseCache';
import type { ScrolithaScope } from './scrolitha.types';

export type ProviderId = 'core' | 'ollama' | 'backup' | 'disabled' | string;

export type ProviderHealth = {
  provider: ProviderId;
  status: 'operational' | 'degraded' | 'unavailable' | 'disabled';
  latencyMs?: number | null;
  checkedAt: string;
  capabilities: {
    completion: boolean;
    streaming: boolean;
    tools: boolean;
  };
  message?: string;
};

export type RoutingDecision = {
  primary: ProviderId;
  fallbacks: ProviderId[];
  reason: string;
  timeoutMs: number;
  maxRetries: number;
  costTier: 'low' | 'medium' | 'high';
  latencySensitive: boolean;
};

export type OrchestratedAttempt = {
  provider: ProviderId;
  attempt: number;
  ok: boolean;
  latencyMs: number;
  error?: string;
};

const HEALTH_TTL_MS = 20_000;

const asProvider = (runtime: ScrolithaLlmRuntime): ProviderId => {
  if (!runtime.enabled || runtime.provider === 'disabled') return 'disabled';
  return runtime.provider === 'ollama' ? 'ollama' : 'core';
};

export const discoverProviderCapabilities = async (scope: ScrolithaScope = 'user') => {
  const runtime = await resolveScrolithaLlmRuntime(scope);
  const provider = asProvider(runtime);
  return {
    runtime: {
      provider: runtime.provider,
      status: runtime.status,
      model: runtime.model,
      timeoutMs: runtime.timeoutMs,
      enableStreaming: runtime.enableStreaming,
      allowGeminiFallback: runtime.allowGeminiFallback
    },
    providers: [
      {
        id: provider,
        completion: runtime.enabled && provider !== 'disabled',
        streaming: Boolean(runtime.enableStreaming),
        tools: true,
        costTier: provider === 'core' || provider === 'ollama' ? 'low' : 'medium'
      },
      {
        id: 'backup',
        completion: Boolean(runtime.allowGeminiFallback),
        streaming: false,
        tools: false,
        costTier: 'high' as const
      }
    ]
  };
};

export const getProviderHealth = async (scope: ScrolithaScope = 'user'): Promise<ProviderHealth[]> => {
  const cacheKey = `health:${scope}`;
  const cached = enterpriseCache.get<ProviderHealth[]>('governance', cacheKey);
  if (cached) return cached;

  const started = Date.now();
  const runtime = await resolveScrolithaLlmRuntime(scope);
  const primary = asProvider(runtime);
  const latencyMs = Date.now() - started;

  const health: ProviderHealth[] = [
    {
      provider: primary,
      status:
        !runtime.enabled || primary === 'disabled'
          ? 'disabled'
          : runtime.status === 'degraded'
            ? 'degraded'
            : runtime.runtimeConfigured
              ? 'operational'
              : 'unavailable',
      latencyMs,
      checkedAt: new Date().toISOString(),
      capabilities: {
        completion: runtime.enabled && primary !== 'disabled',
        streaming: Boolean(runtime.enableStreaming),
        tools: true
      },
      message: runtime.runtimeConfigured ? undefined : 'Runtime endpoint not fully configured'
    },
    {
      provider: 'backup',
      status: runtime.allowGeminiFallback ? 'operational' : 'disabled',
      latencyMs: null,
      checkedAt: new Date().toISOString(),
      capabilities: {
        completion: Boolean(runtime.allowGeminiFallback),
        streaming: false,
        tools: false
      },
      message: runtime.allowGeminiFallback ? 'Backup engine available by policy' : 'Backup disabled by policy'
    }
  ];

  enterpriseCache.set('governance', cacheKey, health, HEALTH_TTL_MS);
  return health;
};

export const routeProvider = async (input: {
  scope?: ScrolithaScope;
  preferLowLatency?: boolean;
  preferLowCost?: boolean;
  requireStreaming?: boolean;
}): Promise<RoutingDecision> => {
  const scope = input.scope || 'user';
  const runtime = await resolveScrolithaLlmRuntime(scope);
  const primary = asProvider(runtime);
  const fallbacks: ProviderId[] = [];
  if (runtime.allowGeminiFallback) fallbacks.push('backup');

  let reason = `Primary provider ${primary} from runtime config`;
  if (input.requireStreaming && !runtime.enableStreaming) {
    reason += '; streaming requested but provider streaming disabled — will use chunk fallback';
  }
  if (input.preferLowCost) {
    reason += '; cost-aware routing prefers self-hosted core/ollama';
  }
  if (input.preferLowLatency) {
    reason += '; latency-aware routing keeps local/core first';
  }

  return {
    primary,
    fallbacks,
    reason,
    timeoutMs: runtime.timeoutMs || 45_000,
    maxRetries: 2,
    costTier: primary === 'backup' ? 'high' : 'low',
    latencySensitive: Boolean(input.preferLowLatency)
  };
};

/**
 * Execute with timeout + retries + ordered fallbacks.
 * `attemptFn` receives provider id; throw to trigger retry/fallback.
 */
export const executeWithProviderOrchestration = async <T>(input: {
  scope?: ScrolithaScope;
  preferLowLatency?: boolean;
  preferLowCost?: boolean;
  requireStreaming?: boolean;
  attemptFn: (provider: ProviderId, attempt: number) => Promise<T>;
}): Promise<{ result: T; decision: RoutingDecision; attempts: OrchestratedAttempt[] }> => {
  const decision = await routeProvider(input);
  const chain = [decision.primary, ...decision.fallbacks].filter((p, i, arr) => p && arr.indexOf(p) === i);
  const attempts: OrchestratedAttempt[] = [];

  let lastError: any;
  for (const provider of chain) {
    for (let attempt = 1; attempt <= decision.maxRetries; attempt += 1) {
      const started = Date.now();
      try {
        const result = await Promise.race([
          input.attemptFn(provider, attempt),
          new Promise<T>((_, reject) => {
            const t = setTimeout(
              () => reject(new Error(`Provider ${provider} timed out after ${decision.timeoutMs}ms`)),
              decision.timeoutMs
            );
            (t as any).unref?.();
          })
        ]);
        attempts.push({
          provider,
          attempt,
          ok: true,
          latencyMs: Date.now() - started
        });
        return { result, decision, attempts };
      } catch (error: any) {
        lastError = error;
        attempts.push({
          provider,
          attempt,
          ok: false,
          latencyMs: Date.now() - started,
          error: String(error?.message || 'error').slice(0, 200)
        });
        // brief backoff
        await new Promise((r) => setTimeout(r, Math.min(250 * attempt, 800)));
      }
    }
  }

  throw Object.assign(new Error(String(lastError?.message || 'All providers failed')), {
    attempts,
    decision
  });
};
