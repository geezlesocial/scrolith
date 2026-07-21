/**
 * Phase 25 — Enterprise Android push taxonomy + deep-link safety net.
 */
import { describe, expect, it } from 'vitest';
import {
  ANDROID_CHANNEL_IDS,
  buildEnterprisePushDeepLink,
  formatNotificationTitleWithCategory,
  resolveAndroidChannelId,
  resolveNotificationCategory
} from '../notificationTaxonomy';

describe('Phase 25 notification taxonomy', () => {
  it('exposes the enterprise channel set', () => {
    // Phase 29 — active delivery channels are *_v2 (Scrolith sound migration).
    expect(ANDROID_CHANNEL_IDS.messages).toBe('scrolith_messages_v2');
    expect(ANDROID_CHANNEL_IDS.community).toBe('scrolith_community_v2');
    expect(ANDROID_CHANNEL_IDS.marketplace).toBe('scrolith_marketplace_v2');
    expect(ANDROID_CHANNEL_IDS.jobs).toBe('scrolith_jobs_v2');
    expect(ANDROID_CHANNEL_IDS.gigs).toBe('scrolith_gigs_v2');
    expect(ANDROID_CHANNEL_IDS.scroll).toBe('scrolith_scroll_v2');
    expect(ANDROID_CHANNEL_IDS.stories).toBe('scrolith_stories_v2');
    expect(ANDROID_CHANNEL_IDS.posts).toBe('scrolith_posts_v2');
    expect(ANDROID_CHANNEL_IDS.follows).toBe('scrolith_follows_v2');
    expect(ANDROID_CHANNEL_IDS.mentions).toBe('scrolith_mentions_v2');
    expect(ANDROID_CHANNEL_IDS.comments).toBe('scrolith_comments_v2');
    expect(ANDROID_CHANNEL_IDS.orders).toBe('scrolith_orders_v2');
    expect(ANDROID_CHANNEL_IDS.wallet).toBe('scrolith_wallet_v2');
    expect(ANDROID_CHANNEL_IDS.payments).toBe('scrolith_payments_v2');
    expect(ANDROID_CHANNEL_IDS.admin).toBe('scrolith_admin_v2');
    expect(ANDROID_CHANNEL_IDS.security).toBe('scrolith_security_v2');
    expect(ANDROID_CHANNEL_IDS.system).toBe('scrolith_system_v2');
  });

  it('routes categories to distinct channels', () => {
    expect(resolveAndroidChannelId({ type: 'new_message' })).toBe(ANDROID_CHANNEL_IDS.messages);
    expect(resolveAndroidChannelId({ type: 'followed_you' })).toBe(ANDROID_CHANNEL_IDS.follows);
    expect(resolveAndroidChannelId({ type: 'story_new' })).toBe(ANDROID_CHANNEL_IDS.stories);
    expect(resolveAndroidChannelId({ type: 'scroll_uploaded' })).toBe(ANDROID_CHANNEL_IDS.scroll);
    expect(resolveAndroidChannelId({ type: 'community_group_request_approved' })).toBe(
      ANDROID_CHANNEL_IDS.community
    );
    expect(resolveAndroidChannelId({ type: 'marketplace_listing_inquiry' })).toBe(
      ANDROID_CHANNEL_IDS.marketplace
    );
    expect(resolveAndroidChannelId({ type: 'order_received' })).toBe(ANDROID_CHANNEL_IDS.orders);
    expect(resolveAndroidChannelId({ type: 'job_application_status' })).toBe(ANDROID_CHANNEL_IDS.jobs);
    expect(resolveAndroidChannelId({ type: 'gig_order_new' })).toBe(ANDROID_CHANNEL_IDS.gigs);
    expect(resolveAndroidChannelId({ type: 'mention_post' })).toBe(ANDROID_CHANNEL_IDS.mentions);
    expect(resolveAndroidChannelId({ type: 'comment_on_post' })).toBe(ANDROID_CHANNEL_IDS.comments);
    expect(resolveAndroidChannelId({ type: 'moderation_queue' })).toBe(ANDROID_CHANNEL_IDS.admin);
    expect(resolveAndroidChannelId({ type: 'security_login' })).toBe(ANDROID_CHANNEL_IDS.security);
  });

  it('builds enterprise deep links for core notification types', () => {
    expect(
      buildEnterprisePushDeepLink({
        type: 'followed_you',
        actorUsername: 'john-doe'
      })
    ).toBe('/profile/john-doe');

    expect(
      buildEnterprisePushDeepLink({
        type: 'new_message',
        conversationId: 'c1'
      })
    ).toBe('/messages/c1');

    expect(
      buildEnterprisePushDeepLink({
        type: 'story_new',
        storyId: 's1'
      })
    ).toBe('/community?story=s1');

    expect(
      buildEnterprisePushDeepLink({
        type: 'scroll_uploaded',
        scrollId: 'v1'
      })
    ).toBe('/scroll?scroll=v1');

    expect(
      buildEnterprisePushDeepLink({
        type: 'community_group_request_approved',
        groupId: 'g1'
      })
    ).toBe('/community/clubs?group=g1');

    expect(
      buildEnterprisePushDeepLink({
        type: 'marketplace_listing_inquiry',
        listingId: 'l1'
      })
    ).toBe('/marketplace/listing/l1');

    expect(
      buildEnterprisePushDeepLink({
        type: 'job_application_status',
        jobId: 'j1',
        applicationId: 'a1'
      })
    ).toContain('/jobs/');

    expect(
      buildEnterprisePushDeepLink({
        type: 'gig_order_new',
        orderId: 'o1'
      })
    ).toBe('/gigs/o1');

    expect(
      buildEnterprisePushDeepLink({
        type: 'comment_on_post',
        postId: 'p1',
        commentId: 'cm1'
      })
    ).toBe('/post/p1?comment=cm1');

    expect(
      buildEnterprisePushDeepLink({
        type: 'live_started',
        liveId: 'live1'
      })
    ).toBe('/live/live1');

    expect(
      buildEnterprisePushDeepLink({
        type: 'moderation_report'
      })
    ).toBe('/admin/moderation');
  });

  it('never returns home as a fallback without a target', () => {
    expect(buildEnterprisePushDeepLink({ type: 'unknown_type_xyz' })).toBeNull();
    expect(buildEnterprisePushDeepLink({})).toBeNull();
  });

  it('prefixes titles with category once', () => {
    const title = formatNotificationTitleWithCategory('John Doe started following you.', {
      type: 'followed_you'
    });
    expect(title).toBe('Follow · John Doe started following you.');
    expect(formatNotificationTitleWithCategory(title, { type: 'followed_you' })).toBe(title);
  });

  it('classifies follow separately from generic social', () => {
    expect(resolveNotificationCategory({ type: 'followed_you' })).toBe('follow');
    expect(resolveNotificationCategory({ type: 'followed_new_post' })).toBe('post');
  });
});
