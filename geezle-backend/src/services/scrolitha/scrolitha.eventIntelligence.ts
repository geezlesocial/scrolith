/**
 * Event-driven intelligence engine.
 * Reacts to platform domain events without polling.
 * Keeps work cheap by default (cache warm + analytics); never blocks request path.
 */
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';
import { trackAnalytics } from './scrolitha.analytics';
import { recordIntelligenceMetric } from './scrolitha.observability';

export type PlatformIntelligenceEventType =
  | 'post.created'
  | 'post.updated'
  | 'post.deleted'
  | 'comment.created'
  | 'comment.reply'
  | 'mention.created'
  | 'community.activity'
  | 'job.created'
  | 'profile.updated'
  | 'service.updated'
  | 'company.updated'
  | 'event.created'
  | 'poll.created';

export type PlatformIntelligenceEvent = {
  type: PlatformIntelligenceEventType;
  actorId?: string | null;
  entityType?: string;
  entityId?: string;
  postId?: string | null;
  communityId?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  at?: number;
};

type EventHandler = (event: PlatformIntelligenceEvent) => void | Promise<void>;

const handlers = new Map<PlatformIntelligenceEventType | '*', Set<EventHandler>>();
const recentEventKeys = new Set<string>();

const DEDUPE_TTL_MS = 15_000;

const register = (type: PlatformIntelligenceEventType | '*', handler: EventHandler) => {
  if (!handlers.has(type)) handlers.set(type, new Set());
  handlers.get(type)!.add(handler);
  return () => handlers.get(type)?.delete(handler);
};

/** Public subscribe API for internal modules/tests. */
export const onIntelligenceEvent = register;

const dedupeKey = (event: PlatformIntelligenceEvent) =>
  hashCacheKey([
    event.type,
    event.entityId || '',
    event.postId || '',
    event.actorId || '',
    JSON.stringify(event.metadata || {})
  ]);

const isDuplicate = (event: PlatformIntelligenceEvent) => {
  const key = dedupeKey(event);
  if (recentEventKeys.has(key)) return true;
  recentEventKeys.add(key);
  setTimeout(() => recentEventKeys.delete(key), DEDUPE_TTL_MS).unref?.();
  return false;
};

const defaultWarmCaches = async (event: PlatformIntelligenceEvent) => {
  // Lightweight: store last-event fingerprint per entity for ranking recency signals.
  if (event.entityId) {
    enterpriseCache.set(
      'entity',
      `last_event:${event.entityType || 'entity'}:${event.entityId}`,
      { type: event.type, at: event.at || Date.now() },
      5 * 60_000
    );
  }
  if (event.postId) {
    enterpriseCache.set(
      'entity',
      `last_event:post:${event.postId}`,
      { type: event.type, at: event.at || Date.now() },
      5 * 60_000
    );
    // Invalidate graph cache entries for this post (prefix scan not available; set invalidation marker)
    enterpriseCache.set('graph', `invalidate:${event.postId}`, Date.now(), 60_000);
  }
};

// Built-in safe handlers
register('*', async (event) => {
  trackAnalytics('event_ingested');
  recordIntelligenceMetric('events');
  await defaultWarmCaches(event);
});

register('mention.created', async (event) => {
  // Mentions of Scrolitha are handled by contextual pipeline; record only.
  enterpriseCache.set(
    'analytics',
    `mention:${event.entityId || event.postId || 'unknown'}`,
    { at: Date.now(), actorId: event.actorId || null },
    10 * 60_000
  );
});

register('post.deleted', async (event) => {
  if (event.postId) {
    enterpriseCache.set('graph', `invalidate:${event.postId}`, Date.now(), 120_000);
  }
});

/**
 * Emit a platform intelligence event (non-blocking).
 * Safe to call from controllers after successful mutations.
 */
export const emitPlatformIntelligenceEvent = (event: PlatformIntelligenceEvent) => {
  const payload: PlatformIntelligenceEvent = {
    ...event,
    at: event.at || Date.now()
  };

  if (isDuplicate(payload)) return { accepted: false, reason: 'deduped' as const };

  // Cross-layer invalidation contracts (cache) — safe, non-blocking
  try {
    if (payload.postId) {
      enterpriseCache.invalidate({ type: 'post', postId: payload.postId });
    }
    if (payload.entityType && payload.entityId) {
      enterpriseCache.invalidate({
        type: 'entity',
        entityType: payload.entityType,
        entityId: String(payload.entityId)
      });
    }
  } catch {
    // ignore
  }

  setImmediate(() => {
    const run = async () => {
      const star = handlers.get('*');
      if (star) {
        for (const h of star) {
          try {
            await h(payload);
          } catch {
            // never throw into request path
          }
        }
      }
      const typed = handlers.get(payload.type);
      if (typed) {
        for (const h of typed) {
          try {
            await h(payload);
          } catch {
            // ignore
          }
        }
      }
    };
    void run();
  });

  return { accepted: true as const };
};

export const mapCommunitySocketToIntelligenceEvent = (input: {
  socketEvent: string;
  postId?: string;
  commentId?: string;
  actorId?: string;
  parentId?: string | null;
}): PlatformIntelligenceEvent | null => {
  const ev = String(input.socketEvent || '');
  if (ev === 'community:post_created') {
    return {
      type: 'post.created',
      postId: input.postId,
      entityType: 'post',
      entityId: input.postId,
      actorId: input.actorId
    };
  }
  if (ev === 'community:post_updated') {
    return {
      type: 'post.updated',
      postId: input.postId,
      entityType: 'post',
      entityId: input.postId,
      actorId: input.actorId
    };
  }
  if (ev === 'community:post_deleted') {
    return {
      type: 'post.deleted',
      postId: input.postId,
      entityType: 'post',
      entityId: input.postId,
      actorId: input.actorId
    };
  }
  if (ev === 'community:post_comment_created') {
    return {
      type: input.parentId ? 'comment.reply' : 'comment.created',
      postId: input.postId,
      entityType: 'comment',
      entityId: input.commentId,
      actorId: input.actorId,
      metadata: { parentId: input.parentId || null }
    };
  }
  return null;
};
