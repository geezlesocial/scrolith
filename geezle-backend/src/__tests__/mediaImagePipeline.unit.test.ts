/**
 * Phase 3A — image processing unit tests (Sharp mocked where needed for pipeline).
 */

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    file: {
      findUnique: jest.fn(),
      update: jest.fn(),
      create: jest.fn()
    },
    fileVariant: {
      findFirst: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn()
    },
    user: { count: jest.fn() },
    profile: { count: jest.fn() },
    communityBusinessPage: { count: jest.fn() },
    marketplaceListingMedia: { count: jest.fn() }
  }
}));

jest.mock('../services/storage/gcsMediaStorage', () => {
  const store = new Map<string, Buffer>();
  return {
    GOOGLE_CLOUD_STORAGE_PROVIDER: 'google_cloud_storage',
    gcsMediaExists: jest.fn(async (key: string) => store.has(key)),
    getGcsMediaMetadata: jest.fn(async (key: string) => {
      const buf = store.get(key);
      if (!buf) {
        const err: any = new Error('not found');
        err.code = 404;
        throw err;
      }
      return { size: buf.length, contentType: 'image/webp' };
    }),
    uploadToGcsMedia: jest.fn(async (params: { objectKey: string; buffer: Buffer }) => {
      store.set(params.objectKey, params.buffer);
      return { objectKey: params.objectKey, sizeBytes: params.buffer.length, contentType: 'image/webp', bucket: 'test' };
    }),
    createGcsMediaReadStream: jest.fn(),
    downloadGcsMediaBuffer: jest.fn(async (key: string) => {
      const buf = store.get(key);
      if (!buf) {
        const err: any = new Error('not found');
        err.code = 'NOT_FOUND';
        throw err;
      }
      return buf;
    }),
    __store: store
  };
});

jest.mock('../services/storage/mediaStorage.service', () => ({
  downloadMediaByProvider: jest.fn()
}));

import sharp from 'sharp';
import {
  isEligibleImageMime,
  inferImageCategory,
  planVariantWidths,
  planThumbWidths,
  inspectImageBuffer,
  generateImageVariants,
  buildVariantObjectKey,
  MAX_INPUT_PIXELS
} from '../services/media/mediaImageProcessor.service';
import { persistGeneratedVariant } from '../services/media/mediaVariant.service';
import {
  processImageFile,
  __clearProcessingLocksForTests,
  buildVariantsManifest
} from '../services/media/mediaProcessing.service';
import { enqueueImageProcessingSafe } from '../services/media/mediaProcessing.enqueue';
import {
  getMediaProcessingMode,
  __resetMediaProcessingQueueForTests
} from '../services/media/mediaProcessingQueue';
import prisma from '../utils/prismaClient';
import { downloadMediaByProvider } from '../services/storage/mediaStorage.service';

const mockPrisma = prisma as any;
const mockDownload = downloadMediaByProvider as jest.Mock;

const makeJpeg = async (w = 800, h = 600) =>
  sharp({
    create: {
      width: w,
      height: h,
      channels: 3,
      background: { r: 40, g: 120, b: 200 }
    }
  })
    .jpeg()
    .toBuffer();

const makePngAlpha = async () =>
  sharp({
    create: {
      width: 200,
      height: 100,
      channels: 4,
      background: { r: 255, g: 0, b: 0, alpha: 0.5 }
    }
  })
    .png()
    .toBuffer();

