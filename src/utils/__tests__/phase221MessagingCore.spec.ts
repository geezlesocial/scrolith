/**
 * Phase 22.1 — frontend unit tests: session stability, outbox fairness, client ids.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  applyPendingInboxItems,
  fairScheduleConversationQueues,
  isolateInboxSoftRefresh,
  mergeThreadAppendOnly,
  MESSAGING_SESSION_STABILITY_VERSION
} from '../../services/messagingSessionStability';
import { buildClientSendId, isOptimisticMessageId } from '../../services/messagingComposer';
import { reconcileOptimisticMessage } from '../../services/messagingSurfaces';

test('MESSAGING_SESSION_STABILITY_VERSION is 22.1', () => {
  assert.equal(MESSAGING_SESSION_STABILITY_VERSION, '22.1');
});

test('mergeThreadAppendOnly never reorders confirmed history', () => {
  const existing = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const incoming = [{ id: 'b' }, { id: 'd' }, { id: 'e' }];
  const { merged, addedCount } = mergeThreadAppendOnly(existing, incoming);
  assert.deepEqual(
    merged.map((m) => m.id),
    ['a', 'b', 'c', 'd', 'e']
  );
  assert.equal(addedCount, 2);
});

test('isolateInboxSoftRefresh preserves session order and collects pending', () => {
  const session = [{ id: 'c1', title: 'old' }, { id: 'c2', title: 'two' }];
  const refresh = [
    { id: 'c3', title: 'new' },
    { id: 'c1', title: 'updated' },
    { id: 'c2', title: 'two' }
  ];
  const result = isolateInboxSoftRefresh(session, refresh);
  assert.equal(result.sessionItems[0].id, 'c1');
  assert.equal((result.sessionItems[0] as any).title, 'updated');
  assert.deepEqual(
    result.pendingNewItems.map((i) => i.id),
    ['c3']
  );
});

test('applyPendingInboxItems prepends without losing session relative order', () => {
  const session = [{ id: 'a' }, { id: 'b' }];
  const pending = [{ id: 'x' }, { id: 'y' }];
  const merged = applyPendingInboxItems(session, pending);
  assert.deepEqual(
    merged.map((m) => m.id),
    ['x', 'y', 'a', 'b']
  );
});

test('fairScheduleConversationQueues is FIFO per conversation and fair across', () => {
  const items = [
    { conversationId: 'A', n: 1 },
    { conversationId: 'A', n: 2 },
    { conversationId: 'B', n: 1 },
    { conversationId: 'A', n: 3 },
    { conversationId: 'B', n: 2 }
  ];
  const ordered = fairScheduleConversationQueues(items);
  // Round-robin: A1, B1, A2, B2, A3
  assert.deepEqual(
    ordered.map((i) => `${i.conversationId}${i.n}`),
    ['A1', 'B1', 'A2', 'B2', 'A3']
  );
});

test('buildClientSendId is unique and optimistic-shaped', () => {
  const a = buildClientSendId('conv1', 1000);
  const b = buildClientSendId('conv1', 1000);
  assert.ok(isOptimisticMessageId(a));
  assert.ok(a !== b);
});

test('reconcileOptimisticMessage prefers clientMessageId match without reordering neighbors', () => {
  const optimisticId = 'optimistic-conv-1-abc';
  const messages = [
    { id: 'm1', text: 'hi', senderId: 'u1' },
    {
      id: optimisticId,
      text: 'pending',
      senderId: 'u1',
      metadata: { clientSendId: optimisticId }
    },
    { id: 'm2', text: 'later', senderId: 'u2' }
  ] as any[];
  const server = {
    id: 'server-99',
    text: 'pending',
    senderId: 'u1',
    metadata: { clientMessageId: optimisticId, clientSendId: optimisticId }
  } as any;
  const next = reconcileOptimisticMessage(messages, server);
  assert.equal(next.length, 3);
  assert.equal(next[0].id, 'm1');
  assert.equal(next[1].id, 'server-99');
  assert.equal(next[2].id, 'm2');
});
