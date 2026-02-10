import { getBackendOrigin } from './apiBase';

const localAssetHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2']);

const isAssetPath = (value: string) => {
  const v = value.toLowerCase();
  return v.startsWith('/uploads') || v.startsWith('uploads/') || v.includes('/uploads/');
};

export const resolveAssetUrl = (value?: string | null) => {
  if (!value) return value ?? '';
  const trimmed = String(value).trim();
  if (!trimmed) return trimmed;

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  ) {
    return trimmed;
  }

  const backendOrigin = getBackendOrigin();
  if (!backendOrigin) return trimmed;

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    if (!isAssetPath(lower)) return trimmed;
    try {
      const url = new URL(trimmed);
      if (!localAssetHosts.has(url.hostname.toLowerCase())) return trimmed;
      return `${backendOrigin}${url.pathname}${url.search}${url.hash}`;
    } catch {
      return trimmed;
    }
  }

  if (isAssetPath(lower)) {
    if (lower.startsWith('uploads/')) return `${backendOrigin}/${trimmed}`;
    return `${backendOrigin}${trimmed}`;
  }

  return trimmed;
};
