import {
  ANDROID_CHANNEL_IDS,
  formatNotificationTitleWithCategory,
  resolveAndroidChannelId,
  resolveNotificationCategory
} from '../notificationAndroidChannels';

describe('notificationAndroidChannels', () => {
  test('maps message types to messages channel', () => {
    expect(resolveNotificationCategory({ type: 'new_message' })).toBe('message');
    expect(resolveAndroidChannelId({ type: 'message' })).toBe(ANDROID_CHANNEL_IDS.messages);
  });

  test('maps social engagement to granular Phase 25 channels', () => {
    expect(resolveAndroidChannelId({ type: 'mention_post' })).toBe(ANDROID_CHANNEL_IDS.mentions);
    expect(resolveAndroidChannelId({ type: 'reaction_on_comment' })).toBe(ANDROID_CHANNEL_IDS.posts);
    expect(resolveAndroidChannelId({ type: 'comment_on_post' })).toBe(ANDROID_CHANNEL_IDS.comments);
    expect(resolveAndroidChannelId({ type: 'followed_you' })).toBe(ANDROID_CHANNEL_IDS.follows);
    expect(resolveAndroidChannelId({ type: 'story_like' })).toBe(ANDROID_CHANNEL_IDS.stories);
    expect(resolveAndroidChannelId({ type: 'scroll_new' })).toBe(ANDROID_CHANNEL_IDS.scroll);
  });

  test('maps marketplace jobs freelancing security scrolitha admin', () => {
    expect(resolveAndroidChannelId({ type: 'marketplace_order' })).toBe(ANDROID_CHANNEL_IDS.orders);
    expect(resolveAndroidChannelId({ type: 'marketplace_listing_interest' })).toBe(ANDROID_CHANNEL_IDS.marketplace);
    expect(resolveAndroidChannelId({ type: 'job_application_viewed' })).toBe(ANDROID_CHANNEL_IDS.jobs);
    expect(resolveAndroidChannelId({ type: 'proposal_accepted' })).toBe(ANDROID_CHANNEL_IDS.gigs);
    expect(resolveAndroidChannelId({ type: 'security_alert' })).toBe(ANDROID_CHANNEL_IDS.security);
    expect(resolveAndroidChannelId({ type: 'scrolitha_done' })).toBe(ANDROID_CHANNEL_IDS.scrolitha);
    expect(resolveAndroidChannelId({ type: 'moderation_report' })).toBe(ANDROID_CHANNEL_IDS.admin);
  });

  test('formats title with category label without double prefix', () => {
    const once = formatNotificationTitleWithCategory('Hello', { type: 'message' });
    expect(once).toBe('Message · Hello');
    expect(formatNotificationTitleWithCategory(once, { type: 'message' })).toBe(once);
  });
});
