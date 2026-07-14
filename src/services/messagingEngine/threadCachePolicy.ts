/**
 * Normalized thread cache helpers: merge, dedupe, LRU eviction.
 */

export type ThreadMessageLike = {
  id?: string;
  timestamp?: string;
  [key: string]: unknown;
};

export type ThreadCacheLike<T extends ThreadMessageLike = ThreadMessageLike> = {
  messages: T[];
  loading?: boolean;
  error?: string | null;
  loadedAt?: number | null;
  lastAccessAt?: number;
};

const safeId = (value: unknown) => String(value || '').trim();

export const dedupeThreadMessages = <T extends ThreadMessageLike>(messages: T[]): T[] => {
  const list = Array.isArray(messages) ? messages : [];
  const seen = new Set<string>();
  const out: T[] = [];
  for (const message of list) {
    const id = safeId(message?.id);
    if (!id) {
      out.push(message);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(message);
  }
  return out;
};

export const sortThreadMessagesByTime = <T extends ThreadMessageLike>(messages: T[]): T[] => {
  return dedupeThreadMessages(messages).sort((a, b) => {
    const ta = Date.parse(String(a?.timestamp || 0)) || 0;
    const tb = Date.parse(String(b?.timestamp || 0)) || 0;
    if (ta !== tb) return ta - tb;
    return safeId(a?.id).localeCompare(safeId(b?.id));
  });
};

export const mergeThreadMessage = <T extends ThreadMessageLike>(
  messages: T[],
  incoming: T
): T[] => {
  const id = safeId(incoming?.id);
  if (!id) return sortThreadMessagesByTime([...messages, incoming]);
  const list = Array.isArray(messages) ? [...messages] : [];
  const index = list.findIndex((entry) => safeId(entry?.id) === id);
  if (index >= 0) {
    list[index] = { ...list[index], ...incoming };
    return sortThreadMessagesByTime(list);
  }
  return sortThreadMessagesByTime([...list, incoming]);
};

/**
 * Evict least-recently-accessed threads while never dropping open/visible ids.
 */
export const evictThreadCacheEntries = <T extends ThreadCacheLike>(
  cache: Record<string, T>,
  options: {
    maxEntries: number;
    protectIds?: Iterable<string>;
  }
): Record<string, T> => {
  const maxEntries = Math.max(1, Number(options.maxEntries) || 40);
  const protect = new Set(
    Array.from(options.protectIds || [])
      .map((id) => safeId(id))
      .filter(Boolean)
  );
  const keys = Object.keys(cache);
  if (keys.length <= maxEntries) return cache;

  const ranked = keys
    .map((key) => ({
      key,
      protected: protect.has(key),
      lastAccessAt: Number(cache[key]?.lastAccessAt || cache[key]?.loadedAt || 0) || 0
    }))
    .sort((a, b) => {
      if (a.protected !== b.protected) return a.protected ? 1 : -1;
      return a.lastAccessAt - b.lastAccessAt;
    });

  const next = { ...cache };
  let size = keys.length;
  for (const entry of ranked) {
    if (size <= maxEntries) break;
    if (entry.protected) continue;
    delete next[entry.key];
    size -= 1;
  }
  return next;
};

export const touchThreadCacheEntry = <T extends ThreadCacheLike>(
  entry: T,
  now = Date.now()
): T => ({
  ...entry,
  lastAccessAt: now
});

export const DEFAULT_THREAD_CACHE_MAX = 48;
