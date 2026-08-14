/**
 * Phase 21.0.2 — production surface entrypoint for continuous feed lifecycle.
 * All Member Home / Community / Mobile feeds should consume this (not fork state).
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  useContinuousFeed,
  type UseContinuousFeedOptions,
  type UseContinuousFeedResult
} from './useContinuousFeed';
import { shouldEnableFeedVirtualization, resolveVirtualOverscan, resolveVirtualEstimateSize } from '../utils/feedVirtualPolicy';
import {
  saveFeedScrollPosition,
  restoreFeedScroll,
  readFeedScrollPosition
} from '../utils/feedScrollRestoration';
import { prefetchStreamMedia } from '../utils/feedMediaPrefetch';
import { observeFeedViewDuration } from '../utils/feedInterestSignals';
import { markFeedPerf } from '../utils/feedPerformanceProbe';
import { ENTERPRISE_FEED_ENGINE_VERSION } from '../utils/enterpriseFeedEngine';

export type UseSurfaceFeedLifecycleOptions = UseContinuousFeedOptions & {
  viewerKey?: string;
  enableScrollRestore?: boolean;
  enableMediaPrefetch?: boolean;
  enablePersonalizationSignals?: boolean;
  /** Override virtualization policy */
  forceVirtualization?: boolean | null;
  compactCards?: boolean;
};

export type UseSurfaceFeedLifecycleResult = UseContinuousFeedResult & {
  virtualizationEnabled: boolean;
  virtualOverscan: number;
  virtualEstimateSize: number;
  saveScroll: () => void;
  restoreScroll: () => boolean;
  lifecycleVersion: string;
  engineVersion: string;
};

/**
 * Single shared lifecycle for all feed surfaces (Phase 21.0.2 migration completion).
 */
export function useSurfaceFeedLifecycle(
  options: UseSurfaceFeedLifecycleOptions
): UseSurfaceFeedLifecycleResult {
  const {
    viewerKey = 'guest',
    enableScrollRestore = true,
    enableMediaPrefetch = true,
    enablePersonalizationSignals = true,
    forceVirtualization = null,
    compactCards = false,
    isMobile = false,
    dataSaver = false,
    surface,
    ...feedOptions
  } = options;

  const feed = useContinuousFeed({
    ...feedOptions,
    surface,
    viewerKey,
    isMobile,
    dataSaver
  });

  const restoredRef = useRef(false);

  const virtualizationEnabled = useMemo(
    () =>
      shouldEnableFeedVirtualization({
        itemCount: feed.stream.length,
        dataSaver,
        force: forceVirtualization
      }),
    [feed.stream.length, dataSaver, forceVirtualization]
  );

  const virtualOverscan = useMemo(
    () => resolveVirtualOverscan({ dataSaver, isMobile }),
    [dataSaver, isMobile]
  );

  const virtualEstimateSize = useMemo(
    () => resolveVirtualEstimateSize({ isMobile, compact: compactCards }),
    [isMobile, compactCards]
  );

  const saveScroll = () => {
    if (!enableScrollRestore || typeof window === 'undefined') return;
    const el = feed.scrollParentRef.current;
    const y = el ? el.scrollTop : window.scrollY || document.documentElement.scrollTop || 0;
    saveFeedScrollPosition(surface, y, viewerKey);
  };

  const restoreScroll = () => {
    if (!enableScrollRestore) return false;
    return restoreFeedScroll({
      surface,
      viewerKey,
      element: feed.scrollParentRef.current
    });
  };

  // Restore once after first non-empty paint.
  useEffect(() => {
    if (!enableScrollRestore || restoredRef.current) return;
    if (feed.loading) return;
    if (feed.stream.length === 0) return;
    const y = readFeedScrollPosition(surface, viewerKey);
    if (y == null) {
      restoredRef.current = true;
      return;
    }
    // Double rAF to wait for layout
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreScroll();
        restoredRef.current = true;
        markFeedPerf('feed_scroll_restored', { y });
      });
    });
  }, [enableScrollRestore, feed.loading, feed.stream.length, surface, viewerKey]);

  // Persist scroll on hide / unmount
  useEffect(() => {
    if (!enableScrollRestore || typeof window === 'undefined') return;
    const onHide = () => saveScroll();
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') onHide();
    });
    return () => {
      saveScroll();
      window.removeEventListener('pagehide', onHide);
    };
  }, [enableScrollRestore, surface, viewerKey, feed.stream.length]);

  // Media prefetch for progressive window edge
  useEffect(() => {
    if (!enableMediaPrefetch || !feed.stream.length) return;
    const start = Math.max(0, feed.renderedCount - 1);
    prefetchStreamMedia(feed.stream, start, dataSaver ? 2 : 5);
  }, [enableMediaPrefetch, feed.stream, feed.renderedCount, dataSaver]);

  // Soft personalization: dwell on currently rendered head
  useEffect(() => {
    if (!enablePersonalizationSignals) return;
    if (!feed.stream.length || feed.loading) return;
    const started = Date.now();
    const visible = feed.stream.slice(0, Math.min(feed.renderedCount, 4));
    return () => {
      const elapsed = Date.now() - started;
      visible.forEach((entry, index) => {
        const id = String(entry.post?.id || entry.data?.id || '').trim();
        if (!id || entry.kind !== 'post') return;
        observeFeedViewDuration({
          entityId: id,
          surface,
          viewDurationMs: elapsed,
          feedPosition: index,
          feedMode: options.feedMode
        });
      });
    };
  }, [
    enablePersonalizationSignals,
    feed.stream,
    feed.renderedCount,
    feed.loading,
    surface,
    options.feedMode
  ]);

  // Perf marks for load boundaries
  useEffect(() => {
    if (feed.loading) markFeedPerf('feed_request_start', { surface });
    else markFeedPerf('feed_request_end', { surface, count: feed.stream.length });
  }, [feed.loading, surface, feed.stream.length]);

  return {
    ...feed,
    virtualizationEnabled,
    virtualOverscan,
    virtualEstimateSize,
    saveScroll,
    restoreScroll,
    lifecycleVersion: '21.0.2',
    engineVersion: ENTERPRISE_FEED_ENGINE_VERSION,
    feedVersion: '21.0.2'
  };
}

export default useSurfaceFeedLifecycle;
