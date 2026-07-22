import { describe, expect, test, beforeEach } from 'vitest';
import {
  applyRemoteSync,
  getLocalBadgeCount,
  getLocalSyncVersion,
  incrementLocalBadge,
  decrementLocalBadge
} from '../notificationSync';
import { createOfflineActionQueue } from '../runtime/offlineActionQueue';

const memoryStore = () => {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => {
      map.set(k, v);
    },
    removeItem: (k: string) => {
      map.delete(k);
    }
  };
};

describe('Phase 32.3 notificationSync', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* */
    }
  });

  test('badge increment and decrement', () => {
    applyRemoteSync(
      { badgeCount: 0, unreadCount: 0, version: 1, serverTime: new Date().toISOString() },
      { force: true }
    );
    incrementLocalBadge(3);
    expect(getLocalBadgeCount()).toBe(3);
    decrementLocalBadge(1);
    expect(getLocalBadgeCount()).toBe(2);
  });

  test('conflict resolution prefers higher version', () => {
    applyRemoteSync(
      { badgeCount: 5, unreadCount: 5, version: 10, serverTime: '2026-01-01T00:00:00.000Z' },
      { force: true }
    );
    const rejected = applyRemoteSync({
      badgeCount: 99,
      unreadCount: 99,
      version: 9,
      serverTime: '2026-06-01T00:00:00.000Z'
    });
    expect(rejected).toBe(false);
    expect(getLocalBadgeCount()).toBe(5);
    expect(getLocalSyncVersion()).toBe(10);

    const accepted = applyRemoteSync({
      badgeCount: 2,
      unreadCount: 2,
      version: 11,
      serverTime: '2026-06-02T00:00:00.000Z'
    });
    expect(accepted).toBe(true);
    expect(getLocalBadgeCount()).toBe(2);
  });

  test('offline queue enqueues notification actions', () => {
    const queue = createOfflineActionQueue({ storage: memoryStore(), key: 'test-notif-offline' });
    queue.enqueue({
      type: 'notification_action',
      payload: { action: 'mark_read', ids: ['n1'] }
    });
    expect(queue.pendingCount()).toBeGreaterThanOrEqual(1);
    expect(queue.read()[0]?.type).toBe('notification_action');
  });
});
