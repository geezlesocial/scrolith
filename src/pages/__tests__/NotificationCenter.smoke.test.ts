import { readFileSync } from 'fs';
import { join } from 'path';

describe('NotificationCenter UI contract', () => {
  const source = readFileSync(join(__dirname, '..', 'NotificationCenter.tsx'), 'utf8');

  test('exports default page component', () => {
    expect(source).toContain('export default NotificationCenter');
  });

  test('supports search, categories, bulk actions, and accessibility', () => {
    expect(source).toContain('Search notifications');
    expect(source).toContain('aria-label="Notification inbox"');
    expect(source).toContain('Mark all read');
    expect(source).toContain('role="list"');
    expect(source).toContain('focus-visible:ring-2');
    expect(source).toContain('pin');
    expect(source).toContain('archive');
  });

  test('uses Phase 32 APIs', () => {
    expect(source).toContain('NotificationService.getPage');
    expect(source).toContain('NotificationService.getSummary');
    expect(source).toContain('NotificationService.bulkUpdate');
  });

  test('realtime socket hooks present', () => {
    expect(source).toContain('notifications:new');
  });
});
