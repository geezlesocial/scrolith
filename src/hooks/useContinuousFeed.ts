/**
 * Phase 21.0.1 — Shared continuous feed lifecycle.
 * Owns cursor, loading, terminal, prefetch, progressive reveal, soft refresh,
 * memory trim, analytics. Surfaces must consume this instead of duplicating logic.
 *
 * Does NOT own ranking — only transport + presentation control plane.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  MemberFeedService,
  type MemberFeedSurface,
  type MemberFeedPage
} from '../services/memberFeed';
import {
  classifyFeedNetwork,
  resolveAdaptivePageSize,
  resolvePrefetchPolicy,
  shouldPrefetchNextPage,
  trimFeedForMemory,
  buildObserverRootMargin,
  type FeedNetworkClass
} from '../utils/enterpriseFeedEngine';
import {
  buildStreamFromMemberFeedPage,
  buildStreamFromPosts,
  mergeStreamEntries,
  type FeedStreamEntry
} from '../utils/feedStream';
import { emitFeedAnalytics, measureFeedRequest } from '../utils/feedAnalytics';
import { resolveFeedTerminalState } from '../utils/continuousFeed';
import {
  shouldAllowObserverLoadMore,
  shouldSkipDuplicateCursorRequest,
  shouldStopUnchangedCursorLoop
} from '../utils/feedLifecycle';
import {
  applyPendingStreamEntries,
  isolateStreamSoftRefresh,
  FEED_SESSION_STABILITY_VERSION
} from '../utils/feedSessionStability';

export type ContinuousFeedMode = 'initial' | 'more' | 'soft_refresh';

export type UseContinuousFeedOptions = {
  surface: MemberFeedSurface;
  feedMode?: string;
  enabled?: boolean;
  isMobile?: boolean;
  dataSaver?: boolean;
  basePageSize?: number;
  /** Optional legacy fetch when orchestrator soft-fails. */
  legacyFetch?: (params: {
    cursor: string | null;
    limit: number;
    mode: ContinuousFeedMode;
    signal?: AbortSignal;
  }) => Promise<{ posts: any[]; nextCursor: string | null; hasMore?: boolean } | null>;
  /** Authenticated viewer required for orchestrator. */
  isAuthenticated?: boolean;
};

