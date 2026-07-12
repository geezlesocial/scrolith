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
  ['file', 'url'],
  ['file', 'path'],
  ['file', 'downloadUrl'],
  ['file', 'download_url'],
  ['asset', 'url'],
  ['asset', 'path'],
  ['asset', 'downloadUrl'],
  ['asset', 'download_url'],
  ['media', 'url'],
  ['media', 'path'],
  ['mediaFile', 'url'],
  ['mediaFile', 'path']
];

const MEDIA_ID_PATHS = [
  ['fileId'],
  ['file_id'],
  ['mediaFileId'],
  ['media_file_id'],
  ['id'],
  ['file', 'id'],
  ['asset', 'id'],
  ['media', 'id'],
  ['mediaFile', 'id']
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

const looksLikeDirectUrl = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    normalized.includes('/') ||
    normalized.includes('.') ||
    normalized.includes('?')
  );
};

const looksLikeFileId = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized || looksLikeDirectUrl(normalized)) return false;
  // Avoid treating human-readable labels as storage ids.
  if (/\s/.test(normalized)) return false;
  return /^[a-z0-9_-]{12,}$/i.test(normalized);
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
  return `/api/files/content/${encodeURIComponent(contentId)}`;
};

export const resolvePostAttachmentMediaUrl = (attachment: any) => {
  if (!attachment) return '';

  if (typeof attachment === 'string') {
    const value = attachment.trim();
    if (!value) return '';
    if (looksLikeDirectUrl(value)) return resolveAssetUrl(value);
    if (looksLikeFileId(value)) return resolveAssetUrl(buildFileContentUrl(value));
    return '';
  }

  const directValue = readFirstPathValue(attachment, MEDIA_VALUE_PATHS);
  const normalizedDirect = String(directValue || '').trim();
  const rawContentId = readFirstPathValue(attachment, MEDIA_ID_PATHS);
  const contentId =
    rawContentId && (isAbsoluteUrl(rawContentId) || looksLikeFileId(rawContentId))
      ? rawContentId
      : '';

  if (contentId && isLegacyUploadPath(normalizedDirect)) {
    return resolveAssetUrl(buildFileContentUrl(contentId));
  }

  if (normalizedDirect && looksLikeDirectUrl(normalizedDirect)) {
    return resolveAssetUrl(normalizedDirect);
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
  if (posterId && isLegacyUploadPath(normalizedPoster)) {
    return resolveAssetUrl(buildFileContentUrl(posterId));
  }
  if (normalizedPoster) {
    return resolveAssetUrl(normalizedPoster);
  }
  if (!posterId) return undefined;
  if (isAbsoluteUrl(posterId)) return resolveAssetUrl(posterId);
  return resolveAssetUrl(buildFileContentUrl(posterId));
};
