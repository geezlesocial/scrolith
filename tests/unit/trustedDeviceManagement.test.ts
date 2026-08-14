import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('trusted device management reuses the authenticated overview and ownership-checked revoke APIs', () => {
  const service = read('src/services/deviceSecurity.ts');
  const settings = read('src/dashboard/shared/SettingsModule.tsx');

  assert.match(service, /api\.get\('\/security\/overview'/);
  assert.match(service, /api\.delete\(`\/security\/devices/);
  assert.match(settings, /DeviceSecurityService\.listTrustedDevices\(\)/);
  assert.match(settings, /DeviceSecurityService\.revokeTrustedDevice\(device\.id\)/);
  assert.match(settings, /Trusted devices \/ Approved browsers/);
  assert.match(settings, /CURRENT DEVICE/);
  assert.match(settings, /clearLocalDeviceSecurityMaterial/);
  assert.doesNotMatch(settings, /device\.requestIp|device\.publicKey|device\.metadata/);
});

test('current-device revocation clears local ECDSA material before logout without exposing secrets', () => {
  const service = read('src/services/deviceSecurity.ts');
  const settings = read('src/dashboard/shared/SettingsModule.tsx');

  assert.match(service, /Preferences\.remove/);
  assert.match(service, /indexedDB\.deleteDatabase\(DEVICE_KEY_DB\)/);
  assert.match(settings, /await clearLocalDeviceSecurityMaterial\(\)/);
  assert.match(settings, /logout\(\)/);
  assert.doesNotMatch(settings, /approvalToken|authorization|privateKey|JWT/);
});
