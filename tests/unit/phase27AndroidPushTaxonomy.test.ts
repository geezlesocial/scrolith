/**
 * Phase 27 — Android push taxonomy, channels, deep links, source labels.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  ANDROID_CHANNEL_DEFINITIONS,
  ANDROID_CHANNEL_IDS,
  buildEnterprisePushDeepLink,
  formatNotificationSourceLabel,
  formatNotificationTitleWithCategory,
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

test('Phase 27 aliases map to enterprise categories and stable channels', () => {
  assert.equal(resolveNotificationCategory({ type: 'chat' }), 'message');
  assert.equal(resolveNotificationCategory({ type: 'group_chat' }), 'message');
  assert.equal(resolveNotificationCategory({ type: 'group_invite' }), 'community');
  assert.equal(resolveNotificationCategory({ type: 'community_request' }), 'community');
  assert.equal(resolveNotificationCategory({ type: 'marketplace_inquiry' }), 'marketplace');
  assert.equal(resolveNotificationCategory({ type: 'payment' }), 'payment');
  assert.equal(resolveNotificationCategory({ type: 'followed_you' }), 'follow');
  assert.equal(resolveNotificationCategory({ type: 'scroll_uploaded' }), 'scroll');

  assert.equal(resolveAndroidChannelId({ type: 'chat' }), ANDROID_CHANNEL_IDS.messages);
  assert.equal(resolveAndroidChannelId({ type: 'group_invite' }), ANDROID_CHANNEL_IDS.community);
  assert.equal(resolveAndroidChannelId({ type: 'marketplace_inquiry' }), ANDROID_CHANNEL_IDS.marketplace);
  assert.equal(resolveAndroidChannelId({ type: 'payment' }), ANDROID_CHANNEL_IDS.payments);
  assert.equal(resolveAndroidChannelId({ type: 'security_login' }), ANDROID_CHANNEL_IDS.security);
});

test('enterprise deep links open exact destinations (no home invent)', () => {
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'message', conversationId: 'c1' }),
    '/messages/c1'
  );
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'followed_you', actorUsername: 'john' }),
    '/profile/john'
  );
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'story', storyId: 's1' }),
    '/community?story=s1'
  );
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'scroll', scrollId: 'v1' }),
    '/scroll?scroll=v1'
  );
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'post', postId: 'p1' }),
    '/post/p1'
  );
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'job_application_status', jobId: 'j1', applicationId: 'a1' }),
    '/jobs/j1?application=a1'
  );
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'marketplace_inquiry', listingId: 'L1' }),
    '/marketplace/listing/L1'
  );
  assert.equal(
    buildEnterprisePushDeepLink({ type: 'group_invite', groupId: 'g1' }),
    '/community/clubs?group=g1'
  );
  assert.equal(buildEnterprisePushDeepLink({ type: 'unknown_xyz' }), null);
});

test('source labels expose category and actor without secrets', () => {
  const src = formatNotificationSourceLabel({
    type: 'message',
    actorName: 'Sarah',
    body: 'Sarah sent you a message.'
  });
  assert.equal(src.category, 'Message');
  assert.equal(src.source, 'Sarah');
  assert.match(src.summary, /Sarah/);

  const titled = formatNotificationTitleWithCategory('New follower', { type: 'followed_you' });
  assert.match(titled, /Follow/i);
});

test('channel definitions include required enterprise set with private messages', () => {
  const ids = new Set(ANDROID_CHANNEL_DEFINITIONS.map((c) => c.id));
  for (const required of [
    ANDROID_CHANNEL_IDS.messages,
    ANDROID_CHANNEL_IDS.community,
    ANDROID_CHANNEL_IDS.marketplace,
    ANDROID_CHANNEL_IDS.jobs,
    ANDROID_CHANNEL_IDS.gigs,
    ANDROID_CHANNEL_IDS.scroll,
    ANDROID_CHANNEL_IDS.stories,
    ANDROID_CHANNEL_IDS.posts,
    ANDROID_CHANNEL_IDS.follows,
    ANDROID_CHANNEL_IDS.mentions,
    ANDROID_CHANNEL_IDS.comments,
    ANDROID_CHANNEL_IDS.orders,
    ANDROID_CHANNEL_IDS.admin,
    ANDROID_CHANNEL_IDS.security,
    ANDROID_CHANNEL_IDS.system
  ]) {
    assert.ok(ids.has(required), required);
  }
  const messages = ANDROID_CHANNEL_DEFINITIONS.find((c) => c.id === ANDROID_CHANNEL_IDS.messages);
  assert.equal(messages?.visibility, 0);
  assert.equal(messages?.importance, 5);
  const security = ANDROID_CHANNEL_DEFINITIONS.find((c) => c.id === ANDROID_CHANNEL_IDS.security);
  assert.equal(security?.importance, 5);
});

test('push.ts uses shared channel definitions', () => {
  assert.match(pushSrc, /ANDROID_CHANNEL_DEFINITIONS/);
  assert.match(pushSrc, /registerTokenWithBackend|TOKEN_KEY/);
  assert.match(pushSrc, /buildEnterprisePushDeepLink/);
});

test('AndroidManifest FCM defaults and POST_NOTIFICATIONS', () => {
  assert.match(manifest, /ic_stat_scrolith/);
  assert.match(manifest, /scrolith_alerts_v2/);
  assert.match(manifest, /POST_NOTIFICATIONS/);
  assert.match(manifest, /scrolith\.com/);
  assert.match(manifest, /enableOnBackInvokedCallback/);
});

test('Phase 29 version and production Capacitor origin', () => {
  assert.match(gradle, /versionCode 38/);
  assert.match(gradle, /versionName "1\.1\.28"/);
  assert.match(gradle, /debugSymbolLevel/);
  assert.match(capacitor, /scrolith\.com/);
  assert.match(capacitor, /androidScheme: 'https'/);
  assert.doesNotMatch(capacitor, /localhost:3000/);
});
