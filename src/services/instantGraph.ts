/**
 * Scrolith Instant Graph - Phase 1 client runtime.
 *
 * The graph is deliberately additive: it never becomes the source of truth for
 * writes or auth. It only restores a recent, user-scoped read snapshot while
 * the existing live requests continue in the background.
 */
import api from './api';
import { resolveAssetUrl } from '../utils/assetUrl';

export const INSTANT_GRAPH_VERSION = 'phase1.1.0';
export const INSTANT_GRAPH_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const INSTANT_GRAPH_FRESH_TTL_MS = 5 * 60 * 1000;
export const INSTANT_GRAPH_MAX_BYTES = 5 * 1024 * 1024;
export const INSTANT_GRAPH_MAX_SNAPSHOTS = 12;
export const INSTANT_GRAPH_MEDIA_CACHE_NAME = 'scrolith-instant-media-v1';
export const INSTANT_GRAPH_MEDIA_MAX_ENTRIES = 80;

const DB_NAME = 'scrolith-instant-graph-v1';
const DB_VERSION = 1;
const SNAPSHOT_STORE = 'snapshots';
const FALLBACK_PREFIX = 'scrolith:instant-graph:';
const BUILD_ENABLED = String(import.meta.env.VITE_INSTANT_GRAPH_ENABLED || '').toLowerCase() === 'true';

export type InstantGraphConfig = {
  enabled: boolean;
  rolloutPercent: number;
  version: string;
  feedTtlMs: number;
  mediaBudgetBytes: number;
};

export type InstantGraphFeedSnapshot = {
  posts: any[];
  stream?: any[];
  cursor?: string | null;
};

export type InstantGraphSnapshot = {
  key: string;
  userId: string;
  savedAt: number;
  critical?: {
    user?: Record<string, unknown> | null;
    notificationSummary?: Record<string, unknown> | null;
    conversations?: any[];
  };
  feed?: InstantGraphFeedSnapshot;
};

export type InstantGraphMetricName =
  | 'cache_hit'
  | 'cache_miss'
  | 'prefetch_success'
  | 'prefetch_error'
  | 'storage_bytes'
  | 'hydration_ms'
  | 'sw_registered';

const DEFAULT_CONFIG: InstantGraphConfig = {
  enabled: BUILD_ENABLED,
  rolloutPercent: BUILD_ENABLED ? 100 : 0,
  version: INSTANT_GRAPH_VERSION,
  feedTtlMs: INSTANT_GRAPH_FRESH_TTL_MS,
  mediaBudgetBytes: 60 * 1024 * 1024
};

let configPromise: Promise<InstantGraphConfig> | null = null;
let configFetchedAt = 0;
let config: InstantGraphConfig = DEFAULT_CONFIG;
let dbPromise: Promise<IDBDatabase | null> | null = null;
const metricCounts = new Map<InstantGraphMetricName, number>();
let metricFlushTimer: ReturnType<typeof setTimeout> | null = null;

const isBrowser = () => typeof window !== 'undefined';
const normalizedUserId = (value: unknown) => String(value || '').trim().slice(0, 160);
const snapshotKey = (userId: string) => `${INSTANT_GRAPH_VERSION}:${normalizedUserId(userId)}:member_home`;
const estimateBytes = (value: unknown) => {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 0;
    }
  }
};

const getConnection = () => {
  if (typeof navigator === 'undefined') return null;
  return (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection || null;
};

export const getInstantGraphNetworkPolicy = () => {
  const connection = getConnection();
  const effectiveType = String(connection?.effectiveType || '').toLowerCase();
  const constrained = Boolean(
    connection?.saveData ||
      effectiveType === 'slow-2g' ||
      effectiveType === '2g' ||
      (Number(connection?.downlink || 0) > 0 && Number(connection.downlink) < 1.2)
  );
  return {
    online: typeof navigator === 'undefined' || navigator.onLine !== false,
    constrained,
    allowBackgroundPrefetch: (typeof navigator === 'undefined' || navigator.onLine !== false) && !constrained
  };
};

const openDb = (): Promise<IDBDatabase | null> => {
  if (!isBrowser() || typeof indexedDB === 'undefined') return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(SNAPSHOT_STORE)) {
          const store = db.createObjectStore(SNAPSHOT_STORE, { keyPath: 'key' });
          store.createIndex('savedAt', 'savedAt', { unique: false });
          store.createIndex('userId', 'userId', { unique: false });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
};

const idbRequest = <T,>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('instant_graph_idb_error'));
  });

