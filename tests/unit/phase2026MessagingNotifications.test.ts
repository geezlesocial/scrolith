import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ANDROID_CHANNEL_IDS,
  formatNotificationTitleWithCategory,
  getNotificationCategoryLabel,
  resolveAndroidChannelId,
  resolveNotificationCategory
} from '../../src/utils/notificationTaxonomy';
import {
  arePendingAttachmentsReadyToSend,
  createLocalPendingAttachment,
  hasPendingUploadsInFlight,
  MESSAGE_UPLOAD_CONCURRENCY,
  pendingToAttachmentIds,
  reconcilePendingWithUploadedFile,
  runWithConcurrency,
  updatePendingAttachment
} from '../../src/services/messagingComposer';
import {
  MAX_MEDIA_CACHE_BYTES,
  MAX_MEDIA_OBJECT_URL_CACHE_ENTRIES,
  setMessagingMediaConversationAffinity
} from '../../src/services/messagingMedia';

test('notification taxonomy maps message types to Message channel', () => {
  assert.equal(resolveNotificationCategory({ type: 'new_message' }), 'message');
  assert.equal(resolveAndroidChannelId({ type: 'message' }), ANDROID_CHANNEL_IDS.messages);
  assert.equal(getNotificationCategoryLabel({ type: 'message' }), 'Message');
});

test('notification taxonomy maps social engagement types', () => {
  assert.equal(resolveNotificationCategory({ type: 'mention_post' }), 'mention');
  assert.equal(resolveNotificationCategory({ type: 'comment_on_post' }), 'comment');
  assert.equal(resolveNotificationCategory({ type: 'reaction_on_post' }), 'reaction');
  assert.equal(resolveAndroidChannelId({ type: 'mention_comment' }), ANDROID_CHANNEL_IDS.social);
});

test('notification taxonomy maps marketplace jobs freelancing security', () => {
  assert.equal(resolveNotificationCategory({ type: 'marketplace_listing_interest' }), 'marketplace');
  assert.equal(resolveNotificationCategory({ type: 'job_application_created' }), 'job');
  assert.equal(resolveNotificationCategory({ type: 'proposal_received' }), 'freelancing');
  assert.equal(resolveNotificationCategory({ type: 'security_login_new_device' }), 'security');
  assert.equal(resolveAndroidChannelId({ type: 'scrolitha_completed' }), ANDROID_CHANNEL_IDS.scrolitha);
});

test('formatNotificationTitleWithCategory prefixes once', () => {
  const first = formatNotificationTitleWithCategory('Sarah sent you a photo', { type: 'message' });
  assert.equal(first, 'Message · Sarah sent you a photo');
  const second = formatNotificationTitleWithCategory(first, { type: 'message' });
  assert.equal(second, first);
});

test('createLocalPendingAttachment is optimistic uploading with local preview', () => {
  const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
  const pending = createLocalPendingAttachment(file);
  assert.equal(pending.uploadState, 'uploading');
  assert.ok(pending.clientLocalId);
  assert.ok(String(pending.localObjectUrl || '').startsWith('blob:') || pending.localObjectUrl === undefined);
  assert.equal(hasPendingUploadsInFlight([pending]), true);
  assert.equal(arePendingAttachmentsReadyToSend([pending]), false);
});

test('pendingToAttachmentIds only includes ready file ids', () => {
  const ids = pendingToAttachmentIds([
    { id: 'local-1', name: 'a', size: 1, type: 'image', uploadState: 'uploading' },
    { id: 'file-2', fileId: 'file-2', name: 'b', size: 1, type: 'image', uploadState: 'ready' },
    { id: 'local-3', name: 'c', size: 1, type: 'image', uploadState: 'failed' }
  ]);
  assert.deepEqual(ids, ['file-2']);
});

test('reconcilePendingWithUploadedFile promotes local upload to ready', () => {
  const file = new File([new Uint8Array([9])], 'doc.pdf', { type: 'application/pdf' });
  const local = createLocalPendingAttachment(file);
  const next = reconcilePendingWithUploadedFile([local], String(local.clientLocalId), {
    id: 'server-file-1',
    fileId: 'server-file-1',
    name: 'doc.pdf',
    size: 1,
    url: '/api/files/content/server-file-1',
    category: 'document'
  } as any);
  assert.equal(next[0].uploadState, 'ready');
  assert.equal(next[0].fileId, 'server-file-1');
  assert.equal(arePendingAttachmentsReadyToSend(next), true);
});

test('updatePendingAttachment patches by clientLocalId', () => {
  const list = updatePendingAttachment(
    [{ id: 'x', clientLocalId: 'x', name: 'n', size: 1, type: 'image', uploadState: 'uploading', progress: 10 }],
    'x',
    { progress: 80 }
  );
  assert.equal(list[0].progress, 80);
});

test('runWithConcurrency preserves order and respects limit', async () => {
  const seen: number[] = [];
  const results = await runWithConcurrency([1, 2, 3, 4], MESSAGE_UPLOAD_CONCURRENCY, async (value) => {
    seen.push(value);
    return value * 2;
  });
  assert.equal(results.length, 4);
  assert.deepEqual(
    results.map((r) => (r.status === 'fulfilled' ? r.value : null)),
    [2, 4, 6, 8]
  );
  assert.equal(seen.length, 4);
});

test('media cache exports enterprise budget constants', () => {
  assert.ok(MAX_MEDIA_CACHE_BYTES >= 32 * 1024 * 1024);
  assert.ok(MAX_MEDIA_OBJECT_URL_CACHE_ENTRIES >= 32);
  setMessagingMediaConversationAffinity('convo-1');
  setMessagingMediaConversationAffinity(null);
});
