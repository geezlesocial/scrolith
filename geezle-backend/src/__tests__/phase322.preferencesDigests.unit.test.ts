/**
 * Phase 32.2 — Delivery policy, quiet hours, focus eligibility, digest grouping.
 */
import { describe, expect, test } from '@jest/globals';
import {
  PREFERENCE_PRECEDENCE,
  MANDATORY_SECURITY_EVENT_TYPES,
  EMERGENCY_SYSTEM_EVENT_TYPES,
  FUTURE_CHANNELS,
  ACTIVE_CHANNELS
} from '../services/notificationCenter/delivery/policyTypes';
import { NotificationDeliveryPolicy } from '../services/notificationCenter/delivery/NotificationDeliveryPolicy';
import { NotificationDigestEngine } from '../services/notificationCenter/digestEngine.service';
import { ALL_NOTIFICATION_CATEGORIES } from '../services/notificationCenter/taxonomy';
import { NotificationAdminDefaultsService } from '../services/notificationCenter/adminDefaults.service';

describe('Phase 32.2 preference hierarchy', () => {
  test('precedence order is complete and ordered', () => {
    expect(PREFERENCE_PRECEDENCE[0]).toBe('emergency_platform');
    expect(PREFERENCE_PRECEDENCE[1]).toBe('mandatory_security');
    expect(PREFERENCE_PRECEDENCE).toContain('focus_mode');
    expect(PREFERENCE_PRECEDENCE).toContain('quiet_hours');
    expect(PREFERENCE_PRECEDENCE).toContain('digest_mode');
    expect(PREFERENCE_PRECEDENCE[PREFERENCE_PRECEDENCE.length - 1]).toBe('default_platform');
  });

  test('mandatory security set includes login and password events', () => {
    expect(MANDATORY_SECURITY_EVENT_TYPES.has('security.new_login')).toBe(true);
    expect(MANDATORY_SECURITY_EVENT_TYPES.has('security.password_change')).toBe(true);
    expect(EMERGENCY_SYSTEM_EVENT_TYPES.has('system.emergency')).toBe(true);
  });

  test('active vs future channels', () => {
    expect(ACTIVE_CHANNELS).toEqual(expect.arrayContaining(['IN_APP', 'PUSH', 'EMAIL']));
    expect(FUTURE_CHANNELS).toEqual(expect.arrayContaining(['SMS', 'DESKTOP', 'WEBHOOK']));
  });

  test('all Phase 32 categories present', () => {
    expect(ALL_NOTIFICATION_CATEGORIES).toEqual(
      expect.arrayContaining([
        'personal',
        'messaging',
        'messaging_groups',
        'jobs',
        'marketplace',
        'communities',
        'business',
        'wallet',
        'security',
        'support',
        'system',
        'admin'
      ])
    );
  });
});

describe('Phase 32.2 NotificationDeliveryPolicy', () => {
  test('emergency always delivers now', async () => {
    const d = await NotificationDeliveryPolicy.evaluate({
      userId: 'u1',
      eventType: 'system.emergency',
      category: 'system',
      channel: 'PUSH',
      priority: 'critical'
    });
    expect(d.allowed).toBe(true);
    expect(d.action).toBe('DELIVER_NOW');
    expect(d.effectivePreferenceSource).toBe('emergency_platform');
  });

  test('mandatory security always delivers now', async () => {
    const d = await NotificationDeliveryPolicy.evaluate({
      userId: 'u1',
      eventType: 'security.new_login',
      category: 'security',
      channel: 'PUSH',
      priority: 'high'
    });
    expect(d.allowed).toBe(true);
    expect(d.action).toBe('DELIVER_NOW');
    expect(d.effectivePreferenceSource).toBe('mandatory_security');
  });

  test('future channels suppressed', async () => {
    const d = await NotificationDeliveryPolicy.evaluate({
      userId: 'u1',
      eventType: 'personal.like',
      category: 'personal',
      channel: 'SMS',
      priority: 'normal'
    });
    expect(d.allowed).toBe(false);
    expect(d.action).toBe('SUPPRESS');
    expect(d.reason).toBe('channel_not_available');
  });

  test('isMandatorySecurity and isEmergency helpers', () => {
    expect(NotificationDeliveryPolicy.isMandatorySecurity('security.new_login')).toBe(true);
    expect(NotificationDeliveryPolicy.isMandatorySecurity('personal.like')).toBe(false);
    expect(NotificationDeliveryPolicy.isEmergencySystem('system.emergency')).toBe(true);
    expect(NotificationDeliveryPolicy.isEmergencySystem('jobs.application_status')).toBe(false);
  });
});

