/**
 * Phase 25/27/29 — Enterprise notification taxonomy for labels, Android channels,
 * and deep-link routing. Pure helpers — no network side effects.
 *
 * Channel ids must match:
 * - geezle/src/mobile/push.ts (client createChannel)
 * - geezle-backend/src/services/notificationAndroidChannels.ts (FCM channelId)
 * - AndroidManifest default_notification_channel_id (migration fallback)
 *
 * Phase 29 — sound migration (Android channel sound is immutable after create):
 * Enterprise channels move v1 → v2 with Scrolith notification sound resource "scrolith"
 * (res/raw/scrolith.wav). Pronunciation guidance: "Scroll it".
 * Legacy v1 channels remain creatable for old payloads; new FCM routes to v2.
 */

export type NotificationCategoryKey =
  | 'message'
  | 'story'
  | 'scroll'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'reaction'
  | 'follow'
  | 'post'
  | 'community'
  | 'marketplace'
  | 'order'
  | 'job'
  | 'gig'
  | 'freelancing'
  | 'event'
  | 'live'
  | 'series'
  | 'playlist'
  | 'scrolitha'
  | 'admin'
  | 'security'
  | 'system'
  | 'social'
  | 'wallet'
  | 'payment';

/**
 * Android notification channel ids (must match FCM android.notification.channelId).
 * Phase 29: active delivery uses *_v2 for Scrolith sound migration.
 */
export const ANDROID_CHANNEL_IDS = {
  messages: 'scrolith_messages_v2',
  community: 'scrolith_community_v2',
  marketplace: 'scrolith_marketplace_v2',
  jobs: 'scrolith_jobs_v2',
  gigs: 'scrolith_gigs_v2',
  scroll: 'scrolith_scroll_v2',
  stories: 'scrolith_stories_v2',
  posts: 'scrolith_posts_v2',
  follows: 'scrolith_follows_v2',
  mentions: 'scrolith_mentions_v2',
  comments: 'scrolith_comments_v2',
  orders: 'scrolith_orders_v2',
  wallet: 'scrolith_wallet_v2',
  payments: 'scrolith_payments_v2',
  admin: 'scrolith_admin_v2',
  security: 'scrolith_security_v2',
  system: 'scrolith_system_v2',
  /** AI assistant */
  scrolitha: 'scrolith_scrolitha_v2',
  /** Legacy umbrella social — still created for prior installs */
  social: 'scrolith_social_v2',
  /** Freelancing alias retained (maps to gigs channel for delivery) */
  freelancing: 'scrolith_gigs_v2',
  /** Default FCM / high-priority alerts (already v2 since Phase 25) */
  alerts: 'scrolith_alerts_v2'
} as const;

/** Phase 29 — legacy channel ids retained on device for old FCM payloads. */
export const ANDROID_LEGACY_CHANNEL_IDS = {
  messages: 'scrolith_messages_v1',
  community: 'scrolith_community_v1',
  marketplace: 'scrolith_marketplace_v1',
  jobs: 'scrolith_jobs_v1',
  gigs: 'scrolith_gigs_v1',
  scroll: 'scrolith_scroll_v1',
  stories: 'scrolith_stories_v1',
  posts: 'scrolith_posts_v1',
  follows: 'scrolith_follows_v1',
  mentions: 'scrolith_mentions_v1',
  comments: 'scrolith_comments_v1',
  orders: 'scrolith_orders_v1',
  admin: 'scrolith_admin_v1',
  security: 'scrolith_security_v1',
  system: 'scrolith_system_v1',
  scrolitha: 'scrolith_scrolitha_v1',
  social: 'scrolith_social_v1',
  freelancing: 'scrolith_gigs_v1'
} as const;

/**
 * Scrolith notification sound — Android raw resource name WITHOUT extension.
 * File: android/app/src/main/res/raw/scrolith.wav
 * Pronunciation (spoken brand cue only): "Scroll it"
 * Do not rename the app package or product brand to "Scroll it".
 */
export const SCROLITH_NOTIFICATION_SOUND = 'scrolith';
export const SCROLITH_NOTIFICATION_SOUND_PRONUNCIATION = 'Scroll it';
export const SCROLITH_NOTIFICATION_SMALL_ICON = 'ic_stat_scrolith';

