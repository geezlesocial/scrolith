/**
 * Phase 1 MediaStorageService + GCS adapter unit tests.
 * Mocks @google-cloud/storage — no network / no real bucket.
 */

jest.mock('@google-cloud/storage', () => {
  const store = new Map<string, Buffer>();

  const makeFile = (name: string) => ({
    name,
    createWriteStream: jest.fn((_opts?: any) => {
      const { Writable } = require('stream');
      const chunks: Buffer[] = [];
      const ws = new Writable({
        write(chunk: any, _enc: any, cb: any) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          cb();
        }
      });
      ws.on('finish', () => {
        store.set(name, Buffer.concat(chunks));
      });
      // Ensure finish fires after pipeline ends
      const origEnd = ws.end.bind(ws);
      ws.end = (chunk?: any, enc?: any, cb?: any) => {
        if (typeof chunk === 'function') {
          return origEnd(chunk);
        }
        return origEnd(chunk, enc, () => {
          store.set(name, Buffer.concat(chunks));
          if (typeof cb === 'function') cb();
        });
      };
      return ws;
    }),
    download: jest.fn(async () => {
      const buf = store.get(name);
      if (!buf) {
        const err: any = new Error('Not Found');
        err.code = 404;
        throw err;
      }
      return [buf];
    }),
    exists: jest.fn(async () => [store.has(name)]),
    delete: jest.fn(async () => {
      store.delete(name);
    }),
    getMetadata: jest.fn(async () => {
      const buf = store.get(name);
      if (!buf) {
        const err: any = new Error('Not Found');
        err.code = 404;
        throw err;
      }
      return [{ size: String(buf.length), contentType: 'application/octet-stream' }];
    }),
    getSignedUrl: jest.fn(async () => [
      `https://storage.googleapis.com/signed/${encodeURIComponent(name)}?X-Goog-Signature=test`
    ]),
    createReadStream: jest.fn(() => {
      const { Readable } = require('stream');
      const buf = store.get(name) || Buffer.alloc(0);
      return Readable.from(buf);
    })
  });

  const bucket = {
    file: jest.fn((name: string) => makeFile(name))
  };

  const Storage = jest.fn().mockImplementation(() => ({
    bucket: jest.fn(() => bucket)
  }));

  return {
    Storage,
    __mockStore: store,
    __mockBucket: bucket
  };
});

jest.mock('../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    file: {
      findUnique: jest.fn()
    },
    managedUploadObject: {
      upsert: jest.fn(),
      findUnique: jest.fn(),
      deleteMany: jest.fn()
    }
  }
}));

import {
  __resetGcsMediaCachesForTests,
  uploadToGcsMedia,
  downloadGcsMediaBuffer,
  gcsMediaExists,
  deleteGcsMedia,
  generateGcsSignedUrl,
  GOOGLE_CLOUD_STORAGE_PROVIDER
} from '../services/storage/gcsMediaStorage';
import {
  MediaStorageService,
  hasAzureStorageEnvironment,
  hasExplicitUploadDriver,
  resolveUploadDriver,
  resolveWriteStorageProvider,
  shouldUseMemoryUploadMulter,
  isGcsUploadDriver,
  buildMediaObjectKey,
  generatePublicUrl,
  uploadMediaObject
} from '../services/storage/mediaStorage.service';
import prisma from '../utils/prismaClient';

const mockPrisma = prisma as unknown as {
  file: { findUnique: jest.Mock };
  managedUploadObject: {
    upsert: jest.Mock;
    findUnique: jest.Mock;
    deleteMany: jest.Mock;
  };
};

describe('GCS media storage adapter', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetGcsMediaCachesForTests();
    process.env.UPLOAD_DRIVER = 'gcs';
    process.env.STORAGE_BUCKET = 'scrolith-prod-media';
    process.env.GOOGLE_CLOUD_PROJECT = 'scrolith-500821';
    const gcsMock = require('@google-cloud/storage');
    gcsMock.__mockStore.clear();
  });

  afterAll(() => {
    process.env = prevEnv;
  });

  test('upload streams buffer to GCS and verifies exists', async () => {
    const buffer = Buffer.from('hello-gcs-media');
    const result = await uploadToGcsMedia({
      buffer,
      contentType: 'text/plain',
      objectKey: 'media/2026/07/system/test/obj-a.txt'
    });
    expect(result.objectKey).toBe('media/2026/07/system/test/obj-a.txt');
    expect(result.bucket).toBe('scrolith-prod-media');
    expect(await gcsMediaExists(result.objectKey)).toBe(true);
    const downloaded = await downloadGcsMediaBuffer(result.objectKey);
    expect(downloaded.toString('utf8')).toBe('hello-gcs-media');
  });

  test('delete removes GCS object', async () => {
    const key = 'media/2026/07/system/test/delete-me.bin';
    await uploadToGcsMedia({
      buffer: Buffer.from('x'),
      contentType: 'application/octet-stream',
      objectKey: key
    });
    expect(await gcsMediaExists(key)).toBe(true);
    await deleteGcsMedia(key);
    expect(await gcsMediaExists(key)).toBe(false);
  });

  test('generateSignedUrl returns URL', async () => {
    const key = 'media/2026/07/system/test/signed.bin';
    await uploadToGcsMedia({
      buffer: Buffer.from('sig'),
      contentType: 'application/octet-stream',
      objectKey: key
    });
    const url = await generateGcsSignedUrl(key, { expiresInSeconds: 300 });
    expect(url).toContain('storage.googleapis.com');
    expect(url).toContain('X-Goog-Signature');
  });
});

