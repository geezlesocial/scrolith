/**
 * MediaStorageService — durable product media façade.
 *
 * New production uploads (UPLOAD_DRIVER=gcs | google_cloud_storage) write to
 * gs://scrolith-prod-media via native @google-cloud/storage.
 *
 * Legacy providers remain readable/writable as configured.
 * Public product URLs stay /api/files/content/{fileId}.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  GOOGLE_CLOUD_STORAGE_PROVIDER,
  deleteGcsMedia,
  downloadGcsMediaBuffer,
  generateGcsSignedUrl,
  getGcsMediaMetadata,
  gcsMediaExists,
  isGcsMediaConfigured,
  uploadToGcsMedia,
  createGcsMediaReadStream
} from './gcsMediaStorage';
import {
  databaseStorageExistsByName,
  deleteDatabaseStorageByName,
  downloadDatabaseStorageBufferByName,
  uploadBufferToDatabaseStorage
} from './databaseStorage';
import {
  deleteFirebaseStorageByName,
  downloadFirebaseStorageBufferByName,
  firebaseStorageExistsByName,
  isFirebaseStorageConfigured,
  uploadBufferToFirebaseStorage
} from './firebaseStorage';
import {
  deleteBlobByName,
  downloadBlobByName,
  isAzureBlobConfigured,
  uploadBufferToBlob
} from './blobStorage';
import prisma from '../../utils/prismaClient';
import { resolveFileBaseUrl } from '../../utils/mediaUrl';

export type MediaStorageProvider =
  | 'google_cloud_storage'
  | 'database_storage'
  | 'firebase_storage'
  | 'azure_blob'
  | 'local';

export type MediaStorageUploadInput = {
  buffer?: Buffer;
  filePath?: string;
  stream?: NodeJS.ReadableStream;
  contentType: string;
  originalName?: string;
  ownerId?: string | null;
  category?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
  /** Optional size hint for streaming uploads */
  sizeBytes?: number;
};

export type MediaStorageObject = {
  storageProvider: MediaStorageProvider;
  storageKey: string;
  sizeBytes: number;
  contentType: string;
  bucket?: string | null;
};

const DEFAULT_PROVIDER: MediaStorageProvider = 'local';
const DATABASE_PROVIDER: MediaStorageProvider = 'database_storage';
const FIREBASE_PROVIDER: MediaStorageProvider = 'firebase_storage';
const AZURE_PROVIDER: MediaStorageProvider = 'azure_blob';
const GCS_PROVIDER: MediaStorageProvider = GOOGLE_CLOUD_STORAGE_PROVIDER as MediaStorageProvider;

const safeFilename = (name: string) => String(name || 'upload.bin').replace(/[^a-z0-9._-]+/gi, '_');

const resolveUploadDriver = () =>
  String(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || DEFAULT_PROVIDER)
    .trim()
    .toLowerCase();

export const isGcsUploadDriver = (driver = resolveUploadDriver()) =>
  ['gcs', 'google_cloud_storage'].includes(driver);

export const isDatabaseUploadDriver = (driver = resolveUploadDriver()) =>
  ['database_storage', 'database', 'db', 'postgres', 'postgresql'].includes(driver);

export const isFirebaseUploadDriver = (driver = resolveUploadDriver()) =>
  ['firebase_storage', 'firebase'].includes(driver);

export const isAzureUploadDriver = (driver = resolveUploadDriver()) =>
  ['azure_blob', 'azure', 'blob'].includes(driver);

/**
 * Provider selection for NEW uploads.
 * gcs / google_cloud_storage → native GCS (not Firebase).
 */
export const resolveWriteStorageProvider = (): MediaStorageProvider => {
  const driver = resolveUploadDriver();
  if (isDatabaseUploadDriver(driver)) return DATABASE_PROVIDER;
  if (isGcsUploadDriver(driver) && isGcsMediaConfigured()) return GCS_PROVIDER;
  if (isFirebaseUploadDriver(driver) && isFirebaseStorageConfigured()) return FIREBASE_PROVIDER;
  if (isAzureUploadDriver(driver) && isAzureBlobConfigured()) return AZURE_PROVIDER;
  // If gcs requested but misconfigured, fail closed (never silent local).
  if (isGcsUploadDriver(driver) && !isGcsMediaConfigured()) {
    throw new Error(
      'UPLOAD_DRIVER=gcs requires explicit STORAGE_BUCKET=scrolith-prod-media (or GCS_MEDIA_BUCKET). Refusing silent local fallback.'
    );
  }
  return DEFAULT_PROVIDER;
};

