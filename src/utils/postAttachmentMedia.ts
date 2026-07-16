import { resolveAssetUrl } from './assetUrl';
import {
  buildFileContentUrl,
  isAlreadyFileContentRef,
  isLegacyUploadPath,
  looksLikeFileId,
  preferServableMediaUrl,
  resolveMediaDescriptor
} from './mediaDescriptor';

export { looksLikeFileId, buildFileContentUrl, resolveMediaDescriptor } from './mediaDescriptor';

/**
 * Resolve a single primary media URL for attachments, logos, covers, and posts.
 * Dual-path (fileId + /uploads): prefers the working legacy uploads URL and never
 * rewrites it into a content URL that may 404.
 */
export const resolvePostAttachmentMediaUrl = (attachment: any) => {
  if (!attachment) return '';
  return preferServableMediaUrl(attachment) || '';
};

/**
 * Resolve poster/thumbnail independently from the primary media source.
 */
export const resolvePostAttachmentPosterUrl = (attachment: any) => {
  if (!attachment || typeof attachment === 'string') return undefined;
  const descriptor = resolveMediaDescriptor(attachment);
  if (descriptor.posterUrl) return descriptor.posterUrl;
  if (descriptor.thumbnailUrl) return descriptor.thumbnailUrl;

  // Preserve prior nested poster-only paths that descriptor may not map when
  // primary media fields are empty but poster fields exist.
  const posterOnly = resolveMediaDescriptor({
    url: attachment.thumbnailUrl || attachment.posterUrl || attachment.previewUrl,
    fileId: attachment.thumbnailFileId || attachment.thumbnail_file_id,
    storagePath: attachment.thumbnailStoragePath
  });
  return posterOnly.url || undefined;
};

/**
 * Preferred + fallback pair for OptimizedImage / video onError handling.
 * primary is always the safest known-working URL; fallback is the alternate.
 */
export const resolvePostAttachmentMediaPair = (attachment: any) => {
  const descriptor = resolveMediaDescriptor(attachment);
  const url = String(descriptor.url || '').trim();
  const fallbackUrl = String(descriptor.fallbackUrl || '').trim();
  return {
    url,
    fallbackUrl: fallbackUrl && fallbackUrl !== url ? fallbackUrl : '',
    posterUrl: descriptor.posterUrl || descriptor.thumbnailUrl || '',
    fileId: descriptor.fileId || '',
    storagePath: descriptor.storagePath || ''
  };
};

/** @deprecated internal helper retained for tests that import path checks indirectly */
export const __mediaInternals = {
  buildFileContentUrl,
  isAlreadyFileContentRef,
  isLegacyUploadPath,
  looksLikeFileId,
  resolveAssetUrl
};
