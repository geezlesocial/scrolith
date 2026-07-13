import type { Request } from 'express';

const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '0.0.0.0', '::1']);

const trimTrailingSlash = (value: string) => String(value || '').replace(/\/+$/, '');
const normalizeSlashes = (value: string) => String(value || '').replace(/\\/g, '/');

/**
 * Canonical internal media descriptor used when shaping API responses.
 * Not every field is always present on the wire.
 */
export type MediaDescriptor = {
  fileId?: string | null;
  url?: string | null;
  fallbackUrl?: string | null;
  storagePath?: string | null;
  mimeType?: string | null;
  width?: number | null;
  height?: number | null;
  durationSeconds?: number | null;
  posterUrl?: string | null;
  thumbnailUrl?: string | null;
  isPublic?: boolean | null;
};

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

export const buildFileContentUrl = (fileId: string, baseUrl?: string | null) => {
  const id = String(fileId || '').trim();
  if (!id) return '';
  // Never double-wrap absolute or already-canonical content paths.
  if (/^https?:\/\//i.test(id)) return id;
  const lower = id.toLowerCase();
  if (lower.includes('/api/files/content/') || lower.startsWith('api/files/content/') || lower.startsWith('/api/files/content/')) {
    if (id.startsWith('/')) return baseUrl ? joinBaseUrl(String(baseUrl), id) : id;
    if (lower.startsWith('api/files/content/')) {
      const path = `/${id.replace(/^\/+/, '')}`;
      return baseUrl ? joinBaseUrl(String(baseUrl), path) : path;
    }
    return id;
  }
  const path = `/api/files/content/${encodeURIComponent(id)}`;
  return baseUrl ? joinBaseUrl(String(baseUrl), path) : path;
};

export const buildUploadsUrl = (storagePath: string, baseUrl?: string | null) => {
  const relative = normalizeUploadsPath(storagePath).replace(/^\/uploads\//, '');
  if (!relative) return '';
  const path = `/uploads/${relative.replace(/^\/+/, '')}`;
  return baseUrl ? joinBaseUrl(String(baseUrl), path) : path;
};

export const isSignedOrTokenizedUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw || !/^https?:\/\//i.test(raw)) return false;
  try {
    const url = new URL(raw);
    for (const key of url.searchParams.keys()) {
      const k = String(key || '').toLowerCase();
      if (
        k.includes('signature') ||
        k.includes('x-amz-') ||
        k.startsWith('x-goog-') ||
        k.startsWith('x-oss-') ||
        k === 'token' ||
        k === 'sig' ||
        k === 'expires' ||
        k === 'expire' ||
        k === 'expiry' ||
        k === 'key-pair-id' ||
        k === 'policy' ||
        k === 'credential' ||
        k.includes('credential')
      ) {
        return true;
      }
    }
  } catch {
    return false;
  }
  return false;
};

export const isLegacyUploadsUrl = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/') ||
    normalized.includes('/uploads/')
  );
};

export const isFileContentUrl = (value?: string | null) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('/api/files/content/') ||
    normalized.startsWith('api/files/content/') ||
    normalized.includes('/files/content/')
  );
};

export const looksLikeFileId = (value?: string | null) => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (normalized.toLowerCase().startsWith('disk:')) return true;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:') || normalized.startsWith('blob:')) {
    return false;
  }
  if (isLegacyUploadsUrl(normalized) || isFileContentUrl(normalized) || normalized.startsWith('/')) {
    return false;
  }
  if (/\s/.test(normalized)) return false;
  if (/^[a-z0-9_-]{12,}$/i.test(normalized)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }
  return false;
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
      // Signed / external hosts must never be rewritten.
      if (isSignedOrTokenizedUrl(raw)) return raw;
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
  if (apiPath) return absoluteBase ? joinBaseUrl(absoluteBase, apiPath) : apiPath;

  if (
    raw.startsWith('/uploads/') ||
    raw.startsWith('uploads/') ||
    raw.toLowerCase().includes('/uploads/')
  ) {
    const uploadsPath = normalizeUploadsPath(raw);
    return absoluteBase ? joinBaseUrl(absoluteBase, uploadsPath) : uploadsPath;
  }

  if (raw.startsWith('/')) return absoluteBase ? joinBaseUrl(absoluteBase, raw) : raw;

  return null;
};

const pickFirstString = (...values: unknown[]) => {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
};