/** Whether multer should use memory storage (no writes under product uploads/). */
export const shouldUseMemoryUploadMulter = () => {
  const driver = resolveUploadDriver();
  return (
    isGcsUploadDriver(driver) ||
    isDatabaseUploadDriver(driver) ||
    isFirebaseUploadDriver(driver) ||
    isAzureUploadDriver(driver)
  );
};

export const buildMediaObjectKey = (params: {
  originalName?: string;
  ownerId?: string | null;
  category?: string;
}) => {
  const now = new Date();
  const yyyy = String(now.getUTCFullYear());
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const owner =
    String(params.ownerId || '')
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, '')
      .slice(0, 64) || 'system';
  const category =
    String(params.category || 'general')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '')
      .slice(0, 40) || 'general';
  const unique =
    typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
  const safe = safeFilename(path.basename(params.originalName || 'upload.bin'));
  return `media/${yyyy}/${mm}/${owner}/${category}/${unique}-${safe}`;
};

export const generatePublicContentUrl = (fileId: string, baseUrl?: string | null) => {
  const id = String(fileId || '').trim();
  if (!id) return '';
  const base = String(baseUrl || resolveFileBaseUrl() || '')
    .trim()
    .replace(/\/+$/, '');
  const pathPart = `/api/files/content/${encodeURIComponent(id)}`;
  return base ? `${base}${pathPart}` : pathPart;
};

const streamToBuffer = async (stream: NodeJS.ReadableStream): Promise<Buffer> => {
  const chunks: Buffer[] = [];
  for await (const chunk of stream as AsyncIterable<Buffer | string>) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
};

/**
 * Upload media bytes to the configured write provider.
 * For GCS: streams to bucket and verifies existence before returning.
 */
