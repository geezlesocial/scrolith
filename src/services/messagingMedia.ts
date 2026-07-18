/**
 * Shared messaging attachment normalization, auth content fetch, and download helpers.
 * Used by full /messages and desktop dock chat for media preview parity.
 */

export type MessagingMediaCategory =
  | 'image'
  | 'video'
  | 'audio'
  | 'voice_note'
  | 'document'
  | 'generic_file';

export type NormalizedMessageAttachment = {
  id: string;
  fileId: string;
  url: string;
  name: string;
  type: MessagingMediaCategory;
  size?: number;
  mimeType?: string;
  durationMs?: number;
  requiresAuthFetch: boolean;
  canPreview: boolean;
  canStream: boolean;
};

export type MessageMediaResourceState = {
  objectUrl?: string;
  loading: boolean;
  mimeType?: string;
  error?: string;
};

/** Private video blob preview ceiling (full-object load; not Range streaming). */
export const MAX_PRIVATE_MEDIA_BLOB_BYTES = 32 * 1024 * 1024;

/** Soft cap for auto-preloaded audio/voice blobs (still full-object). */
export const MAX_AUTO_PRELOAD_AUDIO_BYTES = 12 * 1024 * 1024;

/** Session cache entry count bound (LRU-ish by dropping zero-ref oldest first). */
export const MAX_MEDIA_OBJECT_URL_CACHE_ENTRIES = 64;

/** Soft memory budget for authenticated blob cache (~48MB). */
export const MAX_MEDIA_CACHE_BYTES = 48 * 1024 * 1024;

/** Prefer keeping recent conversation media longer (affinity weight in ms). */
export const MEDIA_CACHE_CONVERSATION_AFFINITY_MS = 15 * 60 * 1000;

const safeString = (value: unknown, fallback = ''): string =>
  typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback;

export const classifyMessagingMediaType = (raw?: string | null): MessagingMediaCategory => {
  const value = safeString(raw).toLowerCase();
  if (!value) return 'generic_file';
  if (value === 'voice_note' || value.includes('voice')) return 'voice_note';
  if (value === 'image' || value.startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(value)) {
    return 'image';
  }
  if (value === 'video' || value.startsWith('video/') || /\.(mp4|webm|mov|m4v|avi|mkv)$/i.test(value)) {
    return 'video';
  }
  if (
    value === 'audio' ||
    value.startsWith('audio/') ||
    /\.(mp3|wav|ogg|m4a|aac|webm)$/i.test(value)
  ) {
    return 'audio';
  }
  if (
    value === 'document' ||
    value === 'file' ||
    value.includes('pdf') ||
    value.includes('msword') ||
    value.includes('officedocument') ||
    /\.(pdf|docx?|xlsx?|pptx?|txt|csv|zip|rar)$/i.test(value)
  ) {
    return 'document';
  }
  return 'generic_file';
};

