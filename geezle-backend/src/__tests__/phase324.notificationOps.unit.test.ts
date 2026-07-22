/**
 * Phase 32.4 — Notification Operations unit tests.
 */
import { describe, expect, test } from '@jest/globals';
import { NotificationOpsConfigService } from '../services/notificationCenter/ops/opsConfig.service';
import { NotificationOpsTemplateService } from '../services/notificationCenter/ops/opsTemplate.service';
import { NotificationOpsCampaignService } from '../services/notificationCenter/ops/opsCampaign.service';
import { NotificationOpsOverviewService } from '../services/notificationCenter/ops/opsOverview.service';

describe('Phase 32.4 ops config', () => {
  test('defaults expose required feature flags', async () => {
    const d = NotificationOpsConfigService.defaults();
    expect(d.featureFlags.notificationCenter).toBe(true);
    expect(d.featureFlags.digests).toBe(true);
    expect(d.featureFlags.focusMode).toBe(true);
    expect(d.featureFlags.quietHours).toBe(true);
    expect(d.featureFlags.richActions).toBe(true);
    expect(d.featureFlags.deliveryReceipts).toBe(true);
    expect(d.featureFlags.campaigns).toBe(true);
    expect(d.featureFlags.emergencyBroadcasts).toBe(true);
    expect(d.retention.notificationEventsDays).toBeGreaterThanOrEqual(7);
    expect(d.settings.maxRetryAttempts).toBeGreaterThan(0);
  });

  test('update feature flags in memory without migration', async () => {
    const next = await NotificationOpsConfigService.updateFeatureFlags(
      { digests: false },
      'admin-test'
    );
    expect(next.value.digests).toBe(false);
    // restore
    await NotificationOpsConfigService.updateFeatureFlags({ digests: true }, 'admin-test');
  });

  test('retention clamps extreme values', async () => {
    const next = await NotificationOpsConfigService.updateRetention(
      { auditLogsDays: 1, deliveryLogsDays: 99999 },
      'admin-test'
    );
    expect(next.value.auditLogsDays).toBeGreaterThanOrEqual(7);
    expect(next.value.deliveryLogsDays).toBeLessThanOrEqual(3650);
  });
});

describe('Phase 32.4 template rendering', () => {
  test('preview rejects missing template with 404 status when not found', async () => {
    await expect(
      NotificationOpsTemplateService.preview('nonexistent-id', { name: 'A' })
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('create without migration returns 503 or succeeds', async () => {
    try {
      const row = await NotificationOpsTemplateService.create(
        {
          key: `test_${Date.now()}`,
          name: 'Test',
          channel: 'in_app',
          body: 'Hello {{name}}',
          title: 'Hi'
        },
        'admin'
      );
      expect(row.key).toBeTruthy();
    } catch (e: any) {
      expect(e.statusCode).toBe(503);
      expect(String(e.message || '')).toMatch(/migration/i);
    }
  });
});

describe('Phase 32.4 campaigns validation', () => {
  test('invalid campaign type rejected', async () => {
    await expect(
      NotificationOpsCampaignService.create(
        { name: 'x', title: 't', body: 'b', type: 'not_a_type' },
        'admin'
      )
    ).rejects.toThrow(/Invalid campaign type/);
  });

  test('missing fields rejected', async () => {
    await expect(
      NotificationOpsCampaignService.create({ name: '', title: '', body: '' } as any, 'admin')
    ).rejects.toThrow();
  });
});

describe('Phase 32.4 overview shape', () => {
  test('getOverview returns metrics object', async () => {
    const ov = await NotificationOpsOverviewService.getOverview({ range: 'today' });
    expect(ov).toHaveProperty('metrics');
    expect(ov.metrics).toHaveProperty('emitted');
    expect(ov.metrics).toHaveProperty('delivered');
    expect(ov.metrics).toHaveProperty('failed');
    expect(ov.metrics).toHaveProperty('failureRate');
    expect(ov.metrics).toHaveProperty('readRate');
    expect(ov).toHaveProperty('featureFlags');
    expect(ov).toHaveProperty('retention');
  });

  test('getQueueHealth returns worker fields', async () => {
    const q = await NotificationOpsOverviewService.getQueueHealth();
    expect(q).toHaveProperty('queueDepth');
    expect(q).toHaveProperty('retryBacklog');
    expect(q).toHaveProperty('workerStatus');
  });

  test('getDeviceHealth returns totals', async () => {
    const d = await NotificationOpsOverviewService.getDeviceHealth();
    expect(d).toHaveProperty('total');
    expect(d).toHaveProperty('byPlatform');
  });
});
