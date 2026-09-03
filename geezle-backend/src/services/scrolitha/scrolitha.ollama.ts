import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { GoogleAuth, IdTokenClient } from 'google-auth-library';
import http from 'node:http';
import https from 'node:https';
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
  sidecarMode: boolean;
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
const DEFAULT_SCROLITHA_MODEL = 'llama3.2:3b';

const OLLAMA_MODEL_PULL_TIMEOUT_MS = 240_000;
const ollamaPullsInFlight = new Map<string, Promise<void>>();
const selfHostedHealthCache = new Map<string, { expiresAt: number; value: Record<string, any> }>();
const idTokenClientCache = new Map<string, Promise<IdTokenClient>>();
const serviceIdentityTokenCache = new Map<string, { token: string; expiresAt: number }>();
const LOCAL_ENDPOINT_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);
const CLOUD_RUN_HOST_SUFFIXES = ['.run.app', '.a.run.app'];
const SELF_HOSTED_HEALTH_CACHE_TTL_MS = 30_000;
const SERVICE_IDENTITY_TOKEN_TTL_MS = 45 * 60_000;
const METADATA_IDENTITY_ENDPOINT =
  'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity';

const getBackupEngineStatus = (runtime: Pick<ScrolithaLlmRuntime, 'allowGeminiFallback'>) =>
  runtime.allowGeminiFallback ? 'available' : 'disabled by policy';

const getSelfHostedUnavailableWarning = (runtime: Pick<ScrolithaLlmRuntime, 'allowGeminiFallback'>) =>
  runtime.allowGeminiFallback
    ? 'Scrolitha Core is unavailable. Managed backup processing remains available.'
    : 'Scrolitha Core is unavailable. Managed backup processing is disabled by policy.';

const asBool = (value: unknown, fallback: boolean) => {
  const v = String(value ?? '').trim().toLowerCase();
  if (!v) return fallback;
  if (['1', 'true', 'yes', 'y', 'on'].includes(v)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(v)) return false;
  return fallback;
};

const isLocalOnlyRuntime = () =>
  asBool(process.env.SCROLITHA_AI_LOCAL_ONLY, false);

const shouldSkipSelfHostedAuth = () =>
  asBool(
    pickString(
      process.env.SCROLITHA_CORE_SKIP_AUTH,
      process.env.SCROLITHA_OLLAMA_SKIP_AUTH,
      process.env.SCROLITHA_CORE_PUBLIC
    ),
    false
  );

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

const isCloudRunHost = (value: unknown) => {
  const raw = String(value || '').trim();
  if (!raw) return false;
  try {
    const parsed = new URL(raw);
    return CLOUD_RUN_HOST_SUFFIXES.some((suffix) => parsed.hostname.toLowerCase().endsWith(suffix));
  } catch {
    return CLOUD_RUN_HOST_SUFFIXES.some((suffix) => raw.toLowerCase().includes(suffix));
  }
};

const isRunningOnCloudRun = () => Boolean(String(process.env.K_SERVICE || '').trim());

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

const isSelfHostedProvider = (provider: ScrolithaLlmRuntime['provider']) =>
  provider === 'core' || provider === 'ollama';

/**
 * Localhost/sidecar is valid for local dev and true co-located sidecars.
 * On production Cloud Run the backend and scrolitha-core are separate services —
 * a local endpoint is never reachable unless explicitly opted in.
 */
const isSidecarRuntimeAllowed = (runtime: Pick<ScrolithaLlmRuntime, 'host' | 'sidecarMode'>) => {
  if (!isLocalEndpoint(runtime.host)) return true;
  if (!isProductionRuntime()) return true;
  if (asBool(process.env.SCROLITHA_CORE_ALLOW_LOCAL_SIDECAR, false)) {
    return Boolean(runtime.sidecarMode);
  }
  // Cloud Run multi-service: local loopback cannot reach scrolitha-core.
  if (isRunningOnCloudRun()) return false;
  return Boolean(runtime.sidecarMode);
};

const isSelfHostedRuntimeUsable = (runtime: Pick<ScrolithaLlmRuntime, 'provider' | 'runtimeConfigured' | 'host' | 'sidecarMode'>) =>
  isSelfHostedProvider(runtime.provider) && runtime.runtimeConfigured && isSidecarRuntimeAllowed(runtime);

