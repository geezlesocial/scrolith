/**
 * Private KYC object storage.
 * Preferred: dedicated KYC_GCS_BUCKET.
 * Temporary bounded fallback: private prefix on media bucket / local disk.
 * No public ACLs, no permanent public URLs, no identity in object keys.
 */
import { randomUUID, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import {
  deleteGcsMedia,
  downloadGcsMediaBuffer,
  generateGcsSignedUrl,
  isGcsMediaConfigured,
  uploadToGcsMedia,
  createGcsMediaReadStream
} from '../storage/gcsMediaStorage';
import { KYC_OBJECT_PREFIX, KYC_SIGNED_URL_TTL_SECONDS } from './kyc.constants';

export type KycStorageNamespace = 'quarantine' | 'clean' | 'rejected';

const trim = (value: unknown) => String(value || '').trim();

const resolveKycBucketMode = () => {
  // dedicated | prefix | local
  const dedicated = trim(process.env.KYC_GCS_BUCKET || process.env.KYC_STORAGE_BUCKET);
  if (dedicated) return { mode: 'dedicated' as const, bucket: dedicated };
  if (isGcsMediaConfigured()) return { mode: 'prefix' as const, bucket: null as string | null };
  return { mode: 'local' as const, bucket: null as string | null };
};

const getLocalRoot = () => {
  const root = trim(process.env.KYC_LOCAL_STORAGE_DIR) || path.join(process.cwd(), 'uploads', 'kyc-private');
  return root;
};

const ensureLocalDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

/** Random non-enumerable object id — no email/name/document type/original filename. */
export const createKycObjectId = () => randomUUID().replace(/-/g, '');

export const buildKycObjectKey = (namespace: KycStorageNamespace, objectId?: string) => {
  const id = objectId || createKycObjectId();
  const prefix = KYC_OBJECT_PREFIX[namespace];
  return `${prefix}/${id}`;
};

export const sha256Hex = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');

export const uploadKycObject = async (params: {
  namespace: KycStorageNamespace;
  buffer: Buffer;
  contentType: string;
  objectId?: string;
}) => {
  const objectKey = buildKycObjectKey(params.namespace, params.objectId);
  const mode = resolveKycBucketMode();
  const checksum = sha256Hex(params.buffer);

  if (mode.mode === 'local') {
    const fullPath = path.join(getLocalRoot(), objectKey);
    ensureLocalDir(path.dirname(fullPath));
    fs.writeFileSync(fullPath, params.buffer);
    return {
      objectKey,
      sizeBytes: params.buffer.length,
      contentType: params.contentType,
      sha256: checksum,
      storageProvider: 'local_kyc_private',
      bucket: null as string | null
    };
  }

  // GCS: dedicated bucket uses STORAGE_BUCKET override via env for this call path.
  // For dedicated KYC bucket we set process-local env only around upload if needed —
  // uploadToGcsMedia uses shared media bucket. When KYC_GCS_BUCKET is set, write via
  // explicit prefix still on that bucket by temporarily using STORAGE_BUCKET.
  const previousBucket = process.env.STORAGE_BUCKET;
  try {
    if (mode.mode === 'dedicated' && mode.bucket) {
      process.env.STORAGE_BUCKET = mode.bucket;
    }
    await uploadToGcsMedia({
      buffer: params.buffer,
      contentType: params.contentType,
      objectKey,
      cacheControl: 'private, no-store, max-age=0'
    });
  } finally {
    if (mode.mode === 'dedicated') {
      if (previousBucket === undefined) delete process.env.STORAGE_BUCKET;
      else process.env.STORAGE_BUCKET = previousBucket;
    }
  }

  return {
    objectKey,
    sizeBytes: params.buffer.length,
    contentType: params.contentType,
    sha256: checksum,
    storageProvider: mode.mode === 'dedicated' ? 'gcs_kyc_dedicated' : 'gcs_kyc_prefix',
    bucket: mode.bucket
  };
};

export const downloadKycObject = async (objectKey: string): Promise<Buffer> => {
  const key = trim(objectKey);
  if (!key || !key.startsWith('kyc/')) {
    throw Object.assign(new Error('Invalid KYC object key'), { code: 'INVALID_KEY', status: 400 });
  }
  const mode = resolveKycBucketMode();
  if (mode.mode === 'local') {
    const fullPath = path.join(getLocalRoot(), key);
    if (!fs.existsSync(fullPath)) {
      throw Object.assign(new Error('KYC object not found'), { code: 'NOT_FOUND', status: 404 });
    }
    return fs.readFileSync(fullPath);
  }

  const previousBucket = process.env.STORAGE_BUCKET;
  try {
    if (mode.mode === 'dedicated' && mode.bucket) {
      process.env.STORAGE_BUCKET = mode.bucket;
    }
    return await downloadGcsMediaBuffer(key);
  } finally {
    if (mode.mode === 'dedicated') {
      if (previousBucket === undefined) delete process.env.STORAGE_BUCKET;
      else process.env.STORAGE_BUCKET = previousBucket;
    }
  }
};

export const deleteKycObject = async (objectKey?: string | null) => {
  const key = trim(objectKey);
  if (!key || !key.startsWith('kyc/')) return;
  const mode = resolveKycBucketMode();
  if (mode.mode === 'local') {
    const fullPath = path.join(getLocalRoot(), key);
    try {
      if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
    } catch {
      /* ignore */
    }
    return;
  }
  const previousBucket = process.env.STORAGE_BUCKET;
  try {
    if (mode.mode === 'dedicated' && mode.bucket) {
      process.env.STORAGE_BUCKET = mode.bucket;
    }
    await deleteGcsMedia(key);
  } finally {
    if (mode.mode === 'dedicated') {
      if (previousBucket === undefined) delete process.env.STORAGE_BUCKET;
      else process.env.STORAGE_BUCKET = previousBucket;
    }
  }
};

export const promoteKycObject = async (params: {
  quarantineKey: string;
  buffer: Buffer;
  contentType: string;
}) => {
  const clean = await uploadKycObject({
    namespace: 'clean',
    buffer: params.buffer,
    contentType: params.contentType
  });
  // Best-effort remove quarantine original after clean promotion.
  await deleteKycObject(params.quarantineKey);
  return clean;
};

export const moveToRejectedNamespace = async (params: {
  sourceKey?: string | null;
  buffer?: Buffer | null;
  contentType: string;
}) => {
  if (params.buffer && Buffer.isBuffer(params.buffer)) {
    const rejected = await uploadKycObject({
      namespace: 'rejected',
      buffer: params.buffer,
      contentType: params.contentType
    });
    if (params.sourceKey) await deleteKycObject(params.sourceKey);
    return rejected;
  }
  // If we only have source key, download then re-upload (bounded files only).
  if (params.sourceKey) {
    const buffer = await downloadKycObject(params.sourceKey);
    const rejected = await uploadKycObject({
      namespace: 'rejected',
      buffer,
      contentType: params.contentType
    });
    await deleteKycObject(params.sourceKey);
    return rejected;
  }
  return null;
};

/**
 * Short-lived signed read URL for clean private objects only.
 * Max ~5 minutes. Never log the URL.
 */
export const createKycSignedReadUrl = async (
  objectKey: string,
  ttlSeconds = KYC_SIGNED_URL_TTL_SECONDS
) => {
  const key = trim(objectKey);
  if (!key.startsWith('kyc/clean/')) {
    throw Object.assign(new Error('Signed URLs only allowed for clean KYC objects'), {
      code: 'SIGNED_URL_NAMESPACE',
      status: 400
    });
  }
  const mode = resolveKycBucketMode();
  if (mode.mode === 'local') {
    // Local mode: no GCS signed URL — caller must stream via authenticated endpoint.
    return null;
  }
  const ttl = Math.max(60, Math.min(KYC_SIGNED_URL_TTL_SECONDS, Number(ttlSeconds || KYC_SIGNED_URL_TTL_SECONDS)));
  const previousBucket = process.env.STORAGE_BUCKET;
  try {
    if (mode.mode === 'dedicated' && mode.bucket) {
      process.env.STORAGE_BUCKET = mode.bucket;
    }
    return await generateGcsSignedUrl(key, { expiresInSeconds: ttl, action: 'read' });
  } finally {
    if (mode.mode === 'dedicated') {
      if (previousBucket === undefined) delete process.env.STORAGE_BUCKET;
      else process.env.STORAGE_BUCKET = previousBucket;
    }
  }
};

export const createKycReadStream = async (objectKey: string): Promise<Readable> => {
  const key = trim(objectKey);
  if (!key.startsWith('kyc/')) {
    throw Object.assign(new Error('Invalid KYC object key'), { code: 'INVALID_KEY', status: 400 });
  }
  const mode = resolveKycBucketMode();
  if (mode.mode === 'local') {
    const fullPath = path.join(getLocalRoot(), key);
    if (!fs.existsSync(fullPath)) {
      throw Object.assign(new Error('KYC object not found'), { code: 'NOT_FOUND', status: 404 });
    }
    return fs.createReadStream(fullPath);
  }
  const previousBucket = process.env.STORAGE_BUCKET;
  try {
    if (mode.mode === 'dedicated' && mode.bucket) {
      process.env.STORAGE_BUCKET = mode.bucket;
    }
    return createGcsMediaReadStream(key) as unknown as Readable;
  } finally {
    // Note: stream may still need bucket env during read; for dedicated mode keep until stream ends is complex.
    // Prefer prefix mode in shared bucket for streaming simplicity; dedicated bucket keeps STORAGE_BUCKET set only for create.
    if (mode.mode === 'dedicated') {
      if (previousBucket === undefined) delete process.env.STORAGE_BUCKET;
      else process.env.STORAGE_BUCKET = previousBucket;
    }
  }
};

export const getKycStorageConfigSnapshot = () => {
  const mode = resolveKycBucketMode();
  return {
    mode: mode.mode,
    hasDedicatedBucket: mode.mode === 'dedicated',
    // Do not expose bucket name in user-facing responses; ops-only.
    prefixes: KYC_OBJECT_PREFIX
  };
};
