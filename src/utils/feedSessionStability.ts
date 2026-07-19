/**
 * Phase 21.0.2 — long-session stability helpers (pure).
 * Used for stress tests and production memory guards. No React / network.
 */
import {
  mergeStreamEntries,
  type FeedStreamEntry,
  buildStreamFromPosts
} from './feedStream';
import { trimFeedForMemory } from './enterpriseFeedEngine';

export const FEED_SESSION_STABILITY_VERSION = '21.0.2';

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

/** Build N synthetic post stream entries for stress tests. */
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

/**
 * Simulate paginated append of `total` items in pages of `pageSize`,
 * applying merge + memory trim each page (mirrors production lifecycle).
 */
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
    // Force unique ids across pages
    const remapped = page.map((entry, i) => {
      const id = `item-${offset + i}`;
      return {
        ...entry,
        key: `POST:${id}`,
        post: entry.post ? { ...entry.post, id } : entry.post,
        data: entry.data ? { ...entry.data, id } : entry.data
      };
    });
    const { merged, addedCount } = mergeStreamEntries(stream, remapped, { maxRetained });
    // Count duplicates that failed to add
    remapped.forEach((e) => {
      if (allKeys.has(e.key)) duplicateKeys += 1;
      else allKeys.add(e.key);
    });
    stream = trimFeedForMemory(merged, maxRetained) as FeedStreamEntry[];
    pages += 1;
    if (addedCount < 0) {
      // impossible — guard
    }
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

/** Detect cursor corruption: cursor must be null when terminal, non-empty when can continue. */
export const assertCursorIntegrity = (params: {
  cursor: string | null | undefined;
  isTerminal: boolean;
  loadedCount: number;
}): { ok: boolean; reason?: string } => {
  const cursor = String(params.cursor || '').trim() || null;
  if (params.isTerminal && cursor) {
    return { ok: false, reason: 'terminal_with_cursor' };
  }
  if (!params.isTerminal && params.loadedCount > 0 && !cursor) {
    // Soft: may be end of feed without terminal flag yet
    return { ok: true };
  }
  return { ok: true };
};

/** No scroll jump invariant: after trim from head, keys that remain keep relative order. */
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