/**
 * Safe precedence:
 * 1. signed URLs
 * 2. external HTTPS
 * 3. already-canonical content URLs
 * 4. content URL when fileId is known AND file is confirmed servable (optional flag)
 * 5. legacy /uploads URL or storagePath
 * 6. relative path resolution
 * 7. empty
 *
 * Never converts a working /uploads URL into a content URL unless fileServable is true.
 */
export const resolveMediaDescriptor = (
  input?: any,
  options?: {
    baseUrl?: string | null;
    fileServable?: boolean | null;
  }
): MediaDescriptor => {
  if (input == null || input === '') {
    return { url: null, fallbackUrl: null };
  }

  const baseUrl = options?.baseUrl ?? null;
  const fileServable = options?.fileServable === true;

  if (typeof input === 'string') {
    const raw = input.trim();
    if (!raw) return { url: null, fallbackUrl: null };
    if (isSignedOrTokenizedUrl(raw) || /^https?:\/\//i.test(raw)) {
      return { url: resolveDirectMediaUrl(raw, baseUrl) || raw, fallbackUrl: null };
    }
    if (looksLikeFileId(raw)) {
      return {
        fileId: raw,
        url: fileServable || raw.toLowerCase().startsWith('disk:')
          ? buildFileContentUrl(raw, baseUrl)
          : buildFileContentUrl(raw, baseUrl),
        fallbackUrl: null
      };
    }
    const resolved = resolveDirectMediaUrl(raw, baseUrl);
    return { url: resolved, fallbackUrl: null, storagePath: isLegacyUploadsUrl(raw) ? raw : null };
  }

  const fileId = pickFirstString(
    input.fileId,
    input.file_id,
    input.mediaFileId,
    input.media_file_id,
    input.logoFileId,
    input.coverFileId,
    input.profilePhotoFileId,
    input.imageFileId,
    input.avatarFileId,
    input.id && looksLikeFileId(input.id) ? input.id : '',
    input.file?.id,
    input.file?.fileId
  );

  const storagePath = pickFirstString(
    input.storagePath,
    input.storage_path,
    input.storageKey,
    input.storage_key,
    input.file?.storageKey,
    input.file?.storage_key
  );

  const directUrl = pickFirstString(
    input.url,
    input.path,
    input.downloadUrl,
    input.download_url,
    input.fileUrl,
    input.file_url,
    input.mediaUrl,
    input.media_url,
    input.videoUrl,
    input.video_url,
    input.src,
    input.href,
    input.publicUrl,
    input.public_url,
    input.secureUrl,
    input.secure_url,
    input.avatarUrl,
    input.logoUrl,
    input.coverUrl,
    input.file?.url,
    input.asset?.url,
    input.media?.url
  );

  const posterUrl = pickFirstString(
    input.posterUrl,
    input.poster_url,
    input.thumbnailUrl,
    input.thumbnail_url,
    input.previewUrl,
    input.preview_url,
    input.poster?.url,
    input.thumbnail?.url
  );

  const resolvedDirect = directUrl ? resolveDirectMediaUrl(directUrl, baseUrl) : null;
  const uploadsFromPath = storagePath ? buildUploadsUrl(storagePath, baseUrl) : null;
  const uploadsFromDirect =
    resolvedDirect && isLegacyUploadsUrl(resolvedDirect) ? resolvedDirect : null;
  const legacyUploads = uploadsFromDirect || uploadsFromPath || null;

  const contentFromDirect =
    resolvedDirect && isFileContentUrl(resolvedDirect) ? resolvedDirect : null;
  const contentFromFileId =
    fileId && looksLikeFileId(fileId) ? buildFileContentUrl(fileId, baseUrl) : null;

  // Signed / external non-platform URLs win unconditionally.
  if (resolvedDirect && isSignedOrTokenizedUrl(resolvedDirect)) {
    return {
      fileId: fileId || null,
      url: resolvedDirect,
      fallbackUrl: legacyUploads && legacyUploads !== resolvedDirect ? legacyUploads : null,
      storagePath: storagePath || null,
      mimeType: input.mimeType || input.mime_type || null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? input.duration ?? null,
      posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      isPublic: input.isPublic ?? null
    };
  }

  if (
    resolvedDirect &&
    /^https?:\/\//i.test(resolvedDirect) &&
    !isLegacyUploadsUrl(resolvedDirect) &&
    !isFileContentUrl(resolvedDirect)
  ) {
    return {
      fileId: fileId || null,
      url: resolvedDirect,
      fallbackUrl: legacyUploads && legacyUploads !== resolvedDirect ? legacyUploads : null,
      storagePath: storagePath || null,
      mimeType: input.mimeType || input.mime_type || null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? input.duration ?? null,
      posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      isPublic: input.isPublic ?? null
    };
  }

  // Already-canonical content URL.
  if (contentFromDirect) {
    return {
      fileId: fileId || null,
      url: contentFromDirect,
      fallbackUrl: legacyUploads && legacyUploads !== contentFromDirect ? legacyUploads : null,
      storagePath: storagePath || null,
      mimeType: input.mimeType || input.mime_type || null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? input.duration ?? null,
      posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      isPublic: input.isPublic ?? null
    };
  }

  // Dual-path: only prefer content when caller confirmed the File row is servable.
  // Otherwise keep working legacy /uploads primary and optionally attach content as fallback.
  if (contentFromFileId && legacyUploads) {
    if (fileServable) {
      return {
        fileId,
        url: contentFromFileId,
        fallbackUrl: legacyUploads,
        storagePath: storagePath || null,
        mimeType: input.mimeType || input.mime_type || null,
        width: input.width ?? null,
        height: input.height ?? null,
        durationSeconds: input.durationSeconds ?? input.duration ?? null,
        posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
        thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
        isPublic: input.isPublic ?? null
      };
    }
    return {
      fileId,
      url: legacyUploads,
      fallbackUrl: contentFromFileId,
      storagePath: storagePath || null,
      mimeType: input.mimeType || input.mime_type || null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? input.duration ?? null,
      posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      isPublic: input.isPublic ?? null
    };
  }

  if (contentFromFileId) {
    return {
      fileId,
      url: contentFromFileId,
      fallbackUrl: null,
      storagePath: storagePath || null,
      mimeType: input.mimeType || input.mime_type || null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? input.duration ?? null,
      posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      isPublic: input.isPublic ?? null
    };
  }

  if (legacyUploads) {
    return {
      fileId: fileId || null,
      url: legacyUploads,
      fallbackUrl: null,
      storagePath: storagePath || null,
      mimeType: input.mimeType || input.mime_type || null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? input.duration ?? null,
      posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      isPublic: input.isPublic ?? null
    };
  }

  if (resolvedDirect) {
    return {
      fileId: fileId || null,
      url: resolvedDirect,
      fallbackUrl: null,
      storagePath: storagePath || null,
      mimeType: input.mimeType || input.mime_type || null,
      width: input.width ?? null,
      height: input.height ?? null,
      durationSeconds: input.durationSeconds ?? input.duration ?? null,
      posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
      isPublic: input.isPublic ?? null
    };
  }

  return {
    fileId: fileId || null,
    url: null,
    fallbackUrl: null,
    storagePath: storagePath || null,
    mimeType: input.mimeType || input.mime_type || null,
    width: input.width ?? null,
    height: input.height ?? null,
    durationSeconds: input.durationSeconds ?? input.duration ?? null,
    posterUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
    thumbnailUrl: posterUrl ? resolveDirectMediaUrl(posterUrl, baseUrl) : null,
    isPublic: input.isPublic ?? null
  };
};

