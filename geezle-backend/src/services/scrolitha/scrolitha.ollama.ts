import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import prisma from '../../utils/prismaClient';
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

export const SCROLITHA_BACKUP_WARNING_CODE = 'SCROLITHA_BACKUP_ENGINE_USED';
export const SCROLITHA_BACKUP_WARNING_MESSAGE =
  'Scrolitha used backup processing for this suggestion. Please review before applying.';
export const SCROLITHA_UNAVAILABLE_MESSAGE =
  'Scrolitha is temporarily unavailable. Please try again shortly.';
export const SCROLITHA_PRODUCTION_ENDPOINT_WARNING =
  'Scrolitha Core endpoint is not configured for production.';

const OLLAMA_MODEL_PULL_TIMEOUT_MS = 240_000;
const ollamaPullsInFlight = new Map<string, Promise<void>>();
const LOCAL_ENDPOINT_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

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

const isProductionRuntime = () => String(process.env.NODE_ENV || '').trim().toLowerCase() === 'production';

const isLocalEndpoint = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return LOCAL_ENDPOINT_HOSTS.has(parsed.hostname.toLowerCase());
  } catch {
    const normalized = raw.toLowerCase();
    return (
      normalized.includes('localhost') ||
      normalized.includes('127.0.0.1') ||
      normalized.includes('0.0.0.0') ||
      normalized.includes('::1')
    );
  }
};

const sanitizeText = (value: unknown) =>
  String(value || '')
    .replace(/\s+/g, ' ')
    .trim();

const sanitizeDiagnosticMessage = (value: unknown, fallback = 'Scrolitha request failed') => {
  const source = sanitizeText(value);
  if (!source) return fallback;
  return source
    .replace(/https?:\/\/[^\s]+/gi, '[endpoint]')
    .replace(/\b(?:localhost|127\.0\.0\.1|0\.0\.0\.0|::1)\b/gi, '[local-endpoint]')
    .slice(0, 220);
};

