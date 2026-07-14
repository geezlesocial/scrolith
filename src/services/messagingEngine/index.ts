/**
 * Enterprise messaging engine facade (Phase 5.3).
 * Single shared realtime coordination layer for all messaging surfaces.
 */
export * from './types';
export {
  subscribeMessagingEvent,
  publishMessagingEvent,
  nextMessagingSequence,
  __resetMessagingEventBusForTests
} from './eventBus';
export { BoundedIdSet, buildMessagingEventFingerprint } from './dedupe';
export {
  trackOutgoingMessage,
  markOutgoingState,
  getOutgoingRecord,
  findOutgoingByServerId,
  listRetryableOutgoing,
  canAutoRetryOutgoing,
  clearOutgoingDeliveryQueue,
  getOutgoingDeliveryDebugSnapshot,
  MAX_OUTGOING_AUTO_RETRIES
} from './deliveryQueue';
export {
  dedupeThreadMessages,
  sortThreadMessagesByTime,
  mergeThreadMessage,
  evictThreadCacheEntries,
  touchThreadCacheEntry,
  DEFAULT_THREAD_CACHE_MAX
} from './threadCachePolicy';
export {
  subscribeMultiTabMessaging,
  broadcastMultiTabMessaging,
  getMessagingTabId,
  isMultiTabSyncEvent
} from './multiTabSync';
export {
  bindMessagingSocketHealth,
  getSocketHealthSnapshot,
  markMessagingPingSent,
  noteMessagingReconnect,
  __resetSocketHealthForTests
} from './socketHealth';
export {
  decideMessagingFallbackPolling,
  MESSAGING_POLL_GRACE_MS,
  MESSAGING_POLL_INTERVAL_MS,
  MESSAGING_POLL_INTERVAL_DEGRADED_MS
} from './pollingPolicy';

import { BoundedIdSet } from './dedupe';
import { clearOutgoingDeliveryQueue } from './deliveryQueue';
import { publishMessagingEvent } from './eventBus';

/** Process-wide seen message ids for socket dedupe across handlers. */
export const globalMessagingSeenIds = new BoundedIdSet(1200);

export const resetMessagingEngineSession = () => {
  globalMessagingSeenIds.clear();
  clearOutgoingDeliveryQueue();
  publishMessagingEvent('SYNC_STATE', { state: 'reset' }, { source: 'system' });
};
