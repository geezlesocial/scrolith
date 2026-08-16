import test from 'node:test';
import assert from 'node:assert/strict';
const ensureViteEnv = () => {
  const meta = import.meta as ImportMeta & { env?: Record<string, unknown> };
  if (!meta.env || typeof meta.env !== 'object') {
    Object.defineProperty(meta, 'env', {
      value: {},
      writable: true,
      configurable: true,
      enumerable: true
    });
  }
  Object.assign(meta.env, {
    PROD: false,
    DEV: true,
    MODE: 'test',
    BASE_URL: '/',
    VITE_API_URL: 'https://api.scrolith.com/api',
    VITE_API_BASE_URL: 'https://api.scrolith.com/api',
    VITE_BACKEND_URL: 'https://api.scrolith.com',
    VITE_PUBLIC_APP_DOMAIN: 'scrolith.com'
  });
};

ensureViteEnv();

const {
  BoundedIdSet,
  buildMessagingEventFingerprint,
  canAutoRetryOutgoing,
  clearOutgoingDeliveryQueue,
  dedupeThreadMessages,
  evictThreadCacheEntries,
  getOutgoingRecord,
  markOutgoingState,
  mergeThreadMessage,
  nextMessagingSequence,
  publishMessagingEvent,
  subscribeMessagingEvent,
  trackOutgoingMessage,
  __resetMessagingEventBusForTests,
  MAX_OUTGOING_AUTO_RETRIES
} = await import('../../src/services/messagingEngine');
const { reconcileOptimisticMessage } = await import('../../src/services/messagingSurfaces');

test('event bus publishes typed and wildcard events with sequences', () => {
  __resetMessagingEventBusForTests();
  const seen: string[] = [];
  const unsubType = subscribeMessagingEvent('MESSAGE_CREATED', (event) => {
    seen.push(`type:${event.type}:${event.sequence}`);
  });
  const unsubAll = subscribeMessagingEvent('*', (event) => {
    seen.push(`all:${event.type}`);
  });
  const first = publishMessagingEvent('MESSAGE_CREATED', { id: 'm1' }, { source: 'local' });
  const second = publishMessagingEvent('UNREAD_CHANGED', { unreadCount: 2 }, { source: 'local' });
  assert.ok(first.sequence > 0);
  assert.ok(second.sequence > first.sequence);
  assert.equal(seen.includes('type:MESSAGE_CREATED:1') || seen.some((s) => s.startsWith('type:MESSAGE_CREATED:')), true);
  assert.equal(seen.some((s) => s === 'all:UNREAD_CHANGED'), true);
  unsubType();
  unsubAll();
  __resetMessagingEventBusForTests();
});

test('BoundedIdSet dedupes and evicts oldest beyond capacity', () => {
  const set = new BoundedIdSet(3);
  assert.equal(set.add('a'), true);
  assert.equal(set.add('a'), false);
  assert.equal(set.add('b'), true);
  assert.equal(set.add('c'), true);
  assert.equal(set.add('d'), true);
  assert.equal(set.has('a'), false);
  assert.equal(set.has('d'), true);
  assert.equal(set.size(), 3);
});

test('event fingerprint prefers message id then client send id', () => {
  assert.equal(buildMessagingEventFingerprint({ id: 'msg_1' }), 'id:msg_1');
  assert.equal(
    buildMessagingEventFingerprint({
      conversationId: 'c1',
      metadata: { clientSendId: 'optimistic-c1-1' }
    }),
    'client:c1:optimistic-c1-1'
  );
  assert.equal(buildMessagingEventFingerprint(null), '');
});

test('delivery queue tracks states and caps auto retries', () => {
  clearOutgoingDeliveryQueue();
  const record = trackOutgoingMessage({
    clientSendId: 'optimistic-c1-9',
    conversationId: 'c1',
    text: 'hello',
    state: 'sending'
  });
  assert.equal(record.state, 'sending');
  markOutgoingState('optimistic-c1-9', 'failed', { error: 'network' });
  assert.equal(getOutgoingRecord('optimistic-c1-9')?.state, 'failed');
  assert.equal(canAutoRetryOutgoing('optimistic-c1-9'), true);
  for (let i = 0; i < MAX_OUTGOING_AUTO_RETRIES; i += 1) {
    markOutgoingState('optimistic-c1-9', 'retry');
    markOutgoingState('optimistic-c1-9', 'failed');
  }
  assert.equal(canAutoRetryOutgoing('optimistic-c1-9'), false);
  clearOutgoingDeliveryQueue();
});

test('thread cache merge dedupes and sorts by timestamp', () => {
  const merged = mergeThreadMessage(
    [
      { id: '2', timestamp: '2026-07-14T12:00:02.000Z', text: 'b' },
      { id: '1', timestamp: '2026-07-14T12:00:01.000Z', text: 'a' }
    ],
    { id: '1', timestamp: '2026-07-14T12:00:01.000Z', text: 'a-updated' }
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, '1');
  assert.equal(merged[0].text, 'a-updated');
  assert.equal(dedupeThreadMessages([{ id: 'x' }, { id: 'x' }, { id: 'y' }]).length, 2);
});

test('thread cache eviction protects visible conversations', () => {
  const cache: Record<string, { messages: any[]; lastAccessAt: number }> = {};
  for (let i = 0; i < 6; i += 1) {
    cache[`c${i}`] = { messages: [], lastAccessAt: i };
  }
  const next = evictThreadCacheEntries(cache, {
    maxEntries: 3,
    protectIds: ['c5']
  });
  assert.equal(Object.keys(next).length <= 3, true);
  assert.equal(Boolean(next.c5), true);
});

test('reconcileOptimisticMessage matches clientSendId metadata', () => {
  const optimisticId = 'optimistic-c1-42';
  const messages = [
    {
      id: optimisticId,
      text: 'hi',
      senderId: 'u1',
      metadata: { clientSendId: optimisticId }
    } as any
  ];
  const server = {
    id: 'server_99',
    text: 'hi',
    senderId: 'u1',
    metadata: { clientSendId: optimisticId }
  } as any;
  const next = reconcileOptimisticMessage(messages, server);
  assert.equal(next.length, 1);
  assert.equal(next[0].id, 'server_99');
  assert.equal((next[0] as any).metadata.clientSendId, optimisticId);
});

test('nextMessagingSequence is monotonic', () => {
  __resetMessagingEventBusForTests();
  const a = nextMessagingSequence();
  const b = nextMessagingSequence();
  assert.ok(b > a);
  __resetMessagingEventBusForTests();
});
