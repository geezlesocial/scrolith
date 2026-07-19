/**
 * Phase 21.1.7 — lightweight feed identity instrumentation for WebKit diagnosis.
 * Writes a ring buffer to window.__scrolithFeedLifecycleLog (no PII beyond post ids).
 */

export type FeedLifecycleEventType =
  | 'session_start'
  | 'commit_stream'
  | 'load_start'
  | 'load_end'
  | 'soft_refresh_isolate'
  | 'soft_refresh_reject_replace'
  | 'initial_protected'
  | 'pagination_merge'
  | 'memory_trim'
  | 'head_change'
  | 'visibility_change'
  | 'online_change'
  | 'sync_ui'
  | 'reject_head_swap'
  | 'recommendation_note'
  | 'webkit_lifecycle'
  | 'probe';

export type FeedLifecycleEvent = {
  t: number;
  type: FeedLifecycleEventType;
  surface?: string;
  sessionId?: string;
  mode?: string;
  headPostId?: string | null;
  headKey?: string | null;
  streamLen?: number;
  renderedCount?: number;
  pendingCount?: number;
  uniqueAdded?: number;
  reason?: string;
  detail?: Record<string, unknown>;
};

const MAX_EVENTS = 200;
const startedAt = Date.now();

const getBuffer = (): FeedLifecycleEvent[] => {
  if (typeof window === 'undefined') return [];
  const w = window as any;
  if (!Array.isArray(w.__scrolithFeedLifecycleLog)) {
    w.__scrolithFeedLifecycleLog = [];
  }
  return w.__scrolithFeedLifecycleLog as FeedLifecycleEvent[];
};

export const pushFeedLifecycleEvent = (event: Omit<FeedLifecycleEvent, 't'> & { t?: number }) => {
  if (typeof window === 'undefined') return;
  const row: FeedLifecycleEvent = {
    ...event,
    t: typeof event.t === 'number' ? event.t : Date.now() - startedAt
  };
  const buf = getBuffer();
  buf.push(row);
  if (buf.length > MAX_EVENTS) {
    buf.splice(0, buf.length - MAX_EVENTS);
  }
  try {
    (window as any).__scrolithFeedSessionId = event.sessionId || (window as any).__scrolithFeedSessionId;
    if (event.headPostId != null) {
      (window as any).__scrolithFeedHeadPostId = event.headPostId;
    }
  } catch {
    /* ignore */
  }
};

export const firstPostIdFromStream = (
  stream: Array<{ kind?: string; key?: string; post?: { id?: string | null } | null }>
): string | null => {
  for (const entry of stream || []) {
    if (entry?.kind === 'post' && entry.post?.id) return String(entry.post.id);
    if (entry?.post?.id) return String(entry.post.id);
  }
  return null;
};

export const firstPostKeyFromStream = (
  stream: Array<{ kind?: string; key?: string; post?: { id?: string | null } | null }>
): string | null => {
  for (const entry of stream || []) {
    if (entry?.kind === 'post' && entry?.key) return String(entry.key);
    if (entry?.kind === 'post' && entry.post?.id) return `POST:${entry.post.id}`;
  }
  return stream?.[0]?.key ? String(stream[0].key) : null;
};

export const readFeedLifecycleLog = (): FeedLifecycleEvent[] => {
  if (typeof window === 'undefined') return [];
  return [...getBuffer()];
};
