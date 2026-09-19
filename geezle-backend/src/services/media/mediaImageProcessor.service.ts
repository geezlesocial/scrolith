/**
 * Phase 3A — Sharp-based image derivative generation.
 * Does not touch originals. Does not use shell commands.
 *
 * Policy helpers (eligibility/category/widths) live in mediaImagePolicy.ts
 * so the upload path can avoid loading native Sharp when processing is disabled.
 */
import crypto from 'crypto';
import type { Sharp } from 'sharp';
import {
  inferImageCategory,
  isEligibleImageMime,
  planThumbWidths,
  planVariantWidths,
  type ImageCategory
} from './mediaImagePolicy';

export type { ImageCategory };
export { isEligibleImageMime, inferImageCategory, planVariantWidths, planThumbWidths };

export type GeneratedVariant = {
  kind: 'image_size' | 'image_thumb' | 'video_poster' | 'video_thumb';
  label: string;
  width: number;
  height: number;
  format: 'webp' | 'avif' | 'jpeg' | 'png';
  mimeType: string;
  buffer: Buffer;
  checksum: string;
};

export type ImageInspectResult = {
  width: number;
  height: number;
  format: string;
  hasAlpha: boolean;
  isAnimated: boolean;
  pages: number;
};

/** ~40 megapixels */
export const MAX_INPUT_PIXELS = 40_000_000;
export const WEBP_QUALITY = 80;
export const AVIF_QUALITY = 65;
export const JPEG_QUALITY = 82;

/** Lazy load Sharp so disabled/prod-upload path need not resolve native bindings. */
type SharpFactory = (input?: any, options?: any) => Sharp;

const getSharp = (): SharpFactory => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require('sharp') as SharpFactory;
};

const checksumBuffer = (buf: Buffer) => crypto.createHash('sha256').update(buf).digest('hex');

/**
 * Inspect image metadata. Throws on corrupt/unsupported with safe messages.
 */
export const inspectImageBuffer = async (buffer: Buffer): Promise<ImageInspectResult> => {
  if (!buffer || !buffer.length) {
    throw Object.assign(new Error('Empty image buffer'), { code: 'EMPTY_IMAGE' });
  }
  // Soft size guard before sharp (500MB already at multer; 80MB decode guard)
  if (buffer.length > 80 * 1024 * 1024) {
    throw Object.assign(new Error('Image payload too large for processing'), { code: 'IMAGE_TOO_LARGE' });
  }

  const sharp = getSharp();
  let meta: Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
  try {
    meta = await sharp(buffer, {
      failOn: 'error',
      limitInputPixels: MAX_INPUT_PIXELS,
      animated: true
    }).metadata();
  } catch (error: any) {
    const msg = String(error?.message || error);
    if (/Input image exceeds pixel limit|pixel limit/i.test(msg)) {
      throw Object.assign(new Error('Image exceeds maximum pixel limit'), { code: 'PIXEL_LIMIT' });
    }
    throw Object.assign(new Error('Corrupt or unsupported image'), { code: 'CORRUPT_IMAGE', cause: error });
  }

  const width = Number(meta.width || 0);
  const height = Number(meta.height || 0);
  if (!width || !height) {
    throw Object.assign(new Error('Image dimensions unavailable'), { code: 'NO_DIMENSIONS' });
  }
  if (width * height > MAX_INPUT_PIXELS) {
    throw Object.assign(new Error('Image exceeds maximum pixel limit'), { code: 'PIXEL_LIMIT' });
  }

  const pages = Number(meta.pages || 1) || 1;
  const isAnimated = pages > 1 || Boolean(meta.pages && meta.pages > 1);

  return {
    width,
    height,
    format: String(meta.format || 'unknown'),
    hasAlpha: Boolean(meta.hasAlpha),
    isAnimated,
    pages
  };
};

const encodeVariant = async (
  pipeline: Sharp,
  format: GeneratedVariant['format'],
  hasAlpha: boolean
): Promise<{ buffer: Buffer; mimeType: string }> => {
  if (format === 'webp') {
    const buffer = await pipeline.webp({ quality: WEBP_QUALITY, effort: 4 }).toBuffer();
    return { buffer, mimeType: 'image/webp' };
  }
  if (format === 'avif') {
    const buffer = await pipeline.avif({ quality: AVIF_QUALITY, effort: 4 }).toBuffer();
    return { buffer, mimeType: 'image/avif' };
  }
  if (format === 'png' || hasAlpha) {
    const buffer = await pipeline.png({ compressionLevel: 8 }).toBuffer();
    return { buffer, mimeType: 'image/png' };
  }
  const buffer = await pipeline.jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toBuffer();
  return { buffer, mimeType: 'image/jpeg' };
};

