const DEFAULT_PUBLIC_APP_HOST = 'scrolith.com';

const normalizeHost = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw.startsWith('http://') || raw.startsWith('https://') ? raw : `https://${raw}`);
    return parsed.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return raw
      .replace(/^https?:\/\//i, '')
      .replace(/\/.*$/, '')
      .toLowerCase()
      .replace(/^www\./, '');
  }
};

const normalizePath = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '/';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname || '/'}${parsed.search}${parsed.hash}`;
    } catch {
      return '/';
    }
  }
  if (raw.startsWith('?') || raw.startsWith('#')) return `/${raw}`;
  return raw.startsWith('/') ? raw : `/${raw}`;
};

export const getCanonicalAppHost = () => {
  const configured =
    normalizeHost(String(import.meta.env.VITE_PUBLIC_APP_DOMAIN || '').trim()) ||
    normalizeHost(String(import.meta.env.VITE_APP_DOMAIN || '').trim());
  return configured || DEFAULT_PUBLIC_APP_HOST;
};

export const getCanonicalAppOrigin = () => `https://${getCanonicalAppHost()}`;

export const buildCanonicalAppUrl = (path = '/') => `${getCanonicalAppOrigin()}${normalizePath(path)}`;

export const getPublicAppOrigin = () => {
  if (typeof window === 'undefined') return getCanonicalAppOrigin();

  const canonicalHost = getCanonicalAppHost();
  const currentHost = String(window.location.hostname || '').trim().toLowerCase();
  if (currentHost === canonicalHost || currentHost === `www.${canonicalHost}`) {
    return getCanonicalAppOrigin();
  }

  return window.location.origin.replace(/\/+$/, '');
};

export const buildPublicAppUrl = (path = '/') => `${getPublicAppOrigin()}${normalizePath(path)}`;

export const getCanonicalRedirectUrl = () => {
  if (typeof window === 'undefined' || !import.meta.env.PROD) return '';

  const canonicalHost = getCanonicalAppHost();
  const currentHost = String(window.location.hostname || '').trim().toLowerCase();
  if (currentHost !== `www.${canonicalHost}`) return '';

  return `https://${canonicalHost}${window.location.pathname}${window.location.search}${window.location.hash}`;
};
