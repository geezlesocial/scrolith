/**
 * Native Google Cloud Storage adapter for durable product media.
 * Uses Application Default Credentials (Cloud Run SA / local ADC).
 * Target production bucket: scrolith-prod-media
 */
import { Storage, type Bucket, type File as GcsFile } from '@google-cloud/storage';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import fs from 'fs';

export const GOOGLE_CLOUD_STORAGE_PROVIDER = 'google_cloud_storage';

const DEFAULT_PROJECT_ID = 'scrolith-500821';
const DEFAULT_BUCKET = 'scrolith-prod-media';

let cachedStorage: Storage | null = null;
let cachedBucket: Bucket | null = null;
let cachedBucketName: string | null = null;

const trim = (value: unknown) => String(value || '').trim();

/**
 * Bucket resolution for GCS durable media.
 * When UPLOAD_DRIVER is gcs/google_cloud_storage, STORAGE_BUCKET (or alias) is required —
 * we do not silently default so misconfigured deploys fail closed.
 * When checking configuration generically, DEFAULT_BUCKET is only used for non-strict helpers.
 */
export const resolveGcsMediaBucketName = (opts?: { requireExplicit?: boolean }) => {
  const explicit =
    trim(process.env.STORAGE_BUCKET) ||
    trim(process.env.GCS_MEDIA_BUCKET) ||
    trim(process.env.GOOGLE_CLOUD_STORAGE_BUCKET) ||
    trim(process.env.GCLOUD_STORAGE_BUCKET);
  if (explicit) return explicit;
  if (opts?.requireExplicit) {
    throw new Error(
      'UPLOAD_DRIVER=gcs requires explicit STORAGE_BUCKET (expected scrolith-prod-media). Refusing silent default.'
    );
  }
  return DEFAULT_BUCKET;
};

export const resolveGcsMediaProjectId = () =>
  trim(process.env.GOOGLE_CLOUD_PROJECT) ||
  trim(process.env.GCLOUD_PROJECT) ||
  trim(process.env.GCP_PROJECT) ||
  DEFAULT_PROJECT_ID;

export const isGcsMediaConfigured = () => {
  const driver = trim(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || '').toLowerCase();
  const gcsSelected = ['gcs', 'google_cloud_storage'].includes(driver);
  if (gcsSelected) {
    return Boolean(
      trim(process.env.STORAGE_BUCKET) ||
        trim(process.env.GCS_MEDIA_BUCKET) ||
        trim(process.env.GOOGLE_CLOUD_STORAGE_BUCKET) ||
        trim(process.env.GCLOUD_STORAGE_BUCKET)
    );
  }
  return Boolean(resolveGcsMediaBucketName());
};

const getStorage = () => {
  if (cachedStorage) return cachedStorage;
  cachedStorage = new Storage({
    projectId: resolveGcsMediaProjectId()
  });
  return cachedStorage;
};

const getBucket = () => {
  const driver = trim(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || '').toLowerCase();
  const requireExplicit = ['gcs', 'google_cloud_storage'].includes(driver);
  const bucketName = resolveGcsMediaBucketName({ requireExplicit });
  if (cachedBucket && cachedBucketName === bucketName) return cachedBucket;
  cachedBucket = getStorage().bucket(bucketName);
  cachedBucketName = bucketName;
  return cachedBucket;
};

const normalizeObjectKey = (value: string) => String(value || '').replace(/^\/+/, '').trim();

const createNotFoundError = (message: string) => {
  const error = new Error(message) as Error & { code?: string };
  error.code = 'NOT_FOUND';
  return error;
};

const getFile = (objectKey: string): GcsFile => {
  const key = normalizeObjectKey(objectKey);
  if (!key) throw new Error('GCS object key is required');
  return getBucket().file(key);
};

export type GcsUploadParams = {
  /** Preferred when already buffered (multer memory). Streamed into GCS in chunks. */
  buffer?: Buffer;
  /** Preferred for large disk-backed temps (never product uploads/ dir). */
  filePath?: string;
  /** Optional readable stream (takes precedence over buffer when both provided without path). */
  stream?: NodeJS.ReadableStream;
  contentType: string;
  objectKey: string;
  cacheControl?: string;
};

/**
 * Upload bytes to GCS. Prefer stream/path for large files; buffer is written via Readable.
 * Verifies object exists after upload.
 */
