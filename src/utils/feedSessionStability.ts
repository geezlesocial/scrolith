/**
 * Phase 21.1.4 — stable feed session: append-only merge, order invariants, soft-refresh isolation.
 * Pure helpers — no React / network. Does not rank or reorder existing session items.
 */
import {
  mergeStreamEntries,
  type FeedStreamEntry,
  buildStreamFromPosts
} from './feedStream';
import { trimFeedForMemory } from './enterpriseFeedEngine';
import { mergeUniqueFeedItems, getStableFeedItemId } from './feedPagination';

export const FEED_SESSION_STABILITY_VERSION = '21.1.4';

export type FeedSessionMeta = {
  sessionId: string;
  surface: string;
  createdAt: number;
  lastAppendAt: number;
};

export type SoftRefreshResult<T> = {
  /** Existing session order preserved. */
  sessionItems: T[];
  /** Genuinely new IDs from the refresh page (not yet in session). */
  pendingNewItems: T[];
  existingCount: number;
  pendingCount: number;
};

export const createFeedSessionId = (surface: string): string => {
  const s = String(surface || 'feed').trim() || 'feed';
  return `${s}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
};

const itemKey = <T extends { id?: string | null }>(item: T, useTypedKeys = false): string => {
  if (useTypedKeys) {
    const typed = getStableFeedItemId(item);
    if (typed) return typed;
  }
  return String((item as any)?.id || '').trim();
};

/**
 * Append-only merge: keep every existing item at its index; append only unseen IDs.
 * Never reorders the session.
 */
export const mergeAppendOnly = <T extends { id?: string | null }>(
  existing: T[],
  incoming: T[],
  options?: { useTypedKeys?: boolean }
): { merged: T[]; addedCount: number } =>
  mergeUniqueFeedItems(existing, incoming, options);

/**
 * Soft-refresh isolation: do not replace or reorder the session.
 * New first-page IDs go into a pending buffer for controlled user apply.
 */
export const isolateSoftRefreshPage = <T extends { id?: string | null }>(
  sessionItems: T[],
  refreshPage: T[],
  options?: { useTypedKeys?: boolean }
): SoftRefreshResult<T> => {
  const existing = Array.isArray(sessionItems) ? sessionItems : [];
  const page = Array.isArray(refreshPage) ? refreshPage : [];
  const seen = new Set<string>();
  existing.forEach((item) => {
    const key = itemKey(item, options?.useTypedKeys);
    if (key) seen.add(key);
  });
  const pendingNewItems: T[] = [];
  page.forEach((item) => {
    const key = itemKey(item, options?.useTypedKeys);
    if (!key || seen.has(key)) return;
    seen.add(key);
    pendingNewItems.push(item);
  });
  return {
    sessionItems: existing,
    pendingNewItems,
    existingCount: existing.length,
    pendingCount: pendingNewItems.length
  };
};

/**
 * Controlled apply of pending new items (user tapped "New posts").
 * Prepends pending, preserves previous session relative order, dedupes.
 */
export const applyPendingNewItems = <T extends { id?: string | null }>(
  sessionItems: T[],
  pendingNewItems: T[],
  options?: { useTypedKeys?: boolean; maxRetained?: number }
): { merged: T[]; addedCount: number } => {
  const existing = Array.isArray(sessionItems) ? sessionItems : [];
  const pending = Array.isArray(pendingNewItems) ? pendingNewItems : [];
  if (!pending.length) return { merged: existing, addedCount: 0 };

  const seen = new Set<string>();
  const merged: T[] = [];
  let addedCount = 0;

  const push = (item: T, countAdd: boolean) => {
    const key = itemKey(item, options?.useTypedKeys);
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push(item);
    if (countAdd) addedCount += 1;
  };

  pending.forEach((item) => push(item, true));
  existing.forEach((item) => push(item, false));

  const cap = Math.max(20, Number(options?.maxRetained || 140));
  if (merged.length > cap) {
    // Drop from the end (oldest tail), keep newest pending + reading window head.
    return { merged: merged.slice(0, cap), addedCount };
  }
  return { merged, addedCount };
};

/** Relative order of shared keys must be identical (subsequence). */
export const assertStableRelativeOrder = <T extends { id?: string | null }>(
  before: T[],
  after: T[],
  options?: { useTypedKeys?: boolean }
): boolean => {
  const beforeKeys = (before || []).map((i) => itemKey(i, options?.useTypedKeys)).filter(Boolean);
  const afterKeys = (after || []).map((i) => itemKey(i, options?.useTypedKeys)).filter(Boolean);
  let bi = 0;
  for (const key of afterKeys) {
    if (!beforeKeys.includes(key)) continue;
    while (bi < beforeKeys.length && beforeKeys[bi] !== key) bi += 1;
    if (bi >= beforeKeys.length) return false;
    bi += 1;
  }
  return true;
};

/** Stream soft-refresh: preserve existing stream order; return pending new entries. */
export const isolateStreamSoftRefresh = (
  session: FeedStreamEntry[],
  refreshPage: FeedStreamEntry[]
): { session: FeedStreamEntry[]; pending: FeedStreamEntry[] } => {
  const existing = Array.isArray(session) ? session : [];
  const page = Array.isArray(refreshPage) ? refreshPage : [];
  const keys = new Set(existing.map((e) => e.key).filter(Boolean));
  const pending = page.filter((e) => e?.key && !keys.has(e.key));
  return { session: existing, pending };
};

export const applyPendingStreamEntries = (
  session: FeedStreamEntry[],
  pending: FeedStreamEntry[],
  maxRetained = 140
): { merged: FeedStreamEntry[]; addedCount: number } => {
  if (!pending.length) return { merged: session, addedCount: 0 };
  return mergeStreamEntries(session, pending, { prepend: true, maxRetained });
};

/**
 * In-place metadata update by id — never moves position.
 */
export const updateItemInPlace = <T extends { id?: string | null }>(
  items: T[],
  id: string,
  patch: Partial<T> | ((item: T) => T)
): T[] => {
  const target = String(id || '').trim();
  if (!target) return items;
  let changed = false;
  const next = items.map((item) => {
    if (String(item?.id || '').trim() !== target) return item;
    changed = true;
    if (typeof patch === 'function') return patch(item);
    return { ...item, ...patch };
  });
  return changed ? next : items;
};

// --- long-session helpers (retained from 21.0.2) ---

export type LongSessionReport = {
  requestedItems: number;
  retainedItems: number;
  uniqueKeys: number;
  duplicateKeys: number;
  maxRetained: number;
  pages: number;
  ok: boolean;
  reasons: string[];
};

export const buildSyntheticStream = (count: number, prefix = 'p'): FeedStreamEntry[] => {
  const n = Math.max(0, Math.trunc(count));
  const posts = Array.from({ length: n }, (_, i) => ({
    id: `${prefix}-${i}`,
    content: `Synthetic professional update ${i}`,
    authorId: `author-${i % 50}`,
    createdAt: new Date(Date.now() - i * 60_000).toISOString()
  }));
  return buildStreamFromPosts(posts);
};

export const simulateLongSessionAppend = (params: {
  total: number;
  pageSize?: number;
  maxRetained?: number;
}): LongSessionReport => {
  const total = Math.max(0, Math.trunc(params.total));
  const pageSize = Math.max(1, Math.trunc(params.pageSize || 20));
  const maxRetained = Math.max(20, Math.trunc(params.maxRetained || 140));
  let stream: FeedStreamEntry[] = [];
  let pages = 0;
  const allKeys = new Set<string>();
  let duplicateKeys = 0;

  for (let offset = 0; offset < total; offset += pageSize) {
    const end = Math.min(total, offset + pageSize);
    const page = buildSyntheticStream(end - offset, `page${pages}`);
    const remapped = page.map((entry, i) => {
      const id = `item-${offset + i}`;
      return {
        ...entry,
        key: `POST:${id}`,
        post: entry.post ? { ...entry.post, id } : entry.post,
        data: entry.data ? { ...entry.data, id } : entry.data
      };
    });
    const { merged } = mergeStreamEntries(stream, remapped, { maxRetained });
    remapped.forEach((e) => {
      if (allKeys.has(e.key)) duplicateKeys += 1;
      else allKeys.add(e.key);
    });
    stream = trimFeedForMemory(merged, maxRetained) as FeedStreamEntry[];
    pages += 1;
  }

  const keys = new Set(stream.map((e) => e.key));
  const reasons: string[] = [];
  if (stream.length > maxRetained) reasons.push('exceeded_max_retained');
  if (keys.size !== stream.length) reasons.push('duplicate_keys_in_retained');
  if (stream.length === 0 && total > 0) reasons.push('empty_after_session');

  return {
    requestedItems: total,
    retainedItems: stream.length,
    uniqueKeys: keys.size,
    duplicateKeys,
    maxRetained,
    pages,
    ok: reasons.length === 0 && stream.length === Math.min(total, maxRetained),
    reasons
  };
};

export const assertCursorIntegrity = (params: {
  cursor: string | null | undefined;
  isTerminal: boolean;
  loadedCount: number;
}): { ok: boolean; reason?: string } => {
  const cursor = String(params.cursor || '').trim() || null;
  if (params.isTerminal && cursor) {
    return { ok: false, reason: 'terminal_with_cursor' };
  }
  return { ok: true };
};

export const assertStableOrderAfterTrim = (
  before: FeedStreamEntry[],
  after: FeedStreamEntry[]
): boolean => {
  const beforeKeys = before.map((e) => e.key);
  const afterKeys = after.map((e) => e.key);
  let bi = 0;
  for (const key of afterKeys) {
    while (bi < beforeKeys.length && beforeKeys[bi] !== key) bi += 1;
    if (bi >= beforeKeys.length) return false;
    bi += 1;
  }
  return true;
};

/** Dev/test: detect destructive soft-refresh (first N keys all changed). */
export const detectDestructiveReplacement = <T extends { id?: string | null }>(
  before: T[],
  after: T[],
  windowSize = 5
): boolean => {
  if (!before.length || !after.length) return false;
  const n = Math.min(windowSize, before.length, after.length);
  let mismatches = 0;
  for (let i = 0; i < n; i += 1) {
    if (String(before[i]?.id || '') !== String(after[i]?.id || '')) mismatches += 1;
  }
  return mismatches >= Math.ceil(n * 0.8);
};