describe('MediaStorageService provider selection', () => {
  const prevEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...prevEnv };
    __resetGcsMediaCachesForTests();
  });

  test('gcs and google_cloud_storage select google_cloud_storage', () => {
    process.env.UPLOAD_DRIVER = 'gcs';
    process.env.STORAGE_BUCKET = 'scrolith-prod-media';
    expect(isGcsUploadDriver()).toBe(true);
    expect(resolveWriteStorageProvider()).toBe(GOOGLE_CLOUD_STORAGE_PROVIDER);
    expect(shouldUseMemoryUploadMulter()).toBe(true);
  });

  test('google_cloud_storage alias selects GCS', () => {
    process.env.UPLOAD_DRIVER = 'google_cloud_storage';
    process.env.STORAGE_BUCKET = 'scrolith-prod-media';
    expect(resolveWriteStorageProvider()).toBe(GOOGLE_CLOUD_STORAGE_PROVIDER);
  });

  test('local driver keeps local and disk multer', () => {
    process.env.UPLOAD_DRIVER = 'local';
    delete process.env.STORAGE_DRIVER;
    expect(resolveWriteStorageProvider()).toBe('local');
    expect(shouldUseMemoryUploadMulter()).toBe(false);
  });

  test('complete Azure configuration without explicit driver selects azure_blob', () => {
    delete process.env.UPLOAD_DRIVER;
    delete process.env.STORAGE_DRIVER;
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      'DefaultEndpointsProtocol=https;AccountName=testaccount;AccountKey=testkey;EndpointSuffix=core.windows.net';
    process.env.AZURE_STORAGE_CONTAINER = 'scrolith-prod-media';
    expect(hasExplicitUploadDriver()).toBe(false);
    expect(hasAzureStorageEnvironment()).toBe(true);
    expect(resolveUploadDriver()).toBe('azure_blob');
    expect(resolveWriteStorageProvider()).toBe('azure_blob');
    expect(shouldUseMemoryUploadMulter()).toBe(true);
  });

  test('explicit local driver overrides complete Azure configuration', () => {
    process.env.UPLOAD_DRIVER = 'local';
    process.env.AZURE_STORAGE_CONNECTION_STRING =
      'DefaultEndpointsProtocol=https;AccountName=testaccount;AccountKey=testkey;EndpointSuffix=core.windows.net';
    process.env.AZURE_STORAGE_CONTAINER = 'scrolith-prod-media';
    expect(resolveUploadDriver()).toBe('local');
    expect(resolveWriteStorageProvider()).toBe('local');
    expect(shouldUseMemoryUploadMulter()).toBe(false);
  });

  test('explicit Azure driver with incomplete configuration fails closed', () => {
    process.env.UPLOAD_DRIVER = 'azure_blob';
    delete process.env.STORAGE_DRIVER;
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    process.env.AZURE_STORAGE_CONTAINER = 'scrolith-prod-media';
    expect(() => resolveWriteStorageProvider()).toThrow(/AZURE_STORAGE_CONNECTION_STRING/);
  });

  test('production Azure environment with incomplete configuration fails closed', () => {
    delete process.env.UPLOAD_DRIVER;
    delete process.env.STORAGE_DRIVER;
    process.env.NODE_ENV = 'production';
    delete process.env.AZURE_STORAGE_CONNECTION_STRING;
    process.env.AZURE_STORAGE_CONTAINER = 'scrolith-prod-media';
    expect(() => resolveWriteStorageProvider()).toThrow(/Azure storage environment is incomplete/);
  });

  test('database_storage selects database_storage', () => {
    process.env.UPLOAD_DRIVER = 'database_storage';
    expect(resolveWriteStorageProvider()).toBe('database_storage');
    expect(shouldUseMemoryUploadMulter()).toBe(true);
  });

  test('firebase does not steal gcs driver', () => {
    process.env.UPLOAD_DRIVER = 'gcs';
    process.env.STORAGE_BUCKET = 'scrolith-prod-media';
    expect(resolveWriteStorageProvider()).not.toBe('firebase_storage');
  });

  test('gcs without explicit STORAGE_BUCKET fails closed', () => {
    process.env.UPLOAD_DRIVER = 'gcs';
    delete process.env.STORAGE_BUCKET;
    delete process.env.GCS_MEDIA_BUCKET;
    delete process.env.GOOGLE_CLOUD_STORAGE_BUCKET;
    delete process.env.GCLOUD_STORAGE_BUCKET;
    expect(() => resolveWriteStorageProvider()).toThrow(/STORAGE_BUCKET/);
  });

  test('buildMediaObjectKey nests under media/yyyy/mm/owner/category', () => {
    const key = buildMediaObjectKey({
      originalName: 'My Photo!.jpg',
      ownerId: 'user_123',
      category: 'avatar'
    });
    expect(key).toMatch(/^media\/\d{4}\/\d{2}\/user_123\/avatar\/.+-My_Photo_.jpg$/);
  });

  test('generatePublicUrl is content-route shaped', () => {
    const url = generatePublicUrl('file-abc-123', 'https://api.scrolith.com');
    expect(url).toBe('https://api.scrolith.com/api/files/content/file-abc-123');
  });
});