export type AndroidChannelId = (typeof ANDROID_CHANNEL_IDS)[keyof typeof ANDROID_CHANNEL_IDS];

/** Sound urgency policy for channel design (Android still respects user mute). */
export type NotificationSoundPolicy = 'high' | 'standard' | 'silent';

export type NotificationCategoryMeta = {
  key: NotificationCategoryKey;
  /** Short badge label for in-app lists */
  label: string;
  /** Android channel id */
  channelId: AndroidChannelId;
  /** Localization key (i18n-ready) */
  i18nKey: string;
  soundPolicy: NotificationSoundPolicy;
};

const CATEGORY_META: Record<NotificationCategoryKey, NotificationCategoryMeta> = {
  message: {
    key: 'message',
    label: 'Message',
    channelId: ANDROID_CHANNEL_IDS.messages,
    i18nKey: 'notification.category.message',
    soundPolicy: 'high'
  },
  story: {
    key: 'story',
    label: 'Story',
    channelId: ANDROID_CHANNEL_IDS.stories,
    i18nKey: 'notification.category.story',
    soundPolicy: 'standard'
  },
  scroll: {
    key: 'scroll',
    label: 'Scroll',
    channelId: ANDROID_CHANNEL_IDS.scroll,
    i18nKey: 'notification.category.scroll',
    soundPolicy: 'standard'
  },
  comment: {
    key: 'comment',
    label: 'Comment',
    channelId: ANDROID_CHANNEL_IDS.comments,
    i18nKey: 'notification.category.comment',
    soundPolicy: 'standard'
  },
  reply: {
    key: 'reply',
    label: 'Reply',
    channelId: ANDROID_CHANNEL_IDS.comments,
    i18nKey: 'notification.category.reply',
    soundPolicy: 'standard'
  },
  mention: {
    key: 'mention',
    label: 'Mention',
    channelId: ANDROID_CHANNEL_IDS.mentions,
    i18nKey: 'notification.category.mention',
    soundPolicy: 'standard'
  },
  reaction: {
    key: 'reaction',
    label: 'Reaction',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.reaction',
    soundPolicy: 'standard'
  },
  follow: {
    key: 'follow',
    label: 'Follow',
    channelId: ANDROID_CHANNEL_IDS.follows,
    i18nKey: 'notification.category.follow',
    soundPolicy: 'standard'
  },
  post: {
    key: 'post',
    label: 'Post',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.post',
    soundPolicy: 'standard'
  },
  community: {
    key: 'community',
    label: 'Community',
    channelId: ANDROID_CHANNEL_IDS.community,
    i18nKey: 'notification.category.community',
    soundPolicy: 'standard'
  },
  marketplace: {
    key: 'marketplace',
    label: 'Marketplace',
    channelId: ANDROID_CHANNEL_IDS.marketplace,
    i18nKey: 'notification.category.marketplace',
    soundPolicy: 'standard'
  },
  order: {
    key: 'order',
    label: 'Order',
    channelId: ANDROID_CHANNEL_IDS.orders,
    i18nKey: 'notification.category.order',
    soundPolicy: 'high'
  },
  job: {
    key: 'job',
    label: 'Job',
    channelId: ANDROID_CHANNEL_IDS.jobs,
    i18nKey: 'notification.category.job',
    soundPolicy: 'high'
  },
  gig: {
    key: 'gig',
    label: 'Gig',
    channelId: ANDROID_CHANNEL_IDS.gigs,
    i18nKey: 'notification.category.gig',
    soundPolicy: 'high'
  },
  freelancing: {
    key: 'freelancing',
    label: 'Gig',
    channelId: ANDROID_CHANNEL_IDS.gigs,
    i18nKey: 'notification.category.gig',
    soundPolicy: 'high'
  },
  event: {
    key: 'event',
    label: 'Event',
    channelId: ANDROID_CHANNEL_IDS.community,
    i18nKey: 'notification.category.event',
    soundPolicy: 'standard'
  },
  live: {
    key: 'live',
    label: 'Live',
    channelId: ANDROID_CHANNEL_IDS.scroll,
    i18nKey: 'notification.category.live',
    soundPolicy: 'standard'
  },
  series: {
    key: 'series',
    label: 'Series',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.series',
    soundPolicy: 'standard'
  },
  playlist: {
    key: 'playlist',
    label: 'Playlist',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.playlist',
    soundPolicy: 'standard'
  },
  scrolitha: {
    key: 'scrolitha',
    label: 'Scrolitha',
    channelId: ANDROID_CHANNEL_IDS.scrolitha,
    i18nKey: 'notification.category.scrolitha',
    soundPolicy: 'standard'
  },
  admin: {
    key: 'admin',
    label: 'Admin',
    channelId: ANDROID_CHANNEL_IDS.admin,
    i18nKey: 'notification.category.admin',
    soundPolicy: 'high'
  },
  security: {
    key: 'security',
    label: 'Security',
    channelId: ANDROID_CHANNEL_IDS.security,
    i18nKey: 'notification.category.security',
    soundPolicy: 'high'
  },
  system: {
    key: 'system',
    label: 'System',
    channelId: ANDROID_CHANNEL_IDS.system,
    i18nKey: 'notification.category.system',
    soundPolicy: 'standard'
  },
  social: {
    key: 'social',
    label: 'Social',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.social',
    soundPolicy: 'standard'
  },
  wallet: {
    key: 'wallet',
    label: 'Wallet',
    channelId: ANDROID_CHANNEL_IDS.wallet,
    i18nKey: 'notification.category.wallet',
    soundPolicy: 'high'
  },
  payment: {
    key: 'payment',
    label: 'Payment',
    channelId: ANDROID_CHANNEL_IDS.payments,
    i18nKey: 'notification.category.payment',
    soundPolicy: 'high'
  }
};

