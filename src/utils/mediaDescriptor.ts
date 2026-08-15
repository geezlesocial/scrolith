/**
 * Canonical media descriptor + safe URL precedence for Scrolith.
 * Used by attachment, avatar, inline, marketplace, story, and Scroll surfaces.
 */
import { resolveAssetUrl } from './assetUrl';

export type MediaDescriptor = {
  fileId?: string;
  url?: string;
  fallbackUrl?: string;
  storagePath?: string;
  mimeType?: string;
  width?: number;
  height?: number;
  durationSeconds?: number;
  posterUrl?: string;
  thumbnailUrl?: string;
  isPublic?: boolean;
};

const readPathValue = (source: any, path: string[]) => {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = current?.[key];
  }
  if (current == null || typeof current === 'object') return '';
  return String(current).trim();
};

const readFirstPathValue = (source: any, paths: string[][]) => {
  for (const path of paths) {
    const value = readPathValue(source, path);
    if (value) return value;
  }
  return '';
};

const MEDIA_VALUE_PATHS = [
  ['url'],
  ['path'],
  ['downloadUrl'],
  ['download_url'],
  ['fileUrl'],
  ['file_url'],
  ['mediaUrl'],
  ['media_url'],
  ['videoUrl'],
  ['video_url'],
  ['src'],
  ['href'],
  ['publicUrl'],
  ['public_url'],
  ['secureUrl'],
  ['secure_url'],
  ['storageKey'],
  ['storage_key'],
  ['storagePath'],
  ['storage_path'],
  ['blobName'],
  ['blob_name'],
  ['file', 'url'],
  ['file', 'path'],
  ['file', 'downloadUrl'],
  ['file', 'download_url'],
  ['file', 'storageKey'],
  ['file', 'storage_key'],
  ['asset', 'url'],
  ['asset', 'path'],
  ['asset', 'downloadUrl'],
  ['asset', 'download_url'],
  ['asset', 'storageKey'],
  ['media', 'url'],
  ['media', 'path'],
  ['media', 'storageKey'],
  ['mediaFile', 'url'],
  ['mediaFile', 'path'],
  ['mediaFile', 'storageKey'],
  ['logo', 'url'],
  ['logo', 'path'],
  ['logo', 'storageKey'],
  ['cover', 'url'],
  ['cover', 'path'],
  ['cover', 'storageKey'],
  ['avatar', 'url'],
  ['avatar', 'path'],
  ['avatar', 'storageKey'],
  ['image', 'url'],
  ['image', 'path'],
  ['thumbnail', 'url'],
  ['thumbnail', 'path']
];

const MEDIA_ID_PATHS = [
  ['fileId'],
  ['file_id'],
  ['mediaFileId'],
  ['media_file_id'],
  ['profilePhotoFileId'],
  ['profile_photo_file_id'],
  ['logoFileId'],
  ['logo_file_id'],
  ['coverFileId'],
  ['cover_file_id'],
  ['imageFileId'],
  ['image_file_id'],
  ['avatarFileId'],
  ['avatar_file_id'],
  ['file', 'id'],
  ['file', 'fileId'],
  ['file', 'file_id'],
  ['asset', 'id'],
  ['asset', 'fileId'],
  ['media', 'id'],
  ['media', 'fileId'],
  ['mediaFile', 'id'],
  ['logo', 'id'],
  ['logo', 'fileId'],
  ['cover', 'id'],
  ['cover', 'fileId'],
  ['avatar', 'id'],
  ['avatar', 'fileId'],
  ['id']
];

const POSTER_VALUE_PATHS = [
  ['thumbnailUrl'],
  ['thumbnail_url'],
  ['posterUrl'],
  ['poster_url'],
  ['previewUrl'],
  ['preview_url'],
  ['thumbnailFileUrl'],
  ['thumbnail_file_url'],
  ['fallbackUrl'],
  ['fallback_url'],
  ['thumbnail', 'url'],
  ['thumbnail', 'path'],
  ['poster', 'url'],
  ['poster', 'path'],
  ['poster'],
  ['preview', 'url'],
  ['preview', 'path'],
  ['file', 'thumbnailUrl'],
  ['file', 'thumbnail_url'],
  ['asset', 'thumbnailUrl'],
  ['asset', 'thumbnail_url']
];

