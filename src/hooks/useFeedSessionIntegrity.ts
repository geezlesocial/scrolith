/**
 * Phase 21.1.4 — React hook for feed session integrity stress monitoring.
 * Privacy-safe: posts IDs / hashes only. Enable via DEV or localStorage scrolith:feedIntegrityProbe=1
 */
import { useCallback, useEffect, useMemo, useRef } from 'react';
import {
  createIntegrityProbeController,
  shouldEnableFeedIntegrityProbe,
  type FeedIntegrityEvent,
  type FeedIntegrityUserAction,
  type IntegrityProbeController
} from '../utils/feedSessionIntegrity';

export type UseFeedSessionIntegrityOptions = {
  surface: string;
  enabled?: boolean;
  /** Ordered stable item ids for the full session list */
  orderedItemIds: Array<string | null | undefined>;
  /** Currently substantially visible post id */
  visiblePostId?: string | null;
  visibleAuthorId?: string | null;
  visibleAnchorId?: string | null;
  /** Probe interval ms while page visible (default 2000) */
  intervalMs?: number;
};

export type UseFeedSessionIntegrityResult = {
  sessionId: string;
  enabled: boolean;
  report: () => ReturnType<IntegrityProbeController['getReport']>;
  noteUserAction: (action: FeedIntegrityUserAction) => void;
  noteEvent: (event: FeedIntegrityEvent) => void;
  regressionCount: number;
};

export function useFeedSessionIntegrity(
  options: UseFeedSessionIntegrityOptions
): UseFeedSessionIntegrityResult {
  const enabled = options.enabled ?? shouldEnableFeedIntegrityProbe();
  const controllerRef = useRef<IntegrityProbeController | null>(null);
  const regressionCountRef = useRef(0);

  if (enabled && !controllerRef.current) {
    controllerRef.current = createIntegrityProbeController(options.surface);
  }

  const orderedKey = useMemo(
    () =>
      (options.orderedItemIds || [])
        .map((id) => String(id || '').trim())
        .filter(Boolean)
        .join('|'),
    [options.orderedItemIds]
  );

  const observeNow = useCallback(
    (event: FeedIntegrityEvent) => {
      if (!enabled || !controllerRef.current) return;
      const reg = controllerRef.current.observe(event, {
        orderedItemIds: options.orderedItemIds,
        visiblePostId: options.visiblePostId,
        visibleAuthorId: options.visibleAuthorId,
        visibleAnchorId: options.visibleAnchorId ?? options.visiblePostId
      });
      if (reg) regressionCountRef.current = controllerRef.current.state.regressions.length;
    },
    [
      enabled,
      options.orderedItemIds,
      options.visiblePostId,
      options.visibleAuthorId,
      options.visibleAnchorId
    ]
  );

  // Continuous probe while visible
  useEffect(() => {
    if (!enabled) return;
    observeNow('probe_tick');
    const intervalMs = Math.max(1000, Number(options.intervalMs || 2000));
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      observeNow('probe_tick');
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [enabled, observeNow, options.intervalMs, orderedKey, options.visiblePostId]);

  // Network + visibility
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return;
    const onOffline = () => observeNow('network_offline');
    const onOnline = () => observeNow('network_online');
    const onVis = () => {
      observeNow(document.visibilityState === 'hidden' ? 'visibility_hidden' : 'visibility_visible');
    };
    window.addEventListener('offline', onOffline);
    window.addEventListener('online', onOnline);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('online', onOnline);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [enabled, observeNow]);

  const noteUserAction = useCallback(
    (action: FeedIntegrityUserAction) => {
      if (!enabled || !controllerRef.current) return;
      controllerRef.current.allowUserAction(action);
      observeNow(action);
    },
    [enabled, observeNow]
  );

  const noteEvent = useCallback(
    (event: FeedIntegrityEvent) => {
      observeNow(event);
    },
    [observeNow]
  );

  return {
    sessionId: controllerRef.current?.state.sessionId || '',
    enabled,
    report: () =>
      controllerRef.current?.getReport() || {
        sessionId: '',
        surface: options.surface,
        regressionCount: 0,
        regressions: [],
        last: null,
        ok: true
      },
    noteUserAction,
    noteEvent,
    regressionCount: regressionCountRef.current
  };
}

export default useFeedSessionIntegrity;
