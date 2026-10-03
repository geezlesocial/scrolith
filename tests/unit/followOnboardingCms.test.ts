import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_FOLLOW_ONBOARDING_CONTENT } from '../../src/utils/followOnboardingCms';

test('CMS defaults do not invent feature cards or change the onboarding policy', () => {
  assert.deepEqual(DEFAULT_FOLLOW_ONBOARDING_CONTENT.featureCards, []);
  assert.equal(DEFAULT_FOLLOW_ONBOARDING_CONTENT.hero.title, 'Build your first Scrolith feed');
  assert.equal(DEFAULT_FOLLOW_ONBOARDING_CONTENT.guidance.title, 'Why we ask this');
  assert.equal('required' in DEFAULT_FOLLOW_ONBOARDING_CONTENT, false);
});

test('follow-onboarding page consumes CMS presentation fields without delegating its required-step policy', async () => {
  const page = await readFile(new URL('../../src/auth/FollowOnboarding.tsx', import.meta.url), 'utf8');
  assert.match(page, /content\.hero\.title/);
  assert.match(page, /content\.hero\.description/);
  assert.match(page, /content\.featureCards\.filter\(\(card\) => card\.enabled\)/);
  assert.match(page, /content\.guidance\.title/);
  assert.match(page, /if \(!onboarding\.required\)/);
  assert.match(page, /AuthService\.completeFollowOnboarding\(\)/);
});

test('admin module exposes structured content editing and the CMS-managed image upload path', async () => {
  const [manager, dashboard] = await Promise.all([
    readFile(new URL('../../src/dashboard/admin/FollowOnboardingManager.tsx', import.meta.url), 'utf8'),
    readFile(new URL('../../src/dashboard/AdminDashboard.tsx', import.meta.url), 'utf8')
  ]);
  assert.match(dashboard, /id: 'onboard-system', label: 'Onboard System'/);
  assert.match(manager, /CMSService\.getFollowOnboardingContent\(true\)/);
  assert.match(manager, /CMSService\.saveFollowOnboardingContent\(content\)/);
  assert.match(manager, /CMSService\.uploadMedia\(file\)/);
  assert.match(manager, /Required language\/follow steps and completion rules remain controlled/);
});
