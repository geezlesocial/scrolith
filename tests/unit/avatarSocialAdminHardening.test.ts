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
const findBackendRoot = () => {
  const candidates = [
    process.env.SCROLITH_BACKEND_ROOT,
    join(root, '..'),
    join(root, '../azure-media-backend-20260804'),
    join(root, '../../..')
  ].filter(Boolean) as string[];
  const match = candidates.find((candidate) =>
    existsSync(join(candidate, 'geezle-backend/src/middleware/admin.middleware.ts'))
  );
  if (!match) throw new Error('Unable to locate Scrolith backend root for avatar hardening test');
  return match;
};
const monorepo = findBackendRoot();

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

test('EnterpriseAvatar bounds failed media attempts and prefers eager loading', () => {
  assert.match(avatar, /loading = 'eager'/);
  assert.match(avatar, /FAILED_AVATAR_TTL_MS/);
  assert.match(avatar, /failedAvatarSources = new Map/);
  assert.match(avatar, /__enterpriseAvatarFailureRegistryForTests/);
  assert.doesNotMatch(avatar, /retryToken/);
  assert.doesNotMatch(avatar, /_av=/);
  assert.match(avatar, /profilePhotoFileId/);
});

test('EnterpriseAvatar failed URL registry expires temporary failures', async () => {
  const { __enterpriseAvatarFailureRegistryForTests: registry } = await import(
    '../../src/components/common/EnterpriseAvatar.tsx'
  );
  registry.reset();
  registry.remember('https://api.scrolith.com/api/files/content/a.png', 1000);
  assert.equal(registry.isFailed('https://api.scrolith.com/api/files/content/a.png', 1001), true);
  assert.equal(
    registry.isFailed(
      'https://api.scrolith.com/api/files/content/a.png',
      1000 + registry.ttlMs + 1
    ),
    false
  );
  assert.equal(registry.size(), 0);
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
