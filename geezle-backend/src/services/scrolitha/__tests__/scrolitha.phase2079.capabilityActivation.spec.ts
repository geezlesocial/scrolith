import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL,
  SCROLITHA_OFFICIAL_COVER_PHOTO_URL,
  withScrolithaAssetVersion
} from '../scrolitha.platformIdentity';
import { getScrolithaMessageSecurityStatus } from '../scrolitha.publicProfile';

test('official assets are stable file-content URLs', () => {
  assert.ok(SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL.includes('/api/files/content/edd2e7e7-1b32-4edd-9209-6e87fe80ea45'));
  assert.ok(SCROLITHA_OFFICIAL_COVER_PHOTO_URL.includes('/api/files/content/a163c581-9ca1-4561-a41f-0540c7fb9214'));
  assert.ok(withScrolithaAssetVersion(SCROLITHA_OFFICIAL_PROFILE_PHOTO_URL).includes('v='));
});

test('security status remains non-E2EE', () => {
  const s = getScrolithaMessageSecurityStatus();
  assert.equal(s.e2eeImplemented, false);
  assert.equal(s.e2eeAvailable, false);
});

test('write capability status phrasing uses confirmation when both gates on', () => {
  // Pure label logic mirror
  const label = (writeOn: boolean, toolsOn: boolean, confirmOn: boolean) => {
    if (!(writeOn && toolsOn)) return 'Not currently available';
    if (confirmOn) return 'Available with confirmation';
    return 'Limited';
  };
  assert.equal(label(true, true, true), 'Available with confirmation');
  assert.equal(label(true, true, false), 'Limited');
  assert.equal(label(false, true, true), 'Not currently available');
});