const readFallback = (userId: string): InstantGraphSnapshot | null => {
  try {
    const raw = localStorage.getItem(`${FALLBACK_PREFIX}${normalizedUserId(userId)}`);
    return raw ? (JSON.parse(raw) as InstantGraphSnapshot) : null;
  } catch {
    return null;
  }
};

const writeFallback = (snapshot: InstantGraphSnapshot) => {
  try {
    const serialized = JSON.stringify(snapshot);
    // localStorage is a fallback only; do not allow a large feed to block the app.
    if (serialized.length <= 900_000) localStorage.setItem(`${FALLBACK_PREFIX}${snapshot.userId}`, serialized);
  } catch {
    // Storage quota and private browsing failures are expected and non-fatal.
  }
};

const pruneSnapshots = async (db: IDBDatabase) => {
  try {
    const readTx = db.transaction(SNAPSHOT_STORE, 'readonly');
    const rows = (await idbRequest(readTx.objectStore(SNAPSHOT_STORE).getAll())) as InstantGraphSnapshot[];
    const ordered = rows.sort((a, b) => Number(b.savedAt || 0) - Number(a.savedAt || 0));
    let total = ordered.reduce((sum, row) => sum + estimateBytes(row), 0);
    const deleteKeys: string[] = [];
    ordered.slice(INSTANT_GRAPH_MAX_SNAPSHOTS).forEach((row) => {
      deleteKeys.push(row.key);
      total -= estimateBytes(row);
    });
    for (const row of ordered.slice(0, INSTANT_GRAPH_MAX_SNAPSHOTS).reverse()) {
      if (total <= INSTANT_GRAPH_MAX_BYTES) break;
      deleteKeys.push(row.key);
      total -= estimateBytes(row);
    }
    if (!deleteKeys.length) return;
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    const store = tx.objectStore(SNAPSHOT_STORE);
    deleteKeys.forEach((key) => store.delete(key));
    await new Promise<void>((resolve) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Pruning must never affect feed rendering.
  }
};

const readSnapshot = async (userId: string): Promise<InstantGraphSnapshot | null> => {
  const normalized = normalizedUserId(userId);
  if (!normalized) return null;
  const db = await openDb();
  if (db) {
    try {
      const tx = db.transaction(SNAPSHOT_STORE, 'readonly');
      const row = (await idbRequest(tx.objectStore(SNAPSHOT_STORE).get(snapshotKey(normalized)))) as InstantGraphSnapshot | undefined;
      if (row) return row;
    } catch {
      // Fall back to localStorage below.
    }
  }
  return readFallback(normalized);
};

export const readInstantGraphSnapshot = async (userId: string): Promise<InstantGraphSnapshot | null> => {
  if (!BUILD_ENABLED) return null;
  const runtime = await getInstantGraphConfig();
  if (!runtime.enabled) return null;
  const startedAt = Date.now();
  const row = await readSnapshot(userId);
  if (!row || Date.now() - Number(row.savedAt || 0) > INSTANT_GRAPH_CACHE_TTL_MS) {
    trackInstantGraphMetric('cache_miss');
    return null;
  }
  trackInstantGraphMetric('cache_hit');
  trackInstantGraphMetric('hydration_ms', Date.now() - startedAt);
  return row;
};

export const writeInstantGraphSnapshot = async (
  userId: string,
  patch: Omit<InstantGraphSnapshot, 'key' | 'userId' | 'savedAt'>
): Promise<void> => {
  if (!BUILD_ENABLED) return;
  const normalized = normalizedUserId(userId);
  if (!normalized) return;
  const existing = (await readSnapshot(normalized)) || undefined;
  const row: InstantGraphSnapshot = {
    ...(existing || {}),
    ...patch,
    key: snapshotKey(normalized),
    userId: normalized,
    savedAt: Date.now()
  };
  if (estimateBytes(row) > INSTANT_GRAPH_MAX_BYTES) {
    // Keep critical metadata and a bounded feed head if a server response grows unexpectedly.
    row.feed = row.feed
      ? { ...row.feed, posts: Array.isArray(row.feed.posts) ? row.feed.posts.slice(0, 24) : [] }
      : undefined;
  }
  const db = await openDb();
  if (db) {
    try {
      const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
      tx.objectStore(SNAPSHOT_STORE).put(row);
      await new Promise<void>((resolve) => {
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
      await pruneSnapshots(db);
      trackInstantGraphMetric('storage_bytes', estimateBytes(row));
      return;
    } catch {
      // Fall through to the bounded localStorage path.
    }
  }
  writeFallback(row);
  trackInstantGraphMetric('storage_bytes', estimateBytes(row));
};

export const clearInstantGraphUser = async (userId: string | null | undefined): Promise<void> => {
  const normalized = normalizedUserId(userId);
  if (!normalized) return;
  try {
    localStorage.removeItem(`${FALLBACK_PREFIX}${normalized}`);
  } catch {
    // ignore
  }
  const db = await openDb();
  if (!db) return;
  try {
    const tx = db.transaction(SNAPSHOT_STORE, 'readwrite');
    tx.objectStore(SNAPSHOT_STORE).delete(snapshotKey(normalized));
  } catch {
    // ignore
  }
};

export const isInstantGraphEnabled = () => config.enabled && BUILD_ENABLED;

export const getInstantGraphConfig = async (): Promise<InstantGraphConfig> => {
  if (!BUILD_ENABLED) return DEFAULT_CONFIG;
  // Refresh the remote gate periodically so an operator can stop the feature
  // without waiting for users to restart the app. Offline sessions continue
  // using the last safe local configuration.
  if (configPromise && Date.now() - configFetchedAt < 60_000) return configPromise;
  configPromise = api
    .get('/instant-graph/config', { timeout: 8000, __skipRetry: true } as any)
    .then((response) => {
      const remote = response?.data?.data || response?.data || {};
      config = {
        ...DEFAULT_CONFIG,
        ...remote,
        enabled: Boolean(remote.enabled) && BUILD_ENABLED,
        rolloutPercent: Math.max(0, Math.min(100, Number(remote.rolloutPercent ?? DEFAULT_CONFIG.rolloutPercent)))
      };
      configFetchedAt = Date.now();
      return config;
    })
    .catch(() => {
      config = configFetchedAt > 0 ? config : DEFAULT_CONFIG;
      configFetchedAt = Date.now();
      return config;
    });
  return configPromise;
};

const canWarmMedia = (raw: string) => {
  try {
    const resolved = new URL(resolveAssetUrl(raw), window.location.origin);
    const path = resolved.pathname.toLowerCase();
    const imageLike = /\.(avif|gif|jpe?g|png|webp)(?:$|\?)/i.test(path) || path.includes('/api/files/content/');
    const allowedHost = resolved.origin === window.location.origin || /(^|\.)api\.scrolith\.com$/i.test(resolved.hostname);
    return imageLike && allowedHost;
  } catch {
    return false;
  }
};

const hasStorageHeadroom = async (budgetBytes: number) => {
  try {
    const estimate = await (navigator as any).storage?.estimate?.();
    if (!estimate?.quota) return true;
    return Number(estimate.usage || 0) + budgetBytes < Number(estimate.quota) * 0.75;
  } catch {
    return true;
  }
};

export const warmInstantGraphMedia = async (
  rawUrl: string,
  options?: { priority?: 'high' | 'low'; signal?: AbortSignal }
): Promise<boolean> => {
  if (!BUILD_ENABLED || !isBrowser() || !getInstantGraphNetworkPolicy().allowBackgroundPrefetch) return false;
  const url = resolveAssetUrl(String(rawUrl || '').trim());
  if (!url || !canWarmMedia(url) || options?.signal?.aborted) return false;
  if (!(await hasStorageHeadroom(512 * 1024))) return false;
  try {
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(INSTANT_GRAPH_MEDIA_CACHE_NAME);
      const cached = await cache.match(url);
      if (cached) {
        trackInstantGraphMetric('cache_hit');
        return true;
      }
    }
    const response = await fetch(url, {
      method: 'GET',
      cache: 'force-cache',
      credentials: 'omit',
      signal: options?.signal
    });
    if (!response.ok) return false;
    if (typeof caches !== 'undefined') {
      const cache = await caches.open(INSTANT_GRAPH_MEDIA_CACHE_NAME);
      await cache.put(url, response.clone());
      const requests = await cache.keys();
      if (requests.length > INSTANT_GRAPH_MEDIA_MAX_ENTRIES) {
        const excess = requests.slice(0, requests.length - INSTANT_GRAPH_MEDIA_MAX_ENTRIES);
        await Promise.all(excess.map((request) => cache.delete(request)));
      }
    }
    trackInstantGraphMetric('prefetch_success');
    return true;
  } catch {
    trackInstantGraphMetric('prefetch_error');
    return false;
  }
};

export const warmInstantGraphMediaBatch = async (
  urls: string[],
  options?: { signal?: AbortSignal; max?: number }
) => {
  const unique = Array.from(new Set((urls || []).map((url) => String(url || '').trim()).filter(Boolean))).slice(0, options?.max || 12);
  const queue = [...unique];
  const workers = Array.from({ length: 2 }, async () => {
    while (queue.length && !options?.signal?.aborted) {
      const next = queue.shift();
      if (next) await warmInstantGraphMedia(next, options);
    }
  });
  await Promise.all(workers);
};

export const collectInstantGraphMediaUrls = (posts: any[]): string[] => {
  const urls: string[] = [];
  const push = (value: unknown) => {
    const normalized = String(value || '').trim();
    if (normalized) urls.push(normalized);
  };
  (Array.isArray(posts) ? posts : []).slice(0, 12).forEach((post) => {
    push(post?.author?.avatarUrl || post?.author?.avatar || post?.authorAvatar);
    (Array.isArray(post?.attachments) ? post.attachments : []).slice(0, 2).forEach((attachment: any) => {
      push(attachment?.thumbnailUrl || attachment?.posterUrl || attachment?.url);
    });
  });
  return Array.from(new Set(urls));
};

export const warmCriticalInstantGraph = async (userId: string, signal?: AbortSignal) => {
  const runtime = await getInstantGraphConfig();
  if (!runtime.enabled || !getInstantGraphNetworkPolicy().allowBackgroundPrefetch) return;
  try {
    const response = await api.get('/instant-graph/bootstrap', {
      params: { includeFeed: 'false' },
      signal,
      timeout: 12000,
      __skipRetry: true
    } as any);
    const data = response?.data?.data || response?.data || {};
    await writeInstantGraphSnapshot(userId, {
      critical: {
        notificationSummary: data.notificationSummary || null,
        conversations: Array.isArray(data.conversations) ? data.conversations : []
      }
    });
    trackInstantGraphMetric('prefetch_success');
  } catch {
    trackInstantGraphMetric('prefetch_error');
  }
};

export const trackInstantGraphMetric = (name: InstantGraphMetricName, value = 1) => {
  metricCounts.set(name, (metricCounts.get(name) || 0) + Math.max(0, Number(value) || 0));
  if (!BUILD_ENABLED || metricFlushTimer || typeof window === 'undefined') return;
  metricFlushTimer = setTimeout(() => {
    metricFlushTimer = null;
    void flushInstantGraphMetrics();
  }, 2500);
};

export const flushInstantGraphMetrics = async () => {
  if (!BUILD_ENABLED || metricCounts.size === 0) return;
  const events = Array.from(metricCounts.entries()).map(([name, value]) => ({ name, value: Math.round(value) }));
  metricCounts.clear();
  try {
    await api.post('/instant-graph/metrics', { events }, { timeout: 5000, __skipRetry: true } as any);
  } catch {
    // Metrics are best effort and must never affect the user path.
  }
};

export const startInstantGraphPrefetch = (userId: string) => {
  if (!BUILD_ENABLED || !normalizedUserId(userId)) return () => undefined;
  const controller = new AbortController();
  const timer = window.setTimeout(() => {
    void warmCriticalInstantGraph(userId, controller.signal);
  }, 1800);
  return () => {
    window.clearTimeout(timer);
    controller.abort();
  };
};
