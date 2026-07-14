/**
 * Phase 3A — orchestrate image processing status transitions and variant generation.
 * Original media must remain available regardless of processing outcome.
 */
import prisma from '../../utils/prismaClient';
import { downloadMediaByProvider } from '../storage/mediaStorage.service';
import { generateImageVariants } from './mediaImageProcessor.service';
import { inferImageCategory, isEligibleImageMime, type ImageCategory } from './mediaImagePolicy';
import { listReadyVariants, persistGeneratedVariant } from './mediaVariant.service';

const processingLocks = new Set<string>();

export type ProcessingOutcome = {
  fileId: string;
  status: 'READY' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'BUSY' | 'DISABLED';
  variantsCreated: number;
  variantsReused: number;
  variantsFailed: number;
  errorCode?: string | null;
  durationMs?: number;
};

const logSafe = (event: string, payload: Record<string, unknown>) => {
  console.info(`[media-processing] ${event}`, payload);
};

export const buildVariantsManifest = async (fileId: string) => {
  const file = await prisma.file.findUnique({
    where: { id: fileId },
    select: {
      id: true,
      width: true,
      height: true,
      duration: true,
      mimeType: true,
      processingStatus: true,
      thumbnailUrl: true,
      url: true,
      variantsManifest: true
    }
  });
  if (!file) return null;
  const variants = await listReadyVariants(fileId);
  const thumb = variants.find((v) => v.kind === 'image_thumb') || null;
  const stored =
    file.variantsManifest && typeof file.variantsManifest === 'object' && !Array.isArray(file.variantsManifest)
      ? (file.variantsManifest as Record<string, unknown>)
      : {};
  const storedVideo =
    stored.video && typeof stored.video === 'object' && !Array.isArray(stored.video)
      ? (stored.video as Record<string, unknown>)
      : null;
  const videoMeta =
    storedVideo?.metadata && typeof storedVideo.metadata === 'object'
      ? (storedVideo.metadata as Record<string, unknown>)
      : storedVideo;

  // Client-safe only: never expose storageKey, bucket, checksum, provider, or raw GCS paths.
  const manifest: Record<string, unknown> = {
    fileId: file.id,
    processingStatus: file.processingStatus,
    width: file.width,
    height: file.height,
    durationSeconds: file.duration != null ? Number(file.duration) : null,
    mimeType: file.mimeType,
    originalUrl: `/api/files/content/${encodeURIComponent(file.id)}`,
    thumbnailUrl:
      thumb
        ? `/api/files/${encodeURIComponent(file.id)}/variants/${encodeURIComponent(thumb.id)}/content`
        : // Prefer application routes; do not echo internal storage paths if thumbnailUrl was a raw key.
          file.thumbnailUrl && String(file.thumbnailUrl).startsWith('/api/files/')
            ? file.thumbnailUrl
            : null,
    variants: variants.map((v) => ({
      id: v.id,
      kind: v.kind,
      label: v.label,
      width: v.width,
      height: v.height,
      format: v.format,
      mimeType: v.mimeType,
      sizeBytes: Number(v.sizeBytes || 0),
      contentUrl: `/api/files/${encodeURIComponent(file.id)}/variants/${encodeURIComponent(v.id)}/content`
    }))
  };

  // Phase 3B.2 — additive client-safe video metadata block (no storage keys / raw probe).
  if (videoMeta && typeof videoMeta === 'object') {
    manifest.video = {
      rotation: (videoMeta as any).rotation ?? null,
      displayAspectRatio: (videoMeta as any).displayAspectRatio ?? null,
      codec: (videoMeta as any).codec ?? null,
      container: (videoMeta as any).container ?? null,
      bitrate: (videoMeta as any).bitrate ?? null,
      frameRate: (videoMeta as any).frameRate ?? null,
      audioPresent: Boolean((videoMeta as any).audioPresent),
      audioCodec: (videoMeta as any).audioCodec ?? null
    };
  }

  return manifest;
};

/**
 * Process a single image file. Idempotent with respect to GCS keys + FileVariant unique.
 */