const coerce = (value: unknown) => String(value ?? '').trim().toLowerCase();

/**
 * Map raw notification type / entity fields to an enterprise category.
 */
export const resolveNotificationCategory = (input: {
  type?: unknown;
  notificationType?: unknown;
  category?: unknown;
  entityType?: unknown;
  title?: unknown;
  metadata?: Record<string, unknown> | null;
}): NotificationCategoryKey => {
  const type = coerce(input.type || input.notificationType || input.metadata?.type);
  const entity = coerce(input.entityType || input.metadata?.entityType || input.metadata?.entity_type);
  const haystack = `${type} ${entity} ${coerce(input.title)}`;

  // Security events must win over a stale or generic persisted category.
  if (
    type.includes('security') ||
    type.includes('login') ||
    type.includes('device') ||
    entity.includes('login_approval') ||
    haystack.includes('new sign-in request')
  ) {
    return 'security';
  }

  const explicit = coerce(input.category || input.metadata?.category || input.metadata?.notificationCategory);
  if (explicit && explicit in CATEGORY_META) {
    return explicit as NotificationCategoryKey;
  }

  // Phase 27 — explicit product aliases before substring matching.
  if (type === 'chat' || type === 'group_chat' || type === 'dm' || type === 'direct_message') {
    return 'message';
  }
  if (
    type === 'group_invite' ||
    type === 'community_request' ||
    type === 'group_invitation' ||
    type.includes('group_invite')
  ) {
    return 'community';
  }
  if (
    type === 'marketplace_inquiry' ||
    type.includes('listing_inquiry') ||
    type.includes('marketplace_inquiry')
  ) {
    return 'marketplace';
  }
  // Phase 29 — wallet / payment before generic order
  if (type.includes('wallet') || type.includes('balance') || type === 'payout' || type.includes('payout_')) {
    return 'wallet';
  }
  if (
    type === 'payment' ||
    type.includes('payment_') ||
    type.includes('refund') ||
    type.includes('receipt')
  ) {
    return 'payment';
  }
  if (
    type === 'message' ||
    type === 'new_message' ||
    type.includes('message') ||
    type.includes('chat') ||
    type.includes('dm')
  ) {
    return 'message';
  }
  // Jobs / applications before story "status" substring match.
  if (type.includes('job') || type.includes('application') || type.includes('recruiter')) {
    return 'job';
  }
  if (type.includes('story') || type === 'status' || type.startsWith('status_') || type.endsWith('_status_update')) {
    // Avoid treating job_application_status as a story.
    if (!type.includes('application') && !type.includes('job')) return 'story';
  }
  if (type.includes('scroll') || type.includes('short_video') || type.includes('reel')) return 'scroll';
  if (type.includes('live') || type.includes('livestream') || type.includes('broadcast_live')) return 'live';
  if (type.includes('event') || type.includes('meetup')) return 'event';
  if (type.includes('reply') || type.includes('replied')) return 'reply';
  if (type.includes('mention')) return 'mention';
  if (
    type.includes('reaction') ||
    type.includes('like') ||
    type.includes('emoji') ||
    type === 'repost'
  ) {
    return 'reaction';
  }
  if (type.includes('comment')) return 'comment';
  // Publication-from-follow before generic follow (followed_new_post includes "follow").
  if (
    type.includes('followed_new') ||
    type === 'followed_new_post' ||
    type.includes('new_post') ||
    type.includes('publication')
  ) {
    return 'post';
  }
  if (
    type === 'followed_you' ||
    type === 'new_follower' ||
    type.includes('friend_request') ||
    (type.includes('follow') && !type.includes('followed_new'))
  ) {
    return 'follow';
  }
  if (
    type.includes('community') ||
    type.includes('group') ||
    type.includes('club') ||
    type.includes('channel')
  ) {
    return 'community';
  }
  if (
    type.includes('gig') ||
    type.includes('freelance') ||
    type.includes('proposal') ||
    type.includes('contract') ||
    type.includes('brief')
  ) {
    return 'gig';
  }
  if (type.includes('order') || entity === 'order') return 'order';
  if (
    type.includes('marketplace') ||
    type.includes('listing') ||
    type.includes('commerce')
  ) {
    return 'marketplace';
  }
  if (type.includes('series') || type.includes('episode')) return 'series';
  if (type.includes('playlist')) return 'playlist';
  if (type.includes('scrolitha') || type.includes('ai_assist') || haystack.includes('scrolitha')) {
    return 'scrolitha';
  }
  if (
    type.includes('security') ||
    type.includes('password') ||
    type.includes('login') ||
    type.includes('2fa') ||
    type.includes('mfa') ||
    type.includes('device')
  ) {
    return 'security';
  }
  if (
    type.includes('admin') ||
    type.includes('moderation') ||
    type.includes('moderator') ||
    type.includes('report_')
  ) {
    return 'admin';
  }
  if (type.includes('post') || type.includes('publication')) {
    return 'post';
  }
  // App campaigns → system category; FCM uses high-priority alerts channel via resolveCampaignChannel
  if (type === 'app_campaign' || type === 'campaign' || (type.includes('campaign') && !type.includes('ad'))) {
    return 'system';
  }
  if (type.includes('social')) {
    return 'social';
  }
  if (type.includes('system') || type.includes('account')) {
    return 'system';
  }

  return 'system';
};

