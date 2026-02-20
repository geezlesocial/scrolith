import axios from 'axios';
import { Capacitor } from '@capacitor/core';
import { tokenStore } from './tokenStore';
import { getApiBaseUrl } from '../utils/apiBase';

const hasBackendEnv = Boolean(
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  import.meta.env.VITE_MOBILE_API_URL ||
  import.meta.env.VITE_MOBILE_API_BASE_URL
);
if (import.meta.env.PROD && !hasBackendEnv) {
  throw new Error('VITE_BACKEND_URL (or VITE_API_URL) must be set when building for production');
}

const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

const API_URL = getApiBaseUrl();
const parseTimeoutMs = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(5000, Math.min(60000, Math.floor(parsed)));
};
const DEFAULT_TIMEOUT_MS = parseTimeoutMs(import.meta.env.VITE_API_TIMEOUT_MS, isNative() ? 25000 : 15000);
const GET_RETRY_LIMIT = 1;
const RETRY_BASE_DELAY_MS = 350;
const shouldRetryRequest = (error: any) => {
  const config = (error?.config || {}) as any;
  const method = String(config?.method || 'get').toLowerCase();
  if (method !== 'get') return false;

  const retries = Number(config.__retryCount || 0);
  if (retries >= GET_RETRY_LIMIT) return false;

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

// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
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

// Request interceptor to add auth token
api.interceptors.request.use(
  async (config) => {
    const token = await readToken();
    if (token) {
      if (!config.headers) {
        config.headers = {};
      }
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor to handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      const headers = error.config?.headers || {};
      const authHeader = headers.Authorization || headers.authorization;
      const url = String(error.config?.url || '').toLowerCase();
      const message = String(
        error.response?.data?.error ||
        error.response?.data?.message ||
        ''
      ).toLowerCase();
      const isAuthValidationRoute =
        url.includes('/auth/me') ||
        url.includes('/auth/logout') ||
        url.includes('/auth/refresh');
      const isTokenInvalid =
        message.includes('invalid token') ||
        message.includes('jwt') ||
        message.includes('token expired') ||
        message.includes('no token provided') ||
        message.includes('user not found');

      // Clear session only when auth itself failed (invalid/expired token),
      // not for generic authorization failures on feature endpoints.
      if (authHeader && (isAuthValidationRoute || isTokenInvalid)) {
        await tokenStore.clear();
        try {
          localStorage.removeItem('user');
        } catch {}
        const isAuthRoute = window.location.pathname.startsWith('/auth/');
        if (!isAuthRoute) {
          window.location.href = '/auth/login';
        }
      }
    }

    if (shouldRetryRequest(error)) {
      const config = (error?.config || {}) as any;
      config.__retryCount = Number(config.__retryCount || 0) + 1;
      const jitter = Math.floor(Math.random() * 120);
      await wait(RETRY_BASE_DELAY_MS * config.__retryCount + jitter);
      return api.request(config);
    }

    return Promise.reject(error);
  }
);

export default api;
