import { describe, expect, test } from '@jest/globals';
import {
  ALL_NOTIFICATION_CATEGORIES,
  ALL_PRIORITY_LEVELS,
  defaultDeepLink,
  resolveNotificationCategory,
  resolvePriorityLevel,
  NOTIFICATION_SCHEMA_VERSION
} from '../services/notificationCenter/taxonomy';
import { stableIdempotencyKey } from '../services/notificationCenter/analytics';

describe('Phase 32.0 taxonomy', () => {
  test('schema version', () => {
    expect(NOTIFICATION_SCHEMA_VERSION).toBe('32.0');
  });

  test('all categories unique and non-empty', () => {
    expect(ALL_NOTIFICATION_CATEGORIES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(ALL_NOTIFICATION_CATEGORIES).size).toBe(ALL_NOTIFICATION_CATEGORIES.length);
  });

  test('resolve category from explicit and type heuristics', () => {
    expect(resolveNotificationCategory('x', 'wallet')).toBe('wallet');
    expect(resolveNotificationCategory('job_application_created')).toBe('jobs');
    expect(resolveNotificationCategory('group_invite')).toBe('messaging_groups');
    expect(resolveNotificationCategory('comment_on_post')).toBe('personal');
    expect(resolveNotificationCategory('wallet_transfer')).toBe('wallet');
    expect(resolveNotificationCategory('security_login')).toBe('security');
    expect(resolveNotificationCategory('support_ticket_reply')).toBe('support');
    expect(resolveNotificationCategory('unknown_thing')).toBe('system');
  });

  test('NI preference category mapping', () => {
    expect(resolveNotificationCategory('x', 'messages')).toBe('messaging');
    expect(resolveNotificationCategory('x', 'mentions')).toBe('personal');
    expect(resolveNotificationCategory('x', 'companies')).toBe('business');
  });

  test('priority levels', () => {
    expect(ALL_PRIORITY_LEVELS).toContain('critical');
    expect(resolvePriorityLevel('high')).toBe('high');
    expect(resolvePriorityLevel('background')).toBe('silent');
    expect(resolvePriorityLevel(null, 'security')).toBe('high');
    expect(resolvePriorityLevel(null, 'system')).toBe('normal');
  });

  test('default deep links', () => {
    expect(defaultDeepLink({ deepLink: '/messages?c=1' })).toBe('/messages?c=1');
    expect(
      defaultDeepLink({ entityType: 'conversation', entityId: 'abc' })
    ).toContain('/messages');
    expect(defaultDeepLink({ entityType: 'job', entityId: 'j1' })).toContain('/jobs/');
    expect(defaultDeepLink({})).toBe('/notifications');
  });

  test('idempotency key stable', () => {
    const a = stableIdempotencyKey(['t', 'u', 'e']);
    const b = stableIdempotencyKey(['t', 'u', 'e']);
    const c = stableIdempotencyKey(['t', 'u', 'x']);
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a.length).toBe(40);
  });
});
