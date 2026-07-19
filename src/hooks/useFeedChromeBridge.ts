/**
 * Phase 21.0.2 — chrome bridge for surfaces that still host their own network loaders
 * (desktop MemberHome / Community) but must share scroll restore + virtualization policy.
 */
import { useEffect, useMemo, useRef } from 'react';
import {
  saveFeedScrollPosition,
  restoreFeedScroll,
  readFeedScrollPosition
} from '../utils/feedScrollRestoration';
import {
  shouldEnableFeedVirtualization,
  resolveVirtualEstimateSize,
  resolveVirtualOverscan
} from '../utils/feedVirtualPolicy';
import { prefetchStreamMedia } from '../utils/feedMediaPrefetch';
import type { FeedStreamEntry } from '../utils/feedStream';

export function useFeedChromeBridge(options: {
  surface: string;
  viewerKey?: string;
  itemCount: number;
  stream?: FeedStreamEntry[];
  renderedCount?: number;
  dataSaver?: boolean;
  isMobile?: boolean;
  enableScrollRestore?: boolean;
}) {
  const {
    surface,
    viewerKey = 'guest',
    itemCount,
    stream = [],
    renderedCount = 0,
    dataSaver = false,
    isMobile = false,
    enableScrollRestore = true
  } = options;

  const restoredRef = useRef(false);

  const virtualizationEnabled = useMemo(
    () =>
      shouldEnableFeedVirtualization({
        itemCount,
        dataSaver
      }),
    [itemCount, dataSaver]
  );

  const virtualOverscan = useMemo(
    () => resolveVirtualOverscan({ dataSaver, isMobile }),
    [dataSaver, isMobile]
  );

  const virtualEstimateSize = useMemo(
    () => resolveVirtualEstimateSize({ isMobile, compact: isMobile }),
    [isMobile]
  );

  useEffect(() => {
    if (!enableScrollRestore || restoredRef.current) return;
    if (itemCount <= 0) return;
    const y = readFeedScrollPosition(surface, viewerKey);
    if (y == null) {
      restoredRef.current = true;
      return;
    }
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        restoreFeedScroll({ surface, viewerKey });
        restoredRef.current = true;
      });
    });
  }, [enableScrollRestore, itemCount, surface, viewerKey]);

  useEffect(() => {
    if (!enableScrollRestore || typeof window === 'undefined') return;
    const persist = () => {
      saveFeedScrollPosition(surface, window.scrollY || document.documentElement.scrollTop || 0, viewerKey);
    };
    window.addEventListener('pagehide', persist);
    return () => {
      persist();
      window.removeEventListener('pagehide', persist);
    };
  }, [enableScrollRestore, surface, viewerKey, itemCount]);

  useEffect(() => {
    if (!stream.length) return;
    prefetchStreamMedia(stream, Math.max(0, renderedCount - 1), dataSaver ? 2 : 5);
  }, [stream, renderedCount, dataSaver]);

  return {
    virtualizationEnabled,
    virtualOverscan,
    virtualEstimateSize,
    lifecycleVersion: '21.0.2'
  };
}

export default useFeedChromeBridge;
