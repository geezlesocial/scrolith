/**
 * Phase 3B.2 — orchestrate async video metadata extraction.
 * Original media remains available in every status. Never blocks upload.
 *
 * Memory: GCS sources are streamed to a job-scoped temp file (never fully buffered).
 * Claim: conditional DB update so only one job becomes active for a version.
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

const processingLocks = new Set<string>();

export type VideoProcessingOutcome = {
  fileId: string;
  status: 'READY' | 'PARTIAL' | 'FAILED' | 'SKIPPED' | 'BUSY' | 'DISABLED';
  errorCode?: string | null;
  durationMs?: number;
  metadata?: VideoProbeMetadata | null;
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
  processingStatus: string
): Record<string, unknown> => {
  let base: Record<string, unknown> = {};
  try {
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      base = { ...(existing as Record<string, unknown>) };
      // Copy array fields shallowly so callers cannot mutate stored arrays in place
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

  // Drop any previously leaked private keys if present
  delete prevVideo.storageKey;
  delete prevVideo.bucket;
  delete prevVideo.raw;
  delete prevVideo.tempPath;
  delete prevVideo.command;

  return {
    ...base,
    processingStatus,
    video: {
      ...prevVideo,
      metadata: toClientSafeVideoMetadata(videoMeta)
    }
  };
};

/**
 * Process video metadata for a single File. Idempotent and version-safe.
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

    // Expected version from enqueue (current version at enqueue time).
    // Claim does NOT increment version — avoids immediately invalidating the same job.
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

    // Conditional claim: only one worker can move this version out of non-PROCESSING.
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

    // Pre-check declared size against product video limit (no download if already over).
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

    // Stale check after long download: another job may have advanced version.
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

    const probe = await probeVideoFile(tempPath);
    // Always drop temp before DB work
    safeUnlinkTemp(tempPath);
    tempPath = null;

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
    const hasExtra = Boolean(
      meta.codec || meta.container || meta.frameRate != null || meta.audioPresent
    );
    let status: 'READY' | 'PARTIAL' | 'FAILED' = 'FAILED';
    if (hasCore && hasExtra) status = 'READY';
    else if (hasCore) status = 'PARTIAL';

    if (status === 'FAILED') {
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

    const mergedManifest = mergeVideoIntoVariantsManifest(
      latest.variantsManifest,
      meta,
      status
    );
    const clientManifest: Record<string, unknown> = {
      ...mergedManifest,
      fileId: id,
      processingStatus: status,
      width: nextWidth ?? null,
      height: nextHeight ?? null,
      durationSeconds: nextDuration ?? null,
      originalUrl: `/api/files/content/${encodeURIComponent(id)}`
    };

    // Final write only if we still own the claim (version + PROCESSING).
    // Bump processingVersion once on successful completion so re-enqueue can run again.
    const updated = await prisma.file.updateMany({
      where: {
        id,
        processingVersion: claimedVersion,
        processingStatus: 'PROCESSING'
      },
      data: {
        processingStatus: status,
        processingErrorCode: null,
        processingCompletedAt: new Date(),
        processingVersion: { increment: 1 },
        width: nextWidth,
        height: nextHeight,
        duration: nextDuration,
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
      durationMs: Date.now() - started
    });

    return {
      fileId: id,
      status,
      metadata: meta,
      durationMs: Date.now() - started
    };
  } finally {
    if (tempPath) safeUnlinkTemp(tempPath);
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
