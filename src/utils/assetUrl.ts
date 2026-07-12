import { getBackendOrigin } from './apiBase';

const localAssetHosts = new Set(['localhost', '127.0.0.1', '0.0.0.0', '10.0.2.2']);
const FILE_CONTENT_PATH = '/api/files/content/';
/** Used when getBackendOrigin() is empty so relative media never resolves against the SPA host. */
const DEFAULT_PRODUCTION_API_ORIGIN = 'https://api.scrolith.com';

type AssetTransformFit = 'inside' | 'cover' | 'contain';

type AssetTransformOptions = {
  width?: number | null;
  height?: number | null;
  fit?: AssetTransformFit;
  quality?: number | null;
};

const isAssetPath = (value: string) => {
  const v = value.toLowerCase();
  return (
    v.startsWith('/uploads') ||
    v.startsWith('uploads/') ||
    v.includes('/uploads/') ||
    v.startsWith('/api/files/') ||
    v.startsWith('api/files/') ||
    v.includes('/api/files/') ||
    v.startsWith('/files/content/') ||
    v.startsWith('files/content/') ||
    v.includes('/files/content/')
  );
};

const recoverEncodedAbsoluteAssetUrl = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return null;

  const lower = trimmed.toLowerCase();
  const markers = [
    '/api/files/content/',
    'api/files/content/',
    '/files/content/',
    'files/content/'
  ];

  for (const marker of markers) {
    const markerIndex = lower.indexOf(marker);
    if (markerIndex < 0) continue;
    const encodedStart = markerIndex + marker.length;
    const suffix = trimmed.slice(encodedStart);
    const queryIndex = suffix.search(/[?#]/);
    const encodedValue = (queryIndex >= 0 ? suffix.slice(0, queryIndex) : suffix).trim();
    if (!encodedValue) continue;

    try {
      const decoded = decodeURIComponent(encodedValue).trim();
      if (/^https?:\/\//i.test(decoded)) {
        return decoded;
      }
    } catch {
      continue;
    }
  }

  return null;
};

const resolveBackendOrigin = () => {
  const origin = String(getBackendOrigin() || '').trim().replace(/\/+$/, '');
  if (origin) return origin;

  if (typeof window !== 'undefined') {
    try {
      const host = String(window.location?.hostname || '').toLowerCase();
      // Signed-in SPA on scrolith.com must never load /api/files/* from the frontend origin.
      if (host === 'scrolith.com' || host.endsWith('.scrolith.com') || host.endsWith('.run.app')) {
        return DEFAULT_PRODUCTION_API_ORIGIN;
      }
    } catch {
      // ignore
    }
  }

  return '';
};

const isPlatformAssetHost = (hostname: string) => {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  if (localAssetHosts.has(host)) return true;
  if (host.includes('scrolith.com')) return true;
  // Historical Cloud Run backend host used in stored absolute media URLs.
  if (host.includes('scrolith-backend') && host.endsWith('.run.app')) return true;
  return false;
};

export const resolveAssetUrl = (value?: string | null) => {
  if (!value) return value ?? '';
  const trimmed = String(value).trim();
  if (!trimmed) return trimmed;

  const recoveredAbsoluteUrl = recoverEncodedAbsoluteAssetUrl(trimmed);
  if (recoveredAbsoluteUrl && recoveredAbsoluteUrl !== trimmed) {
    return resolveAssetUrl(recoveredAbsoluteUrl);
  }

  const lower = trimmed.toLowerCase();
  if (
    lower.startsWith('data:') ||
    lower.startsWith('blob:') ||
    lower.startsWith('mailto:') ||
    lower.startsWith('tel:')
  ) {
    return trimmed;
  }

  // disk: legacy local-file ids are served through the content API.
  if (lower.startsWith('disk:')) {
    const origin = resolveBackendOrigin() || DEFAULT_PRODUCTION_API_ORIGIN;
    return `${origin}/api/files/content/${encodeURIComponent(trimmed)}`;
  }

  let backendOrigin = resolveBackendOrigin();

  if (lower.startsWith('http://') || lower.startsWith('https://')) {
    if (!isAssetPath(lower)) return trimmed;
    try {
      const url = new URL(trimmed);
      const hostname = url.hostname.toLowerCase();
      if (!isPlatformAssetHost(hostname)) return trimmed;
      // Rewrite platform asset hosts to the active API origin so media is not
      // requested from the frontend SPA host (which returns HTML).
      const origin = backendOrigin || DEFAULT_PRODUCTION_API_ORIGIN;
      return `${origin}${url.pathname}${url.search}${url.hash}`;
    } catch {
      return trimmed;
    }
  }

  if (isAssetPath(lower)) {
    const origin = backendOrigin || DEFAULT_PRODUCTION_API_ORIGIN;
    if (lower.startsWith('uploads/')) return `${origin}/${trimmed}`;
    if (lower.startsWith('api/files/')) return `${origin}/${trimmed}`;
    if (lower.startsWith('files/content/')) return `${origin}/${trimmed}`;
    return `${origin}${trimmed.startsWith('/') ? trimmed : `/${trimmed}`}`;
  }

  return trimmed;
};

const normalizePositiveInt = (value?: number | null) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.max(1, Math.min(4096, Math.round(parsed)));
};

export const resolveResponsiveAssetUrl = (
  value?: string | null,
  options: AssetTransformOptions = {}
) => {
  const resolved = resolveAssetUrl(value);
  if (!resolved) return resolved ?? '';

  const width = normalizePositiveInt(options.width);
  const height = normalizePositiveInt(options.height);
  if (!width && !height) return resolved;

  const fit: AssetTransformFit =
    options.fit === 'cover' || options.fit === 'contain' ? options.fit : 'inside';
  const quality = normalizePositiveInt(options.quality);
  const isAbsolute = /^https?:\/\//i.test(resolved);
  const fallbackOrigin =
    getBackendOrigin() ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://scrolith.com');

  try {
    const url = new URL(resolved, fallbackOrigin);
    if (!url.pathname.toLowerCase().includes(FILE_CONTENT_PATH)) {
      return resolved;
    }
    if (width) url.searchParams.set('w', String(width));
    if (height) url.searchParams.set('h', String(height));
    url.searchParams.set('fit', fit);
    if (quality) url.searchParams.set('q', String(Math.max(40, Math.min(90, quality))));
    return isAbsolute ? url.toString() : `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return resolved;
  }
};

export const resolveOptimizedStaticImageUrl = (value?: string | null) => {
  const resolved = resolveAssetUrl(value);
  if (!resolved) return resolved ?? '';

  return resolved;
};
