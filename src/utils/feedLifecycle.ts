/**
 * Shared continuous-feed lifecycle guards for member-home and /community.
 * Pure helpers only — no React, network, or DOM.
 */

export type FeedRequestKind = 'initial' | 'load_more' | 'soft_refresh';

export type FeedLifecycleSnapshot = {
  surface: string;
  transport: 'orchestrated' | 'legacy';
  kind: FeedRequestKind;
  sequence: number;
  cursor: string | null;
  nextCursor?: string | null;
  itemCount?: number;
  hasMore?: boolean;
  feedCountBefore?: number;
  feedCountAfter?: number;
};

/** Development-only structured diagnostics (no tokens / PII). */
export const logFeedLifecycle = (snapshot: FeedLifecycleSnapshot): void => {
  if (typeof import.meta === 'undefined') return;
  try {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean } }).env;
    if (!env?.DEV) return;
  } catch {
    return;
  }
  // eslint-disable-next-line no-console
  console.debug('[feed-lifecycle]', {
    surface: snapshot.surface,
    transport: snapshot.transport,
    kind: snapshot.kind,
    sequence: snapshot.sequence,
    cursor: snapshot.cursor ? `${String(snapshot.cursor).slice(0, 12)}…` : null,
    nextCursor: snapshot.nextCursor ? `${String(snapshot.nextCursor).slice(0, 12)}…` : null,
    itemCount: snapshot.itemCount,
    hasMore: snapshot.hasMore,
    feedCountBefore: snapshot.feedCountBefore,
    feedCountAfter: snapshot.feedCountAfter
  });
};

/**
 * Whether an automatic (observer) load-more should run.
 * Blocks while initial/load-more is in flight, when terminal, or when there is no progress path.
 */
export const shouldAllowObserverLoadMore = (params: {
  isIntersecting: boolean;
  initialLoading: boolean;
  loadMoreInFlight: boolean;
  isTerminal: boolean;
  hasCursor: boolean;
  offsetFallbackEnabled: boolean;
  secondarySourceRemaining: boolean;
  /** Progressive window still has buffered items to reveal locally. */
  hasUnrenderedItems?: boolean;
}): boolean => {
  if (!params.isIntersecting) return false;
  if (params.initialLoading || params.loadMoreInFlight) return false;
  if (params.isTerminal) return false;
  if (params.hasUnrenderedItems) return false;
  return Boolean(params.hasCursor || params.offsetFallbackEnabled || params.secondarySourceRemaining);
};

/**
 * Prevent concurrent identical cursor requests and stale cursor replay.
 */
export const shouldSkipDuplicateCursorRequest = (params: {
  cursor: string | null | undefined;
  inFlightCursor: string | null | undefined;
  loadMoreInFlight: boolean;
  lastCompletedCursor?: string | null | undefined;
  lastCompletedAddedCount?: number;
}): boolean => {
  const cursor = String(params.cursor || '').trim();
  if (!cursor) return false;
  if (params.loadMoreInFlight && String(params.inFlightCursor || '').trim() === cursor) {
    return true;
  }
  // Same cursor completed with zero adds — treat as stuck unless caller cleared terminal.
  if (
    String(params.lastCompletedCursor || '').trim() === cursor &&
    Number(params.lastCompletedAddedCount || 0) <= 0
  ) {
    return true;
  }
  return false;
};

/**
 * Empty-page loop: stop when the cursor does not advance and nothing unique was added.
 */
export const shouldStopUnchangedCursorLoop = (params: {
  requestedCursor: string | null | undefined;
  returnedCursor: string | null | undefined;
  uniqueAddedCount: number;
  consecutiveEmptyPages: number;
  maxEmptyPages?: number;
}): boolean => {
  const requested = String(params.requestedCursor || '').trim();
  const returned = String(params.returnedCursor || '').trim();
  const empty = Number(params.uniqueAddedCount || 0) <= 0;
  const unchanged = Boolean(requested) && requested === returned;
  const streak = Number(params.consecutiveEmptyPages || 0);
  const maxEmpty = Math.max(1, Number(params.maxEmptyPages || 2));
  if (empty && unchanged) return true;
  if (empty && streak >= maxEmpty) return true;
  return false;
};

