import fs from 'fs';
import path from 'path';

const messagesRoutes = fs.readFileSync(path.join(__dirname, '../routes/messages.routes.ts'), 'utf8');
const adminRoutes = fs.readFileSync(
  path.join(__dirname, '../routes/admin/messaging-groups.routes.ts'),
  'utf8'
);
const mig = fs.readFileSync(
  path.join(
    __dirname,
    '../../prisma/migrations/20260721160000_phase295_messaging_groups_search_indexes/migration.sql'
  ),
  'utf8'
);
const mig291 = fs.readFileSync(
  path.join(
    __dirname,
    '../../prisma/migrations/20260721140000_phase291_enterprise_messaging_groups/migration.sql'
  ),
  'utf8'
);

describe('Phase 29.5 wiring', () => {
  test('user search/discover routes before :id', () => {
    expect(messagesRoutes).toMatch(/groups\/search/);
    expect(messagesRoutes).toMatch(/groups\/discover/);
    expect(messagesRoutes).toMatch(/groups\/:id\/health/);
    const searchIdx = messagesRoutes.indexOf("'/groups/search'");
    const idIdx = messagesRoutes.indexOf("'/groups/:id'");
    expect(searchIdx).toBeGreaterThan(-1);
    expect(idIdx).toBeGreaterThan(searchIdx);
  });

  test('admin search and analytics routes', () => {
    expect(adminRoutes).toMatch(/adminSearchMessagingGroups/);
    expect(adminRoutes).toMatch(/adminMessagingGroupsAnalytics/);
    expect(adminRoutes).toMatch(/adminGroupHealth/);
  });

  test('new indexes migration does not alter 29.1 migration file content identity', () => {
    expect(mig).toMatch(/Phase 29\.5/);
    expect(mig).toMatch(/CREATE INDEX IF NOT EXISTS/);
    expect(mig).not.toMatch(/DROP TABLE/);
    expect(mig291).toMatch(/Phase 29\.1/);
    expect(mig291).toMatch(/SECRET/);
  });
});
