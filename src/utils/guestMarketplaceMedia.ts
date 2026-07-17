/**
 * Phase 18.3 — Guest Marketplace media safety.
 * Resolves listing image fields that may be strings, objects, or arrays
 * without ever coercing objects via String() → "[object Object]".
 */
import { resolveAssetUrl } from './assetUrl';
import { resolvePostAttachmentMediaUrl } from './postAttachmentMedia';

const INVALID_LITERALS = new Set([
  '',
  '[object object]',
  'null',
  'undefined',
  'nan',
  'false',
  'true'
]);

const isInvalidUrlString = (value: string) => {
  const normalized = value.trim();
  if (!normalized) return true;
  if (INVALID_LITERALS.has(normalized.toLowerCase())) return true;
  // Reject pure object-coercion artifacts and non-URL garbage.
  if (normalized.includes('[object Object]')) return true;
  return false;
};

const finalizeUrl = (value: unknown): string | null => {
  if (value == null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const raw = String(value).trim();
  if (isInvalidUrlString(raw)) return null;

  // Prefer attachment/content resolution for file ids and nested refs.
  const fromAttachment = String(resolvePostAttachmentMediaUrl(raw) || '').trim();
  if (fromAttachment && !isInvalidUrlString(fromAttachment)) return fromAttachment;

  const fromAsset = String(resolveAssetUrl(raw) || '').trim();
  if (fromAsset && !isInvalidUrlString(fromAsset)) return fromAsset;

  // Absolute or root-relative paths that resolve as-is.
  if (/^(https?:)?\/\//i.test(raw) || raw.startsWith('/') || raw.startsWith('data:image/')) {
    return raw;
  }

  return null;
};

/**
 * Safely resolve a media URL from unknown marketplace payload shapes.
 * Returns a usable string URL/path or null. Never returns "[object Object]".
 */
export const resolveMediaUrl = (input: unknown, depth = 0): string | null => {
  if (input == null || depth > 6) return null;

  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (isInvalidUrlString(trimmed)) return null;

    // JSON-encoded media blob
    if (
      (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
      (trimmed.startsWith('[') && trimmed.endsWith(']'))
    ) {
      try {
        return resolveMediaUrl(JSON.parse(trimmed), depth + 1);
      } catch {
        // fall through as URL string
      }
    }

    return finalizeUrl(trimmed);
  }

  if (typeof input === 'number' && Number.isFinite(input)) {
    return finalizeUrl(String(input));
  }

  if (Array.isArray(input)) {
    for (const entry of input) {
      const resolved = resolveMediaUrl(entry, depth + 1);
      if (resolved) return resolved;
    }
    return null;
  }

  if (typeof input === 'object') {
    // Canonical attachment resolver (fileId, url, nested file/asset, etc.)
    const fromDescriptor = String(resolvePostAttachmentMediaUrl(input) || '').trim();
    if (fromDescriptor && !isInvalidUrlString(fromDescriptor)) return fromDescriptor;

    const record = input as Record<string, unknown>;
    const preferredKeys = [
      'url',
      'src',
      'secureUrl',
      'secure_url',
      'publicUrl',
      'public_url',
      'downloadUrl',
      'download_url',
      'fileUrl',
      'file_url',
      'mediaUrl',
      'media_url',
      'imageUrl',
      'image_url',
      'thumbnailUrl',
      'thumbnail_url',
      'thumbnail',
      'coverImage',
      'cover_image',
      'cardImage',
      'card_image',
      'previewImage',
      'preview_image',
      'path',
      'href'
    ];

    for (const key of preferredKeys) {
      if (record[key] == null) continue;
      const resolved = resolveMediaUrl(record[key], depth + 1);
      if (resolved) return resolved;
    }

    // Nested containers
    for (const key of ['variants', 'images', 'media', 'files', 'attachments', 'file', 'asset', 'image', 'cover', 'thumbnail']) {
      if (record[key] == null) continue;
      const resolved = resolveMediaUrl(record[key], depth + 1);
      if (resolved) return resolved;
    }

    return null;
  }

  return null;
};

const isLikelyVideo = (entry: unknown) => {
  if (!entry || typeof entry !== 'object') return false;
  const record = entry as Record<string, unknown>;
  const typeBlob = [
    record.type,
    record.mimeType,
    record.mime_type,
    record.contentType,
    record.url,
    record.src
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');
  return /video|mp4|webm|mov|m4v/.test(typeBlob);
};

/** Prefer image-like entries when scanning arrays (avoid video URLs in <img>). */
const resolveMediaArrayPreferImage = (input: unknown): string | null => {
  if (!Array.isArray(input)) return resolveMediaUrl(input);
  const ordered = [
    ...input.filter((entry) => !isLikelyVideo(entry)),
    ...input.filter((entry) => isLikelyVideo(entry))
  ];
  for (const entry of ordered) {
    const resolved = resolveMediaUrl(entry);
    if (resolved && !/\.(mp4|webm|mov|m4v)(\?|$)/i.test(resolved)) return resolved;
  }
  return null;
};

/**
 * Pick the best listing/gig image from common marketplace field names.
 */
export const resolveGuestMarketplaceListingImage = (listing: unknown): string | null => {
  if (!listing || typeof listing !== 'object') {
    return resolveMediaUrl(listing);
  }

  const row = listing as Record<string, unknown>;
  const scalarCandidates: unknown[] = [
    row.coverImage,
    row.cover_image,
    row.cardImage,
    row.card_image,
    row.thumbnail,
    row.thumbnailUrl,
    row.thumbnail_url,
    row.previewImage,
    row.preview_image,
    row.image,
    row.imageUrl,
    row.image_url
  ];

  for (const candidate of scalarCandidates) {
    const resolved = resolveMediaUrl(candidate);
    if (resolved) return resolved;
  }

  for (const key of ['images', 'media', 'attachments', 'files'] as const) {
    const resolved = resolveMediaArrayPreferImage(row[key]);
    if (resolved) return resolved;
  }

  return null;
};
