/**
 * Safe realtime invalidation for discovery recommendations.
 * Uses existing Socket.IO app.get('io') — no new websocket stack.
 */
import type { Express } from 'express';
import { discoveryCache } from './discoveryEngine.cache';
import { recordDiscoveryMetric } from './discoveryEngine.observability';
import { DISCOVERY_POLICY_VERSION } from './discoveryEngine.versions';

export type DiscoveryRealtimeEvent =
  | 'discovery:recommendations_invalidated'
  | 'discovery:entity_unavailable'
  | 'discovery:refresh_available';

export type DiscoveryInvalidationPayload = {
  eventId: string;
  reason: string;
  viewerId?: string | null;
  entityType?: string;
  entityId?: string;
  surface?: string;
  policyVersion: string;
  at: string;
};

let appRef: Express | null = null;
const recentEventIds = new Map<string, number>();
const EVENT_TTL_MS = 60_000;

export const bindDiscoveryRealtimeApp = (app: Express | null) => {
  appRef = app;
};

const getIo = () => {
  try {
    return appRef?.get?.('io') || (global as any).appIo || null;
  } catch {
    return (global as any).appIo || null;
  }
};

const dedupeEvent = (eventId: string) => {
  const now = Date.now();
  for (const [id, exp] of recentEventIds) {
    if (exp <= now) recentEventIds.delete(id);
  }
  if (recentEventIds.has(eventId)) return false;
  recentEventIds.set(eventId, now + EVENT_TTL_MS);
  return true;
};

/**
 * Invalidate discovery caches for one viewer (or all when viewerId is absent).
 * Viewer-scoped response keys use prefix `resp:v:{viewerId}:`.
 */
export const invalidateDiscoveryForViewer = (viewerId: string | null | undefined, reason: string) => {
  if (viewerId) {
    discoveryCache.invalidateByPrefix(`resp:v:${viewerId}:`);
    discoveryCache.invalidateByPrefix(`interest:${viewerId}`);
    discoveryCache.invalidateByPrefix(`relctx:${viewerId}`);
    discoveryCache.invalidateByPrefix(`privacy:${viewerId}`);
  } else {
    // Global structural change — drop response caches for all viewers.
    discoveryCache.invalidateByPrefix('resp:');
    discoveryCache.bumpGeneration(reason);
  }
  recordDiscoveryMetric('invalidations', 1);
};

export const emitDiscoveryInvalidation = (input: {
  viewerId?: string | null;
  reason: string;
  entityType?: string;
  entityId?: string;
  surface?: string;
  eventId?: string;
}) => {
  const eventId =
    input.eventId ||
    `${input.reason}:${input.viewerId || 'all'}:${input.entityType || ''}:${input.entityId || ''}:${Date.now()}`;
  if (!dedupeEvent(eventId)) return false;

  invalidateDiscoveryForViewer(input.viewerId, input.reason);

  const payload: DiscoveryInvalidationPayload = {
    eventId,
    reason: input.reason,
    viewerId: input.viewerId || null,
    entityType: input.entityType,
    entityId: input.entityId,
    surface: input.surface,
    policyVersion: DISCOVERY_POLICY_VERSION,
    at: new Date().toISOString()
  };

  const io = getIo();
  if (!io) {
    recordDiscoveryMetric('realtime_no_io', 1);
    return true;
  }

  try {
    if (input.viewerId) {
      io.to?.(`user:${input.viewerId}`)?.emit?.('discovery:recommendations_invalidated', payload);
      io.to?.(`community:user:${input.viewerId}`)?.emit?.('discovery:recommendations_invalidated', payload);
    } else {
      io.emit?.('discovery:refresh_available', payload);
    }
    if (input.entityType && input.entityId && input.viewerId) {
      io.to?.(`user:${input.viewerId}`)?.emit?.('discovery:entity_unavailable', {
        ...payload,
        reason: 'entity_unavailable'
      });
    }
    recordDiscoveryMetric('realtime_emit', 1);
  } catch {
    recordDiscoveryMetric('realtime_emit_fail', 1);
  }
  return true;
};
