/**
 * Enterprise Search realtime invalidation — Socket.IO only (no new stack).
 * Mirrors Discovery realtime pattern; does not change Discovery modules.
 */
import type { Express } from 'express';
import { randomUUID } from 'crypto';
import { invalidateSearchCache, invalidateSearchCacheForViewer, bumpSearchCacheGeneration } from '../cache/cache';
import { recordSearchMetric } from '../observability/observability';

export type SearchRealtimeEvent =
  | 'search:results_invalidated'
  | 'search:refresh_available'
  | 'search:entity_unavailable';

export type SearchInvalidationPayload = {
  eventId: string;
  reason: string;
  viewerId?: string | null;
  entityType?: string;
  entityId?: string;
  surface?: string;
  at: string;
  debounceMs?: number;
};

let appRef: Express | null = null;
const recentEventIds = new Map<string, number>();
const EVENT_TTL_MS = 60_000;
const debounceByViewer = new Map<string, number>();
const DEBOUNCE_MS = 400;

export const bindSearchRealtimeApp = (app: Express | null) => {
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

const shouldDebounce = (viewerId: string | null | undefined) => {
  const key = viewerId || 'all';
  const now = Date.now();
  const last = debounceByViewer.get(key) || 0;
  if (now - last < DEBOUNCE_MS) {
    recordSearchMetric('realtime_debounced', 1);
    return true;
  }
  debounceByViewer.set(key, now);
  return false;
};

export const invalidateSearchForViewer = (viewerId: string | null | undefined, reason: string) => {
  if (viewerId) {
    invalidateSearchCacheForViewer(viewerId, reason);
  } else {
    bumpSearchCacheGeneration(reason);
  }
  recordSearchMetric('search_invalidations', 1);
};

export const emitSearchInvalidation = (input: {
  viewerId?: string | null;
  reason: string;
  entityType?: string;
  entityId?: string;
  surface?: string;
  eventId?: string;
  skipDebounce?: boolean;
}) => {
  if (!input.skipDebounce && shouldDebounce(input.viewerId)) {
    // Still invalidate cache locally even if socket emit debounced
    invalidateSearchForViewer(input.viewerId, input.reason);
    return { emitted: false, debounced: true };
  }

  invalidateSearchForViewer(input.viewerId, input.reason);

  const eventId =
    input.eventId ||
    `${input.reason}:${input.viewerId || 'all'}:${input.entityType || ''}:${input.entityId || ''}:${randomUUID().slice(0, 8)}`;

  if (!dedupeEvent(eventId)) {
    return { emitted: false, debounced: false, deduped: true };
  }

  const payload: SearchInvalidationPayload = {
    eventId,
    reason: input.reason,
    viewerId: input.viewerId ?? null,
    entityType: input.entityType,
    entityId: input.entityId,
    surface: input.surface,
    at: new Date().toISOString(),
    debounceMs: DEBOUNCE_MS
  };

  try {
    const io = getIo();
    if (io) {
      if (input.viewerId) {
        io.to?.(`user:${input.viewerId}`)?.emit?.('search:results_invalidated', payload);
        io.to?.(`user:${input.viewerId}`)?.emit?.('search:refresh_available', payload);
      } else {
        io.emit?.('search:results_invalidated', payload);
        io.emit?.('search:refresh_available', payload);
      }
      recordSearchMetric('realtime_emit', 1);
      return { emitted: true, payload };
    }
  } catch {
    recordSearchMetric('realtime_emit_error', 1);
  }
  return { emitted: false, payload };
};

export const resetSearchRealtimeForTests = () => {
  recentEventIds.clear();
  debounceByViewer.clear();
  appRef = null;
};
