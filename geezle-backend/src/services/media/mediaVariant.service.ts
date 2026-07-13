/**
 * Phase 3A — persist image variants to GCS + FileVariant rows (idempotent).
 *
 * Lifecycle (design for later phases; DB already cascades):
 * - FileVariant rows cascade-delete when File is deleted (schema onDelete: Cascade).
 * - GCS derivative objects under media/{fileId}/… are NOT auto-deleted in Phase 3A.
 * - Future entity deletes (posts, listings, pages, profiles) should either:
 *   (a) delete/unlink File rows through a shared media lifecycle service that
 *       also best-effort deletes GCS original + variants, or
 *   (b) enqueue a cleanup job keyed by fileId for media/{fileId}/** prefix.
 * - Until then, orphaned GCS objects are harmless and recoverable via inventory.
 */
import prisma from '../../utils/prismaClient';
import {
  GOOGLE_CLOUD_STORAGE_PROVIDER,
  gcsMediaExists,
  getGcsMediaMetadata,
  uploadToGcsMedia
} from '../storage/gcsMediaStorage';
import { buildVariantObjectKey, type GeneratedVariant } from './mediaImageProcessor.service';

export type PersistVariantResult = {
  action: 'created' | 'reused' | 'conflict' | 'error';
  variantId?: string;
  storageKey: string;
  message?: string;
};

/**
 * Upload buffer to deterministic key if missing; never overwrite different content.
 * Then upsert FileVariant by unique (fileId, kind, width, format, label).
 */
export const persistGeneratedVariant = async (params: {
  fileId: string;
  variant: GeneratedVariant;
}): Promise<PersistVariantResult> => {
  const { fileId, variant } = params;
  const storageKey = buildVariantObjectKey({
    fileId,
    kind: variant.kind,
    width: variant.width,
    format: variant.format
  });
  const width = Math.max(0, Math.floor(Number(variant.width) || 0));
  const label = String(variant.label || 'default');

  try {
    const exists = await gcsMediaExists(storageKey);
    if (exists) {
      const meta = await getGcsMediaMetadata(storageKey).catch(() => null);
      const size = Number(meta?.size || 0);
      if (size === variant.buffer.length) {
        // Reuse existing object — upsert DB row
        const row = await upsertVariantRow({
          fileId,
          kind: variant.kind,
          label,
          width,
          height: variant.height,
          format: variant.format,
          mimeType: variant.mimeType,
          storageKey,
          sizeBytes: variant.buffer.length,
          checksum: variant.checksum
        });
        return { action: 'reused', variantId: row.id, storageKey };
      }
      // Conflict: different size — do not overwrite
      return {
        action: 'conflict',
        storageKey,
        message: 'Existing GCS object size differs; refusing overwrite'
      };
    }

    await uploadToGcsMedia({
      buffer: variant.buffer,
      contentType: variant.mimeType,
      objectKey: storageKey,
      cacheControl: 'public, max-age=31536000, immutable'
    });

    const verified = await gcsMediaExists(storageKey);
    if (!verified) {
      return { action: 'error', storageKey, message: 'GCS upload verification failed' };
    }
    const meta = await getGcsMediaMetadata(storageKey).catch(() => null);
    const remoteSize = Number(meta?.size || 0);
    if (remoteSize && remoteSize !== variant.buffer.length) {
      return { action: 'error', storageKey, message: 'GCS size mismatch after upload' };
    }

    const row = await upsertVariantRow({
      fileId,
      kind: variant.kind,
      label,
      width,
      height: variant.height,
      format: variant.format,
      mimeType: variant.mimeType,
      storageKey,
      sizeBytes: variant.buffer.length,
      checksum: variant.checksum
    });

    return { action: 'created', variantId: row.id, storageKey };
  } catch (error: any) {
    return {
      action: 'error',
      storageKey,
      message: error?.message || 'Variant persist failed'
    };
  }
};

const upsertVariantRow = async (data: {
  fileId: string;
  kind: string;
  label: string;
  width: number;
  height: number;
  format: string;
  mimeType: string;
  storageKey: string;
  sizeBytes: number;
  checksum: string;
}) => {
  // Unique: fileId + kind + width + format + label
  const existing = await prisma.fileVariant.findFirst({
    where: {
      fileId: data.fileId,
      kind: data.kind,
      width: data.width,
      format: data.format,
      label: data.label
    }
  });

  if (existing) {
    return prisma.fileVariant.update({
      where: { id: existing.id },
      data: {
        height: data.height,
        mimeType: data.mimeType,
        storageProvider: GOOGLE_CLOUD_STORAGE_PROVIDER,
        storageKey: data.storageKey,
        sizeBytes: BigInt(data.sizeBytes),
        checksum: data.checksum,
        status: 'READY'
      }
    });
  }

  return prisma.fileVariant.create({
    data: {
      fileId: data.fileId,
      kind: data.kind,
      label: data.label,
      width: data.width,
      height: data.height,
      format: data.format,
      mimeType: data.mimeType,
      storageProvider: GOOGLE_CLOUD_STORAGE_PROVIDER,
      storageKey: data.storageKey,
      sizeBytes: BigInt(data.sizeBytes),
      checksum: data.checksum,
      status: 'READY'
    }
  });
};

/** Internal list — storageKey retained for workers/serving; never pass raw to clients. */
export const listReadyVariants = async (fileId: string) =>
  prisma.fileVariant.findMany({
    where: { fileId, status: 'READY' },
    orderBy: [{ kind: 'asc' }, { width: 'asc' }, { format: 'asc' }],
    select: {
      id: true,
      kind: true,
      label: true,
      width: true,
      height: true,
      format: true,
      mimeType: true,
      sizeBytes: true,
      storageKey: true
    }
  });

export const findVariantById = async (fileId: string, variantId: string) =>
  prisma.fileVariant.findFirst({
    where: { id: variantId, fileId, status: 'READY' }
  });

export const findMatchingImageVariant = async (params: {
  fileId: string;
  width?: number | null;
  format?: string | null;
}) => {
  const width = Number(params.width || 0);
  if (!width) return null;
  const format = String(params.format || 'webp').toLowerCase();
  return prisma.fileVariant.findFirst({
    where: {
      fileId: params.fileId,
      status: 'READY',
      kind: { in: ['image_size', 'image_thumb'] },
      width,
      format
    }
  });
};

export const MediaVariantService = {
  persistGeneratedVariant,
  listReadyVariants,
  findVariantById,
  findMatchingImageVariant,
  buildVariantObjectKey
};
