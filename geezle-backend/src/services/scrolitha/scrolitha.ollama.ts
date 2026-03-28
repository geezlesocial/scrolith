import { ensureScrolithaConfig } from './scrolitha.policy';
import type { ScrolithaScope } from './scrolitha.types';

export type OllamaChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

export type ScrolithaLlmRuntime = {
  provider: 'core' | 'ollama' | 'disabled';
  enabled: boolean;
  runtimeConfigured: boolean;
  acceleratorActive: boolean;
  status: 'operational' | 'accelerated' | 'degraded' | 'disabled';
  host: string;
  model: string;
  maxTokens: number;
  temperature: number;
  topP: number;
  timeoutMs: number;
  enableStreaming: boolean;
  allowGeminiFallback: boolean;
};

const OLLAMA_MODEL_PULL_TIMEOUT_MS = 240_000;
const ollamaPullsInFlight = new Map<string, Promise<void>>();

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

const normalizeHost = (value: string) =>
  String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/api(?:\/(?:chat|tags|pull))?$/i, '');

const pickString = (...values: Array<unknown>) => {
  for (const value of values) {
    const s = String(value ?? '').trim();
    if (s) return s;
  }
  return '';
};

const readResponseText = async (response: Response) => {
  try {
    return String((await response.text()) || '').trim();
  } catch {
    return '';
  }
};

const isAbortError = (error: any) =>
  Boolean(error) &&
  (String(error?.name || '').trim() === 'AbortError' ||
    String(error?.code || '').trim().toUpperCase() === 'ABORT_ERR');

const hasOllamaModel = (models: string[], requestedModel: string) => {
  const requested = String(requestedModel || '').trim().toLowerCase();
  if (!requested) return false;
  return models.some((model) => String(model || '').trim().toLowerCase() === requested);
};

const isMissingModelError = (status: number, bodyText: string) => {
  const source = String(bodyText || '').trim().toLowerCase();
  return (
    status === 404 ||
    source.includes('model') && source.includes('not found') ||
    source.includes('pull') && source.includes('model') && source.includes('not found')
  );
};

export const ollamaPullModel = async (host: string, model: string, timeoutMs = OLLAMA_MODEL_PULL_TIMEOUT_MS) => {
  const normalizedHost = normalizeHost(host);
  const normalizedModel = String(model || '').trim();
  if (!normalizedHost) throw new Error('Ollama host is missing');
  if (!normalizedModel) throw new Error('Ollama model is missing');

  const key = `${normalizedHost}::${normalizedModel.toLowerCase()}`;
  const existing = ollamaPullsInFlight.get(key);
  if (existing) return existing;

  const pullPromise = (async () => {
    const url = `${normalizedHost}/api/pull`;
    const res = await withTimeout(async (signal) => {
      return fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        body: JSON.stringify({
          name: normalizedModel,
          stream: false
        }),
        signal
      });
    }, Math.max(15_000, Math.floor(asNumber(timeoutMs, OLLAMA_MODEL_PULL_TIMEOUT_MS))));

    const responseText = await readResponseText(res);
    if (!res.ok) {
      throw new Error(`Ollama pull HTTP ${res.status}: ${responseText || res.statusText}`);
    }

    if (responseText) {
      try {
        const payload = JSON.parse(responseText);
        const errorMessage = String(payload?.error || '').trim();
        if (errorMessage) {
          throw new Error(`Ollama pull failed: ${errorMessage}`);
        }
      } catch (error: any) {
        if (!(error instanceof SyntaxError)) {
          throw error;
        }
      }
    }
  })().finally(() => {
    ollamaPullsInFlight.delete(key);
  });

  ollamaPullsInFlight.set(key, pullPromise);
  return pullPromise;
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
    provider:
      provider === 'disabled'
        ? 'disabled'
        : provider === 'ollama'
          ? 'ollama'
          : provider === 'core' || provider === 'scrolitha'
            ? 'core'
            : base.provider,
    enabled,
    runtimeConfigured: base.runtimeConfigured,
    acceleratorActive: base.acceleratorActive,
    status: base.status,
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
  const envProvider = String(process.env.SCROLITHA_PROVIDER || 'core').trim().toLowerCase();
  const envHost = normalizeHost(String(process.env.SCROLITHA_OLLAMA_HOST || '').trim());
  const envModel = String(process.env.SCROLITHA_OLLAMA_MODEL || '').trim();

  const base: ScrolithaLlmRuntime = {
    provider: envProvider === 'disabled' ? 'disabled' : envProvider === 'ollama' ? 'ollama' : 'core',
    enabled: true,
    runtimeConfigured: false,
    acceleratorActive: false,
    status: 'operational',
    host: envHost,
    model: envProvider === 'ollama' ? envModel || 'llama3.1' : envModel || 'scrolitha-core',
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
  const runtimeConfigured = runtime.provider === 'ollama' && runtime.enabled && hostConfigured && modelConfigured;
  const enabled = runtime.provider !== 'disabled' && runtime.enabled;
  const acceleratorActive = runtime.provider === 'ollama' && runtimeConfigured;
  const status = !enabled ? 'disabled' : acceleratorActive ? 'accelerated' : 'operational';

  return { ...runtime, enabled, runtimeConfigured, acceleratorActive, status };
};