export const preferServableMediaUrl = (
  input?: any,
  options?: { baseUrl?: string | null; fileServable?: boolean | null }
) => {
  const descriptor = resolveMediaDescriptor(input, options);
  return String(descriptor.url || '').trim() || null;
};

export const normalizePublicMedia = (
  input?: any,
  options?: { baseUrl?: string | null; fileServable?: boolean | null }
) => {
  const descriptor = resolveMediaDescriptor(input, options);
  if (!descriptor.url && !descriptor.fallbackUrl && !descriptor.fileId) return null;
  return {
    fileId: descriptor.fileId || null,
    url: descriptor.url || null,
    fallbackUrl: descriptor.fallbackUrl || null,
    storagePath: descriptor.storagePath || null,
    mimeType: descriptor.mimeType || null,
    width: descriptor.width ?? null,
    height: descriptor.height ?? null,
    durationSeconds: descriptor.durationSeconds ?? null,
    posterUrl: descriptor.posterUrl || null,
    thumbnailUrl: descriptor.thumbnailUrl || descriptor.posterUrl || null
  };
};

export const normalizeMediaArray = (
  items?: any[] | null,
  options?: { baseUrl?: string | null; fileServableIds?: Set<string> | null }
) => {
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const fileId = String(item?.fileId || item?.file_id || item?.id || '').trim();
      const fileServable = Boolean(
        options?.fileServableIds && fileId && options.fileServableIds.has(fileId)
      );
      return normalizePublicMedia(item, {
        baseUrl: options?.baseUrl,
        fileServable
      });
    })
    .filter(Boolean);
};
