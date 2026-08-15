import axios from 'axios';
import { tokenStore } from './tokenStore';
import { getApiBaseUrl } from '../utils/apiBase';
import { resolveAssetUrl } from '../utils/assetUrl';

// Keep Vite replacements static while allowing Node-only unit imports where
// import.meta.env has not been injected by the bundler.
const vite = {
  get PROD() {
    try { return Boolean(import.meta.env.PROD); } catch { return false; }
  },
  get VITE_API_URL() {
    try { return import.meta.env.VITE_API_URL as string | undefined; } catch { return undefined; }
  },
  get VITE_API_BASE_URL() {
    try { return import.meta.env.VITE_API_BASE_URL as string | undefined; } catch { return undefined; }
  },
  get VITE_BACKEND_URL() {
    try { return import.meta.env.VITE_BACKEND_URL as string | undefined; } catch { return undefined; }
  },
  get VITE_MOBILE_API_URL() {
    try { return import.meta.env.VITE_MOBILE_API_URL as string | undefined; } catch { return undefined; }
  },
  get VITE_MOBILE_API_BASE_URL() {
    try { return import.meta.env.VITE_MOBILE_API_BASE_URL as string | undefined; } catch { return undefined; }
  },
  get VITE_API_TIMEOUT_MS() {
    try { return import.meta.env.VITE_API_TIMEOUT_MS as string | undefined; } catch { return undefined; }
  }
};

const hasBackendEnv = Boolean(
  vite.VITE_API_URL ||
  vite.VITE_API_BASE_URL ||
  vite.VITE_BACKEND_URL ||
  vite.VITE_MOBILE_API_URL ||
  vite.VITE_MOBILE_API_BASE_URL
);
if (vite.PROD && !hasBackendEnv) {
  throw new Error('VITE_BACKEND_URL (or VITE_API_URL) must be set when building for production');
}

const isNative = () =>
  typeof window !== 'undefined' && Boolean((window as any).Capacitor);

const isAbsoluteRequestUrl = (value: unknown) => /^https?:\/\//i.test(String(value || '').trim());
const parseTimeoutMs = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5000, Math.min(60000, Math.floor(parsed)));
};
type NavigatorConnection = {
  effectiveType?: string;
  saveData?: boolean;
  downlink?: number;
};
const getNavigatorConnection = (): NavigatorConnection | null => {
  if (typeof navigator === 'undefined') return null;
  const nav = navigator as any;
  return (nav.connection || nav.mozConnection || nav.webkitConnection || null) as NavigatorConnection | null;
};
const isConstrainedNetwork = () => {
  const connection = getNavigatorConnection();
  if (!connection) return false;
  if (connection.saveData) return true;
  const effectiveType = String(connection.effectiveType || '').toLowerCase();
  if (effectiveType === 'slow-2g' || effectiveType === '2g') return true;
  const downlink = Number(connection.downlink || 0);
  if (Number.isFinite(downlink) && downlink > 0 && downlink < 1.2) return true;
  return false;
};
const DEFAULT_TIMEOUT_MS = parseTimeoutMs(
  vite.VITE_API_TIMEOUT_MS,
  isNative()
    ? (isConstrainedNetwork() ? 22000 : 20000)
    : (isConstrainedNetwork() ? 18000 : 16000)
);
const RETRY_BASE_DELAY_MS = 280;
const MAX_RETRY_DELAY_MS = 2500;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const parseRetryAfterMs = (error: any) => {
  const headers = (error?.response?.headers || {}) as Record<string, any>;
  const retryAfterRaw = headers['retry-after'];
  const seconds = Number.parseInt(String(retryAfterRaw || ''), 10);
  if (Number.isFinite(seconds) && seconds > 0) return clamp(seconds * 1000, 400, 4000);
  return null;
};
const getRetryLimit = (error: any) => {
  const status = Number(error?.response?.status || 0);
  if (status === 429) return 1;
  return isConstrainedNetwork() ? 1 : 2;
};
const computeRetryDelayMs = (error: any, attempt: number) => {
  const retryAfterMs = parseRetryAfterMs(error);
  if (retryAfterMs) return retryAfterMs;
  const jitter = 120 + Math.floor(Math.random() * 320);
  const multiplier = Math.max(1, attempt);
  const constrainedFactor = isConstrainedNetwork() ? 0.7 : 1;
  const exponential = RETRY_BASE_DELAY_MS * Math.pow(2, multiplier - 1) * constrainedFactor;
  return clamp(Math.floor(exponential + jitter), 250, MAX_RETRY_DELAY_MS);
};
const shouldRetryRequest = (error: any) => {
  const config = (error?.config || {}) as any;
  if (config.__skipRetry) return false;

  const method = String(config?.method || 'get').toLowerCase();
  if (method !== 'get') return false;

  const retries = Number(config.__retryCount || 0);
  if (retries >= getRetryLimit(error)) return false;

  const status = Number(error?.response?.status || 0);
  if (status && status < 500 && status !== 408 && status !== 429) return false;

  const code = String(error?.code || '').toUpperCase();
  const message = String(error?.message || '').toLowerCase();
  const timeoutLike =
    code === 'ECONNABORTED' ||
    message.includes('timeout') ||
    message.includes('network error') ||
    (!status && Boolean(error?.request));

  return timeoutLike || status === 408 || status === 429 || status >= 500;
};
const wait = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const shouldNormalizeAssetString = (value: string) => {
  const lower = value.toLowerCase();
  return (
    lower.includes('/uploads') ||
    lower.includes('/api/files/') ||
    lower.includes('/files/content/') ||
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('0.0.0.0') ||
    lower.includes('10.0.2.2')
  );
};

