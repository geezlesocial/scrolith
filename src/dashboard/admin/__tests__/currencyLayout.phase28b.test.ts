/**
 * Phase 28B — layout contract tests (static source assertions).
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const systemSettingsPath = join(__dirname, '../SystemSettings.tsx');
const adminDashboardPath = join(__dirname, '../../AdminDashboard.tsx');

describe('Phase 28B currency management layout contracts', () => {
  const systemSource = readFileSync(systemSettingsPath, 'utf8');
  const adminSource = readFileSync(adminDashboardPath, 'utf8');

  test('system settings shell is column-first (not save-as-third-column row)', () => {
    expect(systemSource).toContain('data-testid="system-settings-shell"');
    expect(systemSource).toContain('flex flex-col min-h-[600px]');
    expect(systemSource).toMatch(/flex flex-col lg:flex-row min-w-0 flex-1/);
  });

  test('currency table container allows horizontal scroll', () => {
    expect(systemSource).toContain('data-testid="currency-table-container"');
    expect(systemSource).toContain('overflow-x-auto');
    expect(systemSource).toContain('min-w-[880px]');
  });

  test('actions and rate controls remain in markup', () => {
    expect(systemSource).toContain('data-testid="currency-toolbar"');
    expect(systemSource).toContain('data-testid="currency-pagination"');
    expect(systemSource).toContain('data-testid="currency-mobile-cards"');
    expect(systemSource).toMatch(/min-w-\[7\.5rem\]/);
    expect(systemSource).toContain('sticky right-0');
    expect(systemSource).toContain('sticky left-0');
  });

  test('admin main allows wider system settings content', () => {
    expect(adminSource).toContain("activeTab === 'system'");
    expect(adminSource).toContain('max-w-[100rem]');
    expect(adminSource).toContain('min-w-0');
  });
});
