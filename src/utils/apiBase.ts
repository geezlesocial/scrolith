import { Capacitor } from '@capacitor/core';

const normalizeBase = (value: string) => value.replace(/\/+$/, '');
const ensureApiSuffix = (value: string) => (value.endsWith('/api') ? value : `${value}/api`);

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
  if (native) {
    const mobile = resolveMobileBase();
    if (mobile) return mobile;
  }

  const envBase = resolveEnvBase();
  if (envBase) return envBase;

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
