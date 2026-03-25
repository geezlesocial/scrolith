import type { Request } from 'express';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');
const normalizeSlashes = (value: string) => String(value || '').replace(/\\/g, '/');

const getPathFromUrl = (value: string) => {
  try {
    return new URL(value).pathname;
  } catch {
    return value;
  }
};

const joinBaseUrl = (baseUrl: string, pathname: string) => {
  const normalizedBase = trimTrailingSlash(baseUrl);
  const normalizedPath = pathname.startsWith('/') ? pathname : `/${pathname}`;
  return `${normalizedBase}${normalizedPath}`;
};

const deriveApiOriginFromAppUrl = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;

  try {
    const parsed = new URL(raw);
    const hostname = parsed.hostname.trim().toLowerCase();
    if (!hostname || LOCAL_HOSTS.has(hostname)) {
      return trimTrailingSlash(parsed.origin);
    }
    if (hostname.startsWith('api.')) {
      return trimTrailingSlash(parsed.origin);
    }

    const apiHostname = hostname.startsWith('www.')
      ? `api.${hostname.slice(4)}`
      : `api.${hostname}`;
    const port = parsed.port ? `:${parsed.port}` : '';
    return `${parsed.protocol}//${apiHostname}${port}`;
  } catch {
    return trimTrailingSlash(raw);
  }
};

const normalizeApiFilePath = (value: string) => {
  const normalized = normalizeSlashes(getPathFromUrl(value)).trim();
  const marker = '/api/files/content/';
  const index = normalized.toLowerCase().indexOf(marker);
  if (index < 0) {
    return normalized.startsWith('api/files/content/')
      ? `/${normalized}`
      : null;
  }
  return normalized.slice(index);
};

export const normalizeUploadsPath = (value: string) => {
  const normalized = normalizeSlashes(getPathFromUrl(value))
    .trim()
    .replace(/^\/+/, '');
  const lower = normalized.toLowerCase();
  const uploadsMarker = 'uploads/';
  const uploadsIndex = lower.indexOf(uploadsMarker);
  const relativePath = uploadsIndex >= 0
    ? normalized.slice(uploadsIndex + uploadsMarker.length)
    : normalized;
  return `/uploads/${relativePath.replace(/^\/+/, '')}`;
};

export const resolveFileBaseUrl = (req?: Request) => {
  const explicitBase =
    process.env.FILE_BASE_URL ||
    process.env.BACKEND_PUBLIC_URL ||
    process.env.PUBLIC_BACKEND_URL ||
    process.env.BACKEND_URL ||
    process.env.API_BASE_URL;
  if (explicitBase) return trimTrailingSlash(explicitBase);

  if (req?.headers?.host) {
    const proto = req.headers['x-forwarded-proto']?.toString().split(',')[0] || req.protocol || 'http';
    return `${proto}://${req.headers.host}`;
  }

  const derivedApiBase = deriveApiOriginFromAppUrl(
    process.env.APP_URL || process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL
  );
  if (derivedApiBase) return derivedApiBase;

  const host = process.env.HOST || 'localhost';
  const port = process.env.PORT || '5000';
  return `http://${host}:${port}`;
};

export const resolveDirectMediaUrl = (value?: string | null, baseUrl?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;

  const normalizedBase = String(baseUrl || '').trim();
  const absoluteBase = normalizedBase ? trimTrailingSlash(normalizedBase) : '';

  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      if (!LOCAL_HOSTS.has(parsed.hostname.trim().toLowerCase())) {
        return raw;
      }

      const apiPath = normalizeApiFilePath(parsed.pathname);
      if (apiPath) return absoluteBase ? joinBaseUrl(absoluteBase, apiPath) : apiPath;

      if (parsed.pathname.toLowerCase().includes('/uploads/') || parsed.pathname.toLowerCase().startsWith('/uploads/')) {
        const uploadsPath = normalizeUploadsPath(parsed.pathname);
        return absoluteBase ? joinBaseUrl(absoluteBase, uploadsPath) : uploadsPath;
      }

      return raw;
    } catch {
      return raw;
    }
  }

  const apiPath = normalizeApiFilePath(raw);
  if (apiPath) return apiPath;

  if (
    raw.startsWith('/uploads/') ||
    raw.startsWith('uploads/') ||
    raw.toLowerCase().includes('/uploads/')
  ) {
    return normalizeUploadsPath(raw);
  }

  if (raw.startsWith('/')) return raw;

  return null;
};
