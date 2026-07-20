/**
 * Phase 24 — Community feed/session stability helpers (Community-scoped).
 * Mirrors Phase 21 principles without sharing Member Home session state.
 */

export type CommunityFeedSession = {
  surface: 'community';
  sessionId: string;
  loadedIds: string[];
  cursor: string | null;
  orderFrozen: boolean;
  createdAt: number;
};

export const createCommunityFeedSession = (): CommunityFeedSession => ({
  surface: 'community',
  sessionId: `community-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
  loadedIds: [],
  cursor: null,
  orderFrozen: true,
  createdAt: Date.now()
});

export const getCommunityItemKey = (item: { id?: string; postId?: string; threadId?: string }, index = 0) => {
  const id = String(item?.id || item?.postId || item?.threadId || '').trim();
  return id || `community-item-${index}`;
};

/** Append-only unique merge; preserves existing order (no destructive rerank). */
export const mergeCommunityItemsAppendOnly = <T extends { id?: string; postId?: string }>(
  existing: T[],
  incoming: T[]
): { items: T[]; duplicates: number } => {
  const seen = new Set(
    existing.map((item, index) => getCommunityItemKey(item, index)).filter(Boolean)
  );
  let duplicates = 0;
  const next = [...existing];
  for (const item of incoming) {
    const key = getCommunityItemKey(item, next.length);
    if (!key || seen.has(key)) {
      duplicates += 1;
      continue;
    }
    seen.add(key);
    next.push(item);
  }
  return { items: next, duplicates };
};

export const shouldSkipStaleCommunitySearch = (
  requestSeq: number,
  latestSeq: number
) => requestSeq !== latestSeq;

export const parseCommunityUrlState = (search: string) => {
  const params = new URLSearchParams(search || '');
  const tab = String(params.get('tab') || 'all').toLowerCase();
  const sort = String(params.get('sort') || 'newest').toLowerCase();
  const category = String(params.get('category') || '').trim();
  const q = String(params.get('q') || '').trim();
  const group = String(params.get('group') || '').trim();
  const allowedTabs = new Set(['all', 'joined', 'recommended', 'mine', 'trending']);
  const allowedSorts = new Set(['newest', 'trending', 'most_active', 'name']);
  return {
    tab: allowedTabs.has(tab) ? tab : 'all',
    sort: allowedSorts.has(sort) ? sort : 'newest',
    category,
    q,
    group
  };
};

export const buildCommunityUrlSearch = (state: {
  tab?: string;
  sort?: string;
  category?: string;
  q?: string;
  group?: string;
}) => {
  const params = new URLSearchParams();
  if (state.tab && state.tab !== 'all') params.set('tab', state.tab);
  if (state.sort && state.sort !== 'newest') params.set('sort', state.sort);
  if (state.category) params.set('category', state.category);
  if (state.q) params.set('q', state.q);
  if (state.group) params.set('group', state.group);
  const raw = params.toString();
  return raw ? `?${raw}` : '';
};
