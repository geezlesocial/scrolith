/**
 * Enterprise create-post attachment helpers.
 * Pure validation + progressive preview utilities (no API side effects).
 */

export const COMPOSER_MAX_ATTACHMENTS = 12;
export const COMPOSER_MAX_VIDEO_ATTACHMENTS = 1;
export const COMPOSER_MAX_IMAGE_BYTES = 25 * 1024 * 1024; // 25MB
export const COMPOSER_MAX_VIDEO_BYTES = 200 * 1024 * 1024; // 200MB
export const COMPOSER_MAX_DOCUMENT_BYTES = 40 * 1024 * 1024; // 40MB
export const COMPOSER_UPLOAD_CONCURRENCY = 3;
export const COMPOSER_UPLOAD_MAX_RETRIES = 2;

/** Shared accept string for <input type="file"> across web + Capacitor WebView. */
export const COMPOSER_UPLOAD_ACCEPT =
  'image/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.mp4,.webm,.mov,.m4v';

export type ComposerMediaKind = 'image' | 'video' | 'document';

export type ComposerFileValidation =
  | { ok: true; kind: ComposerMediaKind }
  | { ok: false; reason: string };

export type ComposerAttachmentPreview = {
  localId: string;
  id?: string;
  /** Durable or remote URL once uploaded */
  url: string;
  /** Alternate durable/legacy URL used when the primary media path is unavailable. */
  fallbackUrl?: string;
  /** Local blob preview while upload is in-flight (never published) */
  localPreviewUrl?: string;
  name?: string;
  type?: ComposerMediaKind;
  mimeType?: string;
  thumbnailUrl?: string | null;
  localPosterUrl?: string | null;
  duration?: number | null;
  progress?: number;
  uploading?: boolean;
  error?: string;
  retryCount?: number;
  size?: number;
  file?: File;
};

export const hasComposerVideoAttachment = (
  media: Array<Pick<ComposerAttachmentPreview, 'type' | 'mimeType' | 'name' | 'url'> | null | undefined>
) => {
  return (Array.isArray(media) ? media : []).some((item) => {
    if (!item) return false;
    if (item.type === 'video') return true;
    const mime = String(item.mimeType || '').toLowerCase();
    if (mime.startsWith('video/')) return true;
    const hay = `${item.name || ''} ${item.url || ''}`.toLowerCase();
    return /\.(mp4|webm|mov|m4v|avi|mkv|3gp)(?:$|[?#\s])/.test(hay);
  });
};

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
  'video/x-matroska',
  'video/3gpp',
  'video/3gpp2'
]);

export const inferComposerMediaKind = (file: Pick<File, 'type' | 'name'>): ComposerMediaKind => {
  const mime = String(file.type || '').toLowerCase();
  if (mime.startsWith('image/') || IMAGE_TYPES.has(mime)) return 'image';
  if (mime.startsWith('video/') || VIDEO_TYPES.has(mime)) return 'video';
  const name = String(file.name || '').toLowerCase();
  if (/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name)) return 'image';
  if (/\.(mp4|webm|mov|m4v|avi|mkv|3gp)$/i.test(name)) return 'video';
  return 'document';
};

export const validateComposerFile = (
  file: File,
  opts?: { currentCount?: number; maxAttachments?: number; currentVideoCount?: number }
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
  if (kind === 'video' && (opts?.currentVideoCount ?? 0) >= COMPOSER_MAX_VIDEO_ATTACHMENTS) {
    return { ok: false, reason: 'Only one video can be attached to a post.' };
  }
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

export const revokeAttachmentPreviews = (item: Pick<ComposerAttachmentPreview, 'url' | 'localPreviewUrl' | 'localPosterUrl'>) => {
  revokePreviewUrl(item.localPreviewUrl);
  revokePreviewUrl(item.localPosterUrl);
  // Only revoke main url if it is still a local blob (not a remote URL).
  if (String(item.url || '').startsWith('blob:')) {
    revokePreviewUrl(item.url);
  }
};

export const canPublishWithAttachments = (
  media: Array<{ uploading?: boolean; error?: string; id?: string }>
) => {
  if (!Array.isArray(media) || media.length === 0) return { ok: true as const };
  if (media.some((item) => item.uploading)) {
    return { ok: false as const, reason: 'Wait for uploads to finish before posting.' };
  }
  if (media.some((item) => item.error)) {
    return { ok: false as const, reason: 'Remove or retry failed uploads before posting.' };
  }
  if (media.some((item) => !item.id)) {
    return { ok: false as const, reason: 'Some attachments are not ready yet.' };
  }
  return { ok: true as const };
};

export const formatComposerBytes = (bytes?: number | null) => {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
};

export const createComposerLocalId = () =>
  `media-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export const createLocalAttachment = (file: File, kind: ComposerMediaKind): ComposerAttachmentPreview => {
  const localPreviewUrl = URL.createObjectURL(file);
  return {
    localId: createComposerLocalId(),
    url: localPreviewUrl,
    localPreviewUrl,
    name: file.name,
    type: kind,
    mimeType: file.type || undefined,
    size: file.size,
    uploading: true,
    progress: 0,
    retryCount: 0,
    file
  };
};

/**
 * Capture a poster frame from a local video File for instant preview polish.
 * Best-effort; failures return null without throwing.
 */
export const generateLocalVideoPoster = (file: File, seekSeconds = 0.25): Promise<string | null> =>
  new Promise((resolve) => {
    if (typeof document === 'undefined' || !file) {
      resolve(null);
      return;
    }
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = objectUrl;

    let settled = false;
    const finish = (value: string | null) => {
      if (settled) return;
      settled = true;
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    const timeout = window.setTimeout(() => finish(null), 4000);

    video.onloadeddata = () => {
      try {
        const duration = Number(video.duration);
        const target =
          Number.isFinite(duration) && duration > 0
            ? Math.min(Math.max(seekSeconds, 0.05), Math.max(duration * 0.1, 0.05))
            : seekSeconds;
        video.currentTime = target;
      } catch {
        finish(null);
      }
    };

    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 360;
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          finish(null);
          return;
        }
        ctx.drawImage(video, 0, 0, w, h);
        canvas.toBlob(
          (blob) => {
            window.clearTimeout(timeout);
            if (!blob) {
              finish(null);
              return;
            }
            finish(URL.createObjectURL(blob));
          },
          'image/jpeg',
          0.82
        );
      } catch {
        window.clearTimeout(timeout);
        finish(null);
      }
    };

    video.onerror = () => {
      window.clearTimeout(timeout);
      finish(null);
    };
  });

/** Collect File objects from a paste or drop DataTransfer. */
export const filesFromDataTransfer = (dt: DataTransfer | null | undefined): File[] => {
  if (!dt) return [];
  const fromFiles = Array.from(dt.files || []);
  if (fromFiles.length) return fromFiles;
  const items = Array.from(dt.items || []);
  const out: File[] = [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const file = item.getAsFile();
    if (file) out.push(file);
  }
  return out;
};

/** Simple async pool for concurrent uploads without flooding the network. */
export const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> => {
  const results: R[] = new Array(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(concurrency, items.length || 1)) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
};
