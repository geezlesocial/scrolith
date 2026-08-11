/**
 * Phase 32.6 — deep-link matrix + badge conflict certification (unit).
 * Complements physical device lab when hardware is unavailable.
 */
import { describe, expect, test, beforeEach } from 'vitest';
import { buildEnterprisePushDeepLink } from '../notificationTaxonomy';
import {
  applyRemoteSync,
  getLocalBadgeCount,
  getLocalSyncVersion,
  incrementLocalBadge,
  decrementLocalBadge
} from '../../mobile/notificationSync';

describe('Phase 32.6 deep-link matrix', () => {
  const cases: Array<{ name: string; data: Record<string, unknown>; expectPath: string | RegExp | null }> = [
    {
      name: 'direct message',
      data: { type: 'messaging.direct_message', conversationId: 'c1' },
      expectPath: '/messages/c1'
    },
    {
      name: 'group mention',
      data: { type: 'messaging.group_mention', conversationId: 'g1' },
      expectPath: '/messages/g1'
    },
    {
      name: 'wallet payment',
      data: { type: 'wallet.payment_received', transactionId: 'tx9' },
      expectPath: /\/wallet/
    },
    {
      name: 'security login',
      data: { type: 'security.new_login' },
      expectPath: '/settings/notifications?tab=privacy'
    },
    {
      name: 'login approval opens in place',
      data: { type: 'security.login_approval.requested', attemptId: 'attempt-1' },
      expectPath: null
    },
    {
      name: 'support ticket',
      data: { type: 'support.ticket_reply', entityId: 't1' },
      expectPath: '/support?ticket=t1'
    },
    {
      name: 'digest ready',
      data: { type: 'system.digest_ready', digestId: 'd1' },
      expectPath: '/notifications?digest=d1'
    },
    {
      name: 'job application',
      data: { type: 'jobs.application_status', jobId: 'j1' },
      expectPath: '/jobs/j1'
    },
    {
      name: 'marketplace order',
      data: { type: 'marketplace.order_update', orderId: 'o1' },
      expectPath: '/gigs/o1'
    },
    {
      name: 'profile follow',
      data: { type: 'personal.follow', actorUsername: 'alex' },
      expectPath: '/profile/alex'
    },
    {
      name: 'preferences',
      data: { type: 'system.preference_update' },
      expectPath: '/settings/notifications'
    },
    {
      name: 'notification center fallback digest',
      data: { type: 'system.digest' },
      expectPath: '/notifications'
    },
    {
      name: 'groups community',
      data: { type: 'community.group_invite', groupId: 'club1' },
      expectPath: '/community/clubs?group=club1'
    }
  ];

  for (const c of cases) {
    test(c.name, () => {
      const path = buildEnterprisePushDeepLink(c.data);
      if (c.expectPath === null) expect(path).toBeNull();
      else {
        expect(path).toBeTruthy();
        if (c.expectPath instanceof RegExp) expect(path!).toMatch(c.expectPath);
        else expect(path).toBe(c.expectPath);
      }
    });
  }
});

describe('Phase 32.6 badge synchronization semantics', () => {
  beforeEach(() => {
    try {
      localStorage.clear();
    } catch {
      /* */
    }
  });

  test('increment and decrement', () => {
    applyRemoteSync(
      { badgeCount: 0, unreadCount: 0, version: 1, serverTime: new Date().toISOString() },
      { force: true }
    );
    incrementLocalBadge(2);
    expect(getLocalBadgeCount()).toBe(2);
    decrementLocalBadge(1);
    expect(getLocalBadgeCount()).toBe(1);
  });

  test('multi-device: higher version wins', () => {
    applyRemoteSync(
      { badgeCount: 10, unreadCount: 10, version: 5, serverTime: '2026-01-01T00:00:00.000Z' },
      { force: true }
    );
    expect(applyRemoteSync({ badgeCount: 99, unreadCount: 99, version: 4, serverTime: '2026-06-01T00:00:00.000Z' })).toBe(
      false
    );
    expect(getLocalBadgeCount()).toBe(10);
    expect(
      applyRemoteSync({ badgeCount: 3, unreadCount: 3, version: 6, serverTime: '2026-06-02T00:00:00.000Z' })
    ).toBe(true);
    expect(getLocalBadgeCount()).toBe(3);
    expect(getLocalSyncVersion()).toBe(6);
  });

  test('force recovery overwrites stale local', () => {
    applyRemoteSync(
      { badgeCount: 50, unreadCount: 50, version: 20, serverTime: '2026-01-01T00:00:00.000Z' },
      { force: true }
    );
    applyRemoteSync(
      { badgeCount: 1, unreadCount: 1, version: 1, serverTime: '2025-01-01T00:00:00.000Z' },
      { force: true }
    );
    expect(getLocalBadgeCount()).toBe(1);
  });
});
