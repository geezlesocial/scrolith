/**
 * Domain event adapters (Phase 10.6).
 * Normalize source-specific payload quirks into envelope-level fields.
 * Placeholders for Scrolitha / Discovery / Search — no external calls.
 */
import type { EventEnvelope, EventDomainSource } from './event.types';
import { normalizeEventSource } from './event.validation';

export type DomainEventAdapter = {
  name: string;
  source: EventDomainSource;
  /** true when adapter is reserved / does not enrich yet */
  placeholder?: boolean;
  adapt: (envelope: EventEnvelope) => EventEnvelope;
};

const asString = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
};

const mergeRecipients = (
  envelope: EventEnvelope,
  extra: Array<{ userId: string; role?: string | null }>
): EventEnvelope => {
  const map = new Map<string, { userId: string; role?: string | null }>();
  for (const r of envelope.recipients || []) {
    if (r?.userId) map.set(r.userId, r);
  }
  for (const r of extra) {
    if (r?.userId && !map.has(r.userId)) map.set(r.userId, r);
  }
  return { ...envelope, recipients: map.size ? Array.from(map.values()) : envelope.recipients };
};

const messagingAdapter: DomainEventAdapter = {
  name: 'messaging',
  source: 'messaging',
  adapt: (envelope) => {
    const p = envelope.payload || {};
    const extras: Array<{ userId: string; role?: string | null }> = [];
    const to = asString(p.toUserId) || asString(p.recipientUserId);
    if (to) extras.push({ userId: to, role: 'recipient' });
    const participants = p.participantIds;
    if (Array.isArray(participants)) {
      for (const id of participants) {
        const uid = asString(id);
        if (uid && uid !== envelope.actor?.id) extras.push({ userId: uid, role: 'participant' });
      }
    }
    let next = mergeRecipients(envelope, extras);
    if (!next.entity?.id && asString(p.conversationId || p.threadId || p.messageId)) {
      next = {
        ...next,
        entity: {
          type: asString(p.conversationId) ? 'conversation' : 'message',
          id: asString(p.conversationId || p.threadId || p.messageId),
          parentId: asString(p.conversationId) || null
        }
      };
    }
    return next;
  }
};

const socialEntityAdapter = (
  name: EventDomainSource,
  entityType: string,
  recipientKeys: string[]
): DomainEventAdapter => ({
  name,
  source: name,
  adapt: (envelope) => {
    const p = envelope.payload || {};
    const extras: Array<{ userId: string; role?: string | null }> = [];
    for (const key of recipientKeys) {
      const v = asString(p[key]);
      if (v) extras.push({ userId: v, role: key });
    }
    let next = mergeRecipients(envelope, extras);
    if (!next.entity?.id) {
      const id =
        asString(p.postId) ||
        asString(p.commentId) ||
        asString(p.entityId) ||
        asString(p.targetId);
      if (id) {
        next = {
          ...next,
          entity: {
            type: entityType,
            id,
            parentId: asString(p.postId) || asString(p.parentId) || null
          }
        };
      }
    }
    if (!next.actor?.id) {
      const actorId = asString(p.actorId) || asString(p.userId) || asString(p.fromUserId);
      if (actorId) {
        next = {
          ...next,
          actor: { id: actorId, type: 'user', displayName: asString(p.actorName) }
        };
      }
    }
    return next;
  }
});

const jobsAdapter: DomainEventAdapter = {
  name: 'jobs',
  source: 'jobs',
  adapt: (envelope) => {
    const p = envelope.payload || {};
    const extras: Array<{ userId: string; role?: string | null }> = [];
    for (const key of ['employerId', 'applicantId', 'candidateId', 'recruiterId', 'ownerId']) {
      const v = asString(p[key]);
      if (v) extras.push({ userId: v, role: key });
    }
    let next = mergeRecipients(envelope, extras);
    if (!next.entity?.id && asString(p.jobId || p.applicationId || p.proposalId)) {
      next = {
        ...next,
        entity: {
          type: asString(p.applicationId) ? 'application' : 'job',
          id: asString(p.applicationId || p.proposalId || p.jobId),
          parentId: asString(p.jobId) || null
        }
      };
    }
    return next;
  }
};

const systemAdapter: DomainEventAdapter = {
  name: 'system',
  source: 'system',
  adapt: (envelope) => {
    const p = envelope.payload || {};
    const extras: Array<{ userId: string; role?: string | null }> = [];
    const uid = asString(p.userId) || asString(p.targetUserId);
    if (uid) extras.push({ userId: uid, role: 'subject' });
    let next = mergeRecipients(envelope, extras);
    if (!next.actor) {
      next = {
        ...next,
        actor: { id: 'system', type: 'system', displayName: 'System' }
      };
    }
    return next;
  }
};

/** Placeholders — pass-through enrichment only */
const placeholderAdapter = (source: EventDomainSource): DomainEventAdapter => ({
  name: source,
  source,
  placeholder: true,
  adapt: (envelope) => ({
    ...envelope,
    meta: {
      ...(envelope.meta || {}),
      adapterPlaceholder: true,
      adapterSource: source
    }
  })
});

export const DOMAIN_EVENT_ADAPTERS: DomainEventAdapter[] = [
  messagingAdapter,
  socialEntityAdapter('posts', 'post', ['authorId', 'ownerId']),
  socialEntityAdapter('comments', 'comment', ['authorId', 'postAuthorId', 'ownerId', 'parentAuthorId']),
  socialEntityAdapter('reactions', 'reaction', ['authorId', 'postAuthorId', 'ownerId']),
  socialEntityAdapter('follows', 'follow', ['followedUserId', 'targetUserId', 'userId']),
  jobsAdapter,
  socialEntityAdapter('marketplace', 'listing', ['sellerId', 'buyerId', 'ownerId']),
  socialEntityAdapter('communities', 'community', ['ownerId', 'moderatorId', 'memberId']),
  socialEntityAdapter('companies', 'company', ['ownerId', 'adminId', 'followerId']),
  systemAdapter,
  placeholderAdapter('scrolitha'),
  placeholderAdapter('discovery'),
  placeholderAdapter('search')
];

const bySource = new Map(DOMAIN_EVENT_ADAPTERS.map((a) => [a.source, a]));

export const getAdapterForSource = (source: string): DomainEventAdapter | null => {
  const key = normalizeEventSource(source);
  return bySource.get(key as EventDomainSource) || null;
};

/**
 * Apply domain adapter enrichment. Unknown sources return envelope unchanged.
 */
export const applyDomainAdapter = (envelope: EventEnvelope): {
  envelope: EventEnvelope;
  adapterName: string | null;
  placeholder: boolean;
} => {
  const adapter = getAdapterForSource(String(envelope.source));
  if (!adapter) {
    return { envelope, adapterName: null, placeholder: false };
  }
  return {
    envelope: adapter.adapt(envelope),
    adapterName: adapter.name,
    placeholder: Boolean(adapter.placeholder)
  };
};

export const listDomainEventAdapters = () =>
  DOMAIN_EVENT_ADAPTERS.map((a) => ({
    name: a.name,
    source: a.source,
    placeholder: Boolean(a.placeholder)
  }));
