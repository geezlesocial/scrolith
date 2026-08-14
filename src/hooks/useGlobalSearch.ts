import { useCallback, useEffect, useRef, useState } from 'react';
import { searchGlobalWithMarketplace, type GlobalSearchPayload } from '../services/globalSearch';
import { SearchService } from '../services/search';

const MIN_QUERY_LENGTH = 2;
const DEFAULT_DEBOUNCE_MS = 300;
const SHARED_CACHE_TTL_MS = 2500;

const emptyPayload = (query = ''): GlobalSearchPayload => ({
  query,
  groups: {
    people: [],
    pages: [],
    jobs: [],
    gigs: [],
    marketplace: [],
    posts: [],
    blogs: [],
    groups: []
  },
  results: [],
  totals: {
    people: 0,
    pages: 0,
    jobs: 0,
    gigs: 0,
    marketplace: 0,
    posts: 0,
    blogs: 0,
    groups: 0,
    total: 0
  }
});

type SharedSearchEntry = {
  expiresAt: number;
  value: GlobalSearchPayload;
};

const sharedRequests = new Map<string, Promise<GlobalSearchPayload>>();
const sharedCache = new Map<string, SharedSearchEntry>();

const runSharedSearch = (query: string, maxResults: number) => {
  const key = `${query.toLowerCase()}::${maxResults}`;
  const cached = sharedCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return Promise.resolve(cached.value);
  if (cached) sharedCache.delete(key);

  const pending = sharedRequests.get(key);
  if (pending) return pending;

  const request = searchGlobalWithMarketplace(query, { maxResults })
    .then((value) => {
      sharedCache.set(key, { value, expiresAt: Date.now() + SHARED_CACHE_TTL_MS });
      return value;
    })
    .finally(() => sharedRequests.delete(key));
  sharedRequests.set(key, request);
  return request;
};

export type UseGlobalSearchOptions = {
  enabled?: boolean;
  maxResults?: number;
  debounceMs?: number;
  userId?: string | null;
  saveHistory?: boolean;
};

export const useGlobalSearch = (query: string, options: UseGlobalSearchOptions = {}) => {
  const {
    enabled = true,
    maxResults = 8,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    userId,
    saveHistory = false
  } = options;
  const [payload, setPayload] = useState<GlobalSearchPayload>(() => emptyPayload());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestSeqRef = useRef(0);

  const searchNow = useCallback(
    async (term: string) => {
      const clean = String(term || '').trim();
      const requestId = ++requestSeqRef.current;
      if (!clean || clean.length < MIN_QUERY_LENGTH || !enabled) {
        setPayload(emptyPayload(clean));
        setLoading(false);
        setError(null);
        return emptyPayload(clean);
      }

      setLoading(true);
      setError(null);
      try {
        const next = await runSharedSearch(clean, Math.max(4, maxResults));
        if (requestSeqRef.current !== requestId) return next;
        setPayload(next);
        if (saveHistory && userId) {
          void SearchService.saveSearchHistory(userId, clean).catch(() => undefined);
        }
        return next;
      } catch (cause: any) {
        if (requestSeqRef.current !== requestId) return emptyPayload(clean);
        const message = cause?.message || 'Search is temporarily unavailable.';
        setPayload(emptyPayload(clean));
        setError(message);
        return emptyPayload(clean);
      } finally {
        if (requestSeqRef.current === requestId) setLoading(false);
      }
    },
    [enabled, maxResults, saveHistory, userId]
  );

  useEffect(() => {
    const clean = String(query || '').trim();
    if (!enabled || clean.length < MIN_QUERY_LENGTH) {
      requestSeqRef.current += 1;
      setPayload(emptyPayload(clean));
      setLoading(false);
      setError(null);
      return;
    }

    const timer = window.setTimeout(() => {
      void searchNow(clean);
    }, Math.max(0, debounceMs));
    return () => window.clearTimeout(timer);
  }, [debounceMs, enabled, query, searchNow]);

  return { payload, loading, error, searchNow };
};

export const __resetGlobalSearchCacheForTests = () => {
  sharedRequests.clear();
  sharedCache.clear();
};