export const getNotificationCategoryMeta = (
  input: Parameters<typeof resolveNotificationCategory>[0]
): NotificationCategoryMeta => {
  const key = resolveNotificationCategory(input);
  return CATEGORY_META[key];
};

export const getNotificationCategoryLabel = (
  input: Parameters<typeof resolveNotificationCategory>[0]
): string => getNotificationCategoryMeta(input).label;

export const resolveAndroidChannelId = (
  input: Parameters<typeof resolveNotificationCategory>[0]
): AndroidChannelId => {
  const category = resolveNotificationCategory(input);
  // High-priority app campaigns use the alerts channel (custom Scrolith sound, MAX importance).
  const type = coerce(input.type || input.notificationType || input.metadata?.type);
  if (
    type === 'app_campaign' ||
    type === 'campaign' ||
    (type.includes('campaign') && !type.includes('ad') && category === 'system')
  ) {
    return ANDROID_CHANNEL_IDS.alerts;
  }
  return getNotificationCategoryMeta(input).channelId;
};

/**
 * Prefix push/in-app titles with the category when not already present.
 * Example: "Message · Sarah sent you a photo"
 */
export const formatNotificationTitleWithCategory = (
  title: string,
  input: Parameters<typeof resolveNotificationCategory>[0]
): string => {
  const raw = String(title || '').trim() || 'Notification';
  const label = getNotificationCategoryLabel(input);
  const lower = raw.toLowerCase();
  if (lower.startsWith(`${label.toLowerCase()} ·`) || lower.startsWith(`${label.toLowerCase()}:`)) {
    return raw;
  }
  // Also avoid double-prefix when backend already used a related label (e.g. Gig vs Freelancing).
  if (lower.includes(' · ')) {
    const existing = lower.split(' · ')[0];
    if (existing === label.toLowerCase() || existing === 'freelancing' || existing === 'social') {
      return raw;
    }
  }
  return `${label} · ${raw}`;
};

