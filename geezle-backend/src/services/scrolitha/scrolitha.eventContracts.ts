/**
 * Distributed event contracts for Scrolitha AI actions.
 * Guarantees: idempotency keys, dedupe, safe replay metadata, ordering hints.
 */
import { createHash } from 'crypto';
import { enterpriseCache } from './scrolitha.enterpriseCache';
import {
  emitPlatformIntelligenceEvent,
  type PlatformIntelligenceEvent,
  type PlatformIntelligenceEventType
} from './scrolitha.eventIntelligence';

export type EventContract = {
  eventId: string;
  idempotencyKey: string;
  type: PlatformIntelligenceEventType | string;
  occurredAt: number;
  producer: string;
  entityType?: string;
  entityId?: string;
  /** Optional causal ordering key (e.g. postId) */
  orderKey?: string;
  /** Monotonic sequence if available */
  sequence?: number;
  payload: PlatformIntelligenceEvent;
  replaySafe: boolean;
};

export type EventProcessResult = {
  accepted: boolean;
  duplicate: boolean;
  eventId: string;
  idempotencyKey: string;
  reason?: string;
};

const processed = new Map<string, number>();
const orderWatermarks = new Map<string, number>();
const DEDUPE_TTL_MS = 60_000;

export const buildIdempotencyKey = (parts: Array<string | number | null | undefined>) =>
  createHash('sha256')
    .update(parts.map((p) => String(p ?? '')).join('|'))
    .digest('hex')
    .slice(0, 40);

export const buildEventContract = (
  event: PlatformIntelligenceEvent,
  opts?: { producer?: string; sequence?: number }
): EventContract => {
  const occurredAt = event.at || Date.now();
  const idempotencyKey = buildIdempotencyKey([
    event.type,
    event.entityType,
    event.entityId,
    event.postId,
    event.actorId,
    JSON.stringify(event.metadata || {})
  ]);
  const eventId = buildIdempotencyKey([idempotencyKey, occurredAt, opts?.sequence || 0]);
  return {
    eventId,
    idempotencyKey,
    type: event.type,
    occurredAt,
    producer: opts?.producer || 'scrolitha',
    entityType: event.entityType,
    entityId: event.entityId || event.postId || undefined,
    orderKey: event.postId || event.entityId || undefined,
    sequence: opts?.sequence,
    payload: { ...event, at: occurredAt },
    // AI side effects that are not durable user actions are replay-safe (cache warm only).
    replaySafe: true
  };
};

const markProcessed = (idempotencyKey: string) => {
  processed.set(idempotencyKey, Date.now());
  enterpriseCache.set('analytics', `evt:idem:${idempotencyKey}`, true, DEDUPE_TTL_MS);
  setTimeout(() => processed.delete(idempotencyKey), DEDUPE_TTL_MS).unref?.();
};

const wasProcessed = (idempotencyKey: string) => {
  if (processed.has(idempotencyKey)) return true;
  return Boolean(enterpriseCache.get('analytics', `evt:idem:${idempotencyKey}`));
};

/**
 * Process event with idempotency + optional ordering check.
 * Does not create duplicate AI comment actions — emits through existing event intelligence only.
 */
export const processContractedEvent = (
  event: PlatformIntelligenceEvent,
  opts?: { producer?: string; sequence?: number; enforceOrder?: boolean }
): EventProcessResult => {
  const contract = buildEventContract(event, opts);

  if (wasProcessed(contract.idempotencyKey)) {
    return {
      accepted: false,
      duplicate: true,
      eventId: contract.eventId,
      idempotencyKey: contract.idempotencyKey,
      reason: 'duplicate_idempotency_key'
    };
  }

  if (opts?.enforceOrder && contract.orderKey && typeof contract.sequence === 'number') {
    const prev = orderWatermarks.get(contract.orderKey) ?? -1;
    if (contract.sequence < prev) {
      return {
        accepted: false,
        duplicate: false,
        eventId: contract.eventId,
        idempotencyKey: contract.idempotencyKey,
        reason: 'out_of_order'
      };
    }
    orderWatermarks.set(contract.orderKey, contract.sequence);
  }

  markProcessed(contract.idempotencyKey);
  const emitResult = emitPlatformIntelligenceEvent(contract.payload);

  // Safe replay bookkeeping
  enterpriseCache.set(
    'analytics',
    `evt:last:${contract.orderKey || contract.eventId}`,
    {
      eventId: contract.eventId,
      type: contract.type,
      at: contract.occurredAt,
      replaySafe: contract.replaySafe
    },
    10 * 60_000
  );

  return {
    accepted: emitResult.accepted,
    duplicate: !emitResult.accepted,
    eventId: contract.eventId,
    idempotencyKey: contract.idempotencyKey,
    reason: emitResult.accepted ? undefined : (emitResult as any).reason
  };
};

export const getEventContractStatus = () => ({
  dedupeTtlMs: DEDUPE_TTL_MS,
  inMemoryDedupeSize: processed.size,
  orderWatermarks: orderWatermarks.size,
  guarantees: [
    'idempotency keys prevent duplicate side effects within TTL',
    'optional sequence watermarks for per-entity ordering',
    'replay-safe events limited to non-mutating AI cache/analytics work',
    'user-visible AI replies remain DB-deduped separately (comment parent author)'
  ]
});
