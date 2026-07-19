/**
 * Phase 21.0.2 — scroll restoration for continuous feeds (privacy-safe).
 * Stores only numeric scroll offsets keyed by surface — no content bodies.
 */

export const FEED_SCROLL_RESTORE_VERSION = '21.0.2';

const PREFIX = 'scrolith.feed.scroll.';

export type FeedScrollSnapshot = {
  y: number;
  ts: number;
  version: string;
};

export const scrollStorageKey = (surface: string, viewerKey = 'guest') =>
  `${PREFIX}${String(surface || 'member_home')}:${String(viewerKey || 'guest')}`;

export const saveFeedScrollPosition = (
  surface: string,
  y: number,
  viewerKey = 'guest'
): void => {
  if (typeof window === 'undefined') return;
  const value: FeedScrollSnapshot = {
    y: Math.max(0, Math.trunc(Number(y) || 0)),
    ts: Date.now(),
    version: FEED_SCROLL_RESTORE_VERSION
  };
  try {
    window.sessionStorage.setItem(scrollStorageKey(surface, viewerKey), JSON.stringify(value));
  } catch {
    // ignore quota
  }
};

export const readFeedScrollPosition = (
  surface: string,
  viewerKey = 'guest',
  maxAgeMs = 30 * 60 * 1000
): number | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(scrollStorageKey(surface, viewerKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as FeedScrollSnapshot;
    if (!parsed || typeof parsed.y !== 'number') return null;
    if (Date.now() - Number(parsed.ts || 0) > maxAgeMs) return null;
    return Math.max(0, Math.trunc(parsed.y));
  } catch {
    return null;
  }
};

export const clearFeedScrollPosition = (surface: string, viewerKey = 'guest'): void => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.removeItem(scrollStorageKey(surface, viewerKey));
  } catch {
    // ignore
  }
};

/** Restore window or element scroll after feed paint. */
export const restoreFeedScroll = (params: {
  surface: string;
  viewerKey?: string;
  element?: HTMLElement | null;
}): boolean => {
  const y = readFeedScrollPosition(params.surface, params.viewerKey || 'guest');
  if (y == null || y <= 0) return false;
  try {
    if (params.element) {
      params.element.scrollTop = y;
    } else if (typeof window !== 'undefined') {
      window.scrollTo({ top: y, behavior: 'auto' });
    }
    return true;
  } catch {
    return false;
  }
};