describe('mediaImageProcessor', () => {
  test('eligibility helpers', () => {
    expect(isEligibleImageMime('image/jpeg')).toBe(true);
    expect(isEligibleImageMime('image/png')).toBe(true);
    expect(isEligibleImageMime('image/webp')).toBe(true);
    expect(isEligibleImageMime('image/gif')).toBe(true);
    expect(isEligibleImageMime('video/mp4')).toBe(false);
    expect(isEligibleImageMime('application/pdf')).toBe(false);
  });

  test('category inference', () => {
    expect(inferImageCategory({ category: 'avatar' })).toBe('avatar');
    expect(inferImageCategory({ usageTypes: ['user_cover'] })).toBe('cover');
    expect(inferImageCategory({ usageTypes: ['marketplace_listing'] })).toBe('marketplace');
    expect(inferImageCategory({ category: 'general' })).toBe('default');
  });

  test('plan widths never upscale', () => {
    expect(planVariantWidths('post', 500)).toEqual([320]);
    expect(planVariantWidths('avatar', 100)).toEqual([64]);
    expect(planThumbWidths(100)).toEqual([]);
    expect(planThumbWidths(400)).toEqual([160, 320]);
  });

  test('buildVariantObjectKey deterministic', () => {
    expect(buildVariantObjectKey({ fileId: 'abc', kind: 'image_size', width: 640, format: 'webp' })).toBe(
      'media/abc/image/640w.webp'
    );
    expect(buildVariantObjectKey({ fileId: 'abc', kind: 'image_thumb', width: 160, format: 'webp' })).toBe(
      'media/abc/thumb/160w.webp'
    );
  });

  test('inspect + generate for JPEG', async () => {
    const buf = await makeJpeg(900, 600);
    const inspect = await inspectImageBuffer(buf);
    expect(inspect.width).toBe(900);
    expect(inspect.height).toBe(600);
    const { variants } = await generateImageVariants({ buffer: buf, category: 'default', enableAvif: false });
    expect(variants.length).toBeGreaterThan(0);
    expect(variants.every((v) => v.width <= 900)).toBe(true);
    expect(variants.some((v) => v.format === 'webp')).toBe(true);
  }, 30000);

  test('transparent PNG produces variants', async () => {
    const buf = await makePngAlpha();
    const { variants } = await generateImageVariants({ buffer: buf, category: 'chat', enableAvif: false });
    expect(variants.length).toBeGreaterThan(0);
  }, 30000);

  test('WebP input works', async () => {
    const buf = await sharp({
      create: { width: 400, height: 300, channels: 3, background: '#336699' }
    })
      .webp()
      .toBuffer();
    const inspect = await inspectImageBuffer(buf);
    expect(inspect.width).toBe(400);
    const { variants } = await generateImageVariants({ buffer: buf, category: 'default', enableAvif: false });
    expect(variants.length).toBeGreaterThan(0);
  }, 30000);

  test('GIF first-frame style variants (static)', async () => {
    // 1-frame GIF as minimal animated-compatible input
    const buf = await sharp({
      create: { width: 120, height: 80, channels: 3, background: '#112233' }
    })
      .gif()
      .toBuffer();
    const { variants } = await generateImageVariants({ buffer: buf, category: 'default', enableAvif: false });
    // may produce thumbs if widths fit
    expect(Array.isArray(variants)).toBe(true);
  }, 30000);

  test('corrupt image throws', async () => {
    await expect(inspectImageBuffer(Buffer.from('not-an-image'))).rejects.toMatchObject({
      code: expect.stringMatching(/CORRUPT|EMPTY|NO_/)
    });
  });

  test('empty buffer rejected', async () => {
    await expect(inspectImageBuffer(Buffer.alloc(0))).rejects.toMatchObject({ code: 'EMPTY_IMAGE' });
  });

  test('pixel limit constant is ~40MP', () => {
    expect(MAX_INPUT_PIXELS).toBe(40_000_000);
  });
});

describe('mediaVariant persist idempotency', () => {
  const gcs = require('../services/storage/gcsMediaStorage');

  beforeEach(() => {
    jest.clearAllMocks();
    gcs.__store.clear();
    mockPrisma.fileVariant.findFirst.mockResolvedValue(null);
    mockPrisma.fileVariant.create.mockImplementation(async ({ data }: any) => ({ id: 'var-1', ...data }));
    mockPrisma.fileVariant.update.mockImplementation(async ({ data, where }: any) => ({ id: where.id, ...data }));
  });

  test('creates GCS object and FileVariant', async () => {
    const buffer = Buffer.from('webp-bytes-here');
    const result = await persistGeneratedVariant({
      fileId: 'file-1',
      variant: {
        kind: 'image_size',
        label: 'default',
        width: 320,
        height: 200,
        format: 'webp',
        mimeType: 'image/webp',
        buffer,
        checksum: 'abc'
      }
    });
    expect(result.action).toBe('created');
    expect(result.storageKey).toBe('media/file-1/image/320w.webp');
    expect(gcs.__store.has('media/file-1/image/320w.webp')).toBe(true);
  });

  test('reuses existing same-size object', async () => {
    const buffer = Buffer.from('same-size-content!!');
    gcs.__store.set('media/file-1/image/320w.webp', buffer);
    mockPrisma.fileVariant.findFirst.mockResolvedValue({ id: 'existing-var' });
    const result = await persistGeneratedVariant({
      fileId: 'file-1',
      variant: {
        kind: 'image_size',
        label: 'default',
        width: 320,
        height: 200,
        format: 'webp',
        mimeType: 'image/webp',
        buffer,
        checksum: 'abc'
      }
    });
    expect(result.action).toBe('reused');
    expect(gcs.uploadToGcsMedia).not.toHaveBeenCalled();
  });

  test('refuses overwrite on size conflict', async () => {
    gcs.__store.set('media/file-1/image/320w.webp', Buffer.from('AAAA'));
    const result = await persistGeneratedVariant({
      fileId: 'file-1',
      variant: {
        kind: 'image_size',
        label: 'default',
        width: 320,
        height: 200,
        format: 'webp',
        mimeType: 'image/webp',
        buffer: Buffer.from('BBBBBBBB'),
        checksum: 'x'
      }
    });
    expect(result.action).toBe('conflict');
  });
});

