/**
 * Avatar reliability, social logos, admin SUPER_ADMIN access.
 * Run: node --import tsx --test tests/unit/avatarSocialAdminHardening.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');
const monorepoCandidates = [join(root, '..'), join(root, '..', '..')];
const monorepo =
  monorepoCandidates.find((candidate) =>
    existsSync(join(candidate, 'geezle-backend/src/middleware/admin.middleware.ts'))
  ) || monorepoCandidates[0];

const avatar = readFileSync(join(root, 'src/components/common/EnterpriseAvatar.tsx'), 'utf8');
const social = readFileSync(join(root, 'src/auth/AuthSocialButtons.tsx'), 'utf8');
const profilePhoto = readFileSync(join(root, 'src/utils/profilePhoto.ts'), 'utf8');
const messaging = readFileSync(join(root, 'src/services/messaging.ts'), 'utf8');
const adminMw = readFileSync(
  join(monorepo, 'geezle-backend/src/middleware/admin.middleware.ts'),
  'utf8'
);
const msgCtrl = readFileSync(
  join(monorepo, 'geezle-backend/src/controllers/messages.controller.ts'),
  'utf8'
);
const rbac = readFileSync(join(monorepo, 'geezle-backend/src/services/rbac.service.ts'), 'utf8');

test('EnterpriseAvatar retries and prefers eager loading', () => {
  assert.match(avatar, /loading = 'eager'/);
  assert.match(avatar, /failCountRef/);
  assert.match(avatar, /retryToken/);
  assert.match(avatar, /profilePhotoFileId/);
});

test('Social auth uses durable SVG data-uri logos', () => {
  assert.match(social, /GOOGLE_LOGO_DATA_URI/);
  assert.match(social, /LINKEDIN_LOGO_DATA_URI/);
  assert.match(social, /data:image\/svg\+xml/);
  assert.doesNotMatch(social, /9c7e50a1-12d1-4b20-9655-54cd30b0961b/);
});

test('Profile photo candidates prioritize file ids', () => {
  assert.match(profilePhoto, /profilePhotoFileId/);
  assert.match(profilePhoto, /Prefer file-id based content URLs/);
});

test('Messaging participant normalization keeps profilePhotoFileId', () => {
  assert.match(messaging, /profilePhotoFileId/);
  assert.match(messaging, /avatarUrl/);
});

test('Admin middleware accepts SUPER_ADMIN and staff Owner', () => {
  assert.match(adminMw, /super_admin/);
  assert.match(adminMw, /includes\('admin'\)/);
  assert.match(adminMw, /roleName === 'owner'/);
});

test('Messaging backend selects profilePhotoFileId', () => {
  assert.match(msgCtrl, /profilePhotoFileId: true/);
  assert.match(msgCtrl, /\/api\/files\/content\//);
});

test('RBAC seeds users manage and marketing subscriber permissions', () => {
  assert.match(rbac, /users\.update/);
  assert.match(rbac, /users\.delete/);
  assert.match(rbac, /marketing\.subscribers\.read/);
  assert.match(rbac, /marketing\.subscribers\.manage/);
});