const withTimeout = async <T>(fn: (signal: AbortSignal) => Promise<T>, timeoutMs: number) => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fn(controller.signal);
  } catch (error: any) {
    if (isAbortError(error)) {
      throw new Error(`Scrolitha AI timeout of ${timeoutMs}ms exceeded`);
    }
    throw error;
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

  const requestChat = () =>
    withTimeout(async (signal) => {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal
      });
    }, timeoutMs);

  let res = await requestChat();
  if (!res.ok) {
    let responseText = await readResponseText(res);
    if (isMissingModelError(res.status, responseText)) {
      await ollamaPullModel(host, model, Math.max(OLLAMA_MODEL_PULL_TIMEOUT_MS, timeoutMs * 4));
      res = await requestChat();
      responseText = await readResponseText(res);
    }
    if (!res.ok) {
      throw new Error(`Ollama HTTP ${res.status}: ${responseText || res.statusText}`);
    }
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

export const getScrolithaRuntimeHealth = async (scope: ScrolithaScope) => {
  const runtime = await resolveScrolithaLlmRuntime(scope);
  if (!runtime.enabled) {
    return {
      ok: false,
      provider: 'scrolitha',
      runtime: runtime.provider,
      enabled: false,
      status: 'disabled',
      host: runtime.host || null,
      model: runtime.model || null,
      error: 'Scrolitha is disabled by configuration.'
    };
  }

  if (runtime.provider === 'core') {
    return {
      ok: true,
      provider: 'scrolitha',
      runtime: 'core',
      enabled: true,
      status: 'operational',
      host: null,
      model: runtime.model || 'scrolitha-core',
      models: [],
      modelPresent: true,
      autoPulled: false,
      note: 'Scrolitha Core is active. Ollama is optional and can be enabled as an accelerator.'
    };
  }

  if (!runtime.runtimeConfigured) {
    return {
      ok: true,
      provider: 'scrolitha',
      runtime: 'ollama',
      enabled: true,
      status: 'degraded',
      host: runtime.host || null,
      model: runtime.model || 'llama3.1',
      models: [],
      modelPresent: false,
      autoPulled: false,
      warning: 'Ollama accelerator is not configured. Scrolitha Core remains active and will serve requests.'
    };
  }

  try {
    let models = await ollamaListModels(runtime.host, Math.min(10_000, runtime.timeoutMs));
    let modelPresent = hasOllamaModel(models, runtime.model);
    let autoPulled = false;

    if (!modelPresent && runtime.model) {
      await ollamaPullModel(runtime.host, runtime.model, Math.max(OLLAMA_MODEL_PULL_TIMEOUT_MS, runtime.timeoutMs * 4));
      autoPulled = true;
      models = await ollamaListModels(runtime.host, Math.min(15_000, Math.max(runtime.timeoutMs, 15_000)));
      modelPresent = hasOllamaModel(models, runtime.model);
    }

    return {
      ok: true,
      provider: 'scrolitha',
      runtime: 'ollama',
      enabled: true,
      status: modelPresent ? 'accelerated' : 'degraded',
      host: runtime.host,
      model: runtime.model,
      models,
      modelPresent,
      autoPulled,
      ...(modelPresent
        ? {
            note: 'Scrolitha is running with the Ollama accelerator.'
          }
        : {
            warning: 'Ollama is reachable, but the selected model is not ready yet. Scrolitha Core remains active.'
          })
    };
  } catch (error: any) {
    return {
      ok: true,
      provider: 'scrolitha',
      runtime: 'ollama',
      enabled: true,
      status: 'degraded',
      host: runtime.host,
      model: runtime.model,
      warning: `Ollama health check failed. Scrolitha Core remains active. ${String(
        error?.message || 'Health check failed'
      )}`
    };
  }
};
