import fs from 'fs';
import path from 'path';
import { blobExistsByName, isAzureBlobConfigured } from '../storage/blobStorage';
import { databaseStorageExistsByName } from '../storage/databaseStorage';
import { firebaseStorageExistsByName } from '../storage/firebaseStorage';
import { gcsMediaExists } from '../storage/gcsMediaStorage';

const UPLOAD_DIR = path.resolve(__dirname, '..', '..', '..', 'uploads');

type StoredMediaAvailabilityInput = {
  storageProvider?: string | null;
  storageKey?: string | null;
  url?: string | null;
  filename?: string | null;
  originalName?: string | null;
};

export const stripUploadsPrefixForAvailability = (value?: string | null) => {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return stripUploadsPrefixForAvailability(parsed.pathname);
  } catch {}
  const normalized = raw.replace(/^\/+/, '');
  const marker = 'uploads/';
  const index = normalized.toLowerCase().indexOf(marker);
  return (index >= 0 ? normalized.slice(index + marker.length) : normalized).replace(/^\/+/, '');
};

const isSafeRelativeStorageKey = (value: string) => {
  if (!value || value.includes('\0')) return false;
  const normalized = value.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../')) return false;
  return true;
};

const buildStorageKeyCandidates = (file: StoredMediaAvailabilityInput) =>
  Array.from(
    new Set(
      [
        file.storageKey,
        stripUploadsPrefixForAvailability(file.url),
        stripUploadsPrefixForAvailability(file.filename),
        stripUploadsPrefixForAvailability(file.originalName)
      ]
        .map((value) => String(value || '').trim())
        .filter((value) => value && isSafeRelativeStorageKey(value))
    )
  );

const localUploadExists = (candidate: string) => {
  const uploadsRoot = path.resolve(UPLOAD_DIR);
  const localPath = path.resolve(UPLOAD_DIR, candidate);
  return localPath.startsWith(uploadsRoot) && fs.existsSync(localPath);
};

const anyCandidateExists = async (
  candidates: string[],
  exists: (candidate: string) => Promise<boolean> | boolean
) => {
  for (const candidate of candidates) {
    if (await Promise.resolve(exists(candidate)).catch(() => false)) return true;
  }
  return false;
};

/**
 * Returns whether a File row can actually be loaded by browser-facing media URLs.
 *
 * Legacy `local` rows are common after migration. In stateless Azure containers,
 * those rows must not be treated as available unless the object exists on local
 * disk or was copied into a managed store under a compatible key.
 */
export const isStoredMediaAvailable = async (file: StoredMediaAvailabilityInput) => {
  const provider = String(file.storageProvider || 'local').trim().toLowerCase();
  const candidates = buildStorageKeyCandidates(file);
  if (!candidates.length) return false;

  if (provider === 'azure_blob' || provider === 'azure' || provider === 'blob') {
    return isAzureBlobConfigured() && anyCandidateExists(candidates, blobExistsByName);
  }

  if (provider === 'database_storage' || provider === 'database' || provider === 'db') {
    return anyCandidateExists(candidates, databaseStorageExistsByName);
  }

  if (provider === 'firebase_storage' || provider === 'firebase') {
    return anyCandidateExists(candidates, firebaseStorageExistsByName);
  }

  if (provider === 'google_cloud_storage' || provider === 'gcs') {
    return anyCandidateExists(candidates, gcsMediaExists);
  }

  if (await anyCandidateExists(candidates, localUploadExists)) return true;
  if (isAzureBlobConfigured() && (await anyCandidateExists(candidates, blobExistsByName))) return true;
  if (await anyCandidateExists(candidates, gcsMediaExists)) return true;
  return false;
};

export const __mediaAvailabilityTestUtils = {
  buildStorageKeyCandidates,
  isSafeRelativeStorageKey
};