const resizePipeline = (buffer: Buffer, targetWidth: number, page: number | undefined) => {
  const sharp = getSharp();
  return sharp(buffer, {
    failOn: 'error',
    limitInputPixels: MAX_INPUT_PIXELS,
    animated: false,
    pages: page
  })
    .rotate() // EXIF auto-orient
    .resize({
      width: targetWidth,
      withoutEnlargement: true,
      fit: 'inside'
    })
    .withMetadata({ orientation: undefined }); // strip orientation after rotate
};

/**
 * Generate responsive image sizes + thumbnails for one original buffer.
 * Animated GIF: static first-frame only for derivatives; original animation preserved separately.
 */
export const generateImageVariants = async (params: {
  buffer: Buffer;
  category?: ImageCategory;
  enableAvif?: boolean;
}): Promise<{
  inspect: ImageInspectResult;
  variants: GeneratedVariant[];
}> => {
  const inspect = await inspectImageBuffer(params.buffer);
  const category = params.category || 'default';
  const widths = planVariantWidths(category, inspect.width);
  const thumbs = planThumbWidths(inspect.width);
  const enableAvif = params.enableAvif !== false;
  const variants: GeneratedVariant[] = [];

  // First page only for animated sources
  const page = inspect.isAnimated ? 0 : undefined;

  const formats: GeneratedVariant['format'][] = ['webp'];
  if (enableAvif) formats.push('avif');

  for (const width of widths) {
    for (const format of formats) {
      try {
        const base = resizePipeline(params.buffer, width, page);
        // Re-inspect output size after resize
        const { buffer, mimeType } = await encodeVariant(base, format, inspect.hasAlpha);
        // Skip if larger than original (except when format conversion is clearly smaller — keep if smaller OR same order)
        if (buffer.length > params.buffer.length * 1.05 && format !== 'webp') {
          continue;
        }
        const outMeta = await getSharp()(buffer).metadata();
        variants.push({
          kind: 'image_size',
          label: 'default',
          width: Number(outMeta.width || width),
          height: Number(outMeta.height || Math.round((inspect.height / inspect.width) * width)),
          format,
          mimeType,
          buffer,
          checksum: checksumBuffer(buffer)
        });
      } catch {
        // Skip individual format failures; partial OK
      }
    }
  }

  for (const width of thumbs) {
    try {
      const base = resizePipeline(params.buffer, width, page);
      const { buffer, mimeType } = await encodeVariant(base, 'webp', inspect.hasAlpha);
      const outMeta = await getSharp()(buffer).metadata();
      variants.push({
        kind: 'image_thumb',
        label: 'default',
        width: Number(outMeta.width || width),
        height: Number(outMeta.height || Math.round((inspect.height / inspect.width) * width)),
        format: 'webp',
        mimeType,
        buffer,
        checksum: checksumBuffer(buffer)
      });
    } catch {
      // skip
    }
  }

  return { inspect, variants };
};

export const buildVariantObjectKey = (params: {
  fileId: string;
  kind: 'image_size' | 'image_thumb' | 'video_poster' | 'video_thumb';
  width: number;
  format: string;
}) => {
  const id = String(params.fileId || '').trim();
  const width = Math.max(1, Math.floor(Number(params.width) || 1));
  const format = String(params.format || 'webp')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
  // Phase 3B.3 — deterministic video derivative keys
  if (params.kind === 'video_poster') {
    return `media/${id}/video/poster.${format}`;
  }
  if (params.kind === 'video_thumb') {
    return `media/${id}/video/thumb-${width}w.${format}`;
  }
  if (params.kind === 'image_thumb') {
    return `media/${id}/thumb/${width}w.${format}`;
  }
  return `media/${id}/image/${width}w.${format}`;
};

export const MediaImageProcessor = {
  isEligibleImageMime,
  inferImageCategory,
  planVariantWidths,
  planThumbWidths,
  inspectImageBuffer,
  generateImageVariants,
  buildVariantObjectKey,
  MAX_INPUT_PIXELS,
  WEBP_QUALITY,
  AVIF_QUALITY,
  JPEG_QUALITY
};
