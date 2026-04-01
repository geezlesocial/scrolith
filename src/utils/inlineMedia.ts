import { resolveAssetUrl } from './assetUrl';

export type InlineMediaKind = 'video' | 'image' | 'document' | 'unknown';

export type ResolvedInlineMedia = {
  kind: InlineMediaKind;
  src: string;
  poster?: string;
};

export const INLINE_VIDEO_PREVIEW_AUTOPLAY = true;

const DIRECT_MEDIA_KEYS = [
  'url',
  'path',
  'downloadUrl',
  'download_url',
  'fileUrl',
  'file_url',
  'mediaUrl',
  'media_url',
  'videoUrl',
  'video_url',
  'recordingUrl',
  'recording_url',
  'src'
];

const POSTER_KEYS = [
  'thumbnailUrl',
  'thumbnail_url',
  'poster',
  'posterUrl',
  'poster_url',
  'previewUrl',
  'preview_url',
  'thumbnailFileUrl',
  'thumbnail_file_url'
];

const ROOT_CONTENT_ID_KEYS = [
  'mediaFileId',
  'media_file_id',
  'fileId',
  'file_id',
  'recordingFileId',
  'recording_file_id'
];

const ROOT_POSTER_ID_KEYS = ['thumbnailFileId', 'thumbnail_file_id'];
const MEDIA_CONTENT_ID_KEYS = ['fileId', 'file_id', 'id'];
const MEDIA_POSTER_ID_KEYS = ['thumbnailFileId', 'thumbnail_file_id'];

const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v|mkv|avi|wmv|flv|m3u8)(?:$|[?#])/i;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(?:$|[?#])/i;
const DOCUMENT_EXTENSION_PATTERN = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z)(?:$|[?#])/i;

const buildFileContentUrl = (value: string) => `/api/files/content/${encodeURIComponent(String(value || '').trim())}`;

const readFirstString = (source: any, keys: string[]) => {
  if (!source || typeof source !== 'object') return '';
  for (const key of keys) {
    const value = String(source?.[key] || '').trim();
    if (value) return value;
  }
  return '';
};

const looksLikeDirectUrl = (value: string) => {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return false;
  return (
    normalized.startsWith('http://') ||
    normalized.startsWith('https://') ||
    normalized.startsWith('/') ||
    normalized.startsWith('uploads/') ||
    normalized.startsWith('api/files/') ||
    normalized.startsWith('files/content/') ||
    normalized.startsWith('blob:') ||
    normalized.startsWith('data:') ||
    normalized.includes('/') ||
    normalized.includes('.') ||
    normalized.includes('?')
  );
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

const resolveContentUrl = (value: string) => {
  const normalized = String(value || '').trim();
  if (!normalized) return '';
  return resolveAssetUrl(buildFileContentUrl(normalized));
};

const inferMediaKind = (
  typeHint: unknown,
  mimeType: unknown,
  src: string,
  poster: string,
  nameHint: unknown
): InlineMediaKind => {
  const normalizedType = String(typeHint || '').trim().toLowerCase();
  const normalizedMime = String(mimeType || '').trim().toLowerCase();
  const srcOrName = `${String(src || '').trim()} ${String(nameHint || '').trim()}`.toLowerCase();
  const posterValue = String(poster || '').trim().toLowerCase();

  if (
    normalizedType === 'video' ||
    normalizedMime.startsWith('video/') ||
    VIDEO_EXTENSION_PATTERN.test(srcOrName)
  ) {
    return 'video';
  }

  if (
    normalizedType === 'image' ||
    normalizedMime.startsWith('image/') ||
    IMAGE_EXTENSION_PATTERN.test(srcOrName) ||
    IMAGE_EXTENSION_PATTERN.test(posterValue)
  ) {
    return 'image';
  }

  if (
    normalizedType === 'document' ||
    normalizedMime === 'application/pdf' ||
    DOCUMENT_EXTENSION_PATTERN.test(srcOrName)
  ) {
    return 'document';
  }

  return 'unknown';
};

export const resolveInlineMedia = (
  input: any,
  options?: {
    typeHint?: unknown;
  }
): ResolvedInlineMedia => {
  const root = input || {};
  const mediaCandidate =
    root?.media ||
    root?.mediaFile ||
    root?.file ||
    root?.attachment ||
    root;
  const media = Array.isArray(mediaCandidate) ? mediaCandidate[0] || {} : mediaCandidate;

  const directValue =
    readFirstString(media, DIRECT_MEDIA_KEYS) ||
    (media !== root ? readFirstString(root, DIRECT_MEDIA_KEYS) : '');
  const mediaContentId =
    readFirstString(media, MEDIA_CONTENT_ID_KEYS) ||
    (media !== root ? readFirstString(root, ROOT_CONTENT_ID_KEYS) : '');

  const shouldPreferContentSrc = Boolean(mediaContentId) && isLegacyUploadPath(directValue);
  const src = shouldPreferContentSrc
    ? resolveContentUrl(mediaContentId)
    : directValue
      ? looksLikeDirectUrl(directValue)
        ? resolveAssetUrl(directValue)
        : resolveContentUrl(directValue)
      : mediaContentId
        ? looksLikeDirectUrl(mediaContentId)
          ? resolveAssetUrl(mediaContentId)
          : resolveContentUrl(mediaContentId)
        : '';

  const posterValue =
    readFirstString(media, POSTER_KEYS) ||
    (media !== root ? readFirstString(root, POSTER_KEYS) : '');
  const posterId =
    readFirstString(media, MEDIA_POSTER_ID_KEYS) ||
    (media !== root ? readFirstString(root, ROOT_POSTER_ID_KEYS) : '');
  const shouldPreferPosterId = Boolean(posterId) && isLegacyUploadPath(posterValue);
  const poster = shouldPreferPosterId
    ? resolveContentUrl(posterId)
    : posterValue
      ? looksLikeDirectUrl(posterValue)
        ? resolveAssetUrl(posterValue)
        : resolveContentUrl(posterValue)
      : posterId
        ? resolveContentUrl(posterId)
        : '';

  const kind = inferMediaKind(
    options?.typeHint ?? media?.type ?? root?.type,
    media?.mimeType ?? media?.mime_type ?? root?.mimeType ?? root?.mime_type,
    src,
    poster,
    media?.name ?? media?.originalName ?? root?.name ?? root?.originalName
  );

  return {
    kind,
    src,
    poster: poster || undefined
  };
};