/** Safe, non-secret connectivity classification for diagnostics/ops. */
export type ScrolithaConnectivityClass =
  | 'remote_configured'
  | 'local_sidecar_allowed'
  | 'local_blocked_cloud_run'
  | 'local_production_sidecar'
  | 'missing_endpoint'
  | 'disabled';

export const classifyScrolithaConnectivity = (
  runtime: Pick<ScrolithaLlmRuntime, 'provider' | 'enabled' | 'host' | 'sidecarMode' | 'runtimeConfigured'>
): {
  class: ScrolithaConnectivityClass;
  usable: boolean;
  productionSafe: boolean;
  message: string;
} => {
  if (!runtime.enabled || runtime.provider === 'disabled') {
    return {
      class: 'disabled',
      usable: false,
      productionSafe: true,
      message: 'Scrolitha LLM provider is disabled by configuration.'
    };
  }
  if (!runtime.host) {
    return {
      class: 'missing_endpoint',
      usable: false,
      productionSafe: false,
      message: SCROLITHA_PRODUCTION_ENDPOINT_WARNING
    };
  }
  if (!isLocalEndpoint(runtime.host)) {
    return {
      class: 'remote_configured',
      usable: isSelfHostedRuntimeUsable({ ...runtime, runtimeConfigured: true }),
      productionSafe: true,
      message: 'Remote Scrolitha Core endpoint is configured.'
    };
  }
  if (isProductionRuntime() && isRunningOnCloudRun() && !asBool(process.env.SCROLITHA_CORE_ALLOW_LOCAL_SIDECAR, false)) {
    return {
      class: 'local_blocked_cloud_run',
      usable: false,
      productionSafe: false,
      message:
        'Local Scrolitha Core endpoint is not reachable from Cloud Run. Set SCROLITHA_CORE_ENDPOINT to the scrolitha-core service URL.'
    };
  }
  if (isProductionRuntime() && Boolean(runtime.sidecarMode)) {
    return {
      class: 'local_production_sidecar',
      usable: isSidecarRuntimeAllowed(runtime),
      productionSafe: isSidecarRuntimeAllowed(runtime),
      message: isSidecarRuntimeAllowed(runtime)
        ? 'Production local sidecar mode is explicitly allowed.'
        : SCROLITHA_PRODUCTION_ENDPOINT_WARNING
    };
  }
  return {
    class: 'local_sidecar_allowed',
    usable: isSidecarRuntimeAllowed(runtime),
    productionSafe: !isProductionRuntime(),
    message: 'Local sidecar/dev endpoint configuration.'
  };
};

const shouldAutoPullModel = (runtime: Pick<ScrolithaLlmRuntime, 'provider' | 'host' | 'sidecarMode'>) =>
  !isProductionRuntime() || (isSelfHostedProvider(runtime.provider) && Boolean(runtime.sidecarMode) && isLocalEndpoint(runtime.host));

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

const waitFor = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, Math.max(0, ms));
  });

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

const getSelfHostedAudience = (endpoint: string) => {
  const explicit = pickString(process.env.SCROLITHA_CORE_AUDIENCE, process.env.SCROLITHA_OLLAMA_AUDIENCE);
  if (explicit) return explicit;
  try {
    const parsed = new URL(endpoint);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return endpoint;
  }
};

const getIdTokenClient = async (audience: string) => {
  const key = String(audience || '').trim();
  if (!key) throw new Error('Missing Scrolitha Core audience');
  const existing = idTokenClientCache.get(key);
  if (existing) return existing;
  const pending = new GoogleAuth().getIdTokenClient(key);
  idTokenClientCache.set(key, pending);
  return pending;
};

const getServiceIdentityToken = async (audience: string) => {
  const key = String(audience || '').trim();
  if (!key) throw new Error('Missing Scrolitha Core audience');

  const now = Date.now();
  const cached = serviceIdentityTokenCache.get(key);
  if (cached && cached.expiresAt > now + 60_000) {
    return cached.token;
  }

  const endpoint = `${METADATA_IDENTITY_ENDPOINT}?audience=${encodeURIComponent(key)}&format=full`;
  const response = await fetch(endpoint, {
    method: 'GET',
    headers: {
      'Metadata-Flavor': 'Google'
    }
  });
  const token = String(await response.text().catch(() => '') || '').trim();
  if (!response.ok || !token) {
    throw new Error(`Unable to fetch Scrolitha Core identity token (${response.status || 'request failed'})`);
  }

  serviceIdentityTokenCache.set(key, {
    token,
    expiresAt: now + SERVICE_IDENTITY_TOKEN_TTL_MS
  });
  return token;
};

