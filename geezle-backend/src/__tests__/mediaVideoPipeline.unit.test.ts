/**
 * Phase 3B.2/3B.3 — video metadata + poster pipeline, enqueue, locking, stream-to-temp, manifest merge.
 */
jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    file: {
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
      create: jest.fn()
    },
    fileVariant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    }
  }
}));

jest.mock('../services/storage/mediaStorage.service', () => ({
  downloadMediaByProvider: jest.fn(),
  createReadStreamForProvider: jest.fn()
}));

jest.mock('../services/media/mediaVariant.service', () => ({
  persistGeneratedVariant: jest.fn(),
  listReadyVariants: jest.fn(async () => [])
}));

jest.mock('../services/media/mediaVideoPoster.service', () => {
  const actual = jest.requireActual('../services/media/mediaVideoPoster.service');
  return {
    ...actual,
    isFfmpegAvailable: jest.fn(async () => true),
    generateVideoPosterAndThumb: jest.fn(),
    cleanupVideoPosterTemps: jest.fn()
  };
});

import { Readable } from 'stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import prisma from '../utils/prismaClient';
import {
  downloadMediaByProvider,
  createReadStreamForProvider
} from '../services/storage/mediaStorage.service';
import {
  processVideoMetadata,
  mergeVideoIntoVariantsManifest,
  __clearVideoProcessingLocksForTests
} from '../services/media/mediaVideoProcessing.service';
import {
  setFfprobeRunnerForTests,
  __resetFfprobeAvailabilityCacheForTests,
  streamToTempFileBounded,
  materializeVideoSourceToTemp,
  MAX_VIDEO_PROBE_BYTES,
  safeUnlinkTemp,
  type FfprobeRunner
} from '../services/media/mediaVideoProbe.service';
import {
  generateVideoPosterAndThumb,
  isFfmpegAvailable,
  cleanupVideoPosterTemps
} from '../services/media/mediaVideoPoster.service';
import { persistGeneratedVariant, listReadyVariants } from '../services/media/mediaVariant.service';
import {
  enqueueVideoProcessingSafe,
  enqueueMediaProcessingSafe
} from '../services/media/mediaProcessing.enqueue';
import {
  getMediaProcessingMode,
  __resetMediaProcessingQueueForTests,
  getMediaProcessingQueue,
  __getMediaProcessingQueueStatsForTests,
  registerVideoProcessingHandler
} from '../services/media/mediaProcessingQueue';

const mockPrisma = prisma as any;
const mockDownload = downloadMediaByProvider as jest.Mock;
const mockCreateStream = createReadStreamForProvider as jest.Mock;
const mockPosterGen = generateVideoPosterAndThumb as jest.Mock;
const mockFfmpegAvail = isFfmpegAvailable as jest.Mock;
const mockPersist = persistGeneratedVariant as jest.Mock;
const mockListVariants = listReadyVariants as jest.Mock;

const sampleProbe = {
  streams: [
    {
      codec_type: 'video',
      codec_name: 'h264',
      width: 1280,
      height: 720,
      avg_frame_rate: '25/1',
      duration: '5.0'
    },
    { codec_type: 'audio', codec_name: 'aac' }
  ],
  format: {
    format_name: 'mp4',
    duration: '5.0',
    bit_rate: '1500000',
    size: '900000'
  }
};

const okRunner: FfprobeRunner = async (args) => {
  if (args.includes('-version')) return { stdout: 'ffprobe version test', stderr: '' };
  return { stdout: JSON.stringify(sampleProbe), stderr: '' };
};

const fakePosterOk = () => ({
  ok: true as const,
  outputs: {
    poster: {
      kind: 'video_poster' as const,
      label: 'default',
      width: 1280,
      height: 720,
      format: 'webp' as const,
      mimeType: 'image/webp',
      buffer: Buffer.from('poster'),
      checksum: 'p1'
    },
    thumbnail: {
      kind: 'video_thumb' as const,
      label: 'default',
      width: 320,
      height: 180,
      format: 'webp' as const,
      mimeType: 'image/webp',
      buffer: Buffer.from('thumb'),
      checksum: 't1'
    },
    timestampSeconds: 0.5,
    posterPath: path.join(os.tmpdir(), 'fake-poster.webp'),
    thumbPath: path.join(os.tmpdir(), 'fake-thumb.webp')
  }
});

