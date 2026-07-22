import { describe, expect, test } from '@jest/globals';
import { DEFAULT_PIN_LIMIT } from '../services/notificationCenter/types';
import { resolveNotificationCategory } from '../services/notificationCenter/taxonomy';

describe('Phase 32.1 inbox foundation helpers', () => {
  test('pin limit is enterprise-reasonable', () => {
    expect(DEFAULT_PIN_LIMIT).toBeGreaterThanOrEqual(10);
    expect(DEFAULT_PIN_LIMIT).toBeLessThanOrEqual(50);
  });

  test('category filters map cleanly for inbox chips', () => {
    expect(resolveNotificationCategory('x', 'all')).toBe('system'); // explicit non-category → system
    expect(resolveNotificationCategory('x', 'messaging')).toBe('messaging');
    expect(resolveNotificationCategory('x', 'messaging_groups')).toBe('messaging_groups');
    expect(resolveNotificationCategory('x', 'wallet')).toBe('wallet');
  });

  test('bulk action vocabulary includes pin', () => {
    const actions = [
      'read',
      'unread',
      'archive',
      'unarchive',
      'delete',
      'restore',
      'pin',
      'unpin'
    ];
    expect(actions).toContain('pin');
    expect(actions).toContain('unpin');
    expect(actions).toContain('archive');
  });
});