const POSTER_ID_PATHS = [
  ['thumbnailFileId'],
  ['thumbnail_file_id'],
  ['thumbnail', 'id'],
  ['poster', 'id'],
  ['preview', 'id']
];

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim());

const isDiskFileId = (value: string) => String(value || '').trim().toLowerCase().startsWith('disk:');

const isAssetLikePath = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/') ||
    normalized.includes('/uploads/') ||
    normalized.startsWith('/api/files/') ||
    normalized.startsWith('api/files/') ||
    normalized.includes('/api/files/content/') ||
    normalized.startsWith('/files/content/') ||
    normalized.startsWith('files/content/')
  );
};

const looksLikeDirectUrl = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  if (isDiskFileId(normalized)) return false;
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    isAssetLikePath(normalized) ||
    (normalized.includes('.') &&
      (normalized.includes('/') ||
        /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v|pdf)$/i.test(normalized)))
  );
};

export const looksLikeFileId = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (isDiskFileId(normalized)) return true;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:') || normalized.startsWith('blob:')) {
    return false;
  }
  if (isAssetLikePath(normalized) || normalized.startsWith('/')) return false;
  if (/\s/.test(normalized)) return false;
  if (/^[a-z0-9_-]{12,}$/i.test(normalized)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }
  if (/^[a-z0-9].*[a-z0-9]$/i.test(normalized) && normalized.includes('/') && normalized.length >= 8) {
    return true;
  }
  return false;
};

export const isLegacyUploadPath = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/') ||
    normalized.includes('/uploads/')
  );
};

export const isAlreadyFileContentRef = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.includes('/api/files/content/') ||
    normalized.startsWith('api/files/content/') ||
    normalized.includes('/files/content/') ||
    normalized.startsWith('files/content/')
  );
};

export const isSignedOrTokenizedUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw || !isAbsoluteUrl(raw)) return false;
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

/**
 * Build a relative content path for a file id. Never double-wrap absolute URLs
 * or existing content paths.
 */
export const buildFileContentUrl = (value: string) => {
  const contentId = String(value || '').trim();
  if (!contentId) return '';

  if (isAbsoluteUrl(contentId)) return contentId;

  if (isAlreadyFileContentRef(contentId)) {
    if (contentId.startsWith('/')) return contentId;
    if (
      contentId.toLowerCase().startsWith('api/files/') ||
      contentId.toLowerCase().startsWith('files/content/')
    ) {
      return `/${contentId.replace(/^\/+/, '')}`;
    }
    return contentId.startsWith('/') ? contentId : `/${contentId.replace(/^\/+/, '')}`;
  }

  return `/api/files/content/${encodeURIComponent(contentId)}`;
};

const buildUploadsUrl = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (isAbsoluteUrl(raw) || isAlreadyFileContentRef(raw)) return raw;
  if (isLegacyUploadPath(raw)) {
    const marker = 'uploads/';
    const lower = raw.toLowerCase();
    const idx = lower.indexOf(marker);
    const relative = idx >= 0 ? raw.slice(idx + marker.length) : raw.replace(/^\/+/, '');
    return `/uploads/${relative.replace(/^\/+/, '')}`;
  }
  // bare storage path without uploads prefix
  if (raw.includes('/') || /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v)$/i.test(raw)) {
    return `/uploads/${raw.replace(/^\/+/, '')}`;
  }
  return '';
};

const uniqueNonEmpty = (...values: Array<string | null | undefined>) => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
};

/**
 * Safe precedence:
 * 1. signed URLs
 * 2. external HTTPS
 * 3. already-valid content URLs
 * 4. legacy /uploads URL or storagePath (primary when dual-path)
 * 5. content URL from fileId (primary only when no working uploads URL)
 * 6. relative path resolution
 * 7. empty
 *
 * Dual-path rule: when both fileId and working /uploads exist, prefer uploads
 * as url and keep content as fallbackUrl so clients can try content first only
 * if they explicitly reverse, and never break marketplace/legacy media.
 */
