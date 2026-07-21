/**
 * Phase 29.4 — admin UI wiring tests
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Phase 29.4 Messaging Groups Admin UI', () => {
  test('admin page and service methods exist', () => {
    const page = read('src/dashboard/admin/MessagingGroupsAdmin.tsx');
    assert.match(page, /admin-messaging-groups/);
    assert.match(page, /mg-admin-overview/);
    assert.match(page, /mg-admin-directory/);
    assert.match(page, /mg-admin-audit/);
    assert.match(page, /mg-admin-danger/);
    assert.match(page, /getMessagingGroupsOverview/);
    assert.doesNotMatch(page, /CommunityClub/);

    const admin = read('src/services/admin.ts');
    assert.match(admin, /getMessagingGroupsOverview/);
    assert.match(admin, /listMessagingGroups/);
    assert.match(admin, /messagingGroupAction/);
    assert.match(admin, /exportMessagingGroups/);
  });

  test('AdminDashboard registers messaging-groups tab', () => {
    const dash = read('src/dashboard/AdminDashboard.tsx');
    assert.match(dash, /messaging-groups/);
    assert.match(dash, /MessagingGroupsAdmin/);
  });
});