describe('Phase 32.2 digest engine helpers', () => {
  test('eligibility excludes critical and mandatory security', () => {
    expect(
      NotificationDigestEngine.isEligibleForDigest(
        { type: 'personal.like', priority: 'normal', isRead: false },
        false
      )
    ).toBe(true);
    expect(
      NotificationDigestEngine.isEligibleForDigest(
        { type: 'security.new_login', priority: 'high', isRead: false },
        false
      )
    ).toBe(false);
    expect(
      NotificationDigestEngine.isEligibleForDigest(
        { type: 'personal.like', priority: 'critical', isRead: false },
        false
      )
    ).toBe(false);
    expect(
      NotificationDigestEngine.isEligibleForDigest(
        { type: 'personal.like', priority: 'normal', isRead: true, deletedAt: null },
        false
      )
    ).toBe(false);
    expect(
      NotificationDigestEngine.isEligibleForDigest(
        { type: 'personal.like', priority: 'normal', isRead: true },
        true
      )
    ).toBe(true);
  });

  test('grouping collapses similar entity notifications', () => {
    const items = NotificationDigestEngine.groupItems([
      { id: '1', category: 'personal', type: 'like', title: 'A liked', entityId: 'post1', entityType: 'post' },
      { id: '2', category: 'personal', type: 'like', title: 'B liked', entityId: 'post1', entityType: 'post' },
      { id: '3', category: 'jobs', type: 'jobs.application_status', title: 'App update' }
    ]);
    expect(items.length).toBe(2);
    const group = items.find((i) => i.metadata?.count === 2);
    expect(group).toBeTruthy();
    expect(String(group?.title || '')).toContain('2 updates');
  });

  test('email HTML escapes user content', () => {
    const html = NotificationDigestEngine.renderEmailHtml({
      name: '<script>alert(1)</script>',
      mode: 'morning',
      count: 1,
      unreadCount: 1,
      highCount: 0,
      items: [{ title: '<b>x</b>', body: 'a&b' }],
      digestId: 'd1'
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;b&gt;x&lt;/b&gt;');
    expect(html).toContain('settings/notifications');
  });

  test('schedule due morning window matches local time', () => {
    // Construct a UTC date that is 08:05 in UTC timezone
    const now = new Date(Date.UTC(2026, 5, 15, 8, 5, 0));
    const due = NotificationDigestEngine.isScheduleDue(
      {
        mode: 'morning',
        timezone: 'UTC',
        morningHour: 8,
        morningMinute: 0,
        lastRunAt: null
      },
      now
    );
    expect(due).not.toBeNull();
    expect(due?.periodMs).toBeGreaterThan(0);
  });

  test('schedule not due outside window', () => {
    const now = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));
    const due = NotificationDigestEngine.isScheduleDue(
      {
        mode: 'morning',
        timezone: 'UTC',
        morningHour: 8,
        morningMinute: 0,
        lastRunAt: null
      },
      now
    );
    expect(due).toBeNull();
  });
});

describe('Phase 32.2 admin defaults', () => {
  test('defaults expose feature flags and locks', () => {
    const d = NotificationAdminDefaultsService.get();
    expect(d.featureFlags.preferencesV2).toBe(true);
    expect(d.featureFlags.digests).toBe(true);
    expect(d.defaultChannelPreferences.SMS).toBe(false);
    expect(d.categoryPolicyLocks.security?.forceImmediate).toBe(true);
    expect(d.allowedDigestModes).toContain('morning');
  });

  test('update bumps version and keeps future channels off', async () => {
    const before = NotificationAdminDefaultsService.get().version;
    const next = await NotificationAdminDefaultsService.update(
      {
        emailDigestEnabled: false,
        defaultChannelPreferences: {
          IN_APP: true,
          PUSH: true,
          EMAIL: true,
          SMS: true,
          DESKTOP: true,
          WEBHOOK: true
        } as any
      },
      'admin1'
    );
    expect(next.version).toBeGreaterThan(before);
    expect(next.emailDigestEnabled).toBe(false);
    expect(next.defaultChannelPreferences.SMS).toBe(false);
    expect(next.defaultChannelPreferences.DESKTOP).toBe(false);
    expect(next.defaultChannelPreferences.WEBHOOK).toBe(false);
    NotificationAdminDefaultsService.resetToCodeDefaults();
  });
});