export type UseContinuousFeedResult = {
  stream: FeedStreamEntry[];
  posts: any[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  terminal: boolean;
  error: string | null;
  statusMessage: string | null;
  cursor: string | null;
  renderedCount: number;
  networkClass: FeedNetworkClass;
  observerRootMargin: string;
  progressiveStep: number;
  transport: 'orchestrated' | 'legacy';
  load: (mode?: ContinuousFeedMode) => Promise<void>;
  loadMore: () => Promise<void>;
  softRefresh: () => Promise<void>;
  /** Phase 21.1.4 — pending new items from soft refresh (not yet in stream). */
  pendingNewCount: number;
  applyPendingNew: () => void;
  dismissPendingNew: () => void;
  setRenderedCount: React.Dispatch<React.SetStateAction<number>>;
  revealMore: () => void;
  sentinelRef: React.RefObject<HTMLDivElement | null>;
  scrollParentRef: React.RefObject<HTMLElement | null>;
  retry: () => Promise<void>;
  feedVersion: string;
};

export function useContinuousFeed(options: UseContinuousFeedOptions): UseContinuousFeedResult {
  const {
    surface,
    feedMode = 'for_you',
    enabled = true,
    isMobile = false,
    dataSaver = false,
    basePageSize = 12,
    legacyFetch,
    isAuthenticated = true
  } = options;

  const [stream, setStream] = useState<FeedStreamEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [terminal, setTerminal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [renderedCount, setRenderedCount] = useState(8);
  const [transport, setTransport] = useState<'orchestrated' | 'legacy'>('orchestrated');
  const [pendingNew, setPendingNew] = useState<FeedStreamEntry[]>([]);

  const streamRef = useRef<FeedStreamEntry[]>([]);
  const pendingNewRef = useRef<FeedStreamEntry[]>([]);
  const cursorRef = useRef<string | null>(null);
  const terminalRef = useRef(false);
  const inFlightRef = useRef(false);
  const inFlightCursorRef = useRef<string | null>(null);
  const lastCompletedCursorRef = useRef<string | null>(null);
  const lastCompletedAddedRef = useRef(0);
  const emptyStreakRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const requestSeqRef = useRef(0);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  const loadMoreArmedRef = useRef(false);

  const networkClass = useMemo(
    () =>
      classifyFeedNetwork({
        effectiveType: (typeof navigator !== 'undefined' && (navigator as any).connection?.effectiveType) || null,
        downlink: (typeof navigator !== 'undefined' && (navigator as any).connection?.downlink) || null,
        saveData:
          dataSaver ||
          Boolean(typeof navigator !== 'undefined' && (navigator as any).connection?.saveData),
        onLine: typeof navigator !== 'undefined' ? navigator.onLine : true
      }),
    [dataSaver]
  );

  const policy = useMemo(
    () => resolvePrefetchPolicy(networkClass, { dataSaver, isMobile }),
    [networkClass, dataSaver, isMobile]
  );

  const pageSize = useMemo(
    () =>
      resolveAdaptivePageSize({
        basePageSize,
        networkClass,
        dataSaver,
        viewportHeight: typeof window !== 'undefined' ? window.innerHeight : 0,
        isMobile
      }),
    [basePageSize, networkClass, dataSaver, isMobile]
  );

  const observerRootMargin = useMemo(
    () => buildObserverRootMargin(policy.observerRootMarginPx),
    [policy.observerRootMarginPx]
  );

  const commitStream = useCallback(
    (
      next: FeedStreamEntry[],
      nextCursor: string | null,
      mode: ContinuousFeedMode,
      uniqueAdded: number
    ) => {
      let resolvedCursor = nextCursor ? String(nextCursor).trim() || null : null;
      if (mode === 'more' || mode === 'soft_refresh') {
        if (uniqueAdded > 0) emptyStreakRef.current = 0;
        else emptyStreakRef.current += 1;

        const terminalState = resolveFeedTerminalState({
          nextCursor: resolvedCursor,
          hasMoreFlag: Boolean(resolvedCursor),
          uniqueAddedCount: uniqueAdded
        });
        const haltEmpty = emptyStreakRef.current >= 2;
        const haltUnchanged = shouldStopUnchangedCursorLoop({
          requestedCursor: cursorRef.current,
          returnedCursor: resolvedCursor,
          uniqueAddedCount: uniqueAdded,
          consecutiveEmptyPages: emptyStreakRef.current
        });

        if (terminalState.isTerminal || haltEmpty || haltUnchanged) {
          if (uniqueAdded <= 0) {
            resolvedCursor = null;
            terminalRef.current = true;
            setTerminal(true);
          } else if (terminalState.isTerminal && !resolvedCursor) {
            terminalRef.current = true;
            setTerminal(true);
          } else {
            terminalRef.current = false;
            setTerminal(false);
          }
        } else {
          terminalRef.current = false;
          setTerminal(false);
        }
        lastCompletedCursorRef.current = String(cursorRef.current || '') || null;
        lastCompletedAddedRef.current = uniqueAdded;
      } else {
        emptyStreakRef.current = 0;
        terminalRef.current = !resolvedCursor;
        setTerminal(!resolvedCursor);
      }

      const trimmed = trimFeedForMemory(next, policy.maxRetainedItems) as FeedStreamEntry[];
      streamRef.current = trimmed;
      cursorRef.current = resolvedCursor;
      setStream(trimmed);
      setCursor(resolvedCursor);

      if (mode === 'initial') {
        setRenderedCount(Math.min(policy.progressiveInitialWindow, trimmed.length || policy.progressiveInitialWindow));
      } else if (uniqueAdded > 0) {
        setRenderedCount((prev) =>
          Math.min(trimmed.length, Math.max(prev, prev + Math.min(policy.progressiveRevealStep, uniqueAdded)))
        );
      }
    },
    [policy.maxRetainedItems, policy.progressiveInitialWindow, policy.progressiveRevealStep]
  );

  const load = useCallback(
    async (mode: ContinuousFeedMode = 'initial') => {
      if (!enabled) return;
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        setStatusMessage('You are offline. Showing cached feed when available.');
        if (streamRef.current.length === 0) {
          setError('Offline — reconnect to load your feed.');
          setLoading(false);
        }
        return;
      }

      if (inFlightRef.current) {
        if (mode === 'soft_refresh') return; // cancel duplicate soft refresh
        if (mode === 'more') return;
      }

      if (
        mode === 'more' &&
        (terminalRef.current ||
          !String(cursorRef.current || '').trim() ||
          shouldSkipDuplicateCursorRequest({
            cursor: cursorRef.current,
            inFlightCursor: inFlightCursorRef.current,
            loadMoreInFlight: inFlightRef.current,
            lastCompletedCursor: lastCompletedCursorRef.current,
            lastCompletedAddedCount: lastCompletedAddedRef.current
          }))
      ) {
        if (!cursorRef.current) {
          terminalRef.current = true;
          setTerminal(true);
        }
        return;
      }

      inFlightRef.current = true;
      const seq = ++requestSeqRef.current;
      const startedAt = Date.now();
      const requestedCursor = mode === 'more' ? cursorRef.current : null;
      inFlightCursorRef.current = requestedCursor;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        if (mode === 'initial') {
          setLoading(streamRef.current.length === 0);
          setError(null);
          setStatusMessage(null);
          terminalRef.current = false;
          setTerminal(false);
        } else if (mode === 'soft_refresh') {
          setRefreshing(true);
        } else {
          setLoadingMore(true);
        }

        emitFeedAnalytics(
          mode === 'more' ? 'feed_prefetch' : mode === 'soft_refresh' ? 'feed_request_start' : 'feed_request_start',
          surface,
          { mode, limit: pageSize }
        );

        let page: MemberFeedPage | null = null;
        if (isAuthenticated) {
          page = await MemberFeedService.tryFetchPage({
            surface,
            mode: feedMode,
            limit: pageSize,
            cursor: mode === 'more' ? cursorRef.current || undefined : undefined,
            signal: controller.signal,
            hardFailAuth: false
          });
        }

        if (seq !== requestSeqRef.current) return;

        if (page && (page.items?.length || page.posts?.length || page.hasMore)) {
          setTransport('orchestrated');
          const incoming = buildStreamFromMemberFeedPage(page);
          // Phase 21.1.4 — soft refresh must NOT reorder or replace the visible session.
          if (mode === 'soft_refresh' && streamRef.current.length > 0) {
            const { session, pending } = isolateStreamSoftRefresh(streamRef.current, incoming);
            streamRef.current = session;
            pendingNewRef.current = pending;
            setPendingNew(pending);
            if (pending.length === 0) {
              setStatusMessage('You are up to date.');
            } else {
              setStatusMessage(null);
            }
            measureFeedRequest(surface, startedAt, 'success', {
              mode,
              added: 0,
              pending: pending.length
            });
            setError(null);
            return;
          }
          const { merged, addedCount } = mergeStreamEntries(
            mode === 'initial' ? [] : streamRef.current,
            incoming,
            { prepend: false, maxRetained: policy.maxRetainedItems }
          );
          const nextCursor = page.nextCursor;
          commitStream(
            mode === 'initial' ? incoming : merged,
            nextCursor,
            mode,
            mode === 'initial' ? incoming.length : addedCount
          );
          if (mode === 'initial') {
            pendingNewRef.current = [];
            setPendingNew([]);
          }
          measureFeedRequest(surface, startedAt, mode === 'more' ? 'prefetch_success' : 'success', {
            transport: 'orchestrated',
            added: mode === 'initial' ? incoming.length : addedCount
          });
          setError(null);
          return;
        }

        // Legacy fallback
        setTransport('legacy');
        if (legacyFetch) {
          const legacy = await legacyFetch({
            cursor: mode === 'more' ? cursorRef.current : null,
            limit: pageSize,
            mode,
            signal: controller.signal
          });
          if (seq !== requestSeqRef.current) return;
          if (legacy) {
            const incoming = buildStreamFromPosts(legacy.posts || []);
            if (mode === 'soft_refresh' && streamRef.current.length > 0) {
              const { session, pending } = isolateStreamSoftRefresh(streamRef.current, incoming);
              streamRef.current = session;
              pendingNewRef.current = pending;
              setPendingNew(pending);
              setStatusMessage(pending.length === 0 ? 'You are up to date.' : null);
              setError(null);
              return;
            }
            const { merged, addedCount } = mergeStreamEntries(
              mode === 'initial' ? [] : streamRef.current,
              incoming,
              { prepend: false, maxRetained: policy.maxRetainedItems }
            );
            commitStream(
              mode === 'initial' ? incoming : merged,
              legacy.nextCursor,
              mode,
              mode === 'initial' ? incoming.length : addedCount
            );
            measureFeedRequest(surface, startedAt, 'success', { transport: 'legacy' });
            setError(null);
            return;
          }
        }

        if (streamRef.current.length === 0) {
          setError('Unable to load feed right now.');
          terminalRef.current = true;
          setTerminal(true);
        } else {
          setStatusMessage('Showing your saved feed while we reconnect.');
          if (mode === 'more') {
            terminalRef.current = true;
            setTerminal(true);
          }
        }
      } catch (e: any) {
        if (e?.name === 'AbortError' || e?.code === 'ERR_CANCELED') return;
        measureFeedRequest(surface, startedAt, 'error', { status: Number(e?.response?.status || 0) });
        if (streamRef.current.length > 0) {
          setError(null);
          setStatusMessage('Showing your saved feed while we reconnect.');
        } else {
          setError(String(e?.response?.data?.error || e?.message || 'Failed to load feed.'));
        }
      } finally {
        if (seq === requestSeqRef.current) {
          inFlightRef.current = false;
          inFlightCursorRef.current = null;
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [
      enabled,
      surface,
      feedMode,
      pageSize,
      isAuthenticated,
      legacyFetch,
      policy.maxRetainedItems,
      commitStream
    ]
  );

  const loadMore = useCallback(() => load('more'), [load]);
  const softRefresh = useCallback(() => load('soft_refresh'), [load]);
  const retry = useCallback(() => load('initial'), [load]);

  const applyPendingNew = useCallback(() => {
    const pending = pendingNewRef.current;
    if (!pending.length) return;
    const { merged, addedCount } = applyPendingStreamEntries(
      streamRef.current,
      pending,
      policy.maxRetainedItems
    );
    pendingNewRef.current = [];
    setPendingNew([]);
    if (addedCount > 0) {
      commitStream(merged, cursorRef.current, 'soft_refresh', addedCount);
      setStatusMessage(null);
    }
  }, [commitStream, policy.maxRetainedItems]);

  const dismissPendingNew = useCallback(() => {
    pendingNewRef.current = [];
    setPendingNew([]);
  }, []);

  const revealMore = useCallback(() => {
    setRenderedCount((prev) => Math.min(streamRef.current.length, prev + policy.progressiveRevealStep));
  }, [policy.progressiveRevealStep]);

  // Initial load
  useEffect(() => {
    if (!enabled) return;
    void load('initial');
    return () => {
      abortRef.current?.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount / surface change
  }, [enabled, surface, feedMode]);

  // Predictive prefetch
  useEffect(() => {
    if (
      !shouldPrefetchNextPage({
        loadedCount: stream.length,
        renderedCount,
        remainingItemThreshold: policy.remainingItemThreshold,
        hasCursor: Boolean(cursor),
        isTerminal: terminal || terminalRef.current,
        loadMoreInFlight: loadingMore || inFlightRef.current,
        initialLoading: loading
      })
    ) {
      return;
    }
    if (loadMoreArmedRef.current) return;
    loadMoreArmedRef.current = true;
    void load('more').finally(() => {
      loadMoreArmedRef.current = false;
    });
  }, [stream.length, renderedCount, policy.remainingItemThreshold, cursor, terminal, loadingMore, loading, load]);

  // Sentinel observer
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (renderedCount < streamRef.current.length && entry?.isIntersecting) {
          revealMore();
          return;
        }
        if (
          !shouldAllowObserverLoadMore({
            isIntersecting: Boolean(entry?.isIntersecting),
            initialLoading: loading,
            loadMoreInFlight: loadingMore || inFlightRef.current,
            isTerminal: terminalRef.current,
            hasCursor: Boolean(cursorRef.current),
            offsetFallbackEnabled: false,
            secondarySourceRemaining: false,
            hasUnrenderedItems: renderedCount < streamRef.current.length
          })
        ) {
          return;
        }
        void load('more');
      },
      { rootMargin: observerRootMargin, threshold: 0.01 }
    );
    obs.observe(node);
    return () => obs.disconnect();
  }, [observerRootMargin, loading, loadingMore, revealMore, load, renderedCount, stream.length]);

  // Online resume — soft only (pending buffer), never hard replace session.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onOnline = () => {
      setStatusMessage(null);
      if (streamRef.current.length === 0) void load('initial');
      else void load('soft_refresh');
    };
    window.addEventListener('online', onOnline);
    return () => window.removeEventListener('online', onOnline);
  }, [load]);

  // Phase 21.1.4 — focus must not rebuild visible sequence (soft refresh only).
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (streamRef.current.length === 0) return;
      void load('soft_refresh');
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [load]);

  const posts = useMemo(
    () => stream.filter((e) => e.kind === 'post' && e.post).map((e) => e.post),
    [stream]
  );

  return {
    stream,
    posts,
    loading,
    loadingMore,
    refreshing,
    terminal,
    error,
    statusMessage,
    cursor,
    renderedCount,
    networkClass,
    observerRootMargin,
    progressiveStep: policy.progressiveRevealStep,
    transport,
    load,
    loadMore,
    softRefresh,
    pendingNewCount: pendingNew.length,
    applyPendingNew,
    dismissPendingNew,
    setRenderedCount,
    revealMore,
    sentinelRef,
    scrollParentRef,
    retry,
    feedVersion: FEED_SESSION_STABILITY_VERSION
  };
}

export default useContinuousFeed;