export const listNotificationCategoryMeta = (): NotificationCategoryMeta[] =>
  Object.values(CATEGORY_META);

/**
 * Phase 25 — Canonical deep-link builder from push/data payload fields.
 * Prefer explicit deepLink when present; this is the client-side safety net.
 *
 * Destinations align with production React routes (with alias rewrites applied
 * in notificationRouting / push normalize).
 */
export const buildEnterprisePushDeepLink = (data: Record<string, unknown> | null | undefined): string | null => {
  if (!data || typeof data !== 'object') return null;
  const type = coerce(data.type || data.notificationType || data.category);
  const conversationId = String(data.conversationId || data.conversation_id || '').trim();
  const postId = String(data.postId || data.post_id || '').trim();
  const entityId = String(data.entityId || data.entity_id || '').trim();
  const storyId = String(data.storyId || data.story_id || '').trim();
  const scrollId = String(data.scrollId || data.scroll_id || data.scrollVideoId || data.videoId || '').trim();
  const listingId = String(data.listingId || data.listing_id || data.listingSlug || '').trim();
  const jobId = String(data.jobId || data.job_id || '').trim();
  const applicationId = String(data.applicationId || data.application_id || '').trim();
  const communityId = String(
    data.communityId || data.community_id || data.groupId || data.group_id || data.groupSlug || ''
  ).trim();
  const orderId = String(data.orderId || data.order_id || '').trim();
  const gigId = String(data.gigId || data.gig_id || '').trim();
  const eventId = String(data.eventId || data.event_id || '').trim();
  const liveId = String(data.liveId || data.live_id || data.sessionId || data.session_id || '').trim();
  const actorUsername = String(data.actorUsername || data.username || data.actorSlug || '').trim();
  const actorId = String(data.actorId || data.actor_id || data.userId || data.user_id || '').trim();
  const campaignId = String(data.campaignId || data.campaign_id || '').trim();
  const commentId = String(data.commentId || data.comment_id || '').trim();

  if ((type === 'message' || type === 'new_message' || type.includes('message')) && conversationId) {
    return `/messages/${encodeURIComponent(conversationId)}`;
  }
  if (type.includes('follow') && (actorUsername || actorId)) {
    if (actorUsername) return `/profile/${encodeURIComponent(actorUsername)}`;
    return `/profile/${encodeURIComponent(actorId)}`;
  }
  if ((type.includes('story') || type.includes('status')) && (storyId || entityId)) {
    return `/community?story=${encodeURIComponent(storyId || entityId)}`;
  }
  if ((type.includes('scroll') || type.includes('short_video') || type.includes('reel')) && (scrollId || entityId)) {
    return `/scroll?scroll=${encodeURIComponent(scrollId || entityId)}`;
  }
  if ((type.includes('live') || type.includes('livestream')) && (liveId || entityId)) {
    return `/live/${encodeURIComponent(liveId || entityId)}`;
  }
  if (type.includes('event') && (eventId || entityId)) {
    return `/community/events?event=${encodeURIComponent(eventId || entityId)}`;
  }
  // Phase 32.6 — support/security before generic reply/post heuristics
  // (e.g. support.ticket_reply must not route as a post comment)
  if (type.includes('support') || type.includes('ticket')) {
    return entityId ? `/support?ticket=${encodeURIComponent(entityId)}` : '/support';
  }
  if (type.includes('security')) {
    return '/settings/notifications?tab=privacy';
  }
  if (
    (type.includes('comment') || type.includes('mention') || type.includes('reaction') || type.includes('reply') || type.includes('post')) &&
    (postId || entityId)
  ) {
    const id = postId || entityId;
    const params = new URLSearchParams();
    if (commentId) params.set('comment', commentId);
    if (type.includes('mention')) params.set('mention', '1');
    const qs = params.toString();
    return `/post/${encodeURIComponent(id)}${qs ? `?${qs}` : ''}`;
  }
  if ((type.includes('community') || type.includes('group') || type.includes('club')) && communityId) {
    return `/community/clubs?group=${encodeURIComponent(communityId)}`;
  }
  if ((type.includes('marketplace') || type.includes('listing')) && listingId) {
    return `/marketplace/listing/${encodeURIComponent(listingId)}`;
  }
  if ((type.includes('wallet') || type.includes('payout')) && !type.includes('payment')) {
    return '/wallet';
  }
  if (type.includes('payment') || type.includes('refund')) {
    return orderId ? `/wallet?receipt=${encodeURIComponent(orderId)}` : '/wallet';
  }
  if (type.includes('order') && orderId) {
    return `/gigs/${encodeURIComponent(orderId)}`;
  }
  if ((type.includes('job') || type.includes('application')) && (applicationId || jobId || entityId)) {
    if (applicationId) return `/jobs/${encodeURIComponent(jobId || applicationId)}?application=${encodeURIComponent(applicationId)}`;
    return `/jobs/${encodeURIComponent(jobId || entityId)}`;
  }
  if ((type.includes('gig') || type.includes('freelance') || type.includes('proposal')) && (orderId || gigId || entityId)) {
    if (orderId) return `/gigs/${encodeURIComponent(orderId)}`;
    return `/gigs/${encodeURIComponent(gigId || entityId)}`;
  }
  if (type.includes('admin') || type.includes('moderation')) {
    return '/admin/moderation';
  }
  if (type.includes('scrolitha')) {
    return '/scrolitha';
  }
  if (type === 'app_campaign' || type === 'campaign') {
    return campaignId ? `/m/notifications?campaignId=${encodeURIComponent(campaignId)}` : '/m/notifications';
  }
  // Phase 32.3 — expanded destinations (security/support already handled above)
  if (type.includes('digest')) {
    const digestId = String(data.digestId || data.digest_id || entityId || '').trim();
    return digestId ? `/notifications?digest=${encodeURIComponent(digestId)}` : '/notifications';
  }
  if (type.includes('group_message') || type.includes('messaging_group') || type.includes('group_mention')) {
    if (conversationId) return `/messages/${encodeURIComponent(conversationId)}`;
    if (communityId) return `/messages?group=${encodeURIComponent(communityId)}`;
    return '/messages';
  }
  if (type.includes('wallet') || type.includes('transaction')) {
    const txId = String(data.transactionId || data.transaction_id || entityId || '').trim();
    return txId ? `/wallet?tx=${encodeURIComponent(txId)}` : '/wallet';
  }
  if (type.includes('preference') || type.includes('quiet') || type.includes('focus')) {
    return '/settings/notifications';
  }
  if (type.includes('profile')) {
    if (actorUsername) return `/profile/${encodeURIComponent(actorUsername)}`;
    if (actorId) return `/profile/${encodeURIComponent(actorId)}`;
    return '/profile/edit';
  }
  return null;
};

