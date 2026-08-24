/**
 * Private KYC object storage — Azure Blob Storage.
 *
 * Production Scrolith runs on Azure. KYC objects are stored privately under:
 *   kyc/quarantine/*
 *   kyc/clean/*
 *   kyc/rejected/*
 *
 * No public ACLs or permanent public URLs are generated here.
 */

import { randomUUID, createHash } from 'crypto';
import { Readable } from 'stream';

import {
  deleteBlobByName,
  downloadBlobBufferByName,
  isAzureBlobConfigured,
  uploadBufferToBlob
} from '../storage/blobStorage';

import {
  KYC_OBJECT_PREFIX,
  KYC_SIGNED_URL_TTL_SECONDS
} from './kyc.constants';

export type KycStorageNamespace = 'quarantine' | 'clean' | 'rejected';

const trim = (value: unknown) => String(value || '').trim();

const assertAzureKycStorageConfigured = () => {
  if (!isAzureBlobConfigured()) {
    throw Object.assign(
      new Error('Azure Blob Storage is not configured for KYC'),
      {
        code: 'KYC_STORAGE_UNAVAILABLE',
        status: 503
      }
    );
  }
};

/**
 * Random non-enumerable object id.
 * Never include identity, email, document type or original filename.
 */
export const createKycObjectId = () =>
  randomUUID().replace(/-/g, '');

export const buildKycObjectKey = (
  namespace: KycStorageNamespace,
  objectId?: string
) => {
  const id = objectId || createKycObjectId();
  const prefix = KYC_OBJECT_PREFIX[namespace];
  return `${prefix}/${id}`;
};

export const sha256Hex = (buffer: Buffer) =>
  createHash('sha256').update(buffer).digest('hex');

export const uploadKycObject = async (params: {
  namespace: KycStorageNamespace;
  buffer: Buffer;
  contentType: string;
  objectId?: string;
}) => {
  assertAzureKycStorageConfigured();

  const objectKey = buildKycObjectKey(
    params.namespace,
    params.objectId
  );

  const checksum = sha256Hex(params.buffer);

  await uploadBufferToBlob({
    buffer: params.buffer,
    contentType:
      params.contentType || 'application/octet-stream',
    fileName: objectKey
  });

  return {
    objectKey,
    sizeBytes: params.buffer.length,
    contentType: params.contentType,
    sha256: checksum,
    storageProvider: 'azure_blob',
    bucket: null as string | null
  };
};

export const downloadKycObject = async (
  objectKey: string
): Promise<Buffer> => {
  const key = trim(objectKey);

  if (!key || !key.startsWith('kyc/')) {
    throw Object.assign(
      new Error('Invalid KYC object key'),
      {
        code: 'INVALID_KEY',
        status: 400
      }
    );
  }

  assertAzureKycStorageConfigured();

  try {
    return await downloadBlobBufferByName(key);
  } catch (error: any) {
    if (
      error?.statusCode === 404 ||
      error?.code === 'BlobNotFound'
    ) {
      throw Object.assign(
        new Error('KYC object not found'),
        {
          code: 'NOT_FOUND',
          status: 404
        }
      );
    }

    throw error;
  }
};

export const deleteKycObject = async (
  objectKey?: string | null
) => {
  const key = trim(objectKey);

  if (!key || !key.startsWith('kyc/')) return;

  assertAzureKycStorageConfigured();

  try {
    await deleteBlobByName(key);
  } catch (error: any) {
    // Deleting an already-removed object is idempotent.
    if (
      error?.statusCode === 404 ||
      error?.code === 'BlobNotFound'
    ) {
      return;
    }

    throw error;
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

  // Quarantine cleanup is best-effort after the clean object
  // has already been successfully persisted.
  try {
    await deleteKycObject(params.quarantineKey);
  } catch {
    // Do not turn a successful clean promotion into an upload
    // failure solely because quarantine cleanup failed.
  }

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

    if (params.sourceKey) {
      try {
        await deleteKycObject(params.sourceKey);
      } catch {
        // Rejected copy has already been safely persisted.
      }
    }

    return rejected;
  }

  if (params.sourceKey) {
    const buffer = await downloadKycObject(
      params.sourceKey
    );

    const rejected = await uploadKycObject({
      namespace: 'rejected',
      buffer,
      contentType: params.contentType
    });

    try {
      await deleteKycObject(params.sourceKey);
    } catch {
      // Rejected copy has already been safely persisted.
    }

    return rejected;
  }

  return null;
};

/**
 * Azure SAS URLs are intentionally not generated in this
 * hotfix. The controller already falls back to the authenticated
 * streaming endpoint when this function returns null.
 */
export const createKycSignedReadUrl = async (
  objectKey: string,
  ttlSeconds = KYC_SIGNED_URL_TTL_SECONDS
): Promise<string | null> => {
  const key = trim(objectKey);

  if (!key.startsWith('kyc/clean/')) {
    throw Object.assign(
      new Error(
        'Signed URLs only allowed for clean KYC objects'
      ),
      {
        code: 'SIGNED_URL_NAMESPACE',
        status: 400
      }
    );
  }

  void ttlSeconds;

  assertAzureKycStorageConfigured();

  return null;
};

export const createKycReadStream = async (
  objectKey: string
): Promise<Readable> => {
  const key = trim(objectKey);

  if (!key.startsWith('kyc/')) {
    throw Object.assign(
      new Error('Invalid KYC object key'),
      {
        code: 'INVALID_KEY',
        status: 400
      }
    );
  }

  const buffer = await downloadKycObject(key);

  return Readable.from([buffer]);
};

export const getKycStorageConfigSnapshot = () => ({
  mode: 'azure_blob' as const,
  hasDedicatedBucket: false,
  prefixes: KYC_OBJECT_PREFIX
});
