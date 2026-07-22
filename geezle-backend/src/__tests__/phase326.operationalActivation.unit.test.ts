/**
 * Phase 32.6 — operational activation unit certifications (no deploy required).
 */
import { describe, expect, test, beforeEach, afterEach } from '@jest/globals';
import { NotificationDigestEngine } from '../services/notificationCenter/digestEngine.service';
import { NotificationRetentionPurgeService } from '../services/notificationCenter/ops/retentionPurge.service';
import { NotificationDeliveryPolicy } from '../services/notificationCenter/delivery/NotificationDeliveryPolicy';

describe('Phase 32.6 digest allowlist gate', () => {
  const envBackup: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of [
      'NOTIFICATION_DIGEST_ALLOWLIST',
      'NOTIFICATION_DIGEST_REQUIRE_ALLOWLIST',
      'NOTIFICATION_RETENTION_PURGE_ENABLED'
    ]) {
      envBackup[k] = process.env[k];
    }
  });

  afterEach(() => {
    for (const [k, v] of Object.entries(envBackup)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });

  test('empty allowlist with require=true → none', () => {
    process.env.NOTIFICATION_DIGEST_REQUIRE_ALLOWLIST = 'true';
    delete process.env.NOTIFICATION_DIGEST_ALLOWLIST;
    const a = NotificationDigestEngine.resolveDigestAllowlist();
    expect(a.mode).toBe('none');
  });

  test('explicit allowlist ids', () => {
    process.env.NOTIFICATION_DIGEST_ALLOWLIST = 'u1, u2';
    const a = NotificationDigestEngine.resolveDigestAllowlist();
    expect(a.mode).toBe('allowlist');
    expect(a.ids.has('u1')).toBe(true);
    expect(a.ids.has('u2')).toBe(true);
  });

  test('wildcard allowlist → all', () => {
    process.env.NOTIFICATION_DIGEST_ALLOWLIST = '*';
    expect(NotificationDigestEngine.resolveDigestAllowlist().mode).toBe('all');
  });

  test('no require and empty → all (legacy)', () => {
    delete process.env.NOTIFICATION_DIGEST_REQUIRE_ALLOWLIST;
    delete process.env.NOTIFICATION_DIGEST_ALLOWLIST;
    expect(NotificationDigestEngine.resolveDigestAllowlist().mode).toBe('all');
  });
});

describe('Phase 32.6 digest eligibility + security bypass', () => {
  test('mandatory security not digestable', () => {
    expect(
      NotificationDigestEngine.isEligibleForDigest(
        { type: 'security.new_login', priority: 'high', isRead: false },
        false
      )
    ).toBe(false);
  });

  test('normal unread eligible', () => {
    expect(
      NotificationDigestEngine.isEligibleForDigest(
        { type: 'personal.like', priority: 'normal', isRead: false },
        false
      )
    ).toBe(true);
  });

  test('security always delivers now via policy', async () => {
    const d = await NotificationDeliveryPolicy.evaluate({
      userId: 'u',
      eventType: 'security.new_login',
      category: 'security',
      channel: 'PUSH',
      priority: 'high'
    });
    expect(d.action).toBe('DELIVER_NOW');
  });

  test('email HTML escapes injection', () => {
    const html = NotificationDigestEngine.renderEmailHtml({
      name: '<img onerror=alert(1)>',
      mode: 'morning',
      count: 1,
      unreadCount: 1,
      highCount: 0,
      items: [{ title: '<script>x</script>', body: 'a&b' }],
      digestId: 'd'
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('/settings/notifications');
  });

  test('duplicate schedule not due outside window', () => {
    const now = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));
    expect(
      NotificationDigestEngine.isScheduleDue(
        { mode: 'morning', timezone: 'UTC', morningHour: 8, morningMinute: 0, lastRunAt: null },
        now
      )
    ).toBeNull();
  });
});

describe('Phase 32.6 retention kill switch', () => {
  test('kill switch off by default', () => {
    delete process.env.NOTIFICATION_RETENTION_PURGE_ENABLED;
    expect(NotificationRetentionPurgeService.killSwitchOn()).toBe(false);
  });

  test('execute refuses when kill switch off', async () => {
    process.env.NOTIFICATION_RETENTION_PURGE_ENABLED = 'false';
    const r = await NotificationRetentionPurgeService.execute({ maxBatches: 1 });
    expect(r.executed).toBe(false);
    expect(r.notes.join(' ')).toMatch(/kill_switch/i);
  });

  test('plan returns candidate map shape', async () => {
    const plan = await NotificationRetentionPurgeService.plan();
    expect(plan.dryRun).toBe(true);
    expect(plan).toHaveProperty('candidates');
    expect(plan).toHaveProperty('windows');
    expect(plan.batchSize).toBeGreaterThan(0);
  });
});