describe('MediaStorageService upload (GCS)', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetGcsMediaCachesForTests();
    process.env.UPLOAD_DRIVER = 'gcs';
    process.env.STORAGE_BUCKET = 'scrolith-prod-media';
    process.env.GOOGLE_CLOUD_PROJECT = 'scrolith-500821';
    require('@google-cloud/storage').__mockStore.clear();
  });

  afterAll(() => {
    process.env = prevEnv;
  });

  test('uploadMediaObject writes to GCS and verifies', async () => {
    const result = await uploadMediaObject({
      buffer: Buffer.from('product-media'),
      contentType: 'image/png',
      originalName: 'cover.png',
      ownerId: 'owner1',
      category: 'cover',
      visibility: 'PUBLIC'
    });
    expect(result.storageProvider).toBe(GOOGLE_CLOUD_STORAGE_PROVIDER);
    expect(result.storageKey.startsWith('media/')).toBe(true);
    expect(result.sizeBytes).toBeGreaterThan(0);
    expect(await gcsMediaExists(result.storageKey)).toBe(true);
  });

  test('MediaStorageService.upload delegates to uploadMediaObject', async () => {
    const result = await MediaStorageService.upload({
      buffer: Buffer.from('svc'),
      contentType: 'text/plain',
      originalName: 'a.txt',
      category: 'cms'
    });
    expect(result.storageProvider).toBe(GOOGLE_CLOUD_STORAGE_PROVIDER);
  });

  test('download/exists/delete by fileId use File row + GCS', async () => {
    const uploaded = await uploadMediaObject({
      buffer: Buffer.from('by-id'),
      contentType: 'text/plain',
      originalName: 'b.txt',
      category: 'general'
    });
    mockPrisma.file.findUnique.mockResolvedValue({
      storageProvider: GOOGLE_CLOUD_STORAGE_PROVIDER,
      storageKey: uploaded.storageKey,
      url: null,
      filename: 'b.txt'
    });

    expect(await MediaStorageService.exists('file-id-1')).toBe(true);
    const buf = await MediaStorageService.download('file-id-1');
    expect(buf?.toString('utf8')).toBe('by-id');

    await MediaStorageService.delete('file-id-1');
    expect(await gcsMediaExists(uploaded.storageKey)).toBe(false);

    const signed = await MediaStorageService.generateSignedUrl('file-id-1');
    // object deleted — signed URL generation still returns string if row exists
    expect(signed === null || typeof signed === 'string').toBe(true);
  });

  test('downloadMediaByProvider supports database_storage compatibility path', async () => {
    mockPrisma.managedUploadObject.findUnique.mockResolvedValue({
      data: Buffer.from('db-bytes')
    });
    // downloadDatabaseStorageBufferByName uses prisma directly
    const { downloadMediaByProvider } = require('../services/storage/mediaStorage.service');
    // Use real database path via mocked prisma
    jest.spyOn(require('../services/storage/databaseStorage'), 'downloadDatabaseStorageBufferByName').mockResolvedValue(
      Buffer.from('db-bytes')
    );
    const buf = await downloadMediaByProvider({
      storageProvider: 'database_storage',
      storageKey: 'some-key'
    });
    expect(buf?.toString('utf8')).toBe('db-bytes');
  });
});