describe('mediaVideoPipeline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __clearVideoProcessingLocksForTests();
    __resetMediaProcessingQueueForTests();
    __resetFfprobeAvailabilityCacheForTests();
    setFfprobeRunnerForTests(null);
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'false';
    process.env.MEDIA_IMAGE_PROCESSING_ENABLED = 'false';
    process.env.MEDIA_PROCESSING_MODE = 'disabled';
    mockFfmpegAvail.mockResolvedValue(true);
    mockPosterGen.mockResolvedValue(fakePosterOk());
    mockPersist.mockImplementation(async ({ variant }) => ({
      action: 'created',
      variantId: `vid-${variant.kind}`,
      storageKey: `media/x/${variant.kind}`
    }));
    mockListVariants.mockResolvedValue([
      {
        id: 'vid-video_poster',
        kind: 'video_poster',
        label: 'default',
        width: 1280,
        height: 720,
        format: 'webp',
        mimeType: 'image/webp',
        sizeBytes: 10
      },
      {
        id: 'vid-video_thumb',
        kind: 'video_thumb',
        label: 'default',
        width: 320,
        height: 180,
        format: 'webp',
        mimeType: 'image/webp',
        sizeBytes: 5
      }
    ]);
  });

  afterEach(() => {
    setFfprobeRunnerForTests(null);
    __resetFfprobeAvailabilityCacheForTests();
    __clearVideoProcessingLocksForTests();
    __resetMediaProcessingQueueForTests();
  });

  test('processing disabled by default — no probe invocation', async () => {
    expect(getMediaProcessingMode()).toBe('disabled');
    const runner = jest.fn(okRunner);
    setFfprobeRunnerForTests(runner);
    const out = await processVideoMetadata('file-v1');
    expect(out.status).toBe('DISABLED');
    expect(mockPrisma.file.findUnique).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
    expect(mockPosterGen).not.toHaveBeenCalled();
  });

  test('non-video skipped', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'f1',
      mimeType: 'image/jpeg',
      storageKey: 'k',
      storageProvider: 'google_cloud_storage',
      processingVersion: 0,
      variantsManifest: null
    });
    mockPrisma.file.update.mockResolvedValue({});
    const out = await processVideoMetadata('f1');
    expect(out.status).toBe('SKIPPED');
    expect(out.errorCode).toBe('NOT_VIDEO');
  });

  test('metadata + poster success → READY and thumbnailUrl route', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);
    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('streamed-video-bytes')));

    mockPrisma.file.findUnique
      .mockResolvedValueOnce({
        id: 'vid1',
        mimeType: 'video/mp4',
        storageKey: 'media/vid1/orig.mp4',
        storageProvider: 'google_cloud_storage',
        width: null,
        height: null,
        duration: null,
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: {
          variants: [{ id: 'img1', kind: 'image_thumb', width: 200 }],
          customFutureKey: { nested: true }
        },
        size: BigInt(32)
      })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING'
      })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING',
        variantsManifest: {
          variants: [{ id: 'img1', kind: 'image_thumb', width: 200 }],
          customFutureKey: { nested: true }
        },
        width: null,
        height: null,
        duration: null
      });

    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const out = await processVideoMetadata('vid1', { expectedVersion: 0 });
    expect(out.status).toBe('READY');
    expect(out.posterVariantId).toBe('vid-video_poster');
    expect(out.thumbVariantId).toBe('vid-video_thumb');
    expect(mockPosterGen).toHaveBeenCalled();
    expect(mockPersist).toHaveBeenCalledTimes(2);
    expect(cleanupVideoPosterTemps).toHaveBeenCalled();

    const finalWrite = mockPrisma.file.updateMany.mock.calls[1][0];
    expect(finalWrite.data.processingStatus).toBe('READY');
    expect(finalWrite.data.thumbnailUrl).toContain('/api/files/vid1/variants/vid-video_thumb/content');
    expect(finalWrite.data.variantsManifest.posterUrl).toContain('video_poster');
    expect(finalWrite.data.variantsManifest.customFutureKey).toEqual({ nested: true });
    // variants list comes from DB ready rows (video poster/thumb in this mock)
    expect(finalWrite.data.variantsManifest.variants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'video_poster' }),
        expect.objectContaining({ kind: 'video_thumb' })
      ])
    );
    // prior image manifest keys preserved via deep-safe merge
    expect(finalWrite.data.variantsManifest.customFutureKey).toEqual({ nested: true });
    expect(JSON.stringify(finalWrite.data.variantsManifest)).not.toMatch(/storageKey|bucket|tmp|ffmpeg/i);
  });

  test('poster GCS/DB failure does not expose posterUrl; thumb-only stays PARTIAL', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);
    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('v')));
    mockPersist.mockImplementation(async ({ variant }) => {
      if (variant.kind === 'video_poster') {
        return { action: 'error', storageKey: 'media/x/video/poster.webp', message: 'upload failed' };
      }
      return { action: 'created', variantId: 'only-thumb', storageKey: 'media/x/video/thumb-320w.webp' };
    });
    mockListVariants.mockResolvedValue([
      {
        id: 'only-thumb',
        kind: 'video_thumb',
        label: 'default',
        width: 320,
        height: 180,
        format: 'webp',
        mimeType: 'image/webp',
        sizeBytes: 5
      }
    ]);

    mockPrisma.file.findUnique
      .mockResolvedValueOnce({
        id: 'vid-pp',
        mimeType: 'video/mp4',
        storageKey: 'k',
        storageProvider: 'google_cloud_storage',
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: null,
        size: BigInt(4)
      })
      .mockResolvedValueOnce({ processingVersion: 0, processingStatus: 'PROCESSING' })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING',
        variantsManifest: null,
        width: null,
        height: null,
        duration: null
      });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const out = await processVideoMetadata('vid-pp', { expectedVersion: 0 });
    expect(out.status).toBe('PARTIAL');
    expect(out.posterVariantId).toBeNull();
    expect(out.thumbVariantId).toBe('only-thumb');
    const finalWrite = mockPrisma.file.updateMany.mock.calls[1][0];
    expect(finalWrite.data.variantsManifest.posterUrl).toBeNull();
    expect(finalWrite.data.variantsManifest.thumbnailUrl).toContain('only-thumb');
    expect(finalWrite.data.thumbnailUrl).toContain('only-thumb');
    // failed poster not listed as ready
    expect(finalWrite.data.variantsManifest.variants.every((v: any) => v.kind !== 'video_poster' || v.id === 'only-thumb')).toBe(true);
    expect(finalWrite.data.variantsManifest.variants.find((v: any) => v.kind === 'video_poster')).toBeUndefined();
  });

  test('thumbnail persist failure keeps posterUrl but not thumbnailUrl; PARTIAL', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);
    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('v')));
    mockPersist.mockImplementation(async ({ variant }) => {
      if (variant.kind === 'video_thumb') {
        return { action: 'conflict', storageKey: 'media/x/video/thumb-320w.webp' };
      }
      return { action: 'created', variantId: 'only-poster', storageKey: 'media/x/video/poster.webp' };
    });
    mockListVariants.mockResolvedValue([
      {
        id: 'only-poster',
        kind: 'video_poster',
        label: 'default',
        width: 640,
        height: 360,
        format: 'webp',
        mimeType: 'image/webp',
        sizeBytes: 10
      }
    ]);

    mockPrisma.file.findUnique
      .mockResolvedValueOnce({
        id: 'vid-tp',
        mimeType: 'video/mp4',
        storageKey: 'k',
        storageProvider: 'google_cloud_storage',
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: null,
        size: BigInt(4)
      })
      .mockResolvedValueOnce({ processingVersion: 0, processingStatus: 'PROCESSING' })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING',
        variantsManifest: null,
        width: null,
        height: null,
        duration: null
      });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const out = await processVideoMetadata('vid-tp', { expectedVersion: 0 });
    expect(out.status).toBe('PARTIAL');
    expect(out.errorCode).toBe('VIDEO_THUMBNAIL_FAILED');
    const finalWrite = mockPrisma.file.updateMany.mock.calls[1][0];
    expect(finalWrite.data.variantsManifest.posterUrl).toContain('only-poster');
    expect(finalWrite.data.variantsManifest.thumbnailUrl).toBeNull();
    // File.thumbnailUrl only when verified thumb exists
    expect(finalWrite.data.thumbnailUrl).toBeUndefined();
  });

  test('File.thumbnailUrl set only after verified thumbnail variant', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);
    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('v')));
    mockPersist.mockResolvedValue({ action: 'error', storageKey: 'x' });
    mockListVariants.mockResolvedValue([]);

    mockPrisma.file.findUnique
      .mockResolvedValueOnce({
        id: 'vid-nt',
        mimeType: 'video/mp4',
        storageKey: 'k',
        storageProvider: 'google_cloud_storage',
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: null,
        size: BigInt(4)
      })
      .mockResolvedValueOnce({ processingVersion: 0, processingStatus: 'PROCESSING' })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING',
        variantsManifest: null,
        width: null,
        height: null,
        duration: null
      });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    await processVideoMetadata('vid-nt', { expectedVersion: 0 });
    const finalWrite = mockPrisma.file.updateMany.mock.calls[1][0];
    expect(finalWrite.data.thumbnailUrl).toBeUndefined();
    expect(finalWrite.data.variantsManifest.thumbnailUrl).toBeNull();
    expect(finalWrite.data.variantsManifest.posterUrl).toBeNull();
  });

  test('metadata success + poster failure → PARTIAL', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);
    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('v')));
    mockPosterGen.mockResolvedValue({ ok: false, errorCode: 'VIDEO_POSTER_FAILED' });

    mockPrisma.file.findUnique
      .mockResolvedValueOnce({
        id: 'vid-partial',
        mimeType: 'video/mp4',
        storageKey: 'k',
        storageProvider: 'google_cloud_storage',
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: null,
        size: BigInt(4)
      })
      .mockResolvedValueOnce({ processingVersion: 0, processingStatus: 'PROCESSING' })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING',
        variantsManifest: null,
        width: null,
        height: null,
        duration: null
      });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockListVariants.mockResolvedValue([]);

    const out = await processVideoMetadata('vid-partial', { expectedVersion: 0 });
    expect(out.status).toBe('PARTIAL');
    expect(out.errorCode).toBe('VIDEO_POSTER_FAILED');
    const finalWrite = mockPrisma.file.updateMany.mock.calls[1][0];
    expect(finalWrite.data.processingStatus).toBe('PARTIAL');
    expect(finalWrite.data.width).toBe(1280);
  });

  test('ffmpeg missing → PARTIAL with VIDEO_POSTER_UNAVAILABLE', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);
    mockFfmpegAvail.mockResolvedValue(false);
    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('v')));

    mockPrisma.file.findUnique
      .mockResolvedValueOnce({
        id: 'vid-noff',
        mimeType: 'video/mp4',
        storageKey: 'k',
        storageProvider: 'google_cloud_storage',
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: null,
        size: BigInt(4)
      })
      .mockResolvedValueOnce({ processingVersion: 0, processingStatus: 'PROCESSING' })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING',
        variantsManifest: null,
        width: null,
        height: null,
        duration: null
      });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });
    mockListVariants.mockResolvedValue([]);

    const out = await processVideoMetadata('vid-noff', { expectedVersion: 0 });
    expect(out.status).toBe('PARTIAL');
    expect(out.errorCode).toBe('VIDEO_POSTER_UNAVAILABLE');
    expect(mockPosterGen).not.toHaveBeenCalled();
  });

  test('GCS stream-to-temp without full buffering', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);
    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('streamed')));
    mockDownload.mockImplementation(async () => {
      throw new Error('downloadBuffer should not be called');
    });

    mockPrisma.file.findUnique
      .mockResolvedValueOnce({
        id: 'vid1',
        mimeType: 'video/mp4',
        storageKey: 'media/vid1/orig.mp4',
        storageProvider: 'google_cloud_storage',
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: null,
        size: BigInt(8)
      })
      .mockResolvedValueOnce({ processingVersion: 0, processingStatus: 'PROCESSING' })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING',
        variantsManifest: null,
        width: null,
        height: null,
        duration: null
      });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const out = await processVideoMetadata('vid1', { expectedVersion: 0 });
    expect(out.status).toBe('READY');
    expect(mockCreateStream).toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
  });

  test('byte limit enforced before download when declared size exceeds max', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);

    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'huge',
      mimeType: 'video/mp4',
      storageKey: 'k',
      storageProvider: 'google_cloud_storage',
      processingVersion: 0,
      processingStatus: 'PENDING',
      variantsManifest: null,
      size: BigInt(MAX_VIDEO_PROBE_BYTES + 1)
    });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const out = await processVideoMetadata('huge', { expectedVersion: 0 });
    expect(out.status).toBe('FAILED');
    expect(out.errorCode).toBe('VIDEO_STORAGE_FAILED');
    expect(mockCreateStream).not.toHaveBeenCalled();
  });

  test('streamToTempFileBounded aborts when stream exceeds maxBytes and cleans partial', async () => {
    const dir = path.join(os.tmpdir(), 'scrolith-video-probe');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, `limit-test-${Date.now()}.bin`);
    const chunks = [Buffer.alloc(100, 1), Buffer.alloc(100, 2), Buffer.alloc(100, 3)];
    const source = Readable.from(chunks);
    await expect(
      streamToTempFileBounded(source, dest, { maxBytes: 150 })
    ).rejects.toMatchObject({ code: 'SIZE_LIMIT' });
    await new Promise((r) => setTimeout(r, 25));
    safeUnlinkTemp(dest);
    expect(fs.existsSync(dest)).toBe(false);
  });

  test('materialize from stream writes only to temp without calling downloadBuffer', async () => {
    const result = await materializeVideoSourceToTemp({
      createReadStream: () => Readable.from(Buffer.from('abc123')),
      downloadBuffer: async () => {
        throw new Error('should not download');
      },
      maxBytes: 1024,
      suffix: '.mp4'
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bytesWritten).toBe(6);
      expect(fs.existsSync(result.tempPath)).toBe(true);
      safeUnlinkTemp(result.tempPath);
      expect(fs.existsSync(result.tempPath)).toBe(false);
    }
  });

  test('duplicate job claim — second claim fails', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);

    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'vid-claim',
      mimeType: 'video/mp4',
      storageKey: 'k',
      storageProvider: 'google_cloud_storage',
      processingVersion: 3,
      processingStatus: 'PENDING',
      variantsManifest: null,
      size: BigInt(10)
    });
    mockPrisma.file.updateMany.mockResolvedValueOnce({ count: 0 });

    const out = await processVideoMetadata('vid-claim', { expectedVersion: 3 });
    expect(out.status).toBe('BUSY');
    expect(out.errorCode).toBe('STALE_VERSION');
  });

  test('stale version cannot overwrite newer results', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'vid3',
      mimeType: 'video/mp4',
      storageKey: 'k',
      storageProvider: 'google_cloud_storage',
      processingVersion: 5,
      processingStatus: 'READY',
      variantsManifest: null,
      size: BigInt(10)
    });
    const out = await processVideoMetadata('vid3', { expectedVersion: 2 });
    expect(out.status).toBe('BUSY');
    expect(out.errorCode).toBe('STALE_VERSION');
    expect(mockPrisma.file.updateMany).not.toHaveBeenCalled();
  });

  test('manifest merge preserves image variants and unknown keys', () => {
    const merged = mergeVideoIntoVariantsManifest(
      {
        variants: [{ id: 'a', kind: 'image_thumb' }],
        thumbnailUrl: '/api/files/x/variants/a/content',
        futureBlock: { keep: true },
        video: { metadata: { codec: 'old' }, extra: 1 }
      },
      {
        durationSeconds: 1,
        width: 10,
        height: 20,
        audioPresent: false,
        codec: 'h264'
      },
      'READY',
      {
        posterUrl: '/api/files/x/variants/p/content',
        thumbnailUrl: '/api/files/x/variants/t/content'
      }
    );
    expect((merged as any).variants).toHaveLength(1);
    expect((merged as any).futureBlock).toEqual({ keep: true });
    expect((merged as any).posterUrl).toContain('/variants/p/');
    expect((merged as any).thumbnailUrl).toContain('/variants/t/');
    expect((merged as any).video.metadata.codec).toBe('h264');
  });

  test('malformed existing manifest fails safely', () => {
    const merged = mergeVideoIntoVariantsManifest(
      null,
      { audioPresent: true, width: 1, height: 1, durationSeconds: 1 },
      'READY'
    );
    expect((merged as any).video.metadata.audioPresent).toBe(true);
  });

  test('metadata failure keeps original available (FAILED only)', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(async (args) => {
      if (args.includes('-version')) return { stdout: 'ffprobe', stderr: '' };
      const err: any = new Error('Invalid data found');
      err.stderr = 'Invalid data found when processing input';
      throw err;
    });

    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('bad')));
    mockPrisma.file.findUnique
      .mockResolvedValueOnce({
        id: 'vid2',
        mimeType: 'video/mp4',
        storageKey: 'media/vid2/orig.mp4',
        storageProvider: 'google_cloud_storage',
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: null,
        size: BigInt(10)
      })
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING'
      });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const out = await processVideoMetadata('vid2', { expectedVersion: 0 });
    expect(out.status).toBe('FAILED');
    expect(out.errorCode).toMatch(/VIDEO_/);
    expect(mockPosterGen).not.toHaveBeenCalled();
  });

  test('download/stream failure maps to VIDEO_STORAGE_FAILED', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);
    mockCreateStream.mockReturnValue(null);
    mockDownload.mockResolvedValue(null);

    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'vid4',
      mimeType: 'video/mp4',
      storageKey: 'missing',
      storageProvider: 'google_cloud_storage',
      processingVersion: 0,
      processingStatus: 'PENDING',
      variantsManifest: null,
      size: BigInt(10)
    });
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 1 });

    const out = await processVideoMetadata('vid4', { expectedVersion: 0 });
    expect(out.status).toBe('FAILED');
    expect(out.errorCode).toBe('VIDEO_STORAGE_FAILED');
  });

  test('enqueue failure does not throw (upload path safe)', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    mockPrisma.file.findUnique.mockRejectedValue(new Error('db down'));
    await expect(
      enqueueVideoProcessingSafe('file-x', { mimeType: 'video/mp4' })
    ).resolves.toBeUndefined();
  });

  test('enqueue no-ops when disabled — no probe', async () => {
    const runner = jest.fn(okRunner);
    setFfprobeRunnerForTests(runner);
    await enqueueVideoProcessingSafe('file-y', { mimeType: 'video/mp4' });
    expect(mockPrisma.file.findUnique).not.toHaveBeenCalled();
    expect(runner).not.toHaveBeenCalled();
  });

  test('non-video not enqueued for video metadata', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    await enqueueVideoProcessingSafe('img', { mimeType: 'image/png' });
    expect(mockPrisma.file.findUnique).not.toHaveBeenCalled();
  });

  test('duplicate enqueue deduped in queue', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    let runs = 0;
    registerVideoProcessingHandler(async () => {
      runs += 1;
      await new Promise((r) => setTimeout(r, 30));
    });
    const q = getMediaProcessingQueue();
    await q.enqueueVideoProcessing('same-file', 0);
    await q.enqueueVideoProcessing('same-file', 0);
    const stats = __getMediaProcessingQueueStatsForTests();
    expect(stats.pending + stats.inflight).toBeLessThanOrEqual(1);
    await new Promise((r) => setTimeout(r, 80));
    expect(runs).toBeLessThanOrEqual(1);
  });

  test('enqueueMediaProcessingSafe handles image and video independently', async () => {
    process.env.MEDIA_IMAGE_PROCESSING_ENABLED = 'false';
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'false';
    process.env.MEDIA_PROCESSING_MODE = 'disabled';
    await expect(
      enqueueMediaProcessingSafe('f', { mimeType: 'video/mp4' })
    ).resolves.toBeUndefined();
  });

  test('in-process lock returns BUSY for concurrent same fileId', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);

    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });

    mockPrisma.file.findUnique.mockImplementation(async () => {
      await gate;
      return {
        id: 'vid-busy',
        mimeType: 'video/mp4',
        storageKey: 'k',
        storageProvider: 'google_cloud_storage',
        processingVersion: 0,
        processingStatus: 'PENDING',
        variantsManifest: null,
        size: BigInt(4)
      };
    });
    mockPrisma.file.updateMany.mockResolvedValue({ count: 1 });
    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('data')));

    const p1 = processVideoMetadata('vid-busy', { expectedVersion: 0 });
    await new Promise((r) => setTimeout(r, 5));
    const second = await processVideoMetadata('vid-busy', { expectedVersion: 0 });
    expect(second.status).toBe('BUSY');
    release();
    await p1;
  });
});