export const resolveMediaDescriptor = (input?: any): MediaDescriptor => {
  if (input == null || input === '') {
    return {};
  }

  if (typeof input === 'string') {
    const raw = input.trim();
    if (!raw) return {};
    if (isSignedOrTokenizedUrl(raw)) {
      return { url: resolveAssetUrl(raw) };
    }
    if (isAbsoluteUrl(raw) || isAssetLikePath(raw) || looksLikeDirectUrl(raw)) {
      return { url: resolveAssetUrl(raw) };
    }
    if (isDiskFileId(raw) || looksLikeFileId(raw)) {
      return {
        fileId: raw,
        url: resolveAssetUrl(buildFileContentUrl(raw))
      };
    }
    return {};
  }

  const explicitFallback = readFirstPathValue(input, [['fallbackUrl'], ['fallback_url'], ['fallbackSrc']]);
  const directValue = readFirstPathValue(input, MEDIA_VALUE_PATHS);
  const rawContentId = readFirstPathValue(input, MEDIA_ID_PATHS);
  const contentId =
    rawContentId &&
    (isAbsoluteUrl(rawContentId) || looksLikeFileId(rawContentId) || isDiskFileId(rawContentId))
      ? rawContentId
      : '';
  const storagePath = readFirstPathValue(input, [
    ['storagePath'],
    ['storage_path'],
    ['storageKey'],
    ['storage_key'],
    ['file', 'storageKey'],
    ['file', 'storage_key']
  ]);

  const posterValue = readFirstPathValue(input, POSTER_VALUE_PATHS);
  const posterId = readFirstPathValue(input, POSTER_ID_PATHS);

  const resolvedDirect = directValue
    ? isAbsoluteUrl(directValue) || isAssetLikePath(directValue) || looksLikeDirectUrl(directValue)
      ? resolveAssetUrl(directValue)
      : looksLikeFileId(directValue) || isDiskFileId(directValue)
        ? resolveAssetUrl(buildFileContentUrl(directValue))
        : ''
    : '';

  const uploadsFromPath = storagePath ? resolveAssetUrl(buildUploadsUrl(storagePath)) : '';
  const uploadsFromDirect =
    resolvedDirect && isLegacyUploadPath(resolvedDirect) ? resolvedDirect : '';
  const legacyUploads = uploadsFromDirect || uploadsFromPath || '';

  const contentFromDirect =
    resolvedDirect && isAlreadyFileContentRef(resolvedDirect) ? resolvedDirect : '';
  const contentFromId =
    contentId && !isAbsoluteUrl(contentId)
      ? resolveAssetUrl(buildFileContentUrl(contentId))
      : contentId && isAbsoluteUrl(contentId)
        ? resolveAssetUrl(contentId)
        : '';

  let posterUrl = '';
  if (posterValue) {
    if (isLegacyUploadPath(posterValue) || isAbsoluteUrl(posterValue) || isAssetLikePath(posterValue)) {
      posterUrl = resolveAssetUrl(posterValue);
    } else if (looksLikeFileId(posterValue) || isDiskFileId(posterValue)) {
      posterUrl = resolveAssetUrl(buildFileContentUrl(posterValue));
    } else {
      posterUrl = resolveAssetUrl(posterValue);
    }
  } else if (posterId && (looksLikeFileId(posterId) || isDiskFileId(posterId))) {
    posterUrl = resolveAssetUrl(buildFileContentUrl(posterId));
  }

  // 1–2 signed / external non-platform
  if (resolvedDirect && isSignedOrTokenizedUrl(resolvedDirect)) {
    return {
      fileId: contentId || undefined,
      url: resolvedDirect,
      fallbackUrl: explicitFallback ? resolveAssetUrl(explicitFallback) : undefined,
      storagePath: storagePath || undefined,
      posterUrl: posterUrl || undefined,
      thumbnailUrl: posterUrl || undefined
    };
  }

  if (
    resolvedDirect &&
    isAbsoluteUrl(resolvedDirect) &&
    !isLegacyUploadPath(resolvedDirect) &&
    !isAlreadyFileContentRef(resolvedDirect)
  ) {
    return {
      fileId: contentId || undefined,
      url: resolvedDirect,
      fallbackUrl: explicitFallback
        ? resolveAssetUrl(explicitFallback)
        : legacyUploads && legacyUploads !== resolvedDirect
          ? legacyUploads
          : undefined,
      storagePath: storagePath || undefined,
      posterUrl: posterUrl || undefined,
      thumbnailUrl: posterUrl || undefined
    };
  }

  // 3 already-valid content URL
  if (contentFromDirect) {
    const fallbacks = uniqueNonEmpty(
      explicitFallback ? resolveAssetUrl(explicitFallback) : '',
      legacyUploads
    ).filter((value) => value !== contentFromDirect);
    return {
      fileId: contentId || undefined,
      url: contentFromDirect,
      fallbackUrl: fallbacks[0],
      storagePath: storagePath || undefined,
      posterUrl: posterUrl || undefined,
      thumbnailUrl: posterUrl || undefined
    };
  }

  // 4+5 dual-path: an explicit /uploads URL is the producer's chosen media
  // path, so preserve it as primary and keep the file-id content route as a
  // fallback. When only storagePath is available, the durable content route
  // remains primary because an inferred /uploads path may be stale.
  if (legacyUploads && contentFromId) {
    const explicitLegacyUpload = Boolean(resolvedDirect && isLegacyUploadPath(resolvedDirect));
    return {
      fileId: contentId || undefined,
      url: explicitLegacyUpload ? legacyUploads : contentFromId,
      fallbackUrl: uniqueNonEmpty(
        explicitFallback ? resolveAssetUrl(explicitFallback) : '',
        explicitLegacyUpload ? contentFromId : legacyUploads
      ).filter((value) => value !== (explicitLegacyUpload ? legacyUploads : contentFromId))[0],
      storagePath: storagePath || undefined,
      posterUrl: posterUrl || undefined,
      thumbnailUrl: posterUrl || undefined
    };
  }

  if (legacyUploads) {
    return {
      fileId: contentId || undefined,
      url: legacyUploads,
      fallbackUrl: explicitFallback ? resolveAssetUrl(explicitFallback) : undefined,
      storagePath: storagePath || undefined,
      posterUrl: posterUrl || undefined,
      thumbnailUrl: posterUrl || undefined
    };
  }

  if (contentFromId) {
    return {
      fileId: contentId || undefined,
      url: contentFromId,
      fallbackUrl: explicitFallback ? resolveAssetUrl(explicitFallback) : undefined,
      storagePath: storagePath || undefined,
      posterUrl: posterUrl || undefined,
      thumbnailUrl: posterUrl || undefined
    };
  }

  if (resolvedDirect) {
    return {
      fileId: contentId || undefined,
      url: resolvedDirect,
      fallbackUrl: explicitFallback ? resolveAssetUrl(explicitFallback) : undefined,
      storagePath: storagePath || undefined,
      posterUrl: posterUrl || undefined,
      thumbnailUrl: posterUrl || undefined
    };
  }

  return {
    fileId: contentId || undefined,
    fallbackUrl: explicitFallback ? resolveAssetUrl(explicitFallback) : undefined,
    storagePath: storagePath || undefined,
    posterUrl: posterUrl || undefined,
    thumbnailUrl: posterUrl || undefined
  };
};

export const preferServableMediaUrl = (input?: any) => {
  const descriptor = resolveMediaDescriptor(input);
  return String(descriptor.url || '').trim();
};

export const normalizePublicMedia = (input?: any): MediaDescriptor | null => {
  const descriptor = resolveMediaDescriptor(input);
  if (!descriptor.url && !descriptor.fallbackUrl && !descriptor.fileId) return null;
  return descriptor;
};

export const normalizeMediaArray = (items?: any[] | null): MediaDescriptor[] => {
  if (!Array.isArray(items)) return [];
  return items.map((item) => resolveMediaDescriptor(item)).filter((item) => Boolean(item.url || item.fallbackUrl || item.fileId));
};