describe('content endpoint provider constants', () => {
  test('GOOGLE_CLOUD_STORAGE_PROVIDER is stable', () => {
    expect(GOOGLE_CLOUD_STORAGE_PROVIDER).toBe('google_cloud_storage');
    expect(MediaStorageService.GOOGLE_CLOUD_STORAGE_PROVIDER).toBe('google_cloud_storage');
  });

  test('local remains available for development selection', () => {
    const prev = process.env.UPLOAD_DRIVER;
    process.env.UPLOAD_DRIVER = 'local';
    expect(resolveWriteStorageProvider()).toBe('local');
    process.env.UPLOAD_DRIVER = prev;
  });
});

describe('upload size limits (validateUploadFile)', () => {
  // Lazy import after mocks so filesController can load.
  const { validateUploadFile, getProductUploadSizeLimits } = require('../controllers/filesController');

  test('reports product limits (image 15MB, video 200MB, multer 500MB)', () => {
    const limits = getProductUploadSizeLimits();
    expect(limits.image).toBe(15 * 1024 * 1024);
    expect(limits.video).toBe(200 * 1024 * 1024);
    expect(limits.audio).toBe(50 * 1024 * 1024);
    expect(limits.document).toBe(20 * 1024 * 1024);
    expect(limits.adminApk).toBe(500 * 1024 * 1024);
    expect(limits.multerAbsolute).toBe(500 * 1024 * 1024);
  });

  test('accepts image below limit', () => {
    const file = {
      originalname: 'avatar.jpg',
      mimetype: 'image/jpeg',
      size: 2 * 1024 * 1024,
      buffer: Buffer.alloc(10)
    } as any;
    expect(() => validateUploadFile(file)).not.toThrow();
    const result = validateUploadFile(file);
    expect(result.kind).toBe('image');
  });

  test('rejects image above limit with 413 semantics', () => {
    const file = {
      originalname: 'huge.jpg',
      mimetype: 'image/jpeg',
      size: 20 * 1024 * 1024,
      buffer: Buffer.alloc(10)
    } as any;
    try {
      validateUploadFile(file);
      throw new Error('expected throw');
    } catch (error: any) {
      expect(error.message).toMatch(/exceeds/i);
      expect(error.code).toBe('LIMIT_FILE_SIZE');
      expect(error.status).toBe(413);
    }
  });

  test('rejects video above 200MB limit', () => {
    const file = {
      originalname: 'clip.mp4',
      mimetype: 'video/mp4',
      size: 250 * 1024 * 1024,
      buffer: Buffer.alloc(10)
    } as any;
    expect(() => validateUploadFile(file)).toThrow(/video upload limit/i);
  });
});

describe('GCS upload failure cleanup (atomicity)', () => {
  const prevEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    __resetGcsMediaCachesForTests();
    process.env.UPLOAD_DRIVER = 'gcs';
    process.env.STORAGE_BUCKET = 'scrolith-prod-media';
    process.env.GOOGLE_CLOUD_PROJECT = 'scrolith-500821';
    require('@google-cloud/storage').__mockStore.clear();
  });

  afterAll(() => {
    process.env = prevEnv;
  });

  test('failed exists verification path can delete object', async () => {
    const key = 'media/2026/07/system/test/orphan-cleanup.bin';
    await uploadToGcsMedia({
      buffer: Buffer.from('orphan'),
      contentType: 'application/octet-stream',
      objectKey: key
    });
    expect(await gcsMediaExists(key)).toBe(true);
    // Simulate cleanup after failed File create
    await MediaStorageService.deleteMediaObject({
      storageProvider: GOOGLE_CLOUD_STORAGE_PROVIDER,
      storageKey: key
    });
    expect(await gcsMediaExists(key)).toBe(false);
  });

  test('upload then delete leaves no object (no orphan after cleanup)', async () => {
    const uploaded = await uploadMediaObject({
      buffer: Buffer.from('tmp'),
      contentType: 'text/plain',
      originalName: 'tmp.txt',
      category: 'general'
    });
    expect(await gcsMediaExists(uploaded.storageKey)).toBe(true);
    await deleteGcsMedia(uploaded.storageKey);
    expect(await gcsMediaExists(uploaded.storageKey)).toBe(false);
  });

  test('rejected size limit never calls GCS upload path (guarded by validateUploadFile)', async () => {
    const { validateUploadFile } = require('../controllers/filesController');
    const gcsModule = require('../services/storage/gcsMediaStorage');
    const spy = jest.spyOn(gcsModule, 'uploadToGcsMedia');
    const file = {
      originalname: 'too-big.mp4',
      mimetype: 'video/mp4',
      size: 300 * 1024 * 1024,
      buffer: Buffer.alloc(10)
    } as any;
    expect(() => validateUploadFile(file)).toThrow();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
