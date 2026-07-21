import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const read = (rel: string) => readFileSync(join(root, rel), 'utf8');

describe('Phase 29.5 FE intelligence wiring', () => {
  test('messaging client has search discover health', () => {
    const src = read('src/services/messaging.ts');
    assert.match(src, /searchMessagingGroups/);
    assert.match(src, /discoverMessagingGroups/);
    assert.match(src, /getMessagingGroupHealth/);
    assert.match(src, /saveMessagingGroupSearch/);
  });

  test('admin service and UI expose enterprise search', () => {
    const admin = read('src/services/admin.ts');
    assert.match(admin, /searchMessagingGroupsAdmin/);
    assert.match(admin, /getMessagingGroupsAnalytics/);
    assert.match(admin, /getMessagingGroupHealthAdmin/);

    const ui = read('src/dashboard/admin/MessagingGroupsAdmin.tsx');
    assert.match(ui, /mg-admin-enterprise-search/);
    assert.match(ui, /searchMessagingGroupsAdmin/);
    assert.match(ui, /getMessagingGroupsAnalytics/);
  });
});
