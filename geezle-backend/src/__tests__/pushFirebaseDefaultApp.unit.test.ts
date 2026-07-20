/**
 * Regression: named Firebase apps (storage) must not make push call admin.app()
 * and throw "The default Firebase app does not exist".
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pushSrc = readFileSync(join(here, '../services/pushNotifications.ts'), 'utf8');
const appsCtrl = readFileSync(join(here, '../controllers/apps.controller.ts'), 'utf8');

test('push does not use admin.apps.length + admin.app() bare default trap', () => {
  // The buggy pattern that 500'd analytics when only scrolith-storage existed.
  assert.doesNotMatch(
    pushSrc,
    /if\s*\(\s*admin\.apps\.length\s*>\s*0\s*\)\s*\{\s*firebaseApp\s*=\s*admin\.app\(\)/s
  );
  assert.match(pushSrc, /getExistingDefaultApp|scrolith-storage|named app/i);
  assert.match(pushSrc, /getPushRuntimeStatus/);
});

test('getPushRuntimeStatus is defensive (try/catch)', () => {
  assert.match(pushSrc, /export const getPushRuntimeStatus[\s\S]*try\s*\{/);
  assert.match(pushSrc, /error:[\s\S]*Firebase runtime status unavailable|Push runtime unavailable|firebaseInitError/);
});

test('admin analytics isolates push runtime failures', () => {
  assert.match(appsCtrl, /getAdminAppDistributionAnalytics/);
  assert.match(appsCtrl, /Never let Firebase init failures fail the whole analytics dashboard/);
  assert.match(appsCtrl, /pushRuntime\s*=\s*getPushRuntimeStatus/);
});

test('Cloud Run uses application default credentials without GOOGLE_APPLICATION_CREDENTIALS alone', () => {
  assert.match(pushSrc, /shouldUseApplicationDefault/);
  assert.match(pushSrc, /K_SERVICE/);
  assert.match(pushSrc, /applicationDefault/);
});
