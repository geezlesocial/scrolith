/**
 * Phase 32.3 — Android excellence & cross-device sync unit tests.
 */
import { describe, expect, test } from '@jest/globals';
import {
  resolveRichActions,
  serializeActionsForPush
} from '../services/notificationCenter/richActions';
import {
  LIFECYCLE_STAGES,
  NotificationLifecycleService
} from '../services/notificationCenter/notificationLifecycle.service';
import { NotificationSyncService } from '../services/notificationCenter/notificationSync.service';

describe('Phase 32.3 rich actions', () => {
  test('messaging includes open conversation, mark read, reply', () => {
    const actions = resolveRichActions({
      type: 'messaging.direct_message',
      category: 'messaging',
      conversationId: 'c1',
      deepLink: '/messages/c1'
    });
    const ids = actions.map((a) => a.id);
    expect(ids).toContain('open_conversation');
    expect(ids).toContain('mark_read');
    expect(ids).toContain('reply');
    expect(actions.length).toBeLessThanOrEqual(4);
  });

  test('jobs include view job', () => {
    const actions = resolveRichActions({ type: 'jobs.application_status', category: 'jobs' });
    expect(actions.some((a) => a.id === 'view_job')).toBe(true);
  });

  test('wallet includes view wallet', () => {
    const actions = resolveRichActions({ type: 'wallet.payment_received', category: 'wallet' });
    expect(actions.some((a) => a.id === 'view_wallet')).toBe(true);
  });

  test('marketplace includes view order', () => {
    const actions = resolveRichActions({ type: 'marketplace.order_update', category: 'marketplace' });
    expect(actions.some((a) => a.id === 'view_order')).toBe(true);
  });

  test('serializeActionsForPush is valid JSON', () => {
    const json = serializeActionsForPush(resolveRichActions({ type: 'system', category: 'system' }));
    const parsed = JSON.parse(json);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBeTruthy();
  });
});

describe('Phase 32.3 lifecycle', () => {
  test('lifecycle stages cover required transitions', () => {
    expect(LIFECYCLE_STAGES).toEqual(
      expect.arrayContaining([
        'created',
        'delivered',
        'displayed',
        'opened',
        'read',
        'archived',
        'deleted',
        'expired'
      ])
    );
  });

  test('invalid lifecycle rejected', async () => {
    await expect(
      NotificationLifecycleService.record({
        userId: 'u1',
        lifecycle: 'not_a_stage'
      })
    ).rejects.toThrow(/Invalid lifecycle/);
  });

  test('record soft-skips when tables missing', async () => {
    const result = await NotificationLifecycleService.record({
      userId: 'u1',
      lifecycle: 'delivered',
      notificationId: null,
      channel: 'push',
      idempotencyKey: `test-delivered-${Date.now()}`
    });
    expect(['recorded', 'duplicate', 'skipped']).toContain(result.status);
  });
});

describe('Phase 32.3 sync snapshot', () => {
  test('getSnapshot returns badge and version fields', async () => {
    const snap = await NotificationSyncService.getSnapshot('nonexistent-user-phase323');
    expect(snap).toHaveProperty('badgeCount');
    expect(snap).toHaveProperty('unreadCount');
    expect(snap).toHaveProperty('version');
    expect(snap).toHaveProperty('serverTime');
    expect(typeof snap.badgeCount).toBe('number');
    expect(snap.userId).toBe('nonexistent-user-phase323');
  });
});
