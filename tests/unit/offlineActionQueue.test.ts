import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createOfflineActionQueue,
  normalizeOfflineAction,
  type OfflineActionStorage
} from '../../src/mobile/runtime/offlineActionQueue';

const createMemoryStorage = (): OfflineActionStorage & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    }
  };
};

test('normalizeOfflineAction creates stable queued actions', () => {
  const action = normalizeOfflineAction(
    {
      id: 'a1',
      type: 'post.react',
      payload: { postId: 'p1' }
    },
    '2026-04-17T00:00:00.000Z'
  );

  assert.equal(action.id, 'a1');
  assert.equal(action.status, 'queued');
  assert.equal(action.attempts, 0);
  assert.equal(action.createdAt, '2026-04-17T00:00:00.000Z');
});

test('offline queue enqueues, updates and removes actions', () => {
  const storage = createMemoryStorage();
  const queue = createOfflineActionQueue({ storage, key: 'test' });

  const action = queue.enqueue({
    id: 'a1',
    type: 'post.reply',
    payload: { postId: 'p1', text: 'hello' }
  });

  assert.equal(queue.read().length, 1);
  assert.equal(action.status, 'queued');
  assert.equal(queue.pendingCount(), 1);

  const updated = queue.update('a1', {
    status: 'failed',
    attempts: 1,
    lastError: 'network'
  });

  assert.equal(updated?.status, 'failed');
  assert.equal(updated?.attempts, 1);
  assert.equal(queue.pendingCount(), 1);

  assert.equal(queue.remove('a1'), true);
  assert.equal(queue.read().length, 0);
});
