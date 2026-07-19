/**
 * Phase 21.0.1 — Ordered mixed-stream helpers.
 * Preserves feedOrchestrator item order. No ranking / reordering.
 */
import {
  type MemberFeedPage,
  type UnifiedFeedItem,
  toPostLikePayload
} from '../services/memberFeed';
import { extractEntityKeyFromItem } from './continuousFeed';

export const FEED_STREAM_VERSION = '21.0.1';

export type FeedStreamKind =
  | 'post'
  | 'job'
  | 'gig'
  | 'marketplace'
  | 'person'
  | 'page'
  | 'community'
  | 'ad'
  | 'story'
  | 'scroll'
  | 'event'
  | 'featured'
  | 'trending'
  | 'unknown';

export type FeedStreamEntry = {
  /** Stable key for React + virtualization. */
  key: string;
  kind: FeedStreamKind;
  type: string;
  /** Post-like payload when kind === 'post'. */
  post?: any | null;
  /** Original orchestrated item (authoritative order). */
  raw: UnifiedFeedItem | any;
  /** Presentation payload for non-post cards. */
  data: any;
};

const normalizeType = (value: unknown) =>
  String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '_');

export const resolveStreamKind = (type: unknown): FeedStreamKind => {
  const t = normalizeType(type);
  if (t === 'POST' || t === 'COMMUNITY_POST') return 'post';
  if (t === 'JOB') return 'job';
  if (t === 'GIG') return 'gig';
  if (t === 'MARKETPLACE_LISTING' || t === 'MARKETPLACE') return 'marketplace';
  if (t === 'PERSON_RECOMMENDATION' || t === 'PERSON') return 'person';
  if (t === 'PAGE_RECOMMENDATION' || t === 'PAGE') return 'page';
  if (t === 'COMMUNITY_RECOMMENDATION' || t === 'COMMUNITY') return 'community';
  if (t === 'AD') return 'ad';
  if (t === 'STORY') return 'story';
  if (t === 'SCROLL_VIDEO') return 'scroll';
  if (t === 'EVENT') return 'event';
  if (t === 'FEATURED') return 'featured';
  if (t === 'TRENDING') return 'trending';
  return 'unknown';
};

/** Convert a single orchestrated item into a stream entry (order-preserving). */
export const toStreamEntry = (item: UnifiedFeedItem | any, index = 0): FeedStreamEntry | null => {
  if (!item || typeof item !== 'object') return null;
  const type = normalizeType(item.type || item.feedItemType || 'POST');
  const kind = resolveStreamKind(type);
  const feedKey =
    String(item.feedKey || item.entityKey || extractEntityKeyFromItem(item) || '').trim() ||
    `${kind}:${String(item.id || item.sourceId || index)}`;

  if (kind === 'post') {
    const post = toPostLikePayload(item as UnifiedFeedItem) || item.payload || item;
    if (!post?.id && !item.id) return null;
    const id = String(post?.id || item.id || item.sourceId || '').trim();
    return {
      key: feedKey || `post:${id}`,
      kind: 'post',
      type,
      post: { ...post, id, feedKey: feedKey || `POST:${id}`, feedItemType: type },
      raw: item,
      data: post
    };
  }

  const payload =
    item.payload && typeof item.payload === 'object' ? { ...item.payload } : { ...item };
  const id = String(payload.id || item.id || item.sourceId || '').trim() || feedKey;
  return {
    key: feedKey || `${kind}:${id}`,
    kind,
    type,
    post: null,
    raw: item,
    data: {
      ...payload,
      id,
      feedKey,
      why: item.why ?? payload.why,
      author: item.author || payload.author,
      intelligence: (item as any).intelligence || payload.intelligence,
      sponsored: kind === 'ad' ? true : payload.sponsored
    }
  };
};

/** Build ordered stream from orchestrator page (authoritative order). */
export const buildStreamFromMemberFeedPage = (page: MemberFeedPage | null | undefined): FeedStreamEntry[] => {
  if (!page) return [];
  if (Array.isArray(page.items) && page.items.length) {
    return page.items.map((item, i) => toStreamEntry(item, i)).filter(Boolean) as FeedStreamEntry[];
  }
  // Fallback: posts-only order when items empty but posts present (legacy partition).
  return (Array.isArray(page.posts) ? page.posts : [])
    .map((post, i) =>
      toStreamEntry(
        {
          type: 'POST',
          id: post?.id,
          sourceId: post?.id,
          feedKey: post?.feedKey || `POST:${post?.id}`,
          payload: post,
          author: post?.author
        },
        i
      )
    )
    .filter(Boolean) as FeedStreamEntry[];
};

/** Build stream from a plain post list (legacy path). */
export const buildStreamFromPosts = (posts: any[]): FeedStreamEntry[] =>
  (Array.isArray(posts) ? posts : [])
    .map((post, i) => {
      const id = String(post?.id || '').trim();
      if (!id) return null;
      return {
        key: String(post?.feedKey || `POST:${id}`),
        kind: 'post' as const,
        type: 'POST',
        post,
        raw: post,
        data: post
      };
    })
    .filter(Boolean) as FeedStreamEntry[];

/**
 * Merge stream pages preserving order, deduping by key.
 * Does not re-rank.
 */
export const mergeStreamEntries = (
  existing: FeedStreamEntry[],
  incoming: FeedStreamEntry[],
  options?: { prepend?: boolean; maxRetained?: number }
): { merged: FeedStreamEntry[]; addedCount: number } => {
  const keys = new Set<string>();
  const merged: FeedStreamEntry[] = [];
  let addedCount = 0;

  const push = (entry: FeedStreamEntry, countAdd: boolean) => {
    if (!entry?.key || keys.has(entry.key)) return;
    // Also dedupe posts by plain id.
    if (entry.kind === 'post' && entry.post?.id) {
      const pid = `id:${String(entry.post.id)}`;
      if (keys.has(pid)) return;
      keys.add(pid);
    }
    keys.add(entry.key);
    merged.push(entry);
    if (countAdd) addedCount += 1;
  };

  if (options?.prepend) {
    (incoming || []).forEach((e) => push(e, true));
    (existing || []).forEach((e) => push(e, false));
  } else {
    (existing || []).forEach((e) => push(e, false));
    (incoming || []).forEach((e) => push(e, true));
  }

  // Phase 21.1.7 — preserve session head; drop oldest tail when over cap.
  const cap = Math.max(20, Number(options?.maxRetained || 140));
  if (merged.length > cap) {
    return { merged: merged.slice(0, cap), addedCount };
  }
  return { merged, addedCount };
};

/** Extract post-like list from stream (for secondary rails / view tracking). */
export const postsFromStream = (entries: FeedStreamEntry[]): any[] =>
  (entries || []).filter((e) => e.kind === 'post' && e.post).map((e) => e.post);
