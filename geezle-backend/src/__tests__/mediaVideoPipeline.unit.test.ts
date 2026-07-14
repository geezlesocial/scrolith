/**
 * Phase 3B.2 — video metadata pipeline, enqueue, locking, stream-to-temp, manifest merge.
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
    expect(mockCreateStream).not.toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
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

  test('GCS stream-to-temp without full buffering — downloadBuffer not used when stream exists', async () => {
    process.env.MEDIA_VIDEO_PROCESSING_ENABLED = 'true';
    process.env.MEDIA_PROCESSING_MODE = 'inline_async';
    setFfprobeRunnerForTests(okRunner);

    mockCreateStream.mockReturnValue(Readable.from(Buffer.from('streamed-video-bytes-not-full-buffer-path')));
    mockDownload.mockImplementation(async () => {
      throw new Error('downloadBuffer should not be called when stream is available');
    });

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
          processingStatus: 'READY',
          variants: [{ id: 'var1', kind: 'image_thumb', width: 200 }],
          thumbnailUrl: '/api/files/vid1/variants/var1/content',
          customFutureKey: { nested: true }
        },
        size: BigInt(32)
      })
      // mid-check after download
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING'
      })
      // latest before write
      .mockResolvedValueOnce({
        processingVersion: 0,
        processingStatus: 'PROCESSING',
        variantsManifest: {
          processingStatus: 'READY',
          variants: [{ id: 'var1', kind: 'image_thumb', width: 200 }],
          thumbnailUrl: '/api/files/vid1/variants/var1/content',
          customFutureKey: { nested: true }
        },
        width: null,
        height: null,
        duration: null
      });

    // claim
    mockPrisma.file.updateMany
      .mockResolvedValueOnce({ count: 1 })
      // final write
      .mockResolvedValueOnce({ count: 1 });

    const out = await processVideoMetadata('vid1', { expectedVersion: 0 });
    expect(out.status).toBe('READY');
    expect(mockCreateStream).toHaveBeenCalled();
    expect(mockDownload).not.toHaveBeenCalled();
    expect(out.metadata?.width).toBe(1280);

    const finalWrite = mockPrisma.file.updateMany.mock.calls[1][0];
    expect(finalWrite.where.processingVersion).toBe(0);
    expect(finalWrite.where.processingStatus).toBe('PROCESSING');
    expect(finalWrite.data.variantsManifest.variants).toEqual([
      { id: 'var1', kind: 'image_thumb', width: 200 }
    ]);
    expect(finalWrite.data.variantsManifest.customFutureKey).toEqual({ nested: true });
    expect(finalWrite.data.variantsManifest.thumbnailUrl).toContain('/api/files/');
    expect(finalWrite.data.variantsManifest.video.metadata.codec).toBe('h264');
    expect(JSON.stringify(finalWrite.data.variantsManifest)).not.toMatch(/storageKey|bucket|tmp|ffprobe/i);
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
      .mockResolvedValueOnce({ count: 1 }) // claim
      .mockResolvedValueOnce({ count: 1 }); // fail update

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
    // Allow Windows handle release after destroy/close.
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
    // claim loses race
    mockPrisma.file.updateMany.mockResolvedValueOnce({ count: 0 });

    const out = await processVideoMetadata('vid-claim', { expectedVersion: 3 });
    expect(out.status).toBe('BUSY');
    expect(out.errorCode).toBe('STALE_VERSION');
    expect(mockCreateStream).not.toHaveBeenCalled();
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
      'READY'
    );
    expect((merged as any).variants).toHaveLength(1);
    expect((merged as any).futureBlock).toEqual({ keep: true });
    expect((merged as any).thumbnailUrl).toContain('/api/files/');
    expect((merged as any).video.metadata.codec).toBe('h264');
    expect((merged as any).video.extra).toBe(1);
  });

  test('malformed existing manifest fails safely', () => {
    const merged = mergeVideoIntoVariantsManifest(
      null,
      { audioPresent: true, width: 1, height: 1, durationSeconds: 1 },
      'READY'
    );
    expect((merged as any).video.metadata.audioPresent).toBe(true);
    const merged2 = mergeVideoIntoVariantsManifest(
      ['not', 'an', 'object'] as any,
      { audioPresent: false, width: 2, height: 2 },
      'PARTIAL'
    );
    expect((merged2 as any).video.metadata.width).toBeUndefined(); // only client-safe fields from toClientSafe
    expect((merged2 as any).processingStatus).toBe('PARTIAL');
  });

  test('failed metadata keeps original available (status FAILED only)', async () => {
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
