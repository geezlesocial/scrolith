import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getNotificationActionUrl, getNotificationBucket } from '../../src/utils/notificationRouting';
import { resolveNotificationCategory } from '../../src/utils/notificationTaxonomy';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const approvalNotification = {
  id: 'notification-1',
  type: 'security.login_approval_required',
  category: 'community',
  title: 'Security · New sign-in request',
  entityType: 'login_approval',
  entityId: 'attempt-1',
  deepLink: '/settings/security?approval=attempt-1'
};

test('login approval notifications are security/home even when persisted category is stale', () => {
  assert.equal(resolveNotificationCategory(approvalNotification), 'security');
  assert.equal(getNotificationBucket(approvalNotification), 'home');
  assert.equal(getNotificationActionUrl(approvalNotification), undefined);
});

test('unrelated community notifications keep their community route', () => {
  const notification = {
    type: 'community_group_invite_received',
    category: 'community',
    actionUrl: '/community/groups/example'
  };
  assert.equal(getNotificationBucket(notification), 'community');
  assert.equal(getNotificationActionUrl(notification), '/community/groups/example');
});

test('trusted-session recovery uses one overlay event and cleans listeners on lifecycle changes', () => {
  const overlay = read('src/components/security/LoginApprovalOverlay.tsx');
  const app = read('src/App.tsx');
  const routing = read('src/utils/notificationRouting.ts');

  assert.match(routing, /LOGIN_APPROVAL_OPEN_EVENT/);
  assert.match(routing, /window\.dispatchEvent\(/);
  assert.match(overlay, /LOGIN_APPROVAL_OPEN_EVENT/);
  assert.match(overlay, /DeviceSecurityService\.listPendingApprovals\(\)/);
  assert.match(overlay, /window\.removeEventListener\(eventName, handler/);
  assert.equal((app.match(/AuthenticatedLoginApprovalOverlay/g) || []).length, 2);
});

test('Settings security reuses the protected pending approval APIs without exposing request IP or tokens', () => {
  const settings = read('src/dashboard/shared/SettingsModule.tsx');
  assert.match(settings, /DeviceSecurityService\.listPendingApprovals\(\)/);
  assert.match(settings, /DeviceSecurityService\.approveLogin\(approvalId\)/);
  assert.match(settings, /DeviceSecurityService\.rejectLogin\(approvalId\)/);
  assert.match(settings, /Login &amp; Device Security/);
  assert.doesNotMatch(settings, /approval\.requestIp/);
  assert.doesNotMatch(settings, /approvalToken/);
});