export const getAttachmentContentId = (attachment: any): string => {
  const directId = safeString(
    attachment?.fileId ??
      attachment?.file_id ??
      attachment?.id ??
      attachment?.attachmentId ??
      attachment?.attachment_id
  );
  if (directId && !/^https?:\/\//i.test(directId)) return directId;
  const directUrl = safeString(
    attachment?.url ??
      attachment?.contentUrl ??
      attachment?.content_url ??
      attachment?.downloadUrl ??
      attachment?.download_url ??
      attachment?.fallbackUrl ??
      attachment?.fallback_url ??
      attachment?.path
  );
  if (!directUrl) return '';
  const match = directUrl.match(/\/(?:api\/)?files\/content\/([^/?#]+)/i);
  return match?.[1] ? decodeURIComponent(match[1]) : '';
};

export const getAttachmentCacheKey = (attachment: any): string => {
  const contentId = getAttachmentContentId(attachment);
  if (contentId) return contentId;
  return safeString(
    attachment?.url ??
      attachment?.contentUrl ??
      attachment?.downloadUrl ??
      attachment?.fallbackUrl ??
      attachment?.path ??
      attachment?.id
  );
};

export const isPreviewableMessagingMedia = (category: MessagingMediaCategory): boolean =>
  category === 'image' || category === 'video' || category === 'audio' || category === 'voice_note';

/**
 * True when a native media element may use the URL without an Authorization header.
 * Private messenger files are uploaded as PRIVATE and API is cross-origin with SameSite=Lax
 * cookies, so bearer-backed content IDs generally require authenticated blob loading.
 * Public/absolute non-content URLs and explicit public assets can use direct URLs.
 */
export const canUseDirectMediaUrl = (attachment: NormalizedMessageAttachment): boolean => {
  if (!attachment.url) return false;
  if (attachment.requiresAuthFetch) return false;
  return true;
};

/**
 * Prefer native Range streaming when a direct authorized URL works.
 * Blob object URLs never support partial Range — they are full-object loads.
 */
export const prefersDirectRangeStreaming = (attachment: NormalizedMessageAttachment): boolean => {
  if (!attachment.canStream) return false;
  return canUseDirectMediaUrl(attachment);
};

export const isOversizedPrivateBlobPreview = (
  attachment: NormalizedMessageAttachment,
  maxBytes: number = MAX_PRIVATE_MEDIA_BLOB_BYTES
): boolean => {
  if (!attachment.requiresAuthFetch) return false;
  const size = Number(attachment.size || 0);
  return Number.isFinite(size) && size > maxBytes;
};

export const normalizeMessageAttachment = (
  attachment: any,
  options?: { forceVoiceNote?: boolean }
): NormalizedMessageAttachment | null => {
  if (!attachment) return null;

  if (typeof attachment === 'string') {
    const raw = attachment.trim();
    if (!raw) return null;
    // Never surface storage keys / absolute disk paths as display names.
    if (/^[A-Za-z]:\\/.test(raw) || raw.startsWith('\\\\') || raw.includes('/uploads/media/')) {
      return null;
    }
    const parts = raw.split('/');
    const name = parts[parts.length - 1] || raw;
    const fileId = !/^https?:\/\//i.test(raw) ? raw : getAttachmentContentId({ url: raw });
    const type = options?.forceVoiceNote ? 'voice_note' : classifyMessagingMediaType(name);
    return {
      id: raw,
      fileId: fileId || raw,
      url: /^https?:\/\//i.test(raw) ? raw : '',
      name,
      type,
      requiresAuthFetch: Boolean(fileId),
      canPreview: isPreviewableMessagingMedia(type),
      canStream: type === 'video' || type === 'audio' || type === 'voice_note'
    };
  }

  const fileId = getAttachmentContentId(attachment);
  const url = safeString(
    attachment.url ??
      attachment.contentUrl ??
      attachment.content_url ??
      attachment.downloadUrl ??
      attachment.download_url ??
      attachment.fallbackUrl ??
      attachment.fallback_url ??
      attachment.path
  );
  // Drop internal storage keys used as path-only payloads without a content id.
  if (!url && !fileId) return null;
  if (
    !fileId &&
    url &&
    !/^https?:\/\//i.test(url) &&
    !url.includes('/files/content/') &&
    (url.includes('uploads/media/') || url.startsWith('gs://') || url.startsWith('s3://'))
  ) {
    return null;
  }

  const name = safeString(
    attachment.name ??
      attachment.filename ??
      attachment.originalName ??
      attachment.original_name ??
      (url ? url.split('/').pop()?.split('?')[0] : '') ??
      'Attachment',
    'Attachment'
  );
  const mimeType = safeString(attachment.mimeType ?? attachment.mime_type);
  // MIME-first classification, then type label, then filename extension.
  let type = options?.forceVoiceNote
    ? 'voice_note'
    : classifyMessagingMediaType(mimeType || attachment.type || name);
  if (type === 'audio' && options?.forceVoiceNote) type = 'voice_note';
  if (
    !options?.forceVoiceNote &&
    type === 'audio' &&
    (safeString(attachment.type).toLowerCase() === 'voice_note' ||
      safeString(attachment.kind).toLowerCase() === 'voice_note')
  ) {
    type = 'voice_note';
  }

  const durationMsRaw = Number(
    attachment.durationMs ?? attachment.duration_ms ?? attachment.duration ?? 0
  );

  const stableId = safeString(attachment.id ?? fileId ?? url, fileId || url);

  return {
    id: stableId,
    fileId: fileId || '',
    url,
    name,
    type,
    size: Number(attachment.size || 0) || undefined,
    mimeType: mimeType || undefined,
    durationMs: Number.isFinite(durationMsRaw) && durationMsRaw > 0 ? durationMsRaw : undefined,
    requiresAuthFetch: Boolean(fileId),
    canPreview: isPreviewableMessagingMedia(type),
    canStream: type === 'video' || type === 'audio' || type === 'voice_note'
  };
};

export const extractMessageAttachments = (message: any): NormalizedMessageAttachment[] => {
  const list: NormalizedMessageAttachment[] = [];
  const seen = new Set<string>();
  const push = (value: any, forceVoiceNote = false) => {
    const normalized = normalizeMessageAttachment(value, { forceVoiceNote });
    if (!normalized) return;
    const key = getAttachmentCacheKey(normalized) || normalized.id;
    if (!key || seen.has(key)) return;
    seen.add(key);
    list.push(normalized);
  };

  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  attachments.forEach((entry) => push(entry, false));

  const voiceNote = message?.voiceNote || message?.voice_note;
  if (voiceNote) {
    push(
      {
        id: voiceNote.fileId || voiceNote.file_id || voiceNote.id || '',
        fileId: voiceNote.fileId || voiceNote.file_id || voiceNote.id || '',
        url: voiceNote.url || voiceNote.contentUrl || '',
        name: 'Voice note',
        type: 'voice_note',
        mimeType: voiceNote.mimeType || voiceNote.mime_type || 'audio/webm',
        durationMs: voiceNote.durationMs || voiceNote.duration_ms || voiceNote.duration,
        size: voiceNote.size
      },
      true
    );
  }

  const messageType = safeString(message?.messageType ?? message?.message_type).toLowerCase();
  if ((messageType === 'voice_note' || messageType === 'audio') && list.length === 0) {
    const meta = message?.metadata && typeof message.metadata === 'object' ? message.metadata : {};
    const voiceMeta = (meta as any).voiceNote || (meta as any).voice_note || meta;
    push(
      {
        id: voiceMeta?.fileId || voiceMeta?.file_id || message?.id || '',
        fileId: voiceMeta?.fileId || voiceMeta?.file_id || '',
        url: voiceMeta?.url || '',
        name: 'Voice note',
        type: 'voice_note',
        mimeType: 'audio/webm',
        durationMs: voiceMeta?.durationMs || voiceMeta?.duration_ms
      },
      true
    );
  }

  return list;
};

export const sanitizeDownloadFilename = (name?: string | null): string => {
  const base = safeString(name, 'attachment')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\.\.+/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  if (!base || base === '.' || base === '..') return 'attachment';
  return base.slice(0, 180);
};

/**
 * Parse Content-Disposition filename (quoted, unquoted, and RFC 5987 filename*).
 */
export const parseContentDispositionFilename = (header?: string | null): string => {
  const raw = safeString(header);
  if (!raw) return '';

  // RFC 5987: filename*=UTF-8''percent-encoded
  const starMatch = /filename\*\s*=\s*(?:UTF-8''|utf-8'')([^;]+)/i.exec(raw);
  if (starMatch?.[1]) {
    try {
      const decoded = decodeURIComponent(starMatch[1].trim().replace(/^["']|["']$/g, ''));
      return sanitizeDownloadFilename(decoded);
    } catch {
      // fall through
    }
  }

  const quoted = /filename\s*=\s*"((?:\\.|[^"\\])*)"/i.exec(raw);
  if (quoted?.[1]) {
    return sanitizeDownloadFilename(quoted[1].replace(/\\(.)/g, '$1'));
  }

  const unquoted = /filename\s*=\s*([^;]+)/i.exec(raw);
  if (unquoted?.[1]) {
    return sanitizeDownloadFilename(unquoted[1].replace(/^["']|["']$/g, ''));
  }

  return '';
};

export const formatMediaBytes = (bytes?: number | null): string => {
  const value = Number(bytes || 0);
  if (!Number.isFinite(value) || value <= 0) return '';
  if (value < 1024) return `${Math.trunc(value)} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
};

export const formatMediaDuration = (durationMs?: number | null): string => {
  const ms = Number(durationMs || 0);
  if (!Number.isFinite(ms) || ms <= 0) return '';
  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

type CacheEntry = {
  objectUrl: string;
  refCount: number;
  byteSize: number;
  lastUsedAt: number;
  conversationId?: string;
};

/** In-memory authenticated blob cache (session only), reference-counted. */
const objectUrlCache = new Map<string, CacheEntry>();
const inflightByKey = new Map<string, Promise<string>>();
/** Generation bumped on full clear so stale inflight cannot repopulate cache. */
let cacheGeneration = 0;
let activeConversationAffinity = '';

const touchEntry = (entry: CacheEntry) => {
  entry.lastUsedAt = Date.now();
};

const revokeEntry = (key: string, entry: CacheEntry) => {
  try {
    URL.revokeObjectURL(entry.objectUrl);
  } catch {
    // ignore
  }
  objectUrlCache.delete(key);
};

const totalCacheBytes = () =>
  Array.from(objectUrlCache.values()).reduce((sum, entry) => sum + (Number(entry.byteSize) || 0), 0);

/** Hint which conversation is on screen so affinity pruning prefers other threads first. */
export const setMessagingMediaConversationAffinity = (conversationId?: string | null) => {
  activeConversationAffinity = safeString(conversationId);
};

const pruneScore = (entry: CacheEntry, now: number) => {
  let score = entry.lastUsedAt;
  if (entry.conversationId && entry.conversationId === activeConversationAffinity) {
    score += MEDIA_CACHE_CONVERSATION_AFFINITY_MS;
  }
  // Prefer keeping recently used; lower score evicts first.
  return score - Math.min(entry.byteSize / 1024, 5000);
};

const pruneZeroRefEntries = () => {
  const now = Date.now();
  const overCount = objectUrlCache.size > MAX_MEDIA_OBJECT_URL_CACHE_ENTRIES;
  const overBytes = totalCacheBytes() > MAX_MEDIA_CACHE_BYTES;
  if (!overCount && !overBytes) return;

  const zeroRef = Array.from(objectUrlCache.entries())
    .filter(([, entry]) => entry.refCount <= 0)
    .sort((a, b) => pruneScore(a[1], now) - pruneScore(b[1], now));

  for (const [key, entry] of zeroRef) {
    if (objectUrlCache.size <= MAX_MEDIA_OBJECT_URL_CACHE_ENTRIES && totalCacheBytes() <= MAX_MEDIA_CACHE_BYTES) {
      break;
    }
    revokeEntry(key, entry);
  }
};

/** Retain a cached object URL for a mounted consumer. Safe no-op if key missing. */
export const retainAuthenticatedMediaUrl = (cacheKey: string): string | null => {
  const key = safeString(cacheKey);
  if (!key) return null;
  const entry = objectUrlCache.get(key);
  if (!entry) return null;
  entry.refCount += 1;
  touchEntry(entry);
  return entry.objectUrl;
};

/**
 * Release a consumer hold. Revokes only when refCount reaches 0.
 * Never revokes while another mounted renderer still holds the URL.
 */
export const releaseAuthenticatedMediaUrl = (cacheKey: string) => {
  const key = safeString(cacheKey);
  if (!key) return;
  const entry = objectUrlCache.get(key);
  if (!entry) return;
  entry.refCount = Math.max(0, entry.refCount - 1);
  touchEntry(entry);
  // Keep zero-ref entries briefly for re-mount / scroll reuse until prune/logout.
  pruneZeroRefEntries();
};

/** Force-revoke one attachment key (unsend / delete-for-me / replacement). */
export const revokeAuthenticatedMediaUrl = (cacheKey: string) => {
  const key = safeString(cacheKey);
  if (!key) return;
  inflightByKey.delete(key);
  const entry = objectUrlCache.get(key);
  if (!entry) return;
  revokeEntry(key, entry);
};

/** Revoke multiple attachment keys from a deleted/unsent message payload. */
export const revokeMessageAttachmentMediaUrls = (message: any) => {
  const list = extractMessageAttachments(message);
  list.forEach((attachment) => {
    const key = getAttachmentCacheKey(attachment);
    if (key) revokeAuthenticatedMediaUrl(key);
  });
};

/** Logout / full session teardown — clear all private blob URLs. */
export const revokeAllAuthenticatedMediaUrls = () => {
  cacheGeneration += 1;
  Array.from(objectUrlCache.entries()).forEach(([key, entry]) => revokeEntry(key, entry));
  inflightByKey.clear();
};

/** Test helper: snapshot of refcounts (not for production UI). */
export const getAuthenticatedMediaCacheDebugState = () =>
  Array.from(objectUrlCache.entries()).map(([key, entry]) => ({
    key,
    refCount: entry.refCount,
    byteSize: entry.byteSize,
    objectUrl: entry.objectUrl
  }));

/** Test helper: seed a cache entry without network. */
export const __testOnlySeedAuthenticatedMediaCache = (
  cacheKey: string,
  objectUrl: string,
  refCount = 0,
  byteSize = 0
) => {
  const key = safeString(cacheKey);
  if (!key || !objectUrl) return;
  objectUrlCache.set(key, {
    objectUrl,
    refCount: Math.max(0, refCount),
    byteSize: Math.max(0, byteSize),
    lastUsedAt: Date.now()
  });
};

export const getAuthenticatedMediaCacheByteTotal = () => totalCacheBytes();

const readHeader = (headers: any, name: string): string => {
  if (!headers) return '';
  const lower = name.toLowerCase();
  if (typeof headers.get === 'function') {
    return safeString(headers.get(name) || headers.get(lower));
  }
  const direct = headers[name] ?? headers[lower];
  if (Array.isArray(direct)) return safeString(direct[0]);
  return safeString(direct);
};

const assertUsableMediaBlob = (blob: Blob) => {
  if (!(blob instanceof Blob)) {
    throw new Error('Invalid media response');
  }
  if (blob.size === 0) {
    throw new Error('Empty media response');
  }
  const type = safeString(blob.type).toLowerCase();
  if (type.includes('application/json') || type.includes('text/html') || type.includes('text/plain')) {
    // API error bodies often arrive as JSON blobs when auth fails.
    throw new Error('Media unavailable');
  }
};

export type FetchAuthenticatedMediaOptions = {
  signal?: AbortSignal;
  force?: boolean;
  /** Max full-object bytes allowed for this fetch (private blob path). */
  maxBytes?: number;
  /** When true, skip retain (caller will retain explicitly). Default retains once. */
  skipRetain?: boolean;
  /** Optional conversation affinity for smart cache eviction. */
  conversationId?: string;
};

export const fetchAuthenticatedMediaObjectUrl = async (
  attachment: NormalizedMessageAttachment,
  options?: FetchAuthenticatedMediaOptions
): Promise<string> => {
  const cacheKey = getAttachmentCacheKey(attachment);
  if (!cacheKey) {
    if (attachment.url && canUseDirectMediaUrl(attachment)) return attachment.url;
    throw new Error('No media content id');
  }

  const maxBytes = options?.maxBytes ?? MAX_PRIVATE_MEDIA_BLOB_BYTES;
  if (isOversizedPrivateBlobPreview(attachment, maxBytes)) {
    const err = new Error('preview_too_large');
    (err as any).code = 'preview_too_large';
    throw err;
  }

  const generationAtStart = cacheGeneration;

  if (!options?.force) {
    const existing = objectUrlCache.get(cacheKey);
    if (existing) {
      if (!options?.skipRetain) {
        existing.refCount += 1;
      }
      touchEntry(existing);
      return existing.objectUrl;
    }
    if (inflightByKey.has(cacheKey)) {
      const shared = await inflightByKey.get(cacheKey)!;
      if (!options?.skipRetain) {
        const entry = objectUrlCache.get(cacheKey);
        if (entry) {
          entry.refCount += 1;
          touchEntry(entry);
        }
      }
      return shared;
    }
  }

  const request = (async () => {
    let blob: Blob;
    let responseHeaders: any = null;
    const contentId = getAttachmentContentId(attachment);
    if (contentId) {
      // Dynamic import keeps pure normalization unit-testable without Vite env.
      const { default: api } = await import('./api');
      const response = await api.get(`/files/content/${encodeURIComponent(contentId)}`, {
        responseType: 'blob',
        signal: options?.signal
      } as any);
      responseHeaders = response?.headers;
      blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
    } else if (attachment.url) {
      const response = await fetch(attachment.url, {
        credentials: 'include',
        signal: options?.signal
      });
      if (!response.ok) {
        const statusErr = new Error(`Media fetch failed (${response.status})`);
        (statusErr as any).status = response.status;
        throw statusErr;
      }
      responseHeaders = response.headers;
      blob = await response.blob();
    } else {
      throw new Error('No media source');
    }

    if (options?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    assertUsableMediaBlob(blob);

    if (blob.size > maxBytes) {
      const err = new Error('preview_too_large');
      (err as any).code = 'preview_too_large';
      (err as any).byteSize = blob.size;
      throw err;
    }

    // Ignore Content-Disposition on preview path (download path uses it).
    void responseHeaders;

    if (generationAtStart !== cacheGeneration) {
      // Logout cleared cache while fetch was in flight — do not repopulate.
      throw new Error('Media cache cleared');
    }

    const objectUrl = URL.createObjectURL(blob);
    const previous = objectUrlCache.get(cacheKey);
    // Force/replace: always drop the prior entry so consumers re-retain the new URL.
    // Callers that still hold the old URL must release it (renderer does this before force).
    if (previous && previous.objectUrl !== objectUrl) {
      revokeEntry(cacheKey, previous);
    }

    objectUrlCache.set(cacheKey, {
      objectUrl,
      refCount: 0,
      byteSize: blob.size,
      lastUsedAt: Date.now(),
      conversationId: safeString(options?.conversationId) || activeConversationAffinity || undefined
    });
    pruneZeroRefEntries();
    return objectUrl;
  })();

  inflightByKey.set(cacheKey, request);
  try {
    const url = await request;
    if (!options?.skipRetain) {
      const entry = objectUrlCache.get(cacheKey);
      if (entry) {
        entry.refCount += 1;
        touchEntry(entry);
      }
    }
    return url;
  } finally {
    inflightByKey.delete(cacheKey);
  }
};

export type DownloadMessageAttachmentResult = {
  filename: string;
  byteSize: number;
};

const activeDownloadKeys = new Set<string>();

export const downloadMessageAttachment = async (
  attachment: NormalizedMessageAttachment
): Promise<DownloadMessageAttachmentResult> => {
  const cacheKey = getAttachmentCacheKey(attachment) || attachment.id || attachment.name;
  if (cacheKey && activeDownloadKeys.has(cacheKey)) {
    const err = new Error('download_in_progress');
    (err as any).code = 'download_in_progress';
    throw err;
  }
  if (cacheKey) activeDownloadKeys.add(cacheKey);

  const fallbackFilename = sanitizeDownloadFilename(attachment.name);
  const triggerDownload = (objectUrl: string, filename: string, revokeAfter: boolean) => {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename;
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    if (revokeAfter) {
      window.setTimeout(() => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch {
          // ignore
        }
      }, 1500);
    }
  };

  const fallbackOpen = () => {
    if (!attachment.url) return;
    // Never auto-open executables inline; still force download attribute when possible.
    const link = document.createElement('a');
    link.href = attachment.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.download = fallbackFilename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  try {
    let blob: Blob;
    let headers: any = null;
    const contentId = getAttachmentContentId(attachment);
    if (contentId) {
      const { default: api } = await import('./api');
      const response = await api.get(`/files/content/${encodeURIComponent(contentId)}`, {
        responseType: 'blob'
      });
      headers = response?.headers;
      blob = response.data instanceof Blob ? response.data : new Blob([response.data]);
    } else if (attachment.url) {
      const response = await fetch(attachment.url, { credentials: 'include' });
      if (!response.ok) {
        const statusErr = new Error(`Download failed (${response.status})`);
        (statusErr as any).status = response.status;
        throw statusErr;
      }
      headers = response.headers;
      blob = await response.blob();
    } else {
      throw new Error('No download source');
    }

    assertUsableMediaBlob(blob);

    const headerName = parseContentDispositionFilename(readHeader(headers, 'content-disposition'));
    const filename = headerName || fallbackFilename;
    const objectUrl = URL.createObjectURL(blob);
    triggerDownload(objectUrl, filename, true);
    return { filename, byteSize: blob.size };
  } catch (error: any) {
    if (error?.code === 'download_in_progress') throw error;
    // Fallback only for non-auth hard failures with a usable URL.
    if (attachment.url && !attachment.requiresAuthFetch) {
      fallbackOpen();
      return { filename: fallbackFilename, byteSize: 0 };
    }
    const status = Number(error?.response?.status || error?.status || 0);
    if (status === 401) {
      const err = new Error('Sign in required to download this file');
      (err as any).status = 401;
      throw err;
    }
    if (status === 403) {
      const err = new Error('You do not have access to download this file');
      (err as any).status = 403;
      throw err;
    }
    throw error instanceof Error ? error : new Error('Download failed');
  } finally {
    if (cacheKey) activeDownloadKeys.delete(cacheKey);
  }
};

export const shouldAutoPreloadMessagingMedia = (
  category: MessagingMediaCategory,
  options?: { saveData?: boolean; size?: number | null }
): boolean => {
  // "Auto-preload" means in-memory blob/object-URL preparation only — never save to Downloads.
  if (options?.saveData) {
    return category === 'image';
  }
  if (category === 'video') return false;
  if (category === 'image') return true;
  if (category === 'audio' || category === 'voice_note') {
    const size = Number(options?.size || 0);
    if (Number.isFinite(size) && size > MAX_AUTO_PRELOAD_AUDIO_BYTES) return false;
    return true;
  }
  return false;
};

/**
 * Build a content path that may stream with native Range when the browser can
 * authorize without a bearer header (public media, or same-site cookie auth).
 * Production SPA (scrolith.com) → API (api.scrolith.com) with SameSite=Lax will
 * typically NOT send cookies on media element loads, so private messenger files
 * still require authenticated blob loading.
 */
export const buildMessagingContentUrlPath = (fileId: string): string => {
  const id = safeString(fileId);
  if (!id) return '';
  return `/api/files/content/${encodeURIComponent(id)}`;
};
