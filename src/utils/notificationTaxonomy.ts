/**
 * Phase 25 — Enterprise notification taxonomy for labels, Android channels,
 * and deep-link routing. Pure helpers — no network side effects.
 *
 * Channel ids must match:
 * - geezle/src/mobile/push.ts (client createChannel)
 * - geezle-backend/src/services/notificationAndroidChannels.ts (FCM channelId)
 * - AndroidManifest default_notification_channel_id (migration fallback)
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
  | 'social';

/**
 * Android notification channel ids (must match FCM android.notification.channelId).
 * Phase 25 expands the enterprise set while retaining v1 ids for migration.
 */
export const ANDROID_CHANNEL_IDS = {
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
  /** AI assistant (retained) */
  scrolitha: 'scrolith_scrolitha_v1',
  /** Legacy umbrella social channel — still created for prior installs */
  social: 'scrolith_social_v1',
  /** Freelancing alias retained (maps to gigs channel for delivery) */
  freelancing: 'scrolith_gigs_v1',
  /** Fallback / migration default used by prior releases */
  alerts: 'scrolith_alerts_v2'
} as const;

export type AndroidChannelId = (typeof ANDROID_CHANNEL_IDS)[keyof typeof ANDROID_CHANNEL_IDS];

export type NotificationCategoryMeta = {
  key: NotificationCategoryKey;
  /** Short badge label for in-app lists */
  label: string;
  /** Android channel id */
  channelId: AndroidChannelId;
  /** Localization key (i18n-ready) */
  i18nKey: string;
};

