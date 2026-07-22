import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

describe('Phase 32.4 Notification Operations UI contract', () => {
  const source = readFileSync(join(__dirname, '..', 'NotificationOperationsCenter.tsx'), 'utf8');
  const adminDash = readFileSync(join(__dirname, '..', '..', 'AdminDashboard.tsx'), 'utf8');
  const adminSvc = readFileSync(join(__dirname, '..', '..', '..', 'services', 'admin.ts'), 'utf8');

  test('exports default operations center', () => {
    expect(source).toContain('export default NotificationOperationsCenter');
  });

  test('covers required sections', () => {
    const sections = [
      'Overview',
      'Live Activity',
      'Delivery',
      'Campaigns',
      'Templates',
      'Retry Queue',
      'Failures',
      'Queue Health',
      'Device Health',
      'Analytics',
      'Feature Flags',
      'Audit Logs',
      'Settings'
    ];
    for (const s of sections) {
      expect(source).toContain(s);
    }
  });

  test('wired into AdminDashboard', () => {
    expect(adminDash).toContain('notification-ops');
    expect(adminDash).toContain('NotificationOperationsCenter');
  });

  test('AdminService exposes ops APIs', () => {
    expect(adminSvc).toContain('getNotificationOpsOverview');
    expect(adminSvc).toContain('createNotificationOpsCampaign');
    expect(adminSvc).toContain('putNotificationOpsFeatureFlags');
    expect(adminSvc).toContain('enqueueNotificationRetries');
  });

  test('accessibility roles present', () => {
    expect(source).toContain('role="tablist"');
    expect(source).toContain('role="tab"');
    expect(source).toContain('role="switch"');
    expect(source).toContain('aria-label');
  });
});