const normalizeAssetUrls = (input: any, seen = new WeakSet()): any => {
  if (typeof input === 'string') {
    return shouldNormalizeAssetString(input) ? resolveAssetUrl(input) : input;
  }
  if (!input || typeof input !== 'object') return input;
  if (seen.has(input)) return input;
  seen.add(input);

  if (Array.isArray(input)) {
    for (let i = 0; i < input.length; i += 1) {
      input[i] = normalizeAssetUrls(input[i], seen);
    }
    return input;
  }

  for (const key of Object.keys(input)) {
    input[key] = normalizeAssetUrls(input[key], seen);
  }
  return input;
};

// Create axios instance with default config
const api = axios.create({
  headers: {
    'Content-Type': 'application/json',
  },
  // In native builds we do not rely on cookies; disabling credentials avoids CORS
  // issues with capacitor:// origins and local dev servers.
  withCredentials: !isNative(),
  timeout: DEFAULT_TIMEOUT_MS,
});

const readToken = () => tokenStore.get();
void (async () => {
  const bootstrapToken = await readToken();
  if (bootstrapToken) {
    api.defaults.headers.common.Authorization = `Bearer ${bootstrapToken}`;
  }
})();

const createRequestId = () => {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch {
    // fall through
  }
  return `fe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
};

// Request interceptor to add auth token + correlation id
api.interceptors.request.use(
  async (config) => {
    if (!config.baseURL && !isAbsoluteRequestUrl(config.url)) {
      config.baseURL = getApiBaseUrl();
    }
    if (!config.headers) {
      config.headers = {};
    }
    const headers = config.headers as any;
    const existingRequestId =
      headers['x-request-id'] ||
      headers['X-Request-Id'] ||
      (typeof headers.get === 'function' ? headers.get('x-request-id') : null);
    if (!existingRequestId) {
      const requestId = createRequestId();
      if (typeof headers.set === 'function') {
        headers.set('x-request-id', requestId);
      } else {
        headers['x-request-id'] = requestId;
      }
    }
    const isFormDataPayload =
      typeof FormData !== 'undefined' &&
      config.data instanceof FormData;
    if (isFormDataPayload && config.headers) {
      if (typeof headers.delete === 'function') {
        headers.delete('Content-Type');
        headers.delete('content-type');
      } else {
        delete headers['Content-Type'];
        delete headers['content-type'];
      }
    }
    const token = await readToken();
    if (token) {
      if (typeof headers.set === 'function') {
        headers.set('Authorization', `Bearer ${token}`);
      } else {
        headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => {
    const responseType = String(response?.config?.responseType || '').toLowerCase();
    if (!responseType || responseType === 'json') {
      response.data = normalizeAssetUrls(response.data);
    }
    return response;
  },
  async (error) => {
    if (error.response?.status === 401) {
      const config = (error?.config || {}) as any;
      const url = String(error.config?.url || '').toLowerCase();
      const isAuthMeRoute = url.includes('/auth/me');
      const shouldClearForAuthCheck = isAuthMeRoute && config.__authValidation === true;

      // Feature/background endpoints can legitimately return 401 while the app
      // is still booting, after logout, or for optional widgets. Do not turn
      // those into global logout redirects. UserContext owns session invalidation
      // from the authoritative /auth/me check.
      if (shouldClearForAuthCheck) {
        try {
          window.dispatchEvent(new CustomEvent('scrolith:auth-invalid'));
        } catch {
          // Ignore event dispatch failures in non-browser contexts.
        }
      }
    }

    if (shouldRetryRequest(error)) {
      const config = (error?.config || {}) as any;
      config.__retryCount = Number(config.__retryCount || 0) + 1;
      await wait(computeRetryDelayMs(error, config.__retryCount));
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

export default api;
