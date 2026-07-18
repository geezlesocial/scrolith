/**
 * Phase 20.2.6R — persistent media disk cache (IndexedDB).
 * Stores private message media blobs + metadata with LRU eviction.
 */

import {
  incrementMessagingCounter,
  recordMessagingMetric
} from './messagingTelemetry';

const DB_NAME = 'scrolith-media-cache-v1';
const DB_VERSION = 1;
const STORE = 'blobs';
const META_STORE = 'meta';

/** Soft disk budget (~120MB). */
export const MAX_DISK_CACHE_BYTES = 120 * 1024 * 1024;
export const MAX_DISK_CACHE_ENTRIES = 200;

export type DiskCacheMeta = {
  key: string;
  byteSize: number;
  mimeType?: string;
  conversationId?: string;
  kind?: 'image' | 'video' | 'audio' | 'voice_note' | 'document' | 'avatar' | 'thumbnail' | 'generic';
  createdAt: number;
  lastAccessAt: number;
  checksum?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  blurDataUrl?: string;
};

type CacheDb = IDBDatabase;

let dbPromise: Promise<CacheDb | null> | null = null;

const isBrowser = () => typeof window !== 'undefined' && typeof indexedDB !== 'undefined';

const openDb = (): Promise<CacheDb | null> => {
  if (!isBrowser()) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
        if (!db.objectStoreNames.contains(META_STORE)) {
          const meta = db.createObjectStore(META_STORE, { keyPath: 'key' });
          meta.createIndex('lastAccessAt', 'lastAccessAt', { unique: false });
          meta.createIndex('conversationId', 'conversationId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
};

const idbRequest = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('idb_error'));
  });

const listMeta = async (db: CacheDb): Promise<DiskCacheMeta[]> => {
  const tx = db.transaction(META_STORE, 'readonly');
  const store = tx.objectStore(META_STORE);
  const rows = await idbRequest(store.getAll());
  return Array.isArray(rows) ? (rows as DiskCacheMeta[]) : [];
};

const totalBytes = (rows: DiskCacheMeta[]) =>
  rows.reduce((sum, row) => sum + (Number(row.byteSize) || 0), 0);

const pruneIfNeeded = async (db: CacheDb) => {
  let rows = await listMeta(db);
  if (rows.length <= MAX_DISK_CACHE_ENTRIES && totalBytes(rows) <= MAX_DISK_CACHE_BYTES) return;

  rows = rows.sort((a, b) => (a.lastAccessAt || 0) - (b.lastAccessAt || 0));
  const tx = db.transaction([META_STORE, STORE], 'readwrite');
  const metaStore = tx.objectStore(META_STORE);
  const blobStore = tx.objectStore(STORE);

  for (const row of rows) {
    const remaining = await listMeta(db);
    if (remaining.length <= MAX_DISK_CACHE_ENTRIES && totalBytes(remaining) <= MAX_DISK_CACHE_BYTES) {
      break;
    }
    metaStore.delete(row.key);
    blobStore.delete(row.key);
    incrementMessagingCounter('disk_cache_evict');
  }

  await new Promise<void>((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('prune_failed'));
  });
};

export const putDiskCacheBlob = async (
  key: string,
  blob: Blob,
  meta?: Partial<DiskCacheMeta>
): Promise<boolean> => {
  const cacheKey = String(key || '').trim();
  if (!cacheKey || !(blob instanceof Blob) || blob.size <= 0) return false;
  const db = await openDb();
  if (!db) return false;

  try {
    const entry: DiskCacheMeta = {
      key: cacheKey,
      byteSize: blob.size,
      mimeType: blob.type || meta?.mimeType,
      conversationId: meta?.conversationId,
      kind: meta?.kind || 'generic',
      createdAt: meta?.createdAt || Date.now(),
      lastAccessAt: Date.now(),
      checksum: meta?.checksum,
      width: meta?.width,
      height: meta?.height,
      durationMs: meta?.durationMs,
      blurDataUrl: meta?.blurDataUrl
    };

    const tx = db.transaction([META_STORE, STORE], 'readwrite');
    tx.objectStore(META_STORE).put(entry);
    tx.objectStore(STORE).put(blob, cacheKey);
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error || new Error('put_failed'));
    });
    await pruneIfNeeded(db);
    incrementMessagingCounter('disk_cache_put');
    return true;
  } catch {
    return false;
  }
};

export const getDiskCacheBlob = async (key: string): Promise<{ blob: Blob; meta: DiskCacheMeta } | null> => {
  const cacheKey = String(key || '').trim();
  if (!cacheKey) return null;
  const db = await openDb();
  if (!db) return null;

  try {
    const tx = db.transaction([META_STORE, STORE], 'readwrite');
    const meta = (await idbRequest(tx.objectStore(META_STORE).get(cacheKey))) as DiskCacheMeta | undefined;
    const blob = (await idbRequest(tx.objectStore(STORE).get(cacheKey))) as Blob | undefined;
    if (!meta || !(blob instanceof Blob) || blob.size <= 0) {
      recordMessagingMetric('cache_miss', 1);
      return null;
    }
    meta.lastAccessAt = Date.now();
    tx.objectStore(META_STORE).put(meta);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
    recordMessagingMetric('cache_hit', 1);
    incrementMessagingCounter('disk_cache_hit');
    return { blob, meta };
  } catch {
    recordMessagingMetric('cache_miss', 1);
    return null;
  }
};

export const getDiskCacheMeta = async (key: string): Promise<DiskCacheMeta | null> => {
  const cacheKey = String(key || '').trim();
  if (!cacheKey) return null;
  const db = await openDb();
  if (!db) return null;
  try {
    const tx = db.transaction(META_STORE, 'readonly');
    const meta = (await idbRequest(tx.objectStore(META_STORE).get(cacheKey))) as DiskCacheMeta | undefined;
    return meta || null;
  } catch {
    return null;
  }
};

export const deleteDiskCacheKey = async (key: string): Promise<void> => {
  const cacheKey = String(key || '').trim();
  if (!cacheKey) return;
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction([META_STORE, STORE], 'readwrite');
    tx.objectStore(META_STORE).delete(cacheKey);
    tx.objectStore(STORE).delete(cacheKey);
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
};

export const clearDiskCache = async (): Promise<void> => {
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction([META_STORE, STORE], 'readwrite');
    tx.objectStore(META_STORE).clear();
    tx.objectStore(STORE).clear();
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // ignore
  }
};

export const getDiskCacheStats = async () => {
  const db = await openDb();
  if (!db) return { entries: 0, bytes: 0, available: false };
  try {
    const rows = await listMeta(db);
    return { entries: rows.length, bytes: totalBytes(rows), available: true };
  } catch {
    return { entries: 0, bytes: 0, available: false };
  }
};

/** Simple content checksum for integrity (SHA-256 hex). */
export const checksumBlob = async (blob: Blob): Promise<string> => {
  if (typeof crypto === 'undefined' || !crypto.subtle) return `size:${blob.size}`;
  try {
    const buffer = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest('SHA-256', buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return `size:${blob.size}`;
  }
};