/**
 * Phase 27 — Human-readable source label for notification chrome.
 * Returns category area + optional actor so the user knows who/what caused it.
 */
export const formatNotificationSourceLabel = (input: {
  type?: unknown;
  category?: unknown;
  actorName?: unknown;
  actorUsername?: unknown;
  title?: unknown;
  body?: unknown;
}): { category: string; source: string; summary: string } => {
  const meta = getNotificationCategoryMeta(input);
  const actor =
    String(input.actorName || input.actorUsername || '')
      .trim()
      .replace(/\s+/g, ' ')
      .slice(0, 80) || '';
  const source = actor || meta.label;
  const body = String(input.body || input.title || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 160);
  const summary = body || (actor ? `${actor} · ${meta.label}` : meta.label);
  return { category: meta.label, source, summary };
};

/** Stable channel definitions for Android client createChannel + cert. */
export const ANDROID_CHANNEL_DEFINITIONS: Array<{
  id: AndroidChannelId;
  name: string;
  description: string;
  importance: 3 | 4 | 5;
  /** 0=private lock screen, 1=public */
  visibility: 0 | 1;
  soundPolicy: NotificationSoundPolicy;
}> = [
  {
    id: ANDROID_CHANNEL_IDS.messages,
    name: 'Messages',
    description: 'Direct messages and chat activity',
    importance: 5,
    visibility: 0,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.community,
    name: 'Community',
    description: 'Group approvals, announcements, and community activity',
    importance: 4,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.marketplace,
    name: 'Marketplace',
    description: 'Listing interest and marketplace updates',
    importance: 4,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.jobs,
    name: 'Jobs',
    description: 'Applications, recruiter views, and hiring updates',
    importance: 4,
    visibility: 1,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.gigs,
    name: 'Gigs',
    description: 'Orders, proposals, contracts, and freelancing',
    importance: 4,
    visibility: 1,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.scroll,
    name: 'Scroll',
    description: 'New Scrolls and short-video activity',
    importance: 4,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.stories,
    name: 'Stories',
    description: 'Story updates from people you follow',
    importance: 4,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.posts,
    name: 'Posts',
    description: 'New posts, reactions, and publications',
    importance: 4,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.alerts,
    name: 'Scrolith alerts (Scroll it)',
    description: 'Important Scrolith alerts and campaigns with the Scrolith notification sound (Scroll it)',
    importance: 5,
    visibility: 1,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.follows,
    name: 'Follows',
    description: 'New followers and follow activity',
    importance: 3,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.mentions,
    name: 'Mentions',
    description: 'When someone mentions you',
    importance: 4,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.comments,
    name: 'Comments',
    description: 'Comments and replies on your content',
    importance: 4,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.orders,
    name: 'Orders',
    description: 'Marketplace and gig order updates',
    importance: 4,
    visibility: 1,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.wallet,
    name: 'Wallet',
    description: 'Wallet balance, payouts, and transfers',
    importance: 4,
    visibility: 0,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.payments,
    name: 'Payments',
    description: 'Payment confirmations, refunds, and receipts',
    importance: 5,
    visibility: 0,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.admin,
    name: 'Admin',
    description: 'Moderation and administrative notices',
    importance: 4,
    visibility: 1,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.security,
    name: 'Security',
    description: 'Login, password, and account security alerts',
    importance: 5,
    visibility: 1,
    soundPolicy: 'high'
  },
  {
    id: ANDROID_CHANNEL_IDS.system,
    name: 'System',
    description: 'Product updates and system notices',
    importance: 3,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.scrolitha,
    name: 'Scrolitha',
    description: 'Scrolitha AI assistant notifications',
    importance: 3,
    visibility: 1,
    soundPolicy: 'standard'
  },
  {
    id: ANDROID_CHANNEL_IDS.social,
    name: 'Social',
    description: 'Legacy social activity channel',
    importance: 3,
    visibility: 1,
    soundPolicy: 'standard'
  }
];

/** Allowlisted channel ids for FCM (active + legacy + short legacy). */
export const ANDROID_CHANNEL_ID_ALLOWLIST = new Set<string>([
  ...Object.values(ANDROID_CHANNEL_IDS),
  ...Object.values(ANDROID_LEGACY_CHANNEL_IDS),
  'scrolith_alerts_v2',
  'general',
  'messages',
  'posts',
  'campaigns_scrolith_v1',
  'campaigns_scrolith_v2'
]);

export const isAllowedAndroidChannelId = (channelId: unknown): boolean => {
  const id = String(channelId || '').trim();
  return Boolean(id) && ANDROID_CHANNEL_ID_ALLOWLIST.has(id);
};