const buildSelfHostedRequestHeaders = async (endpoint: string, extra?: Record<string, string>) => {
  const headers: Record<string, string> = { ...(extra || {}) };
  if (shouldSkipSelfHostedAuth()) return headers;
  const bearerToken = pickString(process.env.SCROLITHA_CORE_BEARER_TOKEN, process.env.SCROLITHA_OLLAMA_BEARER_TOKEN);
  if (bearerToken) {
    headers['X-Scrolitha-Core-Token'] = bearerToken;
    return headers;
  }

  if (isCloudRunHost(endpoint)) {
    const audience = getSelfHostedAudience(endpoint);
    if (isRunningOnCloudRun()) {
      const token = await getServiceIdentityToken(audience);
      if (token) {
        headers.Authorization = `Bearer ${token}`;
        return headers;
      }
    }

    const client = await getIdTokenClient(audience);
    const authHeaders = await client.getRequestHeaders(audience);
    const authorization = String((authHeaders as any)?.Authorization || (authHeaders as any)?.authorization || '').trim();
    if (authorization) headers.Authorization = authorization;
  }

  return headers;
};

const readResponseText = async (response: Response) => {
  try {
    return String((await response.text()) || '').trim();
  } catch {
    return '';
  }
};

const requestViaNodeHttp = async (input: {
  url: string;
  method?: 'GET' | 'POST';
  headers?: Record<string, string>;
  body?: string;
  timeoutMs: number;
}) =>
  new Promise<{ status: number; bodyText: string }>((resolve, reject) => {
    const parsed = new URL(input.url);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.request(
      {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || undefined,
        path: `${parsed.pathname}${parsed.search}`,
        method: input.method || 'GET',
        headers: input.headers || {}
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
        res.on('end', () => {
          resolve({
            status: Number(res.statusCode || 0),
            bodyText: Buffer.concat(chunks).toString('utf8')
          });
        });
      }
    );

    req.setTimeout(input.timeoutMs, () => {
      req.destroy(new Error(`Request timed out after ${input.timeoutMs}ms`));
    });
    req.on('error', reject);
    if (input.body) req.write(input.body);
    req.end();
  });

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

