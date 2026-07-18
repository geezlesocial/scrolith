import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

test('mobile uploads expose gallery pick and quality assessment', () => {
  const path = join(root, 'src/mobile/uploads.ts');
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /assessCaptureQuality/);
  assert.match(source, /pickAndUpload/);
  assert.match(source, /CameraSource\.Photos/);
  assert.match(source, /correctOrientation:\s*true/);
  assert.match(source, /maxBytes/);
});

test('phase 20.4.1 TDZ regression guards remain present', () => {
  const path = join(root, 'tests/unit/phase2041OverviewTdzRegression.test.ts');
  assert.equal(existsSync(path), true);
  const source = readFileSync(path, 'utf8');
  assert.match(source, /unreadNotifications must be declared before loadOverview/);
});
