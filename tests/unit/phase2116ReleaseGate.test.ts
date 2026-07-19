/**
 * Phase 21.1.6 — release gate + certification helper contracts.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '../..');

const files = [
  'tests/certification/playwright.config.ts',
  'tests/certification/helpers/env.ts',
  'tests/certification/helpers/auth.ts',
  'tests/certification/helpers/postCard.ts',
  'tests/certification/helpers/feedIdentity.ts',
  'tests/certification/helpers/a11y.ts',
  'tests/certification/helpers/perf.ts',
  'tests/certification/fixtures/auth.setup.ts',
  'tests/certification/specs/member-home.auth.spec.ts',
  'tests/certification/specs/community.auth.spec.ts',
  'tests/certification/specs/scroll.auth.spec.ts',
  'tests/certification/specs/profile.auth.spec.ts',
  'tests/certification/specs/notifications.auth.spec.ts',
  'tests/certification/specs/feed-identity.auth.spec.ts',
  'tests/certification/specs/mobile-emulation.auth.spec.ts',
  'tests/certification/specs/accessibility.auth.spec.ts',
  'tests/certification/specs/performance.baseline.spec.ts',
  'scripts/phase2116-release-gate.mjs',
  'scripts/phase2116-generate-storage-state.mjs',
  'scripts/phase2116-android-wrapper-cert.mjs',
  'docs/certification/production-certification-runbook.md',
  'docs/certification/authenticated-qa-setup.md',
  'docs/certification/device-checklist.md',
  'docs/certification/release-checklist.md',
  'docs/certification/rollback-checklist.md',
  'docs/certification/android-wrapper-cert.md'
];

test('all Phase 21.1.6 certification files exist', () => {
  for (const rel of files) {
    assert.equal(existsSync(join(root, rel)), true, `missing ${rel}`);
  }
});

test('release gate never mutates Cloud Run traffic', () => {
  const gate = readFileSync(join(root, 'scripts/phase2116-release-gate.mjs'), 'utf8');
  assert.match(gate, /Does NOT change Cloud Run traffic/);
  assert.doesNotMatch(gate, /gcloud run services update-traffic/);
  assert.doesNotMatch(gate, /update-traffic/);
  assert.match(gate, /promoteRecommended/);
  assert.match(gate, /AUTH_REQUIRED/);
  assert.match(gate, /product_defect|productFailures/);
  assert.match(gate, /test_harness_defect|harnessFailures/);
  assert.match(gate, /pixel-7/);
  assert.match(gate, /iphone-15/);
});

test('overflow helpers are component-scoped', () => {
  const src = readFileSync(join(root, 'tests/certification/helpers/postCard.ts'), 'utf8');
  assert.match(src, /assertPostCardNoOverflow/);
  assert.match(src, /assertFeedColumnNoOverflow/);
  assert.match(src, /assertLayoutNoProductOverflow/);
});

test('route helpers accept member-home and m/home', () => {
  const src = readFileSync(join(root, 'tests/certification/helpers/routes.ts'), 'utf8');
  assert.match(src, /member-home/);
  assert.ok(src.includes('m\\/home') || src.includes('m/home'));
  assert.match(src, /isValidAuthDestination/);
});

test('feed identity helper enforces post id and fingerprint stability', () => {
  const src = readFileSync(join(root, 'tests/certification/helpers/feedIdentity.ts'), 'utf8');
  assert.match(src, /visible_post_id_changed/);
  assert.match(src, /author_changed/);
  assert.match(src, /fingerprint_changed/);
  assert.match(src, /FEED_IDENTITY_MS/);
  assert.match(src, /disturbSession/);
});

test('playwright config includes required mobile projects', () => {
  const cfg = readFileSync(join(root, 'tests/certification/playwright.config.ts'), 'utf8');
  assert.match(cfg, /pixel-7/);
  assert.match(cfg, /iphone-15/);
  assert.match(cfg, /mobile-390/);
  assert.match(cfg, /desktop-chrome/);
  assert.match(cfg, /390/);
  assert.match(cfg, /844/);
});

test('auth specs cover required surfaces', () => {
  const names = [
    'member-home.auth.spec.ts',
    'community.auth.spec.ts',
    'scroll.auth.spec.ts',
    'profile.auth.spec.ts',
    'notifications.auth.spec.ts',
    'feed-identity.auth.spec.ts'
  ];
  for (const name of names) {
    const src = readFileSync(join(root, 'tests/certification/specs', name), 'utf8');
    assert.match(src, /requireAuthOrSkip/);
  }
});

test('a11y helpers cover focus, touch, reduced motion, contrast', () => {
  const src = readFileSync(join(root, 'tests/certification/helpers/a11y.ts'), 'utf8');
  assert.match(src, /assertFocusableActions/);
  assert.match(src, /assertTouchTargets/);
  assert.match(src, /assertReducedMotionRespected/);
  assert.match(src, /assertContrastSample/);
  assert.match(src, /assertKeyboardTabOrder/);
});

test('perf helpers write baseline artifacts', () => {
  const src = readFileSync(join(root, 'tests/certification/helpers/perf.ts'), 'utf8');
  assert.match(src, /collectWebVitals/);
  assert.match(src, /writeBaseline/);
  assert.match(src, /compareCls/);
  assert.match(src, /fcp/);
  assert.match(src, /lcp/);
  assert.match(src, /cls/);
  assert.match(src, /inp/);
});

test('package.json exposes cert scripts', () => {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.ok(pkg.scripts['test:cert:unit']);
  assert.ok(pkg.scripts['test:cert:e2e']);
  assert.ok(pkg.scripts['test:cert:gate']);
  assert.ok(pkg.scripts['test:cert:storage']);
  assert.ok(pkg.scripts['test:cert:android-prep']);
});