const CATEGORY_META: Record<NotificationCategoryKey, NotificationCategoryMeta> = {
  message: {
    key: 'message',
    label: 'Message',
    channelId: ANDROID_CHANNEL_IDS.messages,
    i18nKey: 'notification.category.message'
  },
  story: {
    key: 'story',
    label: 'Story',
    channelId: ANDROID_CHANNEL_IDS.stories,
    i18nKey: 'notification.category.story'
  },
  scroll: {
    key: 'scroll',
    label: 'Scroll',
    channelId: ANDROID_CHANNEL_IDS.scroll,
    i18nKey: 'notification.category.scroll'
  },
  comment: {
    key: 'comment',
    label: 'Comment',
    channelId: ANDROID_CHANNEL_IDS.comments,
    i18nKey: 'notification.category.comment'
  },
  reply: {
    key: 'reply',
    label: 'Reply',
    channelId: ANDROID_CHANNEL_IDS.comments,
    i18nKey: 'notification.category.reply'
  },
  mention: {
    key: 'mention',
    label: 'Mention',
    channelId: ANDROID_CHANNEL_IDS.mentions,
    i18nKey: 'notification.category.mention'
  },
  reaction: {
    key: 'reaction',
    label: 'Reaction',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.reaction'
  },
  follow: {
    key: 'follow',
    label: 'Follow',
    channelId: ANDROID_CHANNEL_IDS.follows,
    i18nKey: 'notification.category.follow'
  },
  post: {
    key: 'post',
    label: 'Post',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.post'
  },
  community: {
    key: 'community',
    label: 'Community',
    channelId: ANDROID_CHANNEL_IDS.community,
    i18nKey: 'notification.category.community'
  },
  marketplace: {
    key: 'marketplace',
    label: 'Marketplace',
    channelId: ANDROID_CHANNEL_IDS.marketplace,
    i18nKey: 'notification.category.marketplace'
  },
  order: {
    key: 'order',
    label: 'Order',
    channelId: ANDROID_CHANNEL_IDS.orders,
    i18nKey: 'notification.category.order'
  },
  job: {
    key: 'job',
    label: 'Job',
    channelId: ANDROID_CHANNEL_IDS.jobs,
    i18nKey: 'notification.category.job'
  },
  gig: {
    key: 'gig',
    label: 'Gig',
    channelId: ANDROID_CHANNEL_IDS.gigs,
    i18nKey: 'notification.category.gig'
  },
  freelancing: {
    key: 'freelancing',
    label: 'Gig',
    channelId: ANDROID_CHANNEL_IDS.gigs,
    i18nKey: 'notification.category.gig'
  },
  event: {
    key: 'event',
    label: 'Event',
    channelId: ANDROID_CHANNEL_IDS.community,
    i18nKey: 'notification.category.event'
  },
  live: {
    key: 'live',
    label: 'Live',
    channelId: ANDROID_CHANNEL_IDS.scroll,
    i18nKey: 'notification.category.live'
  },
  series: {
    key: 'series',
    label: 'Series',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.series'
  },
  playlist: {
    key: 'playlist',
    label: 'Playlist',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.playlist'
  },
  scrolitha: {
    key: 'scrolitha',
    label: 'Scrolitha',
    channelId: ANDROID_CHANNEL_IDS.scrolitha,
    i18nKey: 'notification.category.scrolitha'
  },
  admin: {
    key: 'admin',
    label: 'Admin',
    channelId: ANDROID_CHANNEL_IDS.admin,
    i18nKey: 'notification.category.admin'
  },
  security: {
    key: 'security',
    label: 'Security',
    channelId: ANDROID_CHANNEL_IDS.security,
    i18nKey: 'notification.category.security'
  },
  system: {
    key: 'system',
    label: 'System',
    channelId: ANDROID_CHANNEL_IDS.system,
    i18nKey: 'notification.category.system'
  },
  social: {
    key: 'social',
    label: 'Social',
    channelId: ANDROID_CHANNEL_IDS.posts,
    i18nKey: 'notification.category.social'
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
  const explicit = coerce(input.category || input.metadata?.category || input.metadata?.notificationCategory);
  if (explicit && explicit in CATEGORY_META) {
    return explicit as NotificationCategoryKey;
  }

  const type = coerce(input.type || input.notificationType || input.metadata?.type);
  const entity = coerce(input.entityType || input.metadata?.entityType || input.metadata?.entity_type);
  const haystack = `${type} ${entity} ${coerce(input.title)}`;

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
  if (type === 'payment' || type.includes('payout') || type.includes('payment_')) {
    return 'order';
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
  if (type.includes('social') || type.includes('campaign')) {
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
): AndroidChannelId => getNotificationCategoryMeta(input).channelId;

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
  if (type.includes('security')) {
    return '/settings/security';
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
}> = [
  {
    id: ANDROID_CHANNEL_IDS.messages,
    name: 'Messages',
    description: 'Direct messages and chat activity',
    importance: 5,
    visibility: 0
  },
  {
    id: ANDROID_CHANNEL_IDS.community,
    name: 'Community',
    description: 'Group approvals, announcements, and community activity',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.marketplace,
    name: 'Marketplace',
    description: 'Listing interest and marketplace updates',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.jobs,
    name: 'Jobs',
    description: 'Applications, recruiter views, and hiring updates',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.gigs,
    name: 'Gigs',
    description: 'Orders, proposals, contracts, and freelancing',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.scroll,
    name: 'Scroll',
    description: 'New Scrolls and short-video activity',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.stories,
    name: 'Stories',
    description: 'Story updates from people you follow',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.posts,
    name: 'Posts',
    description: 'New posts, reactions, and publications',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.follows,
    name: 'Follows',
    description: 'New followers and follow activity',
    importance: 3,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.mentions,
    name: 'Mentions',
    description: 'When someone mentions you',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.comments,
    name: 'Comments',
    description: 'Comments and replies on your content',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.orders,
    name: 'Orders',
    description: 'Marketplace and gig order updates',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.admin,
    name: 'Admin',
    description: 'Moderation and administrative notices',
    importance: 4,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.security,
    name: 'Security',
    description: 'Login, password, and account security alerts',
    importance: 5,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.system,
    name: 'System',
    description: 'Product updates and system notices',
    importance: 3,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.scrolitha,
    name: 'Scrolitha',
    description: 'Scrolitha AI assistant notifications',
    importance: 3,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.social,
    name: 'Social',
    description: 'Legacy social activity channel',
    importance: 3,
    visibility: 1
  },
  {
    id: ANDROID_CHANNEL_IDS.alerts,
    name: 'Alerts',
    description: 'Migration fallback alerts channel',
    importance: 4,
    visibility: 1
  }
];
