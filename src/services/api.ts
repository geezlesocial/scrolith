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
// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  // In native builds we do not rely on cookies; disabling credentials avoids CORS
  // issues with capacitor:// origins and local dev servers.
  withCredentials: !isNative(),
  timeout: 10000,
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
    return Promise.reject(error);
  }
);

export default api;
