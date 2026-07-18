/**
 * Progressive media helpers — lightweight blur placeholders without external deps.
 * Generates tiny data-URL previews (BlurHash-like effect) from images.
 */

import { startMessagingTimer } from './messagingTelemetry';

export type ProgressiveImageMeta = {
  width: number;
  height: number;
  blurDataUrl: string;
  durationMs?: number;
};

const canvasSupported = () =>
  typeof document !== 'undefined' && typeof HTMLCanvasElement !== 'undefined';

/**
 * Create a tiny blurred preview data URL from a File or Blob image.
 * Target under ~500ms for typical photos.
 */
export const generateImageBlurPreview = async (
  source: Blob | File,
  options?: { maxEdge?: number; quality?: number }
): Promise<ProgressiveImageMeta | null> => {
  if (!canvasSupported()) return null;
  if (!source || !String(source.type || '').startsWith('image/')) return null;
  const stop = startMessagingTimer('preview_generate_ms');
  const maxEdge = Math.max(8, Math.min(48, options?.maxEdge || 24));
  const quality = options?.quality ?? 0.55;

  try {
    const bitmap =
      typeof createImageBitmap === 'function'
        ? await createImageBitmap(source)
        : await loadImageElement(source);

    const width = 'width' in bitmap ? bitmap.width : (bitmap as HTMLImageElement).naturalWidth;
    const height = 'height' in bitmap ? bitmap.height : (bitmap as HTMLImageElement).naturalHeight;
    if (!width || !height) return null;

    const scale = Math.min(1, maxEdge / Math.max(width, height));
    const tw = Math.max(1, Math.round(width * scale));
    const th = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = tw;
    canvas.height = th;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(bitmap as any, 0, 0, tw, th);
    // Soft blur via repeated down/up scale if filter unsupported.
    try {
      (ctx as any).filter = 'blur(2px)';
      ctx.drawImage(canvas, 0, 0);
      (ctx as any).filter = 'none';
    } catch {
      // ignore
    }
    const blurDataUrl = canvas.toDataURL('image/jpeg', quality);
    if ('close' in bitmap && typeof (bitmap as ImageBitmap).close === 'function') {
      (bitmap as ImageBitmap).close();
    }
    stop();
    return { width, height, blurDataUrl };
  } catch {
    stop();
    return null;
  }
};

const loadImageElement = (source: Blob): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(source);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('image_load_failed'));
    };
    img.src = url;
  });

/**
 * Extract a video poster frame (first ~0.1s) as data URL.
 */
export const generateVideoPoster = async (
  source: Blob | File
): Promise<ProgressiveImageMeta | null> => {
  if (!canvasSupported()) return null;
  if (!source || !String(source.type || '').startsWith('video/')) return null;
  const stop = startMessagingTimer('preview_generate_ms');

  return new Promise((resolve) => {
    const url = URL.createObjectURL(source);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    let settled = false;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute('src');
      video.load();
    };

    const fail = () => {
      if (settled) return;
      settled = true;
      cleanup();
      stop();
      resolve(null);
    };

    video.onerror = fail;
    video.onloadeddata = () => {
      try {
        const width = video.videoWidth || 320;
        const height = video.videoHeight || 180;
        const canvas = document.createElement('canvas');
        const maxEdge = 48;
        const scale = Math.min(1, maxEdge / Math.max(width, height));
        canvas.width = Math.max(1, Math.round(width * scale));
        canvas.height = Math.max(1, Math.round(height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          fail();
          return;
        }
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const blurDataUrl = canvas.toDataURL('image/jpeg', 0.6);
        const durationMs = Number.isFinite(video.duration) ? Math.round(video.duration * 1000) : undefined;
        if (settled) return;
        settled = true;
        cleanup();
        stop();
        resolve({ width, height, blurDataUrl, durationMs });
      } catch {
        fail();
      }
    };

    // Seek slightly into the stream for a non-black frame when possible.
    video.onloadedmetadata = () => {
      try {
        video.currentTime = Math.min(0.1, Math.max(0, (video.duration || 1) * 0.01));
      } catch {
        // ignore
      }
    };

    video.src = url;
    window.setTimeout(fail, 2500);
  });
};

/**
 * Lightweight audio duration extraction (no waveform library).
 */
export const extractAudioDurationMs = async (source: Blob | File): Promise<number | null> => {
  if (typeof document === 'undefined') return null;
  if (!source || !String(source.type || '').startsWith('audio/')) return null;
  return new Promise((resolve) => {
    const url = URL.createObjectURL(source);
    const audio = document.createElement('audio');
    audio.preload = 'metadata';
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      resolve(value);
    };
    audio.onloadedmetadata = () => {
      const ms = Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null;
      done(ms && ms > 0 ? ms : null);
    };
    audio.onerror = () => done(null);
    audio.src = url;
    window.setTimeout(() => done(null), 2000);
  });
};

/** Document preview card metadata. */
export const describeDocumentPreview = (file: { name?: string; size?: number; type?: string }) => {
  const name = String(file?.name || 'Document');
  const ext = name.includes('.') ? name.split('.').pop()!.toUpperCase() : 'FILE';
  const size = Number(file?.size || 0);
  let sizeLabel = '';
  if (size > 0) {
    if (size < 1024) sizeLabel = `${size} B`;
    else if (size < 1024 * 1024) sizeLabel = `${Math.round(size / 1024)} KB`;
    else sizeLabel = `${(size / (1024 * 1024)).toFixed(1)} MB`;
  }
  return {
    name,
    extension: ext.slice(0, 5),
    sizeLabel,
    mimeType: String(file?.type || '')
  };
};
