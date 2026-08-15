import { resolveAssetUrl } from './assetUrl';
import {
  looksLikeFileId,
  resolvePostAttachmentMediaPair,
  resolvePostAttachmentMediaUrl,
  resolvePostAttachmentPosterUrl
} from './postAttachmentMedia';

export type InlineMediaKind = 'video' | 'image' | 'document' | 'unknown';

export type ResolvedInlineMedia = {
  kind: InlineMediaKind;
  src: string;
  fallbackSrc?: string;
  fileId?: string;
  poster?: string;
};

export const INLINE_VIDEO_PREVIEW_AUTOPLAY = true;

const VIDEO_EXTENSION_PATTERN = /\.(mp4|webm|mov|m4v|mkv|avi|wmv|flv|m3u8)(?:$|[?#])/i;
const IMAGE_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp|bmp|svg|avif)(?:$|[?#])/i;
const DOCUMENT_EXTENSION_PATTERN = /\.(pdf|docx?|xlsx?|pptx?|csv|txt|zip|rar|7z)(?:$|[?#])/i;

const isAbsoluteUrl = (value: string) => /^https?:\/\//i.test(String(value || '').trim());

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

/**
 * Resolve inline media using the shared attachment resolver so posts, stories,
 * comments, and uploads all honor the same URL shapes.
 */
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

  // Prefer shared attachment resolver (nested file/asset/media + fileId + content URLs).
  const pair =
    resolvePostAttachmentMediaPair(media) ||
    (media !== root ? resolvePostAttachmentMediaPair(root) : { url: '', fallbackUrl: '', posterUrl: '', fileId: '', storagePath: '' });

  let src = pair.url || resolvePostAttachmentMediaUrl(media) || (media !== root ? resolvePostAttachmentMediaUrl(root) : '') || '';
  let fallbackSrc = pair.fallbackUrl || '';

  // Fallback: bare absolute string / file id on the root itself.
  if (!src && typeof input === 'string') {
    const raw = String(input).trim();
    if (raw) {
      src = isAbsoluteUrl(raw) || raw.startsWith('/') || raw.startsWith('data:') || raw.startsWith('blob:')
        ? resolveAssetUrl(raw)
        : looksLikeFileId(raw)
          ? resolvePostAttachmentMediaUrl({ fileId: raw })
          : resolveAssetUrl(raw);
    }
  }

  const poster =
    pair.posterUrl ||
    resolvePostAttachmentPosterUrl(media) ||
    (media !== root ? resolvePostAttachmentPosterUrl(root) : undefined) ||
    undefined;

  const kind = inferMediaKind(
    options?.typeHint ?? media?.type ?? root?.type,
    media?.mimeType ?? media?.mime_type ?? root?.mimeType ?? root?.mime_type,
    src,
    poster || '',
    media?.name ?? media?.originalName ?? root?.name ?? root?.originalName
  );

  return {
    kind,
    src,
    fallbackSrc: fallbackSrc && fallbackSrc !== src ? fallbackSrc : undefined,
    fileId: pair.fileId || undefined,
    poster: poster || undefined
  };
};