const isTransientOllamaBusyError = (status: number, bodyText: string) => {
  if (![502, 503, 504].includes(status)) return false;
  const source = String(bodyText || '').trim().toLowerCase();
  if (!source) return true;
  return (
    source.includes('service unavailable') ||
    source.includes('loading model') ||
    source.includes('llm server') ||
    source.includes('try again') ||
    source.includes('timed out waiting')
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

export const ollamaPullModel = async (
  host: string,
  model: string,
  timeoutMs = OLLAMA_MODEL_PULL_TIMEOUT_MS
) => {
  const normalizedHost = normalizeHost(host);
  const normalizedModel = String(model || '').trim();
  if (!normalizedHost) throw new Error('Ollama host is missing');
  if (!normalizedModel) throw new Error('Ollama model is missing');

  const key = `${normalizedHost}::${normalizedModel.toLowerCase()}`;
  const existing = ollamaPullsInFlight.get(key);
  if (existing) return existing;

  const pullPromise = (async () => {
    const url = `${normalizedHost}/api/pull`;
    const headers = await buildSelfHostedRequestHeaders(normalizedHost, {
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });
    const res = await withTimeout(async (signal) => {
      return fetch(url, {
        method: 'POST',
        headers,
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
  const overrideHost = normalizeHost(pickString(override.coreEndpoint, override.ollamaHost, override.host));
  const requestedSidecarMode =
    typeof override.sidecarMode === 'boolean'
      ? override.sidecarMode
      : typeof override.coreSidecarMode === 'boolean'
        ? override.coreSidecarMode
        : undefined;
  const preserveRemoteBaseRuntime =
    isProductionRuntime() &&
    Boolean(base.host) &&
    !isLocalEndpoint(base.host) &&
    Boolean(overrideHost) &&
    isLocalEndpoint(overrideHost);

  const host = preserveRemoteBaseRuntime ? base.host : pickString(overrideHost, base.host);
  const model = preserveRemoteBaseRuntime
    ? String(base.model || '').trim()
    : pickString(override.coreModel, override.ollamaModel, override.model, base.model);
  const sidecarMode =
    preserveRemoteBaseRuntime
      ? false
      : typeof override.sidecarMode === 'boolean'
      ? override.sidecarMode
      : typeof override.coreSidecarMode === 'boolean'
        ? override.coreSidecarMode
        : base.sidecarMode;

  return {
    provider: isLocalOnlyRuntime()
      ? 'core'
      : provider === 'disabled'
        ? 'disabled'
        : provider === 'ollama'
          ? 'ollama'
          : provider === 'core' || provider === 'scrolitha'
            ? 'core'
            : base.provider,
    enabled,
    runtimeConfigured: base.runtimeConfigured,
    sidecarMode,
    acceleratorActive: base.acceleratorActive,
    status: base.status,
    host: normalizeHost(host),
    model: isLocalOnlyRuntime() ? DEFAULT_SCROLITHA_MODEL : String(model || '').trim(),
    maxTokens: Math.max(32, Math.min(8192, Math.floor(asNumber(override.maxTokens, base.maxTokens)))),
    temperature: Math.max(0, Math.min(2, asNumber(override.temperature, base.temperature))),
    topP: Math.max(0, Math.min(1, asNumber(override.topP, base.topP))),
    timeoutMs: Math.max(1000, Math.min(240_000, Math.floor(asNumber(override.timeoutMs, base.timeoutMs)))),
    enableStreaming:
      typeof override.enableStreaming === 'boolean' ? override.enableStreaming : base.enableStreaming,
    allowGeminiFallback: isLocalOnlyRuntime()
      ? false
      : typeof override.allowGeminiFallback === 'boolean'
        ? override.allowGeminiFallback || base.allowGeminiFallback
        : base.allowGeminiFallback
  };
};

export const resolveScrolithaLlmRuntime = async (scope: ScrolithaScope): Promise<ScrolithaLlmRuntime> => {
  const envProvider = String(process.env.SCROLITHA_PROVIDER || 'core').trim().toLowerCase();
  const envHost = normalizeHost(
    pickString(process.env.SCROLITHA_CORE_ENDPOINT, process.env.SCROLITHA_OLLAMA_HOST)
  );
  const envModel = isLocalOnlyRuntime()
    ? DEFAULT_SCROLITHA_MODEL
    : pickString(process.env.SCROLITHA_CORE_MODEL, process.env.SCROLITHA_OLLAMA_MODEL);
  const envSidecarMode = asBool(
    pickString(process.env.SCROLITHA_CORE_SIDECAR_MODE, process.env.SCROLITHA_OLLAMA_SIDECAR_MODE),
    false
  );

  const base: ScrolithaLlmRuntime = {
    provider: envProvider === 'disabled' ? 'disabled' : envProvider === 'ollama' ? 'ollama' : 'core',
    enabled: true,
    runtimeConfigured: false,
    sidecarMode: envSidecarMode,
    acceleratorActive: false,
    status: 'operational',
    host: envHost,
    model: envModel || DEFAULT_SCROLITHA_MODEL,
    maxTokens: Math.max(32, Math.min(8192, Math.floor(asNumber(process.env.SCROLITHA_MAX_TOKENS, 1024)))),
    temperature: Math.max(0, Math.min(2, asNumber(process.env.SCROLITHA_TEMPERATURE, 0.7))),
    topP: Math.max(0, Math.min(1, asNumber(process.env.SCROLITHA_TOP_P, 0.9))),
    timeoutMs: Math.max(1000, Math.min(240_000, Math.floor(asNumber(process.env.SCROLITHA_TIMEOUT_MS, 25_000)))),
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
  const sidecarAllowed = isSidecarRuntimeAllowed(runtime);
  const runtimeConfigured =
    isSelfHostedProvider(runtime.provider) &&
    runtime.enabled &&
    hostConfigured &&
    modelConfigured &&
    sidecarAllowed;
  const enabled = runtime.provider !== 'disabled' && runtime.enabled;
  const acceleratorActive = Boolean(runtime.sidecarMode) && runtimeConfigured && isLocalEndpoint(runtime.host);
  const connectivity = classifyScrolithaConnectivity({
    ...runtime,
    enabled,
    runtimeConfigured
  });
  const status = !enabled
    ? 'disabled'
    : runtimeConfigured && connectivity.usable
      ? 'operational'
      : 'degraded';

  if (
    isProductionRuntime() &&
    isRunningOnCloudRun() &&
    isSelfHostedProvider(runtime.provider) &&
    enabled &&
    (!runtimeConfigured || connectivity.class === 'local_blocked_cloud_run' || connectivity.class === 'missing_endpoint')
  ) {
    console.warn('[scrolitha] production core endpoint misconfiguration detected', {
      connectivityClass: connectivity.class,
      productionSafe: connectivity.productionSafe,
      message: connectivity.message,
      hasHost: hostConfigured,
      modelConfigured,
      // never log full endpoint secrets; only local-vs-remote class
      endpointClass: runtime.host ? (isLocalEndpoint(runtime.host) ? 'local' : 'remote') : 'missing'
    });
  }

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
  try {
    const record = await prisma.appSetting.findUnique({ where: { scope: 'system' } });
    const system = (record?.data as any) || {};
    return system.aiConfig || system?.system?.aiConfig || null;
  } catch (error) {
    logProviderFailure('system AI config lookup failed; falling back to runtime env', error);
    return null;
  }
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

const probeCoreRuntimeHealth = async (runtime: ScrolithaLlmRuntime) => {
  const lastCheckedAt = new Date().toISOString();
  const backupEngineStatus = getBackupEngineStatus(runtime);
  const candidates = await resolveCoreProviderCandidates('health_probe', {
    maxTokens: Math.max(64, Math.min(256, runtime.maxTokens || 128)),
    temperature: 0
  });

  const base = {
    ok: true,
    provider: 'scrolitha',
    runtime: runtime.provider,
    enabled: true,
    host: runtime.host || null,
    model: 'scrolitha-core',
    backupEngineStatus,
    lastCheckedAt
  };

  if (!candidates.length) {
    return {
      ...base,
      status: 'degraded',
      availability: 'misconfigured',
      models: [],
      modelPresent: false,
      autoPulled: false,
      endpointConfigured: false,
      warning: 'Scrolitha Core providers are not configured.',
      diagnostics: {
        runtime: runtime.provider,
        configuredModel: runtime.model || null
      }
    };
  }

  for (const candidate of candidates) {
    try {
      const text = await callCoreProvider(candidate, {
        scope: 'admin',
        routeKey: 'health_probe',
        systemPrompt: 'You are the Scrolitha Core health probe. Reply with READY only.',
        userPrompt: 'READY',
        maxTokens: Math.min(64, candidate.maxTokens),
        temperature: 0
      });

      if (!String(text || '').trim()) {
        throw new Error('Scrolitha Core probe returned an empty response');
      }

      return {
        ...base,
        status: 'operational',
        availability: 'online',
        models: candidates.map((entry) => entry.model),
        modelPresent: true,
        autoPulled: false,
        endpointConfigured: true,
        note: `Scrolitha Core is online via ${candidate.kind}.`,
        diagnostics: {
          runtime: runtime.provider,
          transport: candidate.kind,
          configuredModel: candidate.model
        }
      };
    } catch (error) {
      logProviderFailure('Scrolitha Core health probe failed', error, {
        transport: candidate.kind
      });
    }
  }

  return {
    ...base,
    status: 'degraded',
    availability: 'unavailable',
    models: candidates.map((entry) => entry.model),
    modelPresent: false,
    autoPulled: false,
    endpointConfigured: true,
    warning: 'Scrolitha Core is unavailable.',
    diagnostics: {
      runtime: runtime.provider,
      configuredModel: candidates[0]?.model || null
    }
  };
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
  autoPullModel?: boolean;
  allowNodeFallback?: boolean;
}): Promise<{ text: string; raw?: any }> => {
  const host = normalizeHost(input.host);
  if (!host) throw new Error('Ollama host is missing');
  const model = String(input.model || '').trim();
  if (!model) throw new Error('Ollama model is missing');

  const timeoutMs = Math.max(1000, Math.floor(asNumber(input.timeoutMs, 25_000)));
  const temperature = asNumber(input.temperature, 0.7);
  const topP = asNumber(input.topP, 0.9);
  const maxTokens = Math.max(32, Math.min(8192, Math.floor(asNumber(input.maxTokens, 1024))));
  const autoPullModel = input.autoPullModel !== false;
  const allowNodeFallback = input.allowNodeFallback !== false;
  const keepAlive = String(process.env.SCROLITHA_OLLAMA_KEEP_ALIVE || '24h').trim() || '24h';

  const url = `${host}/api/chat`;
  const body = {
    model,
    stream: false,
    think: false,
    messages: input.messages.map((m) => ({
      role: m.role,
      content: String(m.content || '')
    })),
    options: {
      temperature,
      top_p: topP,
      num_predict: maxTokens
    },
    keep_alive: keepAlive
  };

  const requestChat = async () => {
    const headers = await buildSelfHostedRequestHeaders(host, { 'Content-Type': 'application/json' });
    try {
      return await withTimeout(async (signal) => {
        return fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
          signal
        });
      }, timeoutMs);
    } catch (error) {
      if (!allowNodeFallback) throw error;
      const fallback = await requestViaNodeHttp({
        url,
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        timeoutMs
      });
      return new Response(fallback.bodyText, {
        status: fallback.status || 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  };

  const deadline = Date.now() + timeoutMs;
  let res = await requestChat();
  let responseText = '';
  while (!res.ok) {
    responseText = await readResponseText(res);
    if (autoPullModel && isMissingModelError(res.status, responseText)) {
      await ollamaPullModel(host, model, Math.max(OLLAMA_MODEL_PULL_TIMEOUT_MS, timeoutMs * 4));
      res = await requestChat();
      continue;
    }
    if (isTransientOllamaBusyError(res.status, responseText) && Date.now() < deadline) {
      const remainingMs = Math.max(0, deadline - Date.now());
      await waitFor(Math.min(5000, Math.max(1000, remainingMs)));
      res = await requestChat();
      continue;
    }
    throw new Error(`Ollama HTTP ${res.status}: ${responseText || res.statusText}`);
  }

  const json: any = await res.json().catch(() => null);
  const content = String(json?.message?.content || json?.response || '').trim();
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

  if (isSelfHostedRuntimeUsable(runtime) && runtime.host && runtime.model) {
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
        timeoutMs: runtime.timeoutMs,
        autoPullModel: shouldAutoPullModel(runtime)
      });
      const text = String(result.text || '').trim();
      if (!text) throw new Error('Scrolitha returned an empty response');
      return {
        text,
        model: 'scrolitha-core',
        engine: 'core',
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

  if (isSelfHostedProvider(runtime.provider) && !isSelfHostedRuntimeUsable(runtime)) {
    logProviderFailure('self-hosted engine is misconfigured for current runtime', new Error('Self-hosted endpoint unavailable'), {
      scope: input.scope,
      routeKey: input.routeKey || null,
      production: isProductionRuntime()
    });
  }

  if (!runtime.allowGeminiFallback) {
    throw new Error('Scrolitha Core is unavailable');
  }

  const coreCandidates = await resolveCoreProviderCandidates(input.routeKey, {
    maxTokens: safeInput.maxTokens,
    temperature: safeInput.temperature
  });

  let providerFailureCount = 0;
  for (const candidate of coreCandidates) {
    try {
      const text = await callCoreProvider(candidate, safeInput);
      if (!text) throw new Error('Scrolitha returned an empty response');
      const usedBackupProcessing = true;
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

  throw new Error('Scrolitha Core is unavailable');
};

export const ollamaListModels = async (host: string, timeoutMs = 8000): Promise<string[]> => {
  const normalized = normalizeHost(host);
  if (!normalized) return [];

  const url = `${normalized}/api/tags`;
  const headers = await buildSelfHostedRequestHeaders(normalized, { Accept: 'application/json' });
  const res = await withTimeout(async (signal) => {
    try {
      return await fetch(url, { method: 'GET', headers, signal });
    } catch {
      const fallback = await requestViaNodeHttp({
        url,
        method: 'GET',
        headers,
        timeoutMs
      });
      return new Response(fallback.bodyText, {
        status: fallback.status || 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }
  }, timeoutMs);

  if (!res.ok) return [];

  const json: any = await res.json().catch(() => null);
  const models = Array.isArray(json?.models) ? json.models : [];
  return models
    .map((m: any) => String(m?.name || '').trim())
    .filter(Boolean)
    .sort((a: string, b: string) => a.localeCompare(b));
};

export const ensureScrolithaRuntimeModel = async (scope: ScrolithaScope) => {
  const runtime = await resolveScrolithaLlmRuntime(scope);
  if (!runtime.enabled || !isSelfHostedProvider(runtime.provider) || !runtime.host || !runtime.model) {
    return {
      runtime,
      pulled: false,
      models: [] as string[],
      modelPresent: false
    };
  }

  let models = await ollamaListModels(runtime.host, Math.min(10_000, runtime.timeoutMs));
  let modelPresent = hasOllamaModel(models, runtime.model);
  let pulled = false;

  if (!modelPresent && shouldAutoPullModel(runtime)) {
    await ollamaPullModel(runtime.host, runtime.model, Math.max(OLLAMA_MODEL_PULL_TIMEOUT_MS, runtime.timeoutMs * 4));
    pulled = true;
    models = await ollamaListModels(runtime.host, Math.min(10_000, runtime.timeoutMs));
    modelPresent = hasOllamaModel(models, runtime.model);
  }

  return {
    runtime,
    pulled,
    models,
    modelPresent
  };
};

type SelfHostedProbeOptions = {
  /** deep=true runs a short READY chat after /api/tags; shallow tags-only is used by frequent health paths */
  deep?: boolean;
};

const probeSelfHostedRuntimeHealth = async (
  runtime: ScrolithaLlmRuntime,
  options: SelfHostedProbeOptions = {}
) => {
  const deep = options.deep !== false;
  const cacheKey = [
    runtime.provider,
    runtime.host,
    runtime.model,
    runtime.sidecarMode ? 'sidecar' : 'remote',
    deep ? 'deep' : 'shallow'
  ].join('::');
  const now = Date.now();
  const cached = selfHostedHealthCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const lastCheckedAt = new Date(now).toISOString();
  const backupEngineStatus = getBackupEngineStatus(runtime);
  const tagsTimeoutMs = deep
    ? Math.min(10_000, Math.max(2_000, runtime.timeoutMs || 8_000))
    : Math.min(3_500, Math.max(1_500, Math.floor((runtime.timeoutMs || 8_000) / 4)));

  const base = {
    ok: true,
    provider: 'scrolitha',
    runtime: runtime.provider,
    enabled: true,
    host: runtime.host || null,
    model: 'scrolitha-core',
    backupEngineStatus,
    lastCheckedAt,
    probeDepth: deep ? 'deep' : 'shallow'
  };

  if (!runtime.runtimeConfigured) {
    const value = {
      ...base,
      status: 'degraded',
      availability: 'misconfigured',
      models: [],
      modelPresent: false,
      autoPulled: false,
      endpointConfigured: false,
      warning: SCROLITHA_PRODUCTION_ENDPOINT_WARNING,
      diagnostics: {
        runtime: runtime.provider,
        endpoint: runtime.host || null,
        configuredModel: runtime.model || null
      }
    };
    selfHostedHealthCache.set(cacheKey, { expiresAt: now + SELF_HOSTED_HEALTH_CACHE_TTL_MS, value });
    return value;
  }

  if (!isSidecarRuntimeAllowed(runtime)) {
    const value = {
      ...base,
      status: 'degraded',
      availability: 'misconfigured',
      models: [],
      modelPresent: false,
      autoPulled: false,
      endpointConfigured: false,
      warning: SCROLITHA_PRODUCTION_ENDPOINT_WARNING,
      diagnostics: {
        runtime: runtime.provider,
        endpoint: runtime.host || null,
        configuredModel: runtime.model || null
      }
    };
    selfHostedHealthCache.set(cacheKey, { expiresAt: now + SELF_HOSTED_HEALTH_CACHE_TTL_MS, value });
    return value;
  }

  try {
    const models = await ollamaListModels(runtime.host, tagsTimeoutMs);
    const modelPresent = hasOllamaModel(models, runtime.model);
    if (!modelPresent) {
      const value = {
        ...base,
        status: 'degraded',
        availability: models.length ? 'unavailable' : 'unavailable',
        models,
        modelPresent: false,
        autoPulled: false,
        endpointConfigured: true,
        warning: getSelfHostedUnavailableWarning(runtime),
        diagnostics: {
          runtime: runtime.provider,
          endpoint: runtime.host,
          configuredModel: runtime.model || null,
          error: models.length
            ? 'Configured Scrolitha Core model is not available on the engine.'
            : 'Scrolitha Core /api/tags probe failed or returned no models.'
        }
      };
      selfHostedHealthCache.set(cacheKey, { expiresAt: now + SELF_HOSTED_HEALTH_CACHE_TTL_MS, value });
      return value;
    }

    // Shallow probe: tags + model presence is enough for orchestration/health dashboards.
    if (!deep) {
      const value = {
        ...base,
        status: 'operational',
        availability: 'online',
        models,
        modelPresent: true,
        autoPulled: false,
        endpointConfigured: true,
        note: 'Scrolitha Core is reachable (tags probe).',
        diagnostics: {
          runtime: runtime.provider,
          endpoint: runtime.host,
          configuredModel: runtime.model || null
        }
      };
      selfHostedHealthCache.set(cacheKey, { expiresAt: now + SELF_HOSTED_HEALTH_CACHE_TTL_MS, value });
      return value;
    }

    const probe = await ollamaChat({
      host: runtime.host,
      model: runtime.model,
      messages: [
        { role: 'system', content: 'You are the Scrolitha Core health probe. Reply with READY only.' },
        { role: 'user', content: 'READY' }
      ],
      maxTokens: 32,
      temperature: 0,
      topP: 0.1,
      timeoutMs: Math.min(15_000, runtime.timeoutMs),
      autoPullModel: false
    });

    if (!String(probe.text || '').trim()) {
      throw new Error('Scrolitha Core probe returned an empty response');
    }

    const value = {
      ...base,
      status: 'operational',
      availability: 'online',
      models,
      modelPresent: true,
      autoPulled: false,
      endpointConfigured: true,
      note: 'Scrolitha Core is online.',
      diagnostics: {
        runtime: runtime.provider,
        endpoint: runtime.host,
        configuredModel: runtime.model || null
      }
    };
    selfHostedHealthCache.set(cacheKey, { expiresAt: now + SELF_HOSTED_HEALTH_CACHE_TTL_MS, value });
    return value;
  } catch (error: any) {
    const value = {
      ...base,
      status: 'degraded',
      availability: 'unavailable',
      models: [],
      modelPresent: false,
      autoPulled: false,
      endpointConfigured: true,
      warning: getSelfHostedUnavailableWarning(runtime),
      diagnostics: {
        runtime: runtime.provider,
        endpoint: runtime.host,
        configuredModel: runtime.model || null,
        error: sanitizeDiagnosticMessage(error?.message || 'Health check failed')
      }
    };
    selfHostedHealthCache.set(cacheKey, { expiresAt: now + SELF_HOSTED_HEALTH_CACHE_TTL_MS, value });
    return value;
  }
};

export type ScrolithaRuntimeHealthOptions = {
  /** Prefer a pre-resolved runtime to avoid duplicate config lookups. */
  runtime?: ScrolithaLlmRuntime;
  /**
   * deep (default): tags + READY chat for admin model health.
   * shallow: tags-only for frequent provider/orchestration health.
   */
  deep?: boolean;
};

export const getScrolithaRuntimeHealth = async (
  scope: ScrolithaScope,
  options: ScrolithaRuntimeHealthOptions = {}
) => {
  const runtime = options.runtime || (await resolveScrolithaLlmRuntime(scope));
  const lastCheckedAt = new Date().toISOString();
  const backupEngineStatus = getBackupEngineStatus(runtime);
  const connectivity = classifyScrolithaConnectivity(runtime);
  const deep = options.deep !== false;

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
      connectivity,
      probeDepth: deep ? 'deep' : 'shallow',
      error: 'Scrolitha is disabled by configuration.'
    };
  }

  if (!isSelfHostedProvider(runtime.provider)) {
    const coreHealth = await probeCoreRuntimeHealth(runtime);
    return { ...coreHealth, connectivity, probeDepth: deep ? 'deep' : 'shallow' };
  }

  const selfHosted = await probeSelfHostedRuntimeHealth(runtime, { deep });
  return { ...selfHosted, connectivity };
};