export const processImageFile = async (
  fileId: string,
  opts?: { category?: ImageCategory | null }
): Promise<ProcessingOutcome> => {
  const id = String(fileId || '').trim();
  const started = Date.now();
  if (!id) {
    return { fileId: '', status: 'FAILED', variantsCreated: 0, variantsReused: 0, variantsFailed: 0, errorCode: 'MISSING_ID' };
  }
  if (processingLocks.has(id)) {
    return { fileId: id, status: 'BUSY', variantsCreated: 0, variantsReused: 0, variantsFailed: 0 };
  }
  processingLocks.add(id);

  try {
    const file = await prisma.file.findUnique({
      where: { id },
      select: {
        id: true,
        mimeType: true,
        storageKey: true,
        storageProvider: true,
        width: true,
        height: true,
        processingVersion: true,
        originalName: true
      }
    });
    if (!file) {
      return {
        fileId: id,
        status: 'FAILED',
        variantsCreated: 0,
        variantsReused: 0,
        variantsFailed: 0,
        errorCode: 'FILE_NOT_FOUND'
      };
    }

    if (!isEligibleImageMime(file.mimeType)) {
      await prisma.file.update({
        where: { id },
        data: {
          processingStatus: 'SKIPPED',
          processingErrorCode: 'NOT_IMAGE',
          processingCompletedAt: new Date()
        }
      });
      logSafe('skipped', { fileIdPrefix: id.slice(0, 8), reason: 'NOT_IMAGE' });
      return {
        fileId: id,
        status: 'SKIPPED',
        variantsCreated: 0,
        variantsReused: 0,
        variantsFailed: 0,
        errorCode: 'NOT_IMAGE',
        durationMs: Date.now() - started
      };
    }

    await prisma.file.update({
      where: { id },
      data: {
        processingStatus: 'PROCESSING',
        processingStartedAt: new Date(),
        processingErrorCode: null,
        processingVersion: { increment: 1 }
      }
    });
    logSafe('started', { fileIdPrefix: id.slice(0, 8) });

    const buffer = await downloadMediaByProvider({
      storageProvider: file.storageProvider,
      storageKey: file.storageKey
    });
    if (!buffer || !buffer.length) {
      await prisma.file.update({
        where: { id },
        data: {
          processingStatus: 'FAILED',
          processingErrorCode: 'SOURCE_UNAVAILABLE',
          processingCompletedAt: new Date()
        }
      });
      return {
        fileId: id,
        status: 'FAILED',
        variantsCreated: 0,
        variantsReused: 0,
        variantsFailed: 0,
        errorCode: 'SOURCE_UNAVAILABLE',
        durationMs: Date.now() - started
      };
    }

    const category =
      opts?.category ||
      inferImageCategory({
        originalName: file.originalName
      });

    let generated;
    try {
      generated = await generateImageVariants({
        buffer,
        category,
        enableAvif: String(process.env.MEDIA_IMAGE_AVIF_ENABLED || 'true').toLowerCase() !== 'false'
      });
    } catch (error: any) {
      const code = String(error?.code || 'PROCESS_ERROR');
      await prisma.file.update({
        where: { id },
        data: {
          processingStatus: 'FAILED',
          processingErrorCode: code.slice(0, 64),
          processingCompletedAt: new Date()
        }
      });
      logSafe('failed', { fileIdPrefix: id.slice(0, 8), errorCode: code });
      return {
        fileId: id,
        status: 'FAILED',
        variantsCreated: 0,
        variantsReused: 0,
        variantsFailed: 0,
        errorCode: code,
        durationMs: Date.now() - started
      };
    }

    let created = 0;
    let reused = 0;
    let failed = 0;

    for (const variant of generated.variants) {
      const result = await persistGeneratedVariant({ fileId: id, variant });
      if (result.action === 'created') created += 1;
      else if (result.action === 'reused') reused += 1;
      else failed += 1;
    }

    const readyCount = created + reused;
    const planned = generated.variants.length;
    let status: ProcessingOutcome['status'] = 'READY';
    if (planned === 0) {
      status = 'FAILED';
    } else if (readyCount === 0) {
      status = 'FAILED';
    } else if (failed > 0 || readyCount < planned) {
      status = 'PARTIAL';
    }

    // Prefer smallest thumb for thumbnailUrl when ready
    const variants = await listReadyVariants(id);
    const thumb = variants
      .filter((v) => v.kind === 'image_thumb')
      .sort((a, b) => Number(a.width || 0) - Number(b.width || 0))[0];
    const manifest = await buildVariantsManifest(id);

    const dbStatus: 'READY' | 'PARTIAL' | 'FAILED' =
      status === 'READY' || status === 'PARTIAL' ? status : 'FAILED';

    await prisma.file.update({
      where: { id },
      data: {
        processingStatus: dbStatus,
        processingErrorCode: dbStatus === 'FAILED' ? 'VARIANT_GENERATION_FAILED' : null,
        processingCompletedAt: new Date(),
        width: file.width || generated.inspect.width,
        height: file.height || generated.inspect.height,
        thumbnailUrl: thumb
          ? `/api/files/${encodeURIComponent(id)}/variants/${encodeURIComponent(thumb.id)}/content`
          : undefined,
        variantsManifest: manifest as any
      }
    });

    logSafe('completed', {
      fileIdPrefix: id.slice(0, 8),
      status,
      variantsCreated: created,
      variantsReused: reused,
      variantsFailed: failed,
      durationMs: Date.now() - started
    });

    return {
      fileId: id,
      status,
      variantsCreated: created,
      variantsReused: reused,
      variantsFailed: failed,
      durationMs: Date.now() - started
    };
  } finally {
    processingLocks.delete(id);
  }
};

// Enqueue lives in mediaProcessing.enqueue.ts so the upload path never loads Sharp / ffprobe.
export {
  enqueueImageProcessingSafe,
  enqueueVideoProcessingSafe,
  enqueueMediaProcessingSafe
} from './mediaProcessing.enqueue';

export const MediaProcessingService = {
  processImageFile,
  buildVariantsManifest,
  isEligibleImageMime
};

export const __clearProcessingLocksForTests = () => processingLocks.clear();
