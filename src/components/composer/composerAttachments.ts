/**
 * Phase 5.1 — client-side attachment validation helpers for the enterprise composer.
 * Does not call APIs; pure checks before upload.
 */

export const COMPOSER_MAX_ATTACHMENTS = 12;
export const COMPOSER_MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB
export const COMPOSER_MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB
export const COMPOSER_MAX_DOCUMENT_BYTES = 40 * 1024 * 1024; // 40MB

export type ComposerMediaKind = 'image' | 'video' | 'document';

export type ComposerFileValidation =
  | { ok: true; kind: ComposerMediaKind }
  | { ok: false; reason: string };

const IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif'
]);

const VIDEO_TYPES = new Set([
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-msvideo',
  'video/x-matroska'
]);

export const inferComposerMediaKind = (file: Pick<File, 'type' | 'name'>): ComposerMediaKind => {
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('image/') || IMAGE_TYPES.has(mime)) return 'image';
  if (mime.startsWith('video/') || VIDEO_TYPES.has(mime)) return 'video';
  const name = String(file.name || '').toLowerCase();
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name)) return 'image';
  if (/\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(name)) return 'video';
  return 'document';
};

export const validateComposerFile = (
  file: File,
  opts?: { currentCount?: number; maxAttachments?: number }
): ComposerFileValidation => {
  if (!file) return { ok: false, reason: 'No file selected.' };
  const maxAttachments = opts?.maxAttachments ?? COMPOSER_MAX_ATTACHMENTS;
  const currentCount = opts?.currentCount ?? 0;
  if (currentCount >= maxAttachments) {
    return { ok: false, reason: `You can attach up to ${maxAttachments} files.` };
  }
  if (!file.size || file.size <= 0) {
    return { ok: false, reason: 'Empty files cannot be uploaded.' };
  }

  const kind = inferComposerMediaKind(file);
  const size = Number(file.size) || 0;
  if (kind === 'image' && size > COMPOSER_MAX_IMAGE_BYTES) {
    return { ok: false, reason: 'Images must be 25MB or smaller.' };
  }
  if (kind === 'video' && size > COMPOSER_MAX_VIDEO_BYTES) {
    return { ok: false, reason: 'Videos must be 200MB or smaller.' };
  }
  if (kind === 'document' && size > COMPOSER_MAX_DOCUMENT_BYTES) {
    return { ok: false, reason: 'Documents must be 40MB or smaller.' };
  }
  return { ok: true, kind };
};

export const revokePreviewUrl = (url?: string | null) => {
  if (!url) return;
  try {
    if (String(url).startsWith('blob:')) {
      URL.revokeObjectURL(url);
    }
  } catch {
    // ignore
  }
};

export const canPublishWithAttachments = (media: Array<{ uploading?: boolean; error?: string; id?: string }>) => {
  if (!Array.isArray(media) || media.length === 0) return { ok: true as const };
  if (media.some((item) => item.uploading)) {
    return { ok: false as const, reason: 'Wait for uploads to finish before posting.' };
  }
  if (media.some((item) => item.error)) {
    return { ok: false as const, reason: 'Remove failed uploads before posting.' };
  }
  // Attachments without server ids cannot be published.
  if (media.some((item) => !item.id)) {
    return { ok: false as const, reason: 'Some attachments are not ready yet.' };
  }
  return { ok: true as const };
};
