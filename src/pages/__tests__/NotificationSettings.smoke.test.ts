import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, expect, test } from 'vitest';

describe('NotificationSettings UI contract (Phase 32.2)', () => {
  const settings = readFileSync(
    join(__dirname, '..', 'settings', 'NotificationSettings.tsx'),
    'utf8'
  );
  const center = readFileSync(join(__dirname, '..', 'NotificationCenter.tsx'), 'utf8');
  const service = readFileSync(join(__dirname, '..', '..', 'services', 'notifications.ts'), 'utf8');

  test('exports default settings page', () => {
    expect(settings).toContain('export default NotificationSettings');
  });

  test('covers preference sections', () => {
    expect(settings).toContain('Quiet hours');
    expect(settings).toContain('Focus mode');
    expect(settings).toContain('Digest schedule');
    expect(settings).toContain('Mandatory security');
    expect(settings).toContain('role="tablist"');
    expect(settings).toContain('role="switch"');
  });

  test('uses Phase 32.2 preference APIs', () => {
    expect(service).toContain('getPreferences');
    expect(service).toContain('startFocusMode');
    expect(service).toContain('putDigestSettings');
    expect(service).toContain('listDigests');
  });

  test('Notification Center exposes focus control and settings link', () => {
    expect(center).toContain('Focus Mode');
    expect(center).toContain('/settings/notifications');
    expect(center).toContain('startFocusMode');
    expect(center).toContain('stopFocusMode');
  });
});
