import { ensureScrolithaConfig } from './scrolitha.policy';
import type { ScrolithaScope } from './scrolitha.types';

export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ScrolithaLlmRuntime = {
  provider: 'ollama' | 'disabled';
  enabled: boolean;
  host: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  timeoutMs: number;
  enableStreaming: boolean;
  allowGeminiFallback: boolean;
};

const asBool = (value: unknown, fallback: boolean) => {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return fallback;
};

const asNumber = (value: unknown, fallback: number) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
};

const normalizeHost = (value: string) => String(value || '').trim().replace(/\/$/, '');

const pickString = (...values: Array<unknown>) => {
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (s) return s;
  }
  return '';
};

const readLlmMetadata = (metadata: any): Record<string, any> => {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return {};
  const llm = (metadata as any).llm;
  if (!llm || typeof llm !== 'object' || Array.isArray(llm)) return {};
  return llm as Record<string, any>;
};

const mergeRuntime = (base: ScrolithaLlmRuntime, override: Record<string, any>): ScrolithaLlmRuntime => {
  const provider = String(override.provider || '').trim().toLowerCase();
  const enabled = typeof override.enabled === 'boolean' ? override.enabled : base.enabled;

  const host = pickString(override.ollamaHost, override.host, base.host);
  const model = pickString(override.ollamaModel, override.model, base.model);

  return {
    provider: provider === 'disabled' ? 'disabled' : base.provider,
    enabled,
    host: normalizeHost(host),
    model: String(model || '').trim(),
    maxTokens: Math.max(32, Math.min(8192, Math.floor(asNumber(override.maxTokens, base.maxTokens)))),
    temperature: Math.max(0, Math.min(2, asNumber(override.temperature, base.temperature))),
    topP: Math.max(0, Math.min(1, asNumber(override.topP, base.topP))),
    timeoutMs: Math.max(1000, Math.min(120_000, Math.floor(asNumber(override.timeoutMs, base.timeoutMs)))),
    enableStreaming:
      typeof override.enableStreaming === 'boolean' ? override.enableStreaming : base.enableStreaming,
    allowGeminiFallback:
      typeof override.allowGeminiFallback === 'boolean'
        ? override.allowGeminiFallback
        : base.allowGeminiFallback
  };
};

export const resolveScrolithaLlmRuntime = async (scope: ScrolithaScope): Promise<ScrolithaLlmRuntime> => {
  const envProvider = String(process.env.SCROLITHA_PROVIDER || 'ollama').trim().toLowerCase();
  const envHost = normalizeHost(String(process.env.SCROLITHA_OLLAMA_HOST || '').trim());
  const envModel = String(process.env.SCROLITHA_OLLAMA_MODEL || '').trim();

  const base: ScrolithaLlmRuntime = {
    provider: envProvider === 'disabled' ? 'disabled' : 'ollama',
    enabled: true,
    host: envHost,
    model: envModel || 'llama3.1',
    maxTokens: Math.max(32, Math.min(8192, Math.floor(asNumber(process.env.SCROLITHA_MAX_TOKENS, 1024)))),
    temperature: Math.max(0, Math.min(2, asNumber(process.env.SCROLITHA_TEMPERATURE, 0.7))),
    topP: Math.max(0, Math.min(1, asNumber(process.env.SCROLITHA_TOP_P, 0.9))),
    timeoutMs: Math.max(1000, Math.min(120_000, Math.floor(asNumber(process.env.SCROLITHA_TIMEOUT_MS, 25_000)))),
    enableStreaming: asBool(process.env.SCROLITHA_ENABLE_STREAMING, false),
    allowGeminiFallback: asBool(process.env.SCROLITHA_GEMINI_FALLBACK, false)
  };

  const [scopeConfig, adminConfig] = await Promise.all([
    ensureScrolithaConfig(scope),
    scope === 'admin' ? Promise.resolve(null) : ensureScrolithaConfig('admin')
  ]);

  // Global (admin) defaults, then scope-specific overrides.
  let runtime = base;
  if (adminConfig?.metadata) runtime = mergeRuntime(runtime, readLlmMetadata(adminConfig.metadata));
  if (scopeConfig?.metadata) runtime = mergeRuntime(runtime, readLlmMetadata(scopeConfig.metadata));

  const hostConfigured = Boolean(runtime.host);
  const modelConfigured = Boolean(runtime.model);
  const enabled = runtime.provider === 'ollama' && runtime.enabled && hostConfigured && modelConfigured;

  return { ...runtime, enabled };
};

const withTimeout = async <T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
};

export const ollamaChat = async (input: {
  host: string;
  model: string;
  messages: OllamaChatMessage[];
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  timeoutMs?: number;
}): Promise<{ text: string; raw?: any }> => {
  const host = normalizeHost(input.host);
  if (!host) throw new Error('Ollama host is missing');
  const model = String(input.model || '').trim();
  if (!model) throw new Error('Ollama model is missing');

  const timeoutMs = Math.max(1000, Math.floor(asNumber(input.timeoutMs, 25_000)));
  const temperature = asNumber(input.temperature, 0.7);
  const topP = asNumber(input.topP, 0.9);
  const maxTokens = Math.max(32, Math.min(8192, Math.floor(asNumber(input.maxTokens, 1024))));

  const url = `${host}/api/chat`;
  const body = {
    model,
    stream: false,
    messages: input.messages.map((m) => ({
      role: m.role,
      content: String(m.content || '')
    })),
    options: {
      temperature,
      top_p: topP,
      num_predict: maxTokens
    }
  };

  const res = await withTimeout(async (signal) => {
    return fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal
    });
  }, timeoutMs);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ollama HTTP ${res.status}: ${text || res.statusText}`);
  }

  const json: any = await res.json().catch(() => null);
  const content = String(json?.message?.content || '').trim();
  return { text: content, raw: json };
};

export const ollamaListModels = async (host: string, timeoutMs = 8000): Promise<string[]> => {
  const normalized = normalizeHost(host);
  if (!normalized) return [];

  const url = `${normalized}/api/tags`;
  const res = await withTimeout(async (signal) => {
    return fetch(url, { method: 'GET', headers: { Accept: 'application/json' }, signal });
  }, timeoutMs);

  if (!res.ok) return [];

  const json: any = await res.json().catch(() => null);
  const models = Array.isArray(json?.models) ? json.models : [];
  return models
    .map((m: any) => String(m?.name || '').trim())
    .filter(Boolean)
    .sort((a: string, b: string) => a.localeCompare(b));
};

export const getScrolithaOllamaHealth = async (scope: ScrolithaScope) => {
  const runtime = await resolveScrolithaLlmRuntime(scope);
  if (!runtime.enabled) {
    return {
      ok: false,
      provider: runtime.provider,
      enabled: false,
      host: runtime.host || null,
      model: runtime.model || null,
      error: 'Ollama runtime is not configured/enabled'
    };
  }

  try {
    const models = await ollamaListModels(runtime.host, Math.min(10_000, runtime.timeoutMs));
    const hasModel = models.includes(runtime.model);
    return {
      ok: true,
      provider: runtime.provider,
      enabled: true,
      host: runtime.host,
      model: runtime.model,
      models,
      modelPresent: hasModel
    };
  } catch (error: any) {
    return {
      ok: false,
      provider: runtime.provider,
      enabled: true,
      host: runtime.host,
      model: runtime.model,
      error: String(error?.message || 'Health check failed')
    };
  }
};