describe('mediaProcessing orchestration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    __clearProcessingLocksForTests();
    __resetMediaProcessingQueueForTests();
    process.env.MEDIA_IMAGE_PROCESSING_ENABLED = 'false';
    process.env.MEDIA_PROCESSING_MODE = 'disabled';
    mockPrisma.file.findUnique.mockReset();
    mockPrisma.file.update.mockResolvedValue({});
    mockPrisma.fileVariant.findMany.mockResolvedValue([]);
    mockPrisma.fileVariant.findFirst.mockResolvedValue(null);
    mockPrisma.fileVariant.create.mockImplementation(async ({ data }: any) => ({ id: 'v1', ...data }));
  });

  test('queue mode defaults to disabled', () => {
    expect(getMediaProcessingMode()).toBe('disabled');
  });

  test('enqueue safe is no-op when disabled and never throws', async () => {
    mockPrisma.file.findUnique.mockResolvedValue({ processingVersion: 0, processingStatus: 'PENDING' });
    await expect(enqueueImageProcessingSafe('file-x', { mimeType: 'image/jpeg' })).resolves.toBeUndefined();
  });

  test('non-image skipped', async () => {
    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'f1',
      mimeType: 'video/mp4',
      storageKey: 'media/x',
      storageProvider: 'google_cloud_storage',
      width: null,
      height: null,
      processingVersion: 0,
      originalName: 'a.mp4'
    });
    const result = await processImageFile('f1');
    expect(result.status).toBe('SKIPPED');
    expect(mockPrisma.file.update).toHaveBeenCalled();
  });

  test('missing source fails without throwing', async () => {
    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'f2',
      mimeType: 'image/jpeg',
      storageKey: 'media/missing',
      storageProvider: 'google_cloud_storage',
      width: null,
      height: null,
      processingVersion: 0,
      originalName: 'a.jpg'
    });
    mockDownload.mockResolvedValue(null);
    const result = await processImageFile('f2');
    expect(result.status).toBe('FAILED');
    expect(result.errorCode).toBe('SOURCE_UNAVAILABLE');
  });

  test('successful processing marks READY with variants', async () => {
    const jpeg = await makeJpeg(640, 480);
    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'f3',
      mimeType: 'image/jpeg',
      storageKey: 'media/orig.jpg',
      storageProvider: 'google_cloud_storage',
      width: 640,
      height: 480,
      processingVersion: 0,
      originalName: 'orig.jpg'
    });
    mockDownload.mockResolvedValue(jpeg);
    mockPrisma.fileVariant.findMany.mockResolvedValue([
      {
        id: 'thumb1',
        kind: 'image_thumb',
        label: 'default',
        width: 320,
        height: 240,
        format: 'webp',
        mimeType: 'image/webp',
        sizeBytes: 100n,
        storageKey: 'media/f3/thumb/320w.webp'
      }
    ]);
    const result = await processImageFile('f3');
    expect(['READY', 'PARTIAL']).toContain(result.status);
    expect(result.variantsCreated + result.variantsReused).toBeGreaterThan(0);
  }, 60000);
});

describe('authorization helpers (manifest controller)', () => {
  test('buildVariantObjectKey never accepts path traversal in format', () => {
    const key = buildVariantObjectKey({
      fileId: 'safeid',
      kind: 'image_size',
      width: 100,
      format: '../evil'
    });
    expect(key).toBe('media/safeid/image/100w.evil');
    expect(key.includes('..')).toBe(false);
  });
});

describe('manifest client-safety', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPrisma.file.findUnique.mockResolvedValue({
      id: 'file-m',
      width: 800,
      height: 600,
      mimeType: 'image/jpeg',
      processingStatus: 'READY',
      thumbnailUrl: '/api/files/file-m/variants/v1/content',
      url: '/api/files/content/file-m'
    });
    mockPrisma.fileVariant.findMany.mockResolvedValue([
      {
        id: 'v1',
        kind: 'image_size',
        label: 'default',
        width: 640,
        height: 480,
        format: 'webp',
        mimeType: 'image/webp',
        sizeBytes: 1234n,
        storageKey: 'media/file-m/image/640w.webp'
      }
    ]);
  });

  test('manifest never exposes storageKey, checksum, bucket, or provider', async () => {
    const manifest = await buildVariantsManifest('file-m');
    const json = JSON.stringify(manifest);
    expect(json).not.toMatch(/storageKey|storage_key|checksum|scrolith-prod-media|google_cloud_storage|gs:\/\//i);
    expect(manifest?.variants?.[0]?.contentUrl).toContain('/api/files/');
    expect((manifest?.variants?.[0] as any)?.storageKey).toBeUndefined();
  });
});
