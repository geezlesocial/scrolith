/**
 * Azure-first video availability checks for posts, Scroll, and feed hydration.
 *
 * Production runs on Azure Blob only (GCP/GCS is retired). The previous GCS-only
 * probe marked valid Azure/local dual-path videos as `storage_missing`, which
 * nulled media URLs and produced postcard/Scroll "Video unavailable".
 */

import { blobExistsByName, isAzureBlobConfigured } from './blobStorage';
import { gcsMediaExists } from './gcsMediaStorage';

export type VideoStorageFileProbe = {
  id?: string | null;
  url?: string | null;
  storageKey?: string | null;
  storageProvider?: string | null;
  mimeType?: string | null;
  filename?: string | null;
  originalName?: string | null;
};

const MANAGED_PROVIDERS = new Set([
  'database_storage',
  'firebase_storage',
  'azure_blob',
  'azure',
  'blob'
]);

const stripUploadsPrefix = (value?: string | null) => {
  const raw = String(value || '').trim().replace(/\\/g, '/');
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    return stripUploadsPrefix(parsed.pathname);
  } catch {
    // not an absolute URL
  }
  const normalized = raw.replace(/^\/+/, '');
  const marker = 'uploads/';
  const index = normalized.toLowerCase().indexOf(marker);
  return (index >= 0 ? normalized.slice(index + marker.length) : normalized).replace(/^\/+/, '');
};

const isVideoLike = (file: VideoStorageFileProbe) => {
  const mimeType = String(file.mimeType || '').toLowerCase();
  const hay = `${file.url || ''} ${file.filename || ''} ${file.originalName || ''}`.toLowerCase();
  return (
    mimeType.startsWith('video/') ||
    /\.(mp4|webm|mov|m4v|ogg|avi|mkv)(?:$|[?#])/.test(hay) ||
    (mimeType === 'application/octet-stream' &&
      (/video|reel|clip|camera|record|capture/i.test(hay) || /\.webm|\.mp4|\.mov/.test(hay)))
  );
};

const storageDriver = () =>
  String(process.env.UPLOAD_DRIVER || process.env.STORAGE_DRIVER || '')
    .trim()
    .toLowerCase();

const isAzureRuntime = () => {
  if (isAzureBlobConfigured()) return true;
  const driver = storageDriver();
  return ['azure_blob', 'azure', 'blob'].includes(driver);
};

const isGcsRuntime = () => {
  const driver = storageDriver();
  if (['gcs', 'google_cloud_storage'].includes(driver)) return true;
  // Explicit bucket without Azure means historical GCS still configured.
  if (isAzureRuntime()) return false;
  return Boolean(
    String(
      process.env.STORAGE_BUCKET ||
        process.env.GCS_MEDIA_BUCKET ||
        process.env.GOOGLE_CLOUD_STORAGE_BUCKET ||
        process.env.GCLOUD_STORAGE_BUCKET ||
        ''
    ).trim()
  );
};

const candidateKeys = (file: VideoStorageFileProbe) =>
  Array.from(
    new Set(
      [
        file.storageKey,
        stripUploadsPrefix(file.url),
        file.filename ? stripUploadsPrefix(file.filename) : '',
        file.originalName ? stripUploadsPrefix(file.originalName) : ''
      ]
        .map((value) => String(value || '').trim())
        .filter(Boolean)
    )
  );

/**
 * Returns true when the video should be treated as playable for feed/scroll cards.
 * On Azure: trust managed providers and blob existence; never fail closed solely
 * because GCS is absent. Missing blobs still return false so UI can offer replace.
 */
export const isVideoFileStorageAvailable = async (file: VideoStorageFileProbe): Promise<boolean> => {
  if (!isVideoLike(file)) return true;

  const provider = String(file.storageProvider || '').toLowerCase();
  if (MANAGED_PROVIDERS.has(provider)) return true;

  const keys = candidateKeys(file);

  // Azure production: probe blob first; if no key but file id exists, allow content
  // route to decide (avoid false storage_missing that blanks URLs entirely).
  if (isAzureRuntime()) {
    if (!keys.length) {
      // File record exists with id — let /api/files/content/:id attempt stream.
      return Boolean(String(file.id || '').trim());
    }
    for (const key of keys) {
      if (await blobExistsByName(key).catch(() => false)) return true;
    }
    // Dual-path / mislabeled providers: still expose content URL rather than
    // permanently blanking media for owners who can replace.
    return Boolean(String(file.id || '').trim());
  }

  // Historical GCS path (not used in current Azure production).
  if (isGcsRuntime()) {
    if (!keys.length) return false;
    for (const key of keys) {
      if (await gcsMediaExists(key).catch(() => false)) return true;
    }
    return false;
  }

  // Unknown runtime: prefer availability when a durable file id exists.
  return Boolean(String(file.id || '').trim() || keys.length);
};

/** Public API origin used when rewriting localhost media URLs in API payloads. */
export const resolvePublicApiOrigin = () => {
  const raw = String(
    process.env.PUBLIC_API_URL ||
      process.env.API_PUBLIC_URL ||
      process.env.BACKEND_PUBLIC_URL ||
      process.env.APP_API_URL ||
      'https://api.scrolith.com'
  )
    .trim()
    .replace(/\/+$/, '');
  if (!raw) return 'https://api.scrolith.com';
  try {
    const url = new URL(raw.includes('://') ? raw : `https://${raw}`);
    return url.origin;
  } catch {
    return 'https://api.scrolith.com';
  }
};

/** Rewrite localhost / relative media URLs to the public API origin. */
export const absolutizePublicMediaUrl = (value?: string | null, baseOrigin?: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('data:') || raw.startsWith('blob:')) return raw;
  const origin = (baseOrigin || resolvePublicApiOrigin()).replace(/\/+$/, '');

  try {
    if (/^https?:\/\//i.test(raw)) {
      const parsed = new URL(raw);
      const host = parsed.hostname.toLowerCase();
      if (
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '0.0.0.0' ||
        host === '10.0.2.2'
      ) {
        return `${origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
      }
      return raw;
    }
  } catch {
    // fall through
  }

  if (raw.startsWith('/')) return `${origin}${raw}`;
  if (raw.toLowerCase().startsWith('uploads/')) return `${origin}/${raw}`;
  if (raw.toLowerCase().startsWith('api/files/')) return `${origin}/${raw}`;
  return raw;
};

export const buildPublicFileContentUrl = (fileId: string, baseOrigin?: string) => {
  const id = String(fileId || '').trim();
  if (!id) return '';
  const origin = (baseOrigin || resolvePublicApiOrigin()).replace(/\/+$/, '');
  return `${origin}/api/files/content/${encodeURIComponent(id)}`;
};
