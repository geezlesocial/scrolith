import { resolveAssetUrl } from './assetUrl';

const readPathValue = (source: any, path: string[]) => {
  let current = source;
  for (const key of path) {
    if (!current || typeof current !== 'object') return '';
    current = current?.[key];
  }
  // Reject object leaves (e.g. poster: { url }) so nested paths can win.
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
  ['mediaFile', 'storageKey']
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
  ['asset', 'id'],
  ['media', 'id'],
  ['mediaFile', 'id'],
  // Attachment/entity id last — only used when it looks like a storage file id.
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
    // Bare filenames / paths with extensions (not storage IDs)
    (normalized.includes('.') && (normalized.includes('/') || /\.(png|jpe?g|gif|webp|avif|svg|mp4|webm|mov|m4v|pdf)$/i.test(normalized)))
  );
};

/**
 * True for Prisma file IDs, UUIDs, disk: legacy ids, and opaque storage keys.
 * False for human labels and normal web URLs/paths.
 */
export const looksLikeFileId = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return false;
  if (isDiskFileId(normalized)) return true;
  if (/^https?:\/\//i.test(normalized) || normalized.startsWith('data:') || normalized.startsWith('blob:')) {
    return false;
  }
  if (isAssetLikePath(normalized) || normalized.startsWith('/')) return false;
  if (/\s/.test(normalized)) return false;
  // cuid / uuid / firebase-ish object names
  if (/^[a-z0-9_-]{12,}$/i.test(normalized)) return true;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(normalized)) {
    return true;
  }
  // Storage object keys that are not plain filenames
  if (/^[a-z0-9].*[a-z0-9]$/i.test(normalized) && normalized.includes('/') && normalized.length >= 8) {
    return true;
  }
  return false;
};

const isLegacyUploadPath = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('/uploads/') ||
    normalized.startsWith('uploads/') ||
    normalized.includes('/uploads/')
  );
};

const buildFileContentUrl = (value: string) => {
  const contentId = String(value || '').trim();
  if (!contentId) return '';
  // Avoid double-wrapping already content URLs.
  if (isAssetLikePath(contentId) && contentId.toLowerCase().includes('/api/files/content/')) {
    return contentId.startsWith('/') ? contentId : `/${contentId.replace(/^\/+/, '')}`;
  }
  return `/api/files/content/${encodeURIComponent(contentId)}`;
};

const resolveMediaCandidate = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  if (isDiskFileId(normalized) || looksLikeFileId(normalized)) {
    return resolveAssetUrl(buildFileContentUrl(normalized));
  }
  if (looksLikeDirectUrl(normalized) || isAssetLikePath(normalized) || isAbsoluteUrl(normalized)) {
    return resolveAssetUrl(normalized);
  }
  return '';
};

export const resolvePostAttachmentMediaUrl = (attachment: any) => {
  if (!attachment) return '';

  if (typeof attachment === 'string') {
    return resolveMediaCandidate(attachment);
  }

  const directValue = readFirstPathValue(attachment, MEDIA_VALUE_PATHS);
  const normalizedDirect = String(directValue || '').trim();
  const rawContentId = readFirstPathValue(attachment, MEDIA_ID_PATHS);
  const contentId =
    rawContentId && (isAbsoluteUrl(rawContentId) || looksLikeFileId(rawContentId) || isDiskFileId(rawContentId))
      ? rawContentId
      : '';

  // Prefer durable file-content URL over stale legacy /uploads paths.
  if (contentId && (!normalizedDirect || isLegacyUploadPath(normalizedDirect))) {
    if (isAbsoluteUrl(contentId)) return resolveAssetUrl(contentId);
    return resolveAssetUrl(buildFileContentUrl(contentId));
  }

  if (normalizedDirect) {
    // Nested storage keys that are not full URLs still map to content endpoint.
    if (!looksLikeDirectUrl(normalizedDirect) && looksLikeFileId(normalizedDirect)) {
      return resolveAssetUrl(buildFileContentUrl(normalizedDirect));
    }
    if (isDiskFileId(normalizedDirect)) {
      return resolveAssetUrl(buildFileContentUrl(normalizedDirect));
    }
    if (looksLikeDirectUrl(normalizedDirect) || isAbsoluteUrl(normalizedDirect)) {
      return resolveAssetUrl(normalizedDirect);
    }
  }

  if (!contentId) return '';
  if (isAbsoluteUrl(contentId)) return resolveAssetUrl(contentId);
  return resolveAssetUrl(buildFileContentUrl(contentId));
};

export const resolvePostAttachmentPosterUrl = (attachment: any) => {
  if (!attachment || typeof attachment === 'string') return undefined;
  const posterValue = readFirstPathValue(attachment, POSTER_VALUE_PATHS);
  const normalizedPoster = String(posterValue || '').trim();
  const posterId = readFirstPathValue(attachment, POSTER_ID_PATHS);
  if (posterId && (isDiskFileId(posterId) || looksLikeFileId(posterId)) && (!normalizedPoster || isLegacyUploadPath(normalizedPoster))) {
    return resolveAssetUrl(buildFileContentUrl(posterId));
  }
  if (normalizedPoster) {
    if (isDiskFileId(normalizedPoster) || (!looksLikeDirectUrl(normalizedPoster) && looksLikeFileId(normalizedPoster))) {
      return resolveAssetUrl(buildFileContentUrl(normalizedPoster));
    }
    return resolveAssetUrl(normalizedPoster);
  }
  if (!posterId) return undefined;
  if (isAbsoluteUrl(posterId)) return resolveAssetUrl(posterId);
  if (looksLikeFileId(posterId) || isDiskFileId(posterId)) {
    return resolveAssetUrl(buildFileContentUrl(posterId));
  }
  return undefined;
};
