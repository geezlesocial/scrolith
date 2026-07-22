import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

describe('Phase 32.3 Android excellence UI/contracts', () => {
  const settings = readFileSync(
    join(__dirname, '..', 'settings', 'NotificationSettings.tsx'),
    'utf8'
  );
  const push = readFileSync(join(__dirname, '..', '..', 'mobile', 'push.ts'), 'utf8');
  const sync = readFileSync(join(__dirname, '..', '..', 'mobile', 'notificationSync.ts'), 'utf8');
  const service = readFileSync(join(__dirname, '..', '..', 'services', 'notifications.ts'), 'utf8');
  const taxonomy = readFileSync(
    join(__dirname, '..', '..', 'utils', 'notificationTaxonomy.ts'),
    'utf8'
  );

  test('settings exposes devices tab', () => {
    expect(settings).toContain("id: 'devices'");
    expect(settings).toContain('Registered devices');
    expect(settings).toContain('listDevices');
  });

  test('push registers device metadata and lifecycle receipts', () => {
    expect(push).toContain('deviceName');
    expect(push).toContain('capabilities');
    expect(push).toContain('recordLifecycleReceipt');
    expect(push).toContain('mark_read');
  });

  test('sync module provides badge and offline flush', () => {
    expect(sync).toContain('flushNotificationOfflineQueue');
    expect(sync).toContain('bindNotificationSyncSocket');
    expect(sync).toContain('notifications:sync');
    expect(sync).toContain('applyRemoteSync');
  });

  test('client APIs for sync-state and receipts', () => {
    expect(service).toContain('getSyncState');
    expect(service).toContain('postReceipts');
    expect(service).toContain('postAction');
    expect(service).toContain('listDevices');
  });

  test('deep links cover wallet support security digest', () => {
    expect(taxonomy).toContain("return '/wallet'");
    expect(taxonomy).toContain('/support');
    expect(taxonomy).toContain('/notifications?digest=');
    expect(taxonomy).toContain('/settings/notifications');
  });
});
