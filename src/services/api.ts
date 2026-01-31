import axios from 'axios';
import { tokenStore } from './tokenStore';

const hasBackendEnv = Boolean(import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || import.meta.env.VITE_BACKEND_URL);
if (import.meta.env.PROD && !hasBackendEnv) {
  throw new Error('VITE_BACKEND_URL (or VITE_API_URL) must be set when building for production');
}

const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_BACKEND_URL ? `${String(import.meta.env.VITE_BACKEND_URL).replace(/\/$/, '')}/api` : '') ||
  '/api';
// Create axios instance with default config
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
  timeout: 10000,
});

const readToken = () => tokenStore.get();
const bootstrapToken = readToken();
if (bootstrapToken) {
  api.defaults.headers.common.Authorization = `Bearer ${bootstrapToken}`;
}

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = readToken();
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
  (error) => {
    if (error.response?.status === 401) {
      const headers = error.config?.headers || {};
      const authHeader = headers.Authorization || headers.authorization;
      // Only trigger a logout redirect when a request actually sent auth credentials.
      // This avoids logging out on public endpoints that return 401.
      if (authHeader) {
        tokenStore.clear();
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
