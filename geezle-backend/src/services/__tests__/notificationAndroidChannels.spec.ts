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

  test('maps social types to social channel', () => {
    expect(resolveAndroidChannelId({ type: 'mention_post' })).toBe(ANDROID_CHANNEL_IDS.social);
    expect(resolveAndroidChannelId({ type: 'reaction_on_comment' })).toBe(ANDROID_CHANNEL_IDS.social);
  });

  test('maps marketplace jobs freelancing security scrolitha', () => {
    expect(resolveAndroidChannelId({ type: 'marketplace_order' })).toBe(ANDROID_CHANNEL_IDS.marketplace);
    expect(resolveAndroidChannelId({ type: 'job_application_viewed' })).toBe(ANDROID_CHANNEL_IDS.jobs);
    expect(resolveAndroidChannelId({ type: 'proposal_accepted' })).toBe(ANDROID_CHANNEL_IDS.freelancing);
    expect(resolveAndroidChannelId({ type: 'security_alert' })).toBe(ANDROID_CHANNEL_IDS.security);
    expect(resolveAndroidChannelId({ type: 'scrolitha_done' })).toBe(ANDROID_CHANNEL_IDS.scrolitha);
  });

  test('formats title with category label without double prefix', () => {
    const once = formatNotificationTitleWithCategory('Hello', { type: 'message' });
    expect(once).toBe('Message · Hello');
    expect(formatNotificationTitleWithCategory(once, { type: 'message' })).toBe(once);
  });
});
