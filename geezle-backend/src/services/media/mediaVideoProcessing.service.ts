/**
 * Phase 3B.2/3B.3 — orchestrate async video metadata + poster/thumbnail generation.
 * Original media remains available in every status. Never blocks upload.
 *
 * Memory: GCS sources are streamed to a job-scoped temp file (never fully buffered).
 * Claim: conditional DB update so only one job becomes active for a version.
 * Derivatives: deterministic GCS keys + FileVariant rows; client-safe manifest only.
 */
import prisma from '../../utils/prismaClient';
import {
  createReadStreamForProvider,
  downloadMediaByProvider
} from '../storage/mediaStorage.service';
import {
  isEligibleVideoMime,
  isFfprobeAvailable,
  materializeVideoSourceToTemp,
  MAX_VIDEO_PROBE_BYTES,
  probeVideoFile,
  safeUnlinkTemp,
  toClientSafeVideoMetadata,
  type VideoProbeErrorCode,
  type VideoProbeMetadata
} from './mediaVideoProbe.service';
import {
  cleanupVideoPosterTemps,
  generateVideoPosterAndThumb,
  isFfmpegAvailable,
  type VideoPosterErrorCode
} from './mediaVideoPoster.service';
import { listReadyVariants, persistGeneratedVariant } from './mediaVariant.service';

const processingLocks = new Set<string>();

export type VideoProcessingOutcome = {
  fileId: string;
  status: 'READY' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'BUSY' | 'DISABLED';
  errorCode?: string | null;
  durationMs?: number;
  metadata?: VideoProbeMetadata | null;
  posterVariantId?: string | null;
  thumbVariantId?: string | null;
};

const logSafe = (event: string, payload: Record<string, unknown>) => {
  // Never log storage keys, paths, full file ids, or stderr
  console.info(`[media-video] ${event}`, payload);
};

const isVideoProcessingEnabled = () => {
  const enabled = String(process.env.MEDIA_VIDEO_PROCESSING_ENABLED || 'false')
    .trim()
    .toLowerCase();
  const mode = String(process.env.MEDIA_PROCESSING_MODE || 'disabled')
    .trim()
    .toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(enabled) && mode === 'inline_async';
};

/**
 * Deep-safe merge for the video subsection.
 * Preserves all existing top-level keys (image variants, thumbnails, unknown future fields).
 * Malformed JSON is treated as empty without throwing.
 */
export const mergeVideoIntoVariantsManifest = (
  existing: unknown,
  videoMeta: VideoProbeMetadata,
  processingStatus: string,
  opts?: {
    posterUrl?: string | null;
    thumbnailUrl?: string | null;
    posterVariantId?: string | null;
    thumbVariantId?: string | null;
  }
): Record<string, unknown> => {
  let base: Record<string, unknown> = {};
  try {
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      base = { ...(existing as Record<string, unknown>) };
      if (Array.isArray(base.variants)) {
        base.variants = [...base.variants];
      }
    }
  } catch {
    base = {};
  }

  let prevVideo: Record<string, unknown> = {};
  try {
    if (base.video && typeof base.video === 'object' && !Array.isArray(base.video)) {
      prevVideo = { ...(base.video as Record<string, unknown>) };
    }
  } catch {
    prevVideo = {};
  }

  delete prevVideo.storageKey;
  delete prevVideo.bucket;
  delete prevVideo.raw;
  delete prevVideo.tempPath;
  delete prevVideo.command;

  const next: Record<string, unknown> = {
    ...base,
    processingStatus,
    video: {
      ...prevVideo,
      metadata: toClientSafeVideoMetadata(videoMeta)
    }
  };

  if (opts?.posterUrl) next.posterUrl = opts.posterUrl;
  if (opts?.thumbnailUrl) next.thumbnailUrl = opts.thumbnailUrl;

  return next;
};

const authorizedVariantUrl = (fileId: string, variantId: string) =>
  `/api/files/${encodeURIComponent(fileId)}/variants/${encodeURIComponent(variantId)}/content`;

/**
 * Process video metadata + optional poster/thumbnail for a single File.
 */
