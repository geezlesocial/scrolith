/**
 * Phase 29.4 — admin messaging groups wiring tests
 */
import fs from 'fs';
import path from 'path';

const routes = fs.readFileSync(
  path.join(__dirname, '../routes/admin/messaging-groups.routes.ts'),
  'utf8'
);
const adminIndex = fs.readFileSync(path.join(__dirname, '../routes/admin/index.ts'), 'utf8');
const controller = fs.readFileSync(
  path.join(__dirname, '../controllers/admin.messagingGroups.controller.ts'),
  'utf8'
);
const rbac = fs.readFileSync(path.join(__dirname, '../services/rbac.service.ts'), 'utf8');

describe('Phase 29.4 messaging groups admin', () => {
  test('routes mount under messaging-groups with RBAC', () => {
    expect(routes).toMatch(/messaging\.groups\.read/);
    expect(routes).toMatch(/adminMessagingGroupsOverview/);
    expect(routes).toMatch(/adminListMessagingGroups/);
    expect(routes).toMatch(/adminMessagingGroupAction/);
    expect(routes).toMatch(/adminExportMessagingGroups/);
    expect(adminIndex).toMatch(/messaging-groups/);
    expect(adminIndex).toMatch(/messagingGroupsAdminRoutes/);
  });

  test('controller covers overview directory actions audit templates settings', () => {
    expect(controller).toMatch(/adminMessagingGroupsOverview/);
    expect(controller).toMatch(/transfer_ownership/);
    expect(controller).toMatch(/force_lock|emergency_lockdown/);
    expect(controller).toMatch(/apply_template/);
    expect(controller).toMatch(/POLICY_TEMPLATES/);
    expect(controller).toMatch(/groupAdminMetrics/);
    // not community
    expect(controller).not.toMatch(/CommunityClub/);
  });

  test('RBAC seeds messaging.groups permissions', () => {
    expect(rbac).toMatch(/messaging\.groups\.read/);
    expect(rbac).toMatch(/messaging\.groups\.moderate/);
    expect(rbac).toMatch(/messaging\.groups\.admin/);
    expect(rbac).toMatch(/messaging\.groups\.export/);
  });
});
