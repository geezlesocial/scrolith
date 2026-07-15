/**
 * EventEnvelope validation (Phase 10.6).
 */
import type { EventEnvelope, EventIntegrationIssue, EventDomainSource } from './event.types';
import { ALL_EVENT_DOMAIN_SOURCES } from './event.types';

export class EventIntegrationValidationError extends Error {
  statusCode = 400;
  code = 'EVENT_INTEGRATION_VALIDATION_ERROR';
  issues: EventIntegrationIssue[];

  constructor(message: string, issues: EventIntegrationIssue[] = []) {
    super(message);
    this.name = 'EventIntegrationValidationError';
    this.issues = issues;
  }
}

const asString = (v: unknown): string | null => {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s || null;
};

const isObject = (v: unknown): v is Record<string, unknown> =>
  Boolean(v) && typeof v === 'object' && !Array.isArray(v);

export const normalizeEventSource = (raw: unknown): EventDomainSource | string => {
  const s = String(raw || '')
    .trim()
    .toLowerCase();
  if (!s) return 'unknown';
  if ((ALL_EVENT_DOMAIN_SOURCES as string[]).includes(s)) return s as EventDomainSource;
  // aliases
  if (s === 'messages' || s === 'dm' || s === 'chat') return 'messaging';
  if (s === 'post' || s === 'feed') return 'posts';
  if (s === 'comment') return 'comments';
  if (s === 'reaction' || s === 'like' || s === 'likes') return 'reactions';
  if (s === 'follow' || s === 'follower') return 'follows';
  if (s === 'job' || s === 'careers') return 'jobs';
  if (s === 'market' || s === 'commerce') return 'marketplace';
  if (s === 'community' || s === 'groups') return 'communities';
  if (s === 'company' || s === 'pages') return 'companies';
  if (s === 'ai' || s === 'scrolitha_ai') return 'scrolitha';
  if (s === 'recommend' || s === 'recommendations') return 'discovery';
  if (s === 'enterprise_search') return 'search';
  return s;
};

/**
 * Validate and normalize a raw envelope into EventEnvelope.
 * Throws EventIntegrationValidationError on hard failures.
 */
export const validateEventEnvelope = (raw: unknown): EventEnvelope => {
  const issues: EventIntegrationIssue[] = [];
  if (!isObject(raw)) {
    throw new EventIntegrationValidationError('EventEnvelope must be an object', [
      { code: 'not_object', message: 'EventEnvelope must be an object' }
    ]);
  }

  const eventId = asString(raw.eventId) || asString(raw.id);
  if (!eventId) {
    issues.push({ code: 'eventId_required', message: 'eventId is required', path: 'eventId' });
  }

  const type = asString(raw.type) || asString(raw.eventType);
  if (!type) {
    issues.push({ code: 'type_required', message: 'type is required', path: 'type' });
  }

  const source = normalizeEventSource(raw.source ?? raw.system ?? raw.domain);

  let occurredAt = asString(raw.occurredAt) || asString(raw.timestamp) || asString(raw.createdAt);
  if (!occurredAt) {
    occurredAt = new Date().toISOString();
  } else {
    const t = Date.parse(occurredAt);
    if (!Number.isFinite(t)) {
      issues.push({
        code: 'occurredAt_invalid',
        message: 'occurredAt must be a valid ISO date',
        path: 'occurredAt'
      });
      occurredAt = new Date().toISOString();
    } else {
      occurredAt = new Date(t).toISOString();
    }
  }

  if (issues.some((i) => i.code === 'eventId_required' || i.code === 'type_required')) {
    throw new EventIntegrationValidationError('Invalid EventEnvelope', issues);
  }

  const actorRaw = isObject(raw.actor) ? raw.actor : null;
  const entityRaw = isObject(raw.entity) ? raw.entity : null;
  const permsRaw = isObject(raw.permissions) ? raw.permissions : null;

  const recipients: EventEnvelope['recipients'] = [];
  const recIn = raw.recipients ?? raw.recipientIds;
  if (Array.isArray(recIn)) {
    for (const r of recIn) {
      if (typeof r === 'string' && r.trim()) {
        recipients.push({ userId: r.trim() });
      } else if (isObject(r) && asString(r.userId || r.id)) {
        recipients.push({
          userId: asString(r.userId || r.id) as string,
          role: asString(r.role)
        });
      }
    }
  } else if (asString(raw.recipientId)) {
    recipients.push({ userId: asString(raw.recipientId) as string });
  }

  // payload may nest recipients
  const payload = isObject(raw.payload) ? { ...(raw.payload as Record<string, unknown>) } : {};
  if (!recipients.length && asString(payload.recipientId)) {
    recipients.push({ userId: asString(payload.recipientId) as string });
  }
  if (!recipients.length && Array.isArray(payload.recipientIds)) {
    for (const id of payload.recipientIds) {
      if (asString(id)) recipients.push({ userId: asString(id) as string });
    }
  }

  const envelope: EventEnvelope = {
    eventId: eventId as string,
    source,
    type: type as string,
    occurredAt,
    actor: actorRaw
      ? {
          id: asString(actorRaw.id) || asString(payload.actorId),
          type: asString(actorRaw.type) || 'user',
          displayName: asString(actorRaw.displayName) || asString(actorRaw.name)
        }
      : asString(payload.actorId)
        ? { id: asString(payload.actorId), type: 'user', displayName: null }
        : null,
    entity: entityRaw
      ? {
          type: asString(entityRaw.type),
          id: asString(entityRaw.id),
          parentId: asString(entityRaw.parentId)
        }
      : asString(payload.entityId)
        ? {
            type: asString(payload.entityType),
            id: asString(payload.entityId),
            parentId: asString(payload.parentId)
          }
        : null,
    recipients: recipients.length ? recipients : null,
    payload,
    permissions: permsRaw
      ? {
          required: Array.isArray(permsRaw.required)
            ? permsRaw.required.map(String).filter(Boolean)
            : null,
          audience: asString(permsRaw.audience),
          visibility: asString(permsRaw.visibility)
        }
      : null,
    correlationId: asString(raw.correlationId) || asString(raw.correlation_id),
    traceId: asString(raw.traceId) || asString(raw.trace_id),
    idempotencyKey:
      asString(raw.idempotencyKey) ||
      asString(raw.idempotency_key) ||
      asString(raw.dedupeKey) ||
      null,
    schemaVersion:
      raw.schemaVersion != null
        ? (typeof raw.schemaVersion === 'number' || typeof raw.schemaVersion === 'string'
            ? raw.schemaVersion
            : String(raw.schemaVersion))
        : raw.schema_version != null
          ? (typeof raw.schema_version === 'number' || typeof raw.schema_version === 'string'
              ? raw.schema_version
              : String(raw.schema_version))
          : null,
    meta: isObject(raw.meta) ? { ...(raw.meta as Record<string, unknown>) } : null
  };

  return envelope;
};

export const softValidateIssues = (envelope: EventEnvelope): EventIntegrationIssue[] => {
  const issues: EventIntegrationIssue[] = [];
  if (!envelope.recipients?.length) {
    issues.push({
      code: 'no_recipients',
      message: 'No recipients on envelope; evaluation may be empty',
      path: 'recipients'
    });
  }
  if (!envelope.actor?.id) {
    issues.push({
      code: 'actor_missing',
      message: 'Actor id missing',
      path: 'actor.id'
    });
  }
  return issues;
};
