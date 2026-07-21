/**
 * Phase 29 — Android push sound, channel v2 migration, icon, production URLs.
 * Run with: node --import tsx --test tests/unit/phase29AndroidPushSound.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ANDROID_CHANNEL_DEFINITIONS,
  ANDROID_CHANNEL_IDS,
  ANDROID_LEGACY_CHANNEL_IDS,
  SCROLITH_NOTIFICATION_SOUND,
  SCROLITH_NOTIFICATION_SOUND_PRONUNCIATION,
  SCROLITH_NOTIFICATION_SMALL_ICON,
  buildEnterprisePushDeepLink,
  isAllowedAndroidChannelId,
  resolveAndroidChannelId,
  resolveNotificationCategory
} from '../../src/utils/notificationTaxonomy.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pushSrc = readFileSync(join(here, '../../src/mobile/push.ts'), 'utf8');
const manifest = readFileSync(
  join(here, '../../../mobile/android/app/src/main/AndroidManifest.xml'),
  'utf8'
);
const gradle = readFileSync(join(here, '../../../mobile/android/app/build.gradle'), 'utf8');
const capacitor = readFileSync(join(here, '../../../mobile/capacitor.config.ts'), 'utf8');
const packageJson = JSON.parse(
  readFileSync(join(here, '../../../mobile/package.json'), 'utf8')
);
const rawSoundPath = join(here, '../../../mobile/android/app/src/main/res/raw/scrolith.wav');
const smallIconPath = join(
  here,
  '../../../mobile/android/app/src/main/res/drawable/ic_stat_scrolith.xml'
);
const networkSecurity = readFileSync(
  join(here, '../../../mobile/android/app/src/main/res/xml/network_security_config.xml'),
  'utf8'
);
const beChannels = readFileSync(
  join(here, '../../../geezle-backend/src/services/notificationAndroidChannels.ts'),
  'utf8'
);
const bePush = readFileSync(
  join(here, '../../../geezle-backend/src/services/pushNotifications.ts'),
  'utf8'
);

test('Phase 29 sound resource exists with valid Android name', () => {
  assert.equal(existsSync(rawSoundPath), true, 'raw/scrolith.wav must exist');
  assert.equal(SCROLITH_NOTIFICATION_SOUND, 'scrolith');
  assert.match(SCROLITH_NOTIFICATION_SOUND, /^[a-z0-9_]+$/);
  assert.doesNotMatch(SCROLITH_NOTIFICATION_SOUND, /\./);
  assert.equal(SCROLITH_NOTIFICATION_SOUND_PRONUNCIATION, 'Scroll it');
  const wav = readFileSync(rawSoundPath);
  assert.ok(wav.length > 1000, 'sound file too small');
  assert.ok(wav.length < 500_000, 'sound file too large for notification');
  // RIFF/WAVE header
  assert.equal(wav.subarray(0, 4).toString('ascii'), 'RIFF');
  assert.equal(wav.subarray(8, 12).toString('ascii'), 'WAVE');
});

test('Phase 29 active channels are v2 with Scrolith sound migration', () => {
  assert.equal(ANDROID_CHANNEL_IDS.messages, 'scrolith_messages_v2');
  assert.equal(ANDROID_CHANNEL_IDS.system, 'scrolith_system_v2');
  assert.equal(ANDROID_CHANNEL_IDS.wallet, 'scrolith_wallet_v2');
  assert.equal(ANDROID_CHANNEL_IDS.payments, 'scrolith_payments_v2');
  assert.equal(ANDROID_CHANNEL_IDS.alerts, 'scrolith_alerts_v2');
  assert.equal(ANDROID_LEGACY_CHANNEL_IDS.messages, 'scrolith_messages_v1');
  for (const def of ANDROID_CHANNEL_DEFINITIONS) {
    assert.match(def.id, /^scrolith_/);
    assert.ok(!def.id.endsWith('_v1') || def.id.includes('alerts'), `active def should not be v1: ${def.id}`);
  }
});

test('Phase 29 category map + payment/wallet + campaign alerts', () => {
  assert.equal(resolveNotificationCategory({ type: 'chat' }), 'message');
  assert.equal(resolveNotificationCategory({ type: 'payment' }), 'payment');
  assert.equal(resolveNotificationCategory({ type: 'wallet_payout' }), 'wallet');
  assert.equal(resolveAndroidChannelId({ type: 'new_message' }), ANDROID_CHANNEL_IDS.messages);
  assert.equal(resolveAndroidChannelId({ type: 'payment' }), ANDROID_CHANNEL_IDS.payments);
  assert.equal(resolveAndroidChannelId({ type: 'wallet_balance' }), ANDROID_CHANNEL_IDS.wallet);
  assert.equal(resolveAndroidChannelId({ type: 'app_campaign' }), ANDROID_CHANNEL_IDS.alerts);
  assert.equal(resolveAndroidChannelId({ type: 'security_login' }), ANDROID_CHANNEL_IDS.security);
});

test('Phase 29 channel allowlist rejects arbitrary ids', () => {
  assert.equal(isAllowedAndroidChannelId('scrolith_messages_v2'), true);
  assert.equal(isAllowedAndroidChannelId('scrolith_messages_v1'), true);
  assert.equal(isAllowedAndroidChannelId('evil_channel'), false);
  assert.equal(isAllowedAndroidChannelId(''), false);
});

test('Phase 29 deep links never invent Home', () => {
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'message', conversationId: 'c9' }),
    '/messages/c9'
  );
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'scroll', scrollId: 'sv1' }),
    '/scroll?scroll=sv1'
  );
  assert.equal(buildEnterprisePushDeepLink({ type: 'wallet_update' }), '/wallet');
  assert.equal(buildEnterprisePushDeepLink({ type: 'totally_unknown' }), null);
});

test('Phase 29 push.ts uses Scrolith sound constant and legacy v1 retention', () => {
  assert.match(pushSrc, /SCROLITH_NOTIFICATION_SOUND/);
  assert.match(pushSrc, /ANDROID_LEGACY_CHANNEL_IDS/);
  assert.match(pushSrc, /ANDROID_CHANNEL_DEFINITIONS/);
  assert.doesNotMatch(pushSrc, /sound:\s*['"]scrolith\.wav['"]/);
});

test('Phase 29 manifest icon, default channel, production hosts, POST_NOTIFICATIONS', () => {
  assert.equal(existsSync(smallIconPath), true);
  assert.equal(SCROLITH_NOTIFICATION_SMALL_ICON, 'ic_stat_scrolith');
  assert.match(manifest, /ic_stat_scrolith/);
  assert.match(manifest, /scrolith_alerts_v2/);
  assert.match(manifest, /POST_NOTIFICATIONS/);
  assert.match(manifest, /scrolith\.com/);
  assert.doesNotMatch(manifest, /usesCleartextTraffic"\s*android:value="true"/);
  assert.match(networkSecurity, /scrolith\.com/);
  // Production hosts never allow cleartext; local/emulator domains may.
  assert.match(networkSecurity, /base-config cleartextTrafficPermitted="false"/);
  assert.match(
    networkSecurity,
    /cleartextTrafficPermitted="false">\s*\n\s*<domain includeSubdomains="true">scrolith\.com<\/domain>/
  );
});

test('Phase 29 version code > 35 and package identity', () => {
  assert.match(gradle, /versionCode 42/);
  assert.match(gradle, /versionName "1.1.32"/);
  assert.match(gradle, /applicationId "com\.scrolith\.scrolith"/);
  assert.equal(packageJson.version, '1.1.31');
  assert.match(capacitor, /hostname: 'scrolith\.com'/);
  assert.match(capacitor, /androidScheme: 'https'/);
  assert.doesNotMatch(capacitor, /localhost:3000/);
});

test('Phase 29 backend FCM payload uses scrolith sound + v2 channels', () => {
  assert.match(beChannels, /scrolith_messages_v2/);
  assert.match(beChannels, /SCROLITH_NOTIFICATION_SOUND = 'scrolith'/);
  assert.match(beChannels, /Scroll it/);
  assert.match(bePush, /SCROLITH_NOTIFICATION_SOUND/);
  assert.match(bePush, /ic_stat_scrolith|SCROLITH_NOTIFICATION_SMALL_ICON/);
  assert.match(bePush, /channelId/);
  assert.match(bePush, /sound:/);
});

test('messages channel is private lock-screen', () => {
  const messages = ANDROID_CHANNEL_DEFINITIONS.find((c) => c.id === ANDROID_CHANNEL_IDS.messages);
  assert.equal(messages?.visibility, 0);
  assert.equal(messages?.importance, 5);
  const payments = ANDROID_CHANNEL_DEFINITIONS.find((c) => c.id === ANDROID_CHANNEL_IDS.payments);
  assert.equal(payments?.visibility, 0);
});