export const uploadToGcsMedia = async (params: GcsUploadParams) => {
  const objectKey = normalizeObjectKey(params.objectKey);
  if (!objectKey) throw new Error('GCS upload requires objectKey');

  const file = getFile(objectKey);
  const contentType = params.contentType || 'application/octet-stream';
  const cacheControl = params.cacheControl || 'private, max-age=0';

  const writeStream = file.createWriteStream({
    resumable: true,
    validation: 'crc32c',
    metadata: {
      contentType,
      cacheControl
    }
  });

  if (params.filePath) {
    await pipeline(fs.createReadStream(params.filePath), writeStream);
  } else if (params.stream) {
    await pipeline(params.stream as any, writeStream);
  } else if (params.buffer && Buffer.isBuffer(params.buffer)) {
    await pipeline(Readable.from(params.buffer), writeStream);
  } else {
    throw new Error('GCS upload requires buffer, stream, or filePath');
  }

  // Verify object exists before caller creates File row.
  const [exists] = await file.exists();
  if (!exists) {
    throw new Error(`GCS upload verification failed for object: ${objectKey}`);
  }

  let sizeBytes = 0;
  try {
    const [metadata] = await file.getMetadata();
    sizeBytes = Number(metadata?.size || 0) || (params.buffer?.length ?? 0);
  } catch {
    sizeBytes = params.buffer?.length ?? 0;
  }

  return {
    objectKey,
    bucket: resolveGcsMediaBucketName({
      requireExplicit: ['gcs', 'google_cloud_storage'].includes(
        trim(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || '').toLowerCase()
      )
    }),
    sizeBytes,
    contentType
  };
};

export const downloadGcsMediaBuffer = async (objectKey: string) => {
  const key = normalizeObjectKey(objectKey);
  try {
    const [buffer] = await getFile(key).download();
    return buffer;
  } catch (error: any) {
    const code = Number(error?.code || 0);
    if (code === 404) throw createNotFoundError('GCS object not found');
    throw error;
  }
};

/**
 * Create a GCS read stream. Optional inclusive byte window for HTTP Range.
 * @param opts.start inclusive start byte
 * @param opts.end inclusive end byte (Node/GCS createReadStream end is inclusive)
 */
export const createGcsMediaReadStream = (
  objectKey: string,
  opts?: { start?: number; end?: number }
) => {
  const key = normalizeObjectKey(objectKey);
  const start = opts?.start;
  const end = opts?.end;
  if (
    typeof start === 'number' &&
    Number.isFinite(start) &&
    typeof end === 'number' &&
    Number.isFinite(end)
  ) {
    return getFile(key).createReadStream({ start, end });
  }
  if (typeof start === 'number' && Number.isFinite(start)) {
    return getFile(key).createReadStream({ start });
  }
  return getFile(key).createReadStream();
};

export const gcsMediaExists = async (objectKey: string) => {
  const key = normalizeObjectKey(objectKey);
  if (!key) return false;
  try {
    const [exists] = await getFile(key).exists();
    return Boolean(exists);
  } catch {
    return false;
  }
};

export const deleteGcsMedia = async (objectKey?: string | null) => {
  const key = normalizeObjectKey(String(objectKey || ''));
  if (!key) return;
  await getFile(key).delete({ ignoreNotFound: true });
};

export const getGcsMediaMetadata = async (objectKey: string) => {
  const key = normalizeObjectKey(objectKey);
  try {
    const [metadata] = await getFile(key).getMetadata();
    return {
      contentType: String(metadata?.contentType || '').trim() || 'application/octet-stream',
      size: Number(metadata?.size || 0) || 0
    };
  } catch (error: any) {
    const code = Number(error?.code || 0);
    if (code === 404) throw createNotFoundError('GCS object not found');
    throw error;
  }
};

export const generateGcsSignedUrl = async (
  objectKey: string,
  opts?: { expiresInSeconds?: number; action?: 'read' | 'write' }
) => {
  const key = normalizeObjectKey(objectKey);
  if (!key) return null;
  const expiresInSeconds = Math.max(60, Math.min(7 * 24 * 3600, Number(opts?.expiresInSeconds || 900)));
  const action = opts?.action === 'write' ? 'write' : 'read';
  const [url] = await getFile(key).getSignedUrl({
    version: 'v4',
    action,
    expires: Date.now() + expiresInSeconds * 1000
  });
  return url;
};

/**
 * List object keys under a prefix (read-only). Used by Phase 2 orphan detection.
 * Never deletes. Caps results via maxResults.
 */
export const listGcsMediaObjectKeys = async (opts?: {
  prefix?: string;
  maxResults?: number;
  pageToken?: string;
}): Promise<{ keys: string[]; nextPageToken?: string | null }> => {
  const prefix = normalizeObjectKey(String(opts?.prefix || 'media/'));
  const maxResults = Math.max(1, Math.min(5000, Number(opts?.maxResults || 1000)));
  const [files, , apiResponse] = await getBucket().getFiles({
    prefix: prefix || undefined,
    maxResults,
    autoPaginate: false,
    pageToken: opts?.pageToken || undefined
  });
  const keys = (files || [])
    .map((file) => normalizeObjectKey(String(file?.name || '')))
    .filter(Boolean);
  const nextPageToken =
    (apiResponse as { nextPageToken?: string } | undefined)?.nextPageToken || null;
  return { keys, nextPageToken };
};

/** Test-only: reset module caches */
export const __resetGcsMediaCachesForTests = () => {
  cachedStorage = null;
  cachedBucket = null;
  cachedBucketName = null;
};
