import { Capacitor } from '@capacitor/core';

const normalizeBase = (value: string) => value.replace(/\/+$/, '');
const ensureApiSuffix = (value: string) => (value.endsWith('/api') ? value : `${value}/api`);
const parseBool = (value: unknown, fallback = false) => {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
};
const isLocalHostLike = (host: string) => {
  const normalized = String(host || '').trim().toLowerCase();
  if (!normalized) return false;
  if (normalized === 'localhost' || normalized === '127.0.0.1' || normalized === '0.0.0.0' || normalized === '10.0.2.2') {
    return true;
  }
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(normalized)) {
    if (normalized.startsWith('192.168.') || normalized.startsWith('10.')) return true;
    if (normalized.startsWith('172.')) {
      const second = Number(normalized.split('.')[1] || '0');
      if (second >= 16 && second <= 31) return true;
    }
  }
  return false;
};
const parseHost = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    if (raw.startsWith('/')) return '';
    const parsed = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase();
  } catch {
    return '';
  }
};
const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim());
const resolveNativeProdFallbackBase = () => {
  const explicit = String(import.meta.env.VITE_NATIVE_PROD_API_URL || '').trim();
  if (explicit) return ensureApiSuffix(normalizeBase(explicit));

  const appDomainRaw =
    String(import.meta.env.VITE_PUBLIC_APP_DOMAIN || '').trim() ||
    String(import.meta.env.VITE_APP_DOMAIN || '').trim();
  if (appDomainRaw) {
    const host = parseHost(appDomainRaw);
    if (host) {
      const cleanHost = host.replace(/^www\./, '');
      return `https://api.${cleanHost}/api`;
    }
  }

  // Final safe fallback for production-native builds in this project.
  return 'https://api.scrolith.com/api';
};

const resolveEnvBase = () => {
  const envBase =
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    (import.meta.env.VITE_BACKEND_URL ? normalizeBase(String(import.meta.env.VITE_BACKEND_URL)) : '');
  if (!envBase) return '';
  return ensureApiSuffix(envBase);
};

const resolveMobileBase = () => {
  const mobileBase =
    import.meta.env.VITE_MOBILE_API_URL ||
    import.meta.env.VITE_MOBILE_API_BASE_URL;
  if (mobileBase) return ensureApiSuffix(normalizeBase(String(mobileBase)));
  return '';
};

const resolveNativeDevBase = () => {
  try {
    if (!Capacitor.isNativePlatform()) return '';
  } catch {
    return '';
  }
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return 'http://10.0.2.2:5000/api';
  if (platform === 'ios') return 'http://localhost:5000/api';
  return 'http://localhost:5000/api';
};

const isNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const getApiBaseUrl = () => {
  const native = isNativePlatform();
  const allowLocalApiInProd = parseBool(import.meta.env.VITE_ALLOW_LOCAL_API_IN_PROD, false);
  if (native) {
    // Safety: avoid accidentally shipping local/LAN mobile API overrides to production bundles.
    // Default behavior:
    // - PROD: prefer VITE_API_URL/VITE_BACKEND_URL; mobile override only when explicitly forced.
    // - DEV: allow mobile override first for on-device local testing.
    const forceMobileOverride = parseBool(import.meta.env.VITE_FORCE_MOBILE_API_OVERRIDE, false);
    if (!import.meta.env.PROD || forceMobileOverride) {
      const mobile = resolveMobileBase();
      if (mobile) return mobile;
    }
  }

  const envBase = resolveEnvBase();
  if (envBase) {
    if (native && import.meta.env.PROD) {
      const absolute = isAbsoluteUrl(envBase);
      if (!absolute) {
        return resolveNativeProdFallbackBase();
      }
      if (!allowLocalApiInProd) {
        const host = parseHost(envBase);
        if (isLocalHostLike(host)) {
          return resolveNativeProdFallbackBase();
        }
      }
    }
    return envBase;
  }

  if (native && import.meta.env.PROD) {
    const mobile = resolveMobileBase();
    if (mobile) {
      if (!allowLocalApiInProd) {
        const host = parseHost(mobile);
        if (!isLocalHostLike(host)) return mobile;
      } else {
        return mobile;
      }
    }
    return resolveNativeProdFallbackBase();
  }

  if (import.meta.env.DEV) {
    if (native) {
      const nativeDev = resolveNativeDevBase();
      if (nativeDev) return nativeDev;
    }
    return '/api';
  }

  return '/api';
};

export const getBackendOrigin = () => {
  const base = getApiBaseUrl();
  if (base.startsWith('/')) return '';
  try {
    const url = new URL(base);
    return url.origin;
  } catch {
    return '';
  }
};