export const uploadMediaObject = async (input: MediaStorageUploadInput): Promise<MediaStorageObject> => {
  const provider = resolveWriteStorageProvider();
  const contentType = input.contentType || 'application/octet-stream';
  const objectKey = buildMediaObjectKey({
    originalName: input.originalName,
    ownerId: input.ownerId,
    category: input.category
  });

  if (provider === GCS_PROVIDER) {
    const result = await uploadToGcsMedia({
      buffer: input.buffer,
      filePath: input.filePath,
      stream: input.stream,
      contentType,
      objectKey,
      cacheControl:
        String(input.visibility || 'PUBLIC').toUpperCase() === 'PRIVATE'
          ? 'private, max-age=0'
          : 'public, max-age=31536000, immutable'
    });
    const verified = await gcsMediaExists(result.objectKey);
    if (!verified) {
      throw new Error(`GCS upload verification failed for ${result.objectKey}`);
    }
    return {
      storageProvider: GCS_PROVIDER,
      storageKey: result.objectKey,
      sizeBytes: result.sizeBytes || input.sizeBytes || input.buffer?.length || 0,
      contentType: result.contentType || contentType,
      bucket: result.bucket
    };
  }

  if (provider === DATABASE_PROVIDER) {
    let buffer = input.buffer;
    if (!buffer && input.filePath && fs.existsSync(input.filePath)) {
      buffer = fs.readFileSync(input.filePath);
    }
    if (!buffer && input.stream) {
      buffer = await streamToBuffer(input.stream);
    }
    if (!buffer) throw new Error('Database storage upload requires a buffer');
    const key = objectKey.replace(/^media\//, '').replace(/\//g, '_');
    await uploadBufferToDatabaseStorage({
      buffer,
      contentType,
      fileName: key
    });
    const ok = await databaseStorageExistsByName(key);
    if (!ok) throw new Error(`Database storage verification failed for ${key}`);
    return {
      storageProvider: DATABASE_PROVIDER,
      storageKey: key,
      sizeBytes: buffer.length,
      contentType
    };
  }

  if (provider === FIREBASE_PROVIDER) {
    let buffer = input.buffer;
    if (!buffer && input.filePath && fs.existsSync(input.filePath)) {
      buffer = fs.readFileSync(input.filePath);
    }
    if (!buffer && input.stream) {
      buffer = await streamToBuffer(input.stream);
    }
    if (!buffer) throw new Error('Firebase storage upload requires a buffer');
    await uploadBufferToFirebaseStorage({
      buffer,
      contentType,
      fileName: objectKey
    });
    const ok = await firebaseStorageExistsByName(objectKey);
    if (!ok) throw new Error(`Firebase storage verification failed for ${objectKey}`);
    return {
      storageProvider: FIREBASE_PROVIDER,
      storageKey: objectKey,
      sizeBytes: buffer.length,
      contentType
    };
  }

  if (provider === AZURE_PROVIDER) {
    let buffer = input.buffer;
    if (!buffer && input.filePath && fs.existsSync(input.filePath)) {
      buffer = fs.readFileSync(input.filePath);
    }
    if (!buffer && input.stream) {
      buffer = await streamToBuffer(input.stream);
    }
    if (!buffer) throw new Error('Azure blob upload requires a buffer');
    await uploadBufferToBlob({
      buffer,
      contentType,
      fileName: objectKey
    });
    return {
      storageProvider: AZURE_PROVIDER,
      storageKey: objectKey,
      sizeBytes: buffer.length,
      contentType
    };
  }

  // local — caller (persistUploadedFile) owns disk write under uploads/
  throw new Error('local provider is handled by filesController disk path');
};

export const downloadMediaByProvider = async (params: {
  storageProvider?: string | null;
  storageKey?: string | null;
}): Promise<Buffer | null> => {
  const provider = String(params.storageProvider || DEFAULT_PROVIDER).toLowerCase();
  const key = String(params.storageKey || '').trim();
  if (!key) return null;

  if (provider === GCS_PROVIDER || provider === 'gcs') {
    try {
      return await downloadGcsMediaBuffer(key);
    } catch (error: any) {
      if (String(error?.code || '') === 'NOT_FOUND') return null;
      throw error;
    }
  }
  if (provider === DATABASE_PROVIDER) {
    try {
      return await downloadDatabaseStorageBufferByName(key);
    } catch {
      return null;
    }
  }
  if (provider === FIREBASE_PROVIDER) {
    try {
      return await downloadFirebaseStorageBufferByName(key);
    } catch {
      return null;
    }
  }
  if (provider === AZURE_PROVIDER) {
    try {
      const blobResponse = await downloadBlobByName(key);
      const stream = blobResponse.readableStreamBody;
      if (!stream) return null;
      return streamToBuffer(stream);
    } catch {
      return null;
    }
  }
  return null;
};

export const mediaObjectExists = async (params: {
  storageProvider?: string | null;
  storageKey?: string | null;
}) => {
  const provider = String(params.storageProvider || DEFAULT_PROVIDER).toLowerCase();
  const key = String(params.storageKey || '').trim();
  if (!key) return false;
  if (provider === GCS_PROVIDER || provider === 'gcs') return gcsMediaExists(key);
  if (provider === DATABASE_PROVIDER) return databaseStorageExistsByName(key);
  if (provider === FIREBASE_PROVIDER) return firebaseStorageExistsByName(key);
  if (provider === AZURE_PROVIDER) {
    try {
      await downloadBlobByName(key);
      return true;
    } catch {
      return false;
    }
  }
  return false;
};

export const deleteMediaObject = async (params: {
  storageProvider?: string | null;
  storageKey?: string | null;
}) => {
  const provider = String(params.storageProvider || DEFAULT_PROVIDER).toLowerCase();
  const key = String(params.storageKey || '').trim();
  if (!key) return;
  if (provider === GCS_PROVIDER || provider === 'gcs') {
    await deleteGcsMedia(key);
    return;
  }
  if (provider === DATABASE_PROVIDER) {
    await deleteDatabaseStorageByName(key);
    return;
  }
  if (provider === FIREBASE_PROVIDER) {
    await deleteFirebaseStorageByName(key);
    return;
  }
  if (provider === AZURE_PROVIDER) {
    await deleteBlobByName(key);
  }
};

/**
 * Resolve File row by fileId and download bytes.
 */
export const downloadByFileId = async (fileId: string): Promise<Buffer | null> => {
  const id = String(fileId || '').trim();
  if (!id) return null;
  const row = await prisma.file.findUnique({
    where: { id },
    select: { storageProvider: true, storageKey: true, url: true, filename: true }
  });
  if (!row) return null;
  return downloadMediaByProvider({
    storageProvider: row.storageProvider,
    storageKey: row.storageKey
  });
};

export const existsByFileId = async (fileId: string): Promise<boolean> => {
  const id = String(fileId || '').trim();
  if (!id) return false;
  const row = await prisma.file.findUnique({
    where: { id },
    select: { storageProvider: true, storageKey: true }
  });
  if (!row) return false;
  return mediaObjectExists({
    storageProvider: row.storageProvider,
    storageKey: row.storageKey
  });
};

export const deleteByFileId = async (fileId: string): Promise<void> => {
  const id = String(fileId || '').trim();
  if (!id) return;
  const row = await prisma.file.findUnique({
    where: { id },
    select: { storageProvider: true, storageKey: true }
  });
  if (!row) return;
  await deleteMediaObject({
    storageProvider: row.storageProvider,
    storageKey: row.storageKey
  });
};

export const generatePublicUrl = (fileId: string, baseUrl?: string | null) =>
  generatePublicContentUrl(fileId, baseUrl);

export const generateSignedUrl = async (
  fileId: string,
  opts?: { expiresInSeconds?: number }
): Promise<string | null> => {
  const id = String(fileId || '').trim();
  if (!id) return null;
  const row = await prisma.file.findUnique({
    where: { id },
    select: { storageProvider: true, storageKey: true }
  });
  if (!row?.storageKey) return null;
  const provider = String(row.storageProvider || '').toLowerCase();
  if (provider === GCS_PROVIDER || provider === 'gcs') {
    return generateGcsSignedUrl(row.storageKey, opts);
  }
  // Non-GCS providers: no direct signed URL; clients use content route.
  return null;
};

export const createReadStreamForProvider = (params: {
  storageProvider?: string | null;
  storageKey?: string | null;
}) => {
  const provider = String(params.storageProvider || DEFAULT_PROVIDER).toLowerCase();
  const key = String(params.storageKey || '').trim();
  if (!key) return null;
  if (provider === GCS_PROVIDER || provider === 'gcs') {
    return createGcsMediaReadStream(key);
  }
  return null;
};

export const getObjectMetadataForProvider = async (params: {
  storageProvider?: string | null;
  storageKey?: string | null;
}) => {
  const provider = String(params.storageProvider || DEFAULT_PROVIDER).toLowerCase();
  const key = String(params.storageKey || '').trim();
  if (!key) return null;
  if (provider === GCS_PROVIDER || provider === 'gcs') {
    try {
      return await getGcsMediaMetadata(key);
    } catch {
      return null;
    }
  }
  return null;
};

/** Named service object for tests and controllers */
export const MediaStorageService = {
  upload: uploadMediaObject,
  download: downloadByFileId,
  exists: existsByFileId,
  delete: deleteByFileId,
  generatePublicUrl,
  generateSignedUrl,
  resolveWriteStorageProvider,
  shouldUseMemoryUploadMulter,
  isGcsUploadDriver,
  buildMediaObjectKey,
  downloadMediaByProvider,
  mediaObjectExists,
  deleteMediaObject,
  createReadStreamForProvider,
  getObjectMetadataForProvider,
  GOOGLE_CLOUD_STORAGE_PROVIDER: GCS_PROVIDER
};

export { GOOGLE_CLOUD_STORAGE_PROVIDER };