/**
 * Stale response guard: only apply if sequence still matches the latest request.
 */
export const isStaleFeedResponse = (requestSequence: number, latestSequence: number): boolean =>
  Number(requestSequence) !== Number(latestSequence);

/**
 * Soft refresh / initial load: keep existing items on screen while fetching.
 * Skeleton only when there is no content yet.
 */
export const shouldShowInitialSkeleton = (params: {
  loading: boolean;
  existingItemCount: number;
}): boolean => Boolean(params.loading) && Number(params.existingItemCount || 0) <= 0;

/**
 * After a successful replace, preserve progressive render window when the list did not shrink.
 */
export const resolveRenderedCountAfterCommit = (params: {
  previousRendered: number;
  previousLength: number;
  nextLength: number;
  initialWindow: number;
  forceReset?: boolean;
}): number => {
  const initial = Math.max(1, Number(params.initialWindow || 8));
  const nextLen = Math.max(0, Number(params.nextLength || 0));
  if (nextLen <= 0) return initial;
  if (params.forceReset) {
    return Math.min(initial, nextLen);
  }
  const prevRendered = Math.max(0, Number(params.previousRendered || 0));
  // Grow or hold the window so append/soft-refresh does not collapse the viewport.
  const preserved = Math.max(prevRendered, Math.min(initial, nextLen));
  return Math.min(nextLen, Math.max(preserved, Math.min(initial, nextLen)));
};

/**
 * Transport stickiness: once a session falls back to legacy, stay there until deliberate reset.
 */
export const resolveTransportAfterFailure = (
  current: 'orchestrated' | 'legacy',
  failed: 'orchestrated' | 'legacy'
): 'orchestrated' | 'legacy' => {
  if (failed === 'orchestrated') return 'legacy';
  return current;
};

/**
 * Whether to attempt orchestrated transport for this request.
 */
export const shouldAttemptOrchestrated = (
  transport: 'orchestrated' | 'legacy',
  options?: { forceRetryOrchestrated?: boolean; kind?: FeedRequestKind }
): boolean => {
  if (options?.forceRetryOrchestrated) return true;
  if (options?.kind === 'initial' || options?.kind === 'soft_refresh') {
    // Deliberate refresh may retry orchestrated even after a prior session failure
    // only when forceRetryOrchestrated is set; default initial tries once until failure.
    return transport === 'orchestrated' || options?.kind === 'initial';
  }
  return transport === 'orchestrated';
};

/**
 * Stable React key for feed cards (never array index).
 */
export const getStableFeedReactKey = (item: any, index?: number): string => {
  const feedKey = String(item?.feedKey || item?.entityKey || '').trim();
  if (feedKey) return feedKey;
  const id = String(item?.id || item?.postId || item?.sourceId || '').trim();
  if (id) return id;
  const fallback = String(item?.createdAt || item?.created_at || '').trim();
  if (fallback) return `item-${fallback}`;
  return `item-idx-${Number(index || 0)}`;
};

/**
 * Merge realtime insert without resetting pagination cursors (caller keeps cursor state).
 */
export const prependRealtimeItem = <T extends { id?: string | null }>(
  existing: T[],
  incoming: T | null | undefined
): { next: T[]; inserted: boolean } => {
  if (!incoming) return { next: existing, inserted: false };
  const id = String(incoming.id || '').trim();
  if (!id) return { next: existing, inserted: false };
  if ((existing || []).some((item) => String(item?.id || '').trim() === id)) {
    return { next: existing, inserted: false };
  }
  return { next: [incoming, ...(existing || [])], inserted: true };
};
