/**
 * Phase 1 perf — idle/hover prefetch of lazy route modules.
 * Safe no-op on failure; never blocks UI.
 */

type PrefetchFn = () => Promise<unknown>;

const prefetched = new Set<string>();

export const prefetchRouteModule = (key: string, loader: PrefetchFn) => {
  const id = String(key || '').trim();
  if (!id || prefetched.has(id)) return;
  prefetched.add(id);
  const run = () => {
    void loader().catch(() => {
      prefetched.delete(id);
    });
  };
  try {
    const ric = (window as any).requestIdleCallback as
      | undefined
      | ((cb: () => void, opts?: { timeout: number }) => number);
    if (typeof ric === 'function') {
      ric(run, { timeout: 1800 });
      return;
    }
  } catch {
    /* ignore */
  }
  window.setTimeout(run, 200);
};

/** Common authenticated destinations — keep keys stable for Set dedupe. */
export const PREFETCH_LOADERS = {
  messages: () => import('../messages/Messages'),
  community: () => import('../community/CommunityHome'),
  notifications: () => import('../pages/NotificationCenter'),
  discovery: () => import('../pages/discovery/PersonalizedDiscovery'),
  marketplace: () => import('../pages/marketplace/MarketplacePage'),
  scroll: () => import('../features/scroll/ScrollFeed'),
  assistant: () => import('../pages/assistant/ScrolithaAssistantPage')
} as const;