export const sanitizeScrolithaUserMessage = (
  value: unknown,
  fallback = SCROLITHA_UNAVAILABLE_MESSAGE
) => {
  const source = sanitizeText(value);
  if (!source) return fallback;
  if (
    /\b(?:ollama|llama|localhost|127\.0\.0\.1|0\.0\.0\.0|::1|accelerator|local fallback|provider unavailable|provider failed)\b/i.test(
      source
    )
  ) {
    return fallback;
  }
  if (/not configured for production/i.test(source)) {
    return SCROLITHA_PRODUCTION_ENDPOINT_WARNING;
  }
  return source;
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

type CoreProviderKind = 'google' | 'openai';

type ScrolithaCoreProviderConfig = {
  kind: CoreProviderKind;
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
};

type ScrolithaGenerationInput = {
  scope: ScrolithaScope;
  routeKey?: string;
  systemPrompt?: string;
  userPrompt: string;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
};

export type ScrolithaGenerationResult = {
  text: string;
  model: string;
  engine: 'core' | 'ollama';
  transport: 'google' | 'openai' | 'ollama';
  usedBackupProcessing: boolean;
  warning?: string;
  warningCode?: string;
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

const getSystemAiConfig = async () => {
  const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
  const system = (record?.data as any) || {};
  return system.aiConfig || system?.system?.aiConfig || null;
};

const getMergedCoreAiConfig = async () => {
  const [systemConfig] = await Promise.all([getSystemAiConfig()]);
  const googleApiKey = pickString(
    systemConfig?.providers?.google?.apiKey,
    systemConfig?.providers?.google?.api_key,
    process.env.GOOGLE_API_KEY,
    process.env.GEMINI_API_KEY,
    process.env.GOOGLE_GEMINI_KEY
  );
  const openAiApiKey = pickString(
    systemConfig?.providers?.openai?.apiKey,
    systemConfig?.providers?.openai?.api_key,
    process.env.OPENAI_API_KEY
  );

  return {
    routing: systemConfig?.routing || {},
    safety: {
      maxTokens: Number(systemConfig?.safety?.maxTokens ?? systemConfig?.safety?.max_tokens ?? 1024),
      temperature: Number(systemConfig?.safety?.temperature ?? 0.35)
    },
    providers: {
      google: {
        enabled:
          typeof systemConfig?.providers?.google?.enabled === 'boolean'
            ? systemConfig.providers.google.enabled
            : Boolean(googleApiKey),
        apiKey: googleApiKey,
        model: String(systemConfig?.providers?.google?.model || process.env.GOOGLE_MODEL || 'gemini-1.5-flash').trim()
      },
      openai: {
        enabled:
          typeof systemConfig?.providers?.openai?.enabled === 'boolean'
            ? systemConfig.providers.openai.enabled
            : Boolean(openAiApiKey),
        apiKey: openAiApiKey,
        model: String(systemConfig?.providers?.openai?.model || process.env.OPENAI_MODEL || 'gpt-4o-mini').trim()
      }
    }
  };
};

const resolveCoreProviderCandidates = async (
  routeKey?: string,
  overrides?: { maxTokens?: number; temperature?: number }
): Promise<ScrolithaCoreProviderConfig[]> => {
  const config = await getMergedCoreAiConfig();
  const ordered = new Set<CoreProviderKind>();
  const preferred = String(config?.routing?.[String(routeKey || '').trim()] || '').trim().toLowerCase();
  if (preferred === 'google' || preferred === 'openai') {
    ordered.add(preferred);
  }
  ordered.add('google');
  ordered.add('openai');

  const safetyMaxTokens = Math.max(64, Math.min(4096, Math.floor(Number(overrides?.maxTokens ?? config?.safety?.maxTokens ?? 1024))));
  const safetyTemperature = Math.max(
    0,
    Math.min(1.5, Number(overrides?.temperature ?? config?.safety?.temperature ?? 0.35))
  );

  const candidates: ScrolithaCoreProviderConfig[] = [];
  ordered.forEach((kind) => {
    const provider = config?.providers?.[kind];
    if (!provider?.enabled) return;
    const apiKey = String(provider.apiKey || '').trim();
    if (!apiKey) return;
    candidates.push({
      kind,
      apiKey,
      model: String(provider.model || (kind === 'google' ? 'gemini-1.5-flash' : 'gpt-4o-mini')).trim(),
      maxTokens: safetyMaxTokens,
      temperature: safetyTemperature
    });
  });

  return candidates;
};

const callGoogleProvider = async (
  provider: ScrolithaCoreProviderConfig,
  input: ScrolithaGenerationInput
) => {
  const modelRef = new GoogleGenerativeAI(provider.apiKey).getGenerativeModel({ model: provider.model });
  const mergedPrompt = [sanitizeText(input.systemPrompt), sanitizeText(input.userPrompt)]
    .filter(Boolean)
    .join('\n\n');
  const result = await withTimeout(async () => {
    return modelRef.generateContent({
      contents: [{ role: 'user', parts: [{ text: mergedPrompt }] }],
      generationConfig: {
        maxOutputTokens: provider.maxTokens,
        temperature: provider.temperature
      }
    });
  }, Math.max(5000, Math.min(120_000, Math.floor(Number(input.maxTokens || provider.maxTokens) * 25))));

  return String(result.response.text() || '').trim();
};

const callOpenAiProvider = async (
  provider: ScrolithaCoreProviderConfig,
  input: ScrolithaGenerationInput
) => {
  const client = new OpenAI({ apiKey: provider.apiKey });
  const response = await withTimeout(async () => {
    return client.chat.completions.create({
      model: provider.model,
      messages: [
        ...(sanitizeText(input.systemPrompt)
          ? [{ role: 'system' as const, content: sanitizeText(input.systemPrompt) }]
          : []),
        { role: 'user' as const, content: sanitizeText(input.userPrompt) }
      ],
      max_tokens: provider.maxTokens,
      temperature: provider.temperature
    });
  }, 25_000);

  return String(response.choices?.[0]?.message?.content || '').trim();
};

const callCoreProvider = async (
  provider: ScrolithaCoreProviderConfig,
  input: ScrolithaGenerationInput
) => {
  if (provider.kind === 'google') {
    return callGoogleProvider(provider, input);
  }
  return callOpenAiProvider(provider, input);
};

const logProviderFailure = (label: string, error: unknown, details?: Record<string, unknown>) => {
  console.warn(`[scrolitha] ${label}`, {
    ...details,
    error: sanitizeDiagnosticMessage((error as any)?.message || error)
  });
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

export const generateScrolithaText = async (
  input: ScrolithaGenerationInput
): Promise<ScrolithaGenerationResult> => {
  const runtime = await resolveScrolithaLlmRuntime(input.scope);
  if (!runtime.enabled || runtime.provider === 'disabled') {
    throw new Error('Scrolitha is disabled');
  }

  const safeInput: ScrolithaGenerationInput = {
    ...input,
    systemPrompt: sanitizeText(input.systemPrompt),
    userPrompt: sanitizeText(input.userPrompt),
    maxTokens: Math.max(64, Math.min(4096, Math.floor(Number(input.maxTokens || runtime.maxTokens || 1024)))),
    temperature: Math.max(0, Math.min(1.5, Number(input.temperature ?? runtime.temperature ?? 0.35)))
  };
  const coreCandidates = await resolveCoreProviderCandidates(input.routeKey, {
    maxTokens: safeInput.maxTokens,
    temperature: safeInput.temperature
  });

  if (runtime.provider === 'ollama' && runtime.runtimeConfigured && runtime.host && runtime.model) {
    try {
      const result = await ollamaChat({
        host: runtime.host,
        model: runtime.model,
        messages: [
          ...(safeInput.systemPrompt ? [{ role: 'system' as const, content: safeInput.systemPrompt }] : []),
          { role: 'user' as const, content: safeInput.userPrompt }
        ],
        maxTokens: safeInput.maxTokens,
        temperature: safeInput.temperature,
        topP: safeInput.topP ?? runtime.topP,
        timeoutMs: runtime.timeoutMs
      });
      const text = String(result.text || '').trim();
      if (!text) throw new Error('Scrolitha returned an empty response');
      return {
        text,
        model: 'scrolitha-core',
        engine: 'ollama',
        transport: 'ollama',
        usedBackupProcessing: false
      };
    } catch (error) {
      logProviderFailure('primary self-hosted engine failed; attempting Scrolitha Core backup', error, {
        scope: input.scope,
        routeKey: input.routeKey || null
      });
    }
  }

  if (runtime.provider === 'ollama' && (!runtime.runtimeConfigured || (isProductionRuntime() && isLocalEndpoint(runtime.host)))) {
    logProviderFailure('self-hosted engine is misconfigured for current runtime', new Error('Self-hosted endpoint unavailable'), {
      scope: input.scope,
      routeKey: input.routeKey || null,
      production: isProductionRuntime()
    });
  }

  let providerFailureCount = 0;
  for (const candidate of coreCandidates) {
    try {
      const text = await callCoreProvider(candidate, safeInput);
      if (!text) throw new Error('Scrolitha returned an empty response');
      const usedBackupProcessing =
        runtime.provider === 'ollama' || providerFailureCount > 0;
      return {
        text,
        model: 'scrolitha-core',
        engine: 'core',
        transport: candidate.kind,
        usedBackupProcessing,
        ...(usedBackupProcessing
          ? {
              warning: SCROLITHA_BACKUP_WARNING_MESSAGE,
              warningCode: SCROLITHA_BACKUP_WARNING_CODE
            }
          : {})
      };
    } catch (error) {
      providerFailureCount += 1;
      logProviderFailure('Scrolitha Core transport failed', error, {
        scope: input.scope,
        routeKey: input.routeKey || null,
        transport: candidate.kind
      });
    }
  }

  throw new Error(
    runtime.provider === 'core'
      ? 'Scrolitha Core is not configured'
      : 'Scrolitha primary engine is unavailable'
  );
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
  const lastCheckedAt = new Date().toISOString();
  const backupEngineStatus = 'available';
  if (!runtime.enabled) {
    return {
      ok: false,
      provider: 'scrolitha',
      runtime: runtime.provider,
      enabled: false,
      status: 'disabled',
      availability: 'unavailable',
      host: null,
      model: runtime.model || null,
      backupEngineStatus,
      lastCheckedAt,
      error: 'Scrolitha is disabled by configuration.'
    };
  }

  if (runtime.provider === 'core') {
    const candidates = await resolveCoreProviderCandidates('scrolitha_core');
    if (!candidates.length) {
      return {
        ok: true,
        provider: 'scrolitha',
        runtime: 'core',
        enabled: true,
        status: 'degraded',
        availability: 'misconfigured',
        host: null,
        model: 'scrolitha-core',
        models: [],
        modelPresent: false,
        endpointConfigured: false,
        backupEngineStatus,
        lastCheckedAt,
        warning: SCROLITHA_PRODUCTION_ENDPOINT_WARNING
      };
    }
    return {
      ok: true,
      provider: 'scrolitha',
      runtime: 'core',
      enabled: true,
      status: 'operational',
      availability: 'online',
      host: null,
      model: 'scrolitha-core',
      models: [],
      modelPresent: true,
      autoPulled: false,
      endpointConfigured: true,
      backupEngineStatus,
      lastCheckedAt,
      note: 'Scrolitha Core is online.'
    };
  }

  if (!runtime.runtimeConfigured || (isProductionRuntime() && isLocalEndpoint(runtime.host))) {
    return {
      ok: true,
      provider: 'scrolitha',
      runtime: 'ollama',
      enabled: true,
      status: 'degraded',
      availability: 'misconfigured',
      host: runtime.host || null,
      model: runtime.model || 'scrolitha-core',
      models: [],
      modelPresent: false,
      autoPulled: false,
      endpointConfigured: false,
      backupEngineStatus,
      lastCheckedAt,
      warning: SCROLITHA_PRODUCTION_ENDPOINT_WARNING,
      diagnostics: {
        runtime: runtime.provider,
        endpoint: runtime.host || null
      }
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
      availability: modelPresent ? 'online' : 'unavailable',
      host: runtime.host,
      model: 'scrolitha-core',
      models,
      modelPresent,
      autoPulled,
      endpointConfigured: true,
      backupEngineStatus,
      lastCheckedAt,
      diagnostics: {
        runtime: runtime.provider,
        endpoint: runtime.host
      },
      ...(modelPresent
        ? {
            note: 'Scrolitha Core is online.'
          }
        : {
            warning: 'Scrolitha Core is unavailable. Backup processing remains available.'
          })
    };
  } catch (error: any) {
    return {
      ok: true,
      provider: 'scrolitha',
      runtime: 'ollama',
      enabled: true,
      status: 'degraded',
      availability: 'unavailable',
      host: runtime.host,
      model: 'scrolitha-core',
      endpointConfigured: true,
      backupEngineStatus,
      lastCheckedAt,
      warning: 'Scrolitha Core is unavailable. Backup processing remains available.',
      diagnostics: {
        runtime: runtime.provider,
        endpoint: runtime.host,
        error: sanitizeDiagnosticMessage(error?.message || 'Health check failed')
      }
    };
  }
};