export const processVideoMetadata = async (
  fileId: string,
  opts?: { expectedVersion?: number; signal?: AbortSignal }
): Promise<VideoProcessingOutcome> => {
  const id = String(fileId || '').trim();
  const started = Date.now();
  if (!id) {
    return { fileId: '', status: 'FAILED', errorCode: 'MISSING_ID' };
  }

  if (!isVideoProcessingEnabled()) {
    return { fileId: id, status: 'DISABLED', durationMs: Date.now() - started };
  }

  if (processingLocks.has(id)) {
    return { fileId: id, status: 'BUSY', durationMs: Date.now() - started };
  }
  processingLocks.add(id);

  let claimedVersion: number | null = null;
  let tempPath: string | null = null;
  let posterTemps: { posterPath?: string | null; thumbPath?: string | null } | null = null;

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
        duration: true,
        processingVersion: true,
        processingStatus: true,
        variantsManifest: true,
        size: true
      }
    });

    if (!file) {
      return {
        fileId: id,
        status: 'FAILED',
        errorCode: 'FILE_NOT_FOUND',
        durationMs: Date.now() - started
      };
    }

    if (!isEligibleVideoMime(file.mimeType)) {
      await prisma.file.update({
        where: { id },
        data: {
          processingStatus: 'SKIPPED',
          processingErrorCode: 'NOT_VIDEO',
          processingCompletedAt: new Date()
        }
      });
      logSafe('skipped', { fileIdPrefix: id.slice(0, 8), reason: 'NOT_VIDEO' });
      return {
        fileId: id,
        status: 'SKIPPED',
        errorCode: 'NOT_VIDEO',
        durationMs: Date.now() - started
      };
    }

    const expectedVersion =
      opts?.expectedVersion != null && Number.isFinite(Number(opts.expectedVersion))
        ? Number(opts.expectedVersion)
        : Number(file.processingVersion || 0);

    if (Number(file.processingVersion || 0) !== expectedVersion) {
      logSafe('stale_job_skipped', {
        fileIdPrefix: id.slice(0, 8),
        jobVersion: expectedVersion,
        currentVersion: file.processingVersion
      });
      return {
        fileId: id,
        status: 'BUSY',
        errorCode: 'STALE_VERSION',
        durationMs: Date.now() - started
      };
    }

    const claim = await prisma.file.updateMany({
      where: {
        id,
        processingVersion: expectedVersion,
        processingStatus: { not: 'PROCESSING' }
      },
      data: {
        processingStatus: 'PROCESSING',
        processingStartedAt: new Date(),
        processingErrorCode: null
      }
    });

    if (claim.count === 0) {
      logSafe('claim_failed', {
        fileIdPrefix: id.slice(0, 8),
        expectedVersion
      });
      return {
        fileId: id,
        status: 'BUSY',
        errorCode: 'STALE_VERSION',
        durationMs: Date.now() - started
      };
    }

    claimedVersion = expectedVersion;
    logSafe('started', { fileIdPrefix: id.slice(0, 8), processingVersion: claimedVersion });

    // Metadata requires ffprobe; without it we cannot proceed to READY.
    if (!(await isFfprobeAvailable())) {
      await safeFinalUpdate(id, claimedVersion, {
        processingStatus: 'FAILED',
        processingErrorCode: 'VIDEO_METADATA_UNAVAILABLE',
        processingCompletedAt: new Date()
      });
      return {
        fileId: id,
        status: 'FAILED',
        errorCode: 'VIDEO_METADATA_UNAVAILABLE',
        durationMs: Date.now() - started
      };
    }

    const declaredSize = Number(file.size);
    if (Number.isFinite(declaredSize) && declaredSize > MAX_VIDEO_PROBE_BYTES) {
      await safeFinalUpdate(id, claimedVersion, {
        processingStatus: 'FAILED',
        processingErrorCode: 'VIDEO_STORAGE_FAILED',
        processingCompletedAt: new Date()
      });
      return {
        fileId: id,
        status: 'FAILED',
        errorCode: 'VIDEO_STORAGE_FAILED',
        durationMs: Date.now() - started
      };
    }

    const materialize = await materializeVideoSourceToTemp({
      createReadStream: () =>
        createReadStreamForProvider({
          storageProvider: file.storageProvider,
          storageKey: file.storageKey
        }) as NodeJS.ReadableStream | null,
      downloadBuffer: async () =>
        downloadMediaByProvider({
          storageProvider: file.storageProvider,
          storageKey: file.storageKey
        }),
      declaredSizeBytes: file.size,
      maxBytes: MAX_VIDEO_PROBE_BYTES,
      suffix: guessSuffix(file.mimeType),
      signal: opts?.signal
    });

    if (materialize.ok === false) {
      await safeFinalUpdate(id, claimedVersion, {
        processingStatus: 'FAILED',
        processingErrorCode: materialize.errorCode,
        processingCompletedAt: new Date()
      });
      logSafe('materialize_failed', {
        fileIdPrefix: id.slice(0, 8),
        errorCode: materialize.errorCode
      });
      return {
        fileId: id,
        status: 'FAILED',
        errorCode: materialize.errorCode,
        durationMs: Date.now() - started
      };
    }

    tempPath = materialize.tempPath;

    const mid = await prisma.file.findUnique({
      where: { id },
      select: { processingVersion: true, processingStatus: true }
    });
    if (
      !mid ||
      Number(mid.processingVersion) !== claimedVersion ||
      String(mid.processingStatus) !== 'PROCESSING'
    ) {
      logSafe('stale_after_download', {
        fileIdPrefix: id.slice(0, 8),
        claimedVersion
      });
      return {
        fileId: id,
        status: 'BUSY',
        errorCode: 'STALE_VERSION',
        durationMs: Date.now() - started
      };
    }

    // --- Metadata ---
    const probe = await probeVideoFile(tempPath);
    if (probe.ok === false) {
      const code: VideoProbeErrorCode = probe.errorCode;
      await safeFinalUpdate(id, claimedVersion, {
        processingStatus: 'FAILED',
        processingErrorCode: String(code).slice(0, 64),
        processingCompletedAt: new Date()
      });
      logSafe('failed', { fileIdPrefix: id.slice(0, 8), errorCode: code });
      return {
        fileId: id,
        status: 'FAILED',
        errorCode: code,
        durationMs: Date.now() - started
      };
    }

    const meta = probe.metadata;
    const hasCore = Boolean(meta.width || meta.height || meta.durationSeconds != null);
    if (!hasCore) {
      await safeFinalUpdate(id, claimedVersion, {
        processingStatus: 'FAILED',
        processingErrorCode: 'VIDEO_METADATA_FAILED',
        processingCompletedAt: new Date()
      });
      return {
        fileId: id,
        status: 'FAILED',
        errorCode: 'VIDEO_METADATA_FAILED',
        durationMs: Date.now() - started
      };
    }

    // --- Poster / thumbnail (best-effort; metadata may still persist as PARTIAL) ---
    let posterVariantId: string | null = null;
    let thumbVariantId: string | null = null;
    let posterError: VideoPosterErrorCode | null = null;

    if (!(await isFfmpegAvailable())) {
      posterError = 'VIDEO_POSTER_UNAVAILABLE';
      logSafe('poster_unavailable', { fileIdPrefix: id.slice(0, 8) });
    } else {
      const posterResult = await generateVideoPosterAndThumb({
        inputPath: tempPath,
        metadata: meta
      });
      if (posterResult.ok === false) {
        posterError = posterResult.errorCode;
        logSafe('poster_failed', { fileIdPrefix: id.slice(0, 8), errorCode: posterError });
      } else {
        posterTemps = {
          posterPath: posterResult.outputs.posterPath,
          thumbPath: posterResult.outputs.thumbPath
        };

        // Atomicity: only assign variant IDs after verified GCS upload + FileVariant upsert.
        // Failed derivative must not appear in posterUrl/thumbnailUrl or READY status.
        const posterPersist = await persistGeneratedVariant({
          fileId: id,
          variant: posterResult.outputs.poster
        });
        if (posterPersist.action === 'created' || posterPersist.action === 'reused') {
          posterVariantId = posterPersist.variantId || null;
        } else {
          posterError = 'VIDEO_POSTER_FAILED';
          // Safe log: action only — no full storage key / bucket
          logSafe('poster_persist_failed', {
            fileIdPrefix: id.slice(0, 8),
            action: posterPersist.action,
            derivative: 'video_poster'
          });
        }

        const thumbPersist = await persistGeneratedVariant({
          fileId: id,
          variant: posterResult.outputs.thumbnail
        });
        if (thumbPersist.action === 'created' || thumbPersist.action === 'reused') {
          thumbVariantId = thumbPersist.variantId || null;
        } else {
          if (!posterError) posterError = 'VIDEO_THUMBNAIL_FAILED';
          logSafe('thumb_persist_failed', {
            fileIdPrefix: id.slice(0, 8),
            action: thumbPersist.action,
            derivative: 'video_thumb'
          });
        }

        // Drop temp image files after persist attempts (success or fail)
        cleanupVideoPosterTemps(posterTemps);
        posterTemps = null;
      }
    }

    // Drop original temp before final DB write
    safeUnlinkTemp(tempPath);
    tempPath = null;

    // READY only when metadata is rich AND both derivatives verified+persisted.
    // Poster-only or thumb-only success remains PARTIAL (most useful error preserved).
    const bothDerivativesOk = Boolean(posterVariantId && thumbVariantId);
    const hasExtra = Boolean(
      meta.codec || meta.container || meta.frameRate != null || meta.audioPresent
    );

    let status: 'READY' | 'PARTIAL' = 'PARTIAL';
    let errorCode: string | null = null;
    if (bothDerivativesOk && hasExtra) {
      status = 'READY';
      errorCode = null;
    } else if (bothDerivativesOk) {
      status = 'PARTIAL';
      errorCode = 'VIDEO_PARTIAL';
    } else if (posterVariantId && !thumbVariantId) {
      status = 'PARTIAL';
      errorCode = posterError || 'VIDEO_THUMBNAIL_FAILED';
    } else if (!posterVariantId && thumbVariantId) {
      status = 'PARTIAL';
      errorCode = posterError || 'VIDEO_POSTER_FAILED';
    } else {
      status = 'PARTIAL';
      errorCode = posterError || 'VIDEO_PARTIAL';
    }

    const latest = await prisma.file.findUnique({
      where: { id },
      select: {
        processingVersion: true,
        processingStatus: true,
        variantsManifest: true,
        width: true,
        height: true,
        duration: true
      }
    });
    if (
      !latest ||
      Number(latest.processingVersion || 0) !== claimedVersion ||
      String(latest.processingStatus) !== 'PROCESSING'
    ) {
      logSafe('stale_before_write', {
        fileIdPrefix: id.slice(0, 8),
        claimedVersion,
        current: latest?.processingVersion
      });
      return {
        fileId: id,
        status: 'BUSY',
        errorCode: 'STALE_VERSION',
        durationMs: Date.now() - started
      };
    }

    const nextWidth = meta.width ?? latest.width ?? undefined;
    const nextHeight = meta.height ?? latest.height ?? undefined;
    const nextDuration =
      meta.durationSeconds != null
        ? meta.durationSeconds
        : latest.duration != null
          ? latest.duration
          : undefined;

    const posterUrl = posterVariantId ? authorizedVariantUrl(id, posterVariantId) : null;
    const thumbnailUrl = thumbVariantId ? authorizedVariantUrl(id, thumbVariantId) : null;

    // Include ready variants list (client-safe) from DB
    const readyVariants = await listReadyVariants(id);
    const clientVariants = readyVariants.map((v) => ({
      id: v.id,
      kind: v.kind,
      label: v.label,
      width: v.width,
      height: v.height,
      format: v.format,
      mimeType: v.mimeType,
      sizeBytes: Number(v.sizeBytes || 0),
      contentUrl: authorizedVariantUrl(id, v.id)
    }));

    const mergedManifest = mergeVideoIntoVariantsManifest(
      latest.variantsManifest,
      meta,
      status,
      { posterUrl, thumbnailUrl, posterVariantId, thumbVariantId }
    );
    const clientManifest: Record<string, unknown> = {
      ...mergedManifest,
      fileId: id,
      processingStatus: status,
      width: nextWidth ?? null,
      height: nextHeight ?? null,
      durationSeconds: nextDuration ?? null,
      originalUrl: `/api/files/content/${encodeURIComponent(id)}`,
      posterUrl,
      thumbnailUrl,
      variants: clientVariants
    };

    const updated = await prisma.file.updateMany({
      where: {
        id,
        processingVersion: claimedVersion,
        processingStatus: 'PROCESSING'
      },
      data: {
        processingStatus: status,
        processingErrorCode: errorCode,
        processingCompletedAt: new Date(),
        processingVersion: { increment: 1 },
        width: nextWidth,
        height: nextHeight,
        duration: nextDuration,
        // Prefer authorized app route for File.thumbnailUrl when thumb exists
        ...(thumbnailUrl ? { thumbnailUrl } : {}),
        variantsManifest: clientManifest as any
      }
    });

    if (updated.count === 0) {
      logSafe('stale_write_skipped', { fileIdPrefix: id.slice(0, 8), claimedVersion });
      return {
        fileId: id,
        status: 'BUSY',
        errorCode: 'STALE_VERSION',
        durationMs: Date.now() - started
      };
    }

    logSafe('completed', {
      fileIdPrefix: id.slice(0, 8),
      status,
      errorCode,
      durationMs: Date.now() - started,
      hasPoster: Boolean(posterVariantId),
      hasThumb: Boolean(thumbVariantId)
    });

    return {
      fileId: id,
      status,
      errorCode,
      metadata: meta,
      posterVariantId,
      thumbVariantId,
      durationMs: Date.now() - started
    };
  } finally {
    if (tempPath) safeUnlinkTemp(tempPath);
    if (posterTemps) cleanupVideoPosterTemps(posterTemps);
    processingLocks.delete(id);
  }
};

const safeFinalUpdate = async (
  id: string,
  claimedVersion: number,
  data: Record<string, unknown>
) => {
  try {
    await prisma.file.updateMany({
      where: {
        id,
        processingVersion: claimedVersion,
        processingStatus: 'PROCESSING'
      },
      data: data as any
    });
  } catch {
    // best-effort
  }
};

const guessSuffix = (mimeType?: string | null) => {
  const mime = String(mimeType || '').toLowerCase();
  if (mime.includes('webm')) return '.webm';
  if (mime.includes('quicktime') || mime.includes('mov')) return '.mov';
  if (mime.includes('ogg')) return '.ogv';
  return '.mp4';
};

export const __clearVideoProcessingLocksForTests = () => processingLocks.clear();

export const MediaVideoProcessingService = {
  processVideoMetadata,
  mergeVideoIntoVariantsManifest,
  isEligibleVideoMime,
  MAX_VIDEO_PROBE_BYTES
};
