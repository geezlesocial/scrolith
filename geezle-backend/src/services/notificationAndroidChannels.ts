/**
 * Phase 25/27/29 — Android FCM channel + enterprise category mapping for push delivery.
 * Keep channel ids aligned with geezle/src/utils/notificationTaxonomy.ts and mobile/push.ts.
 *
 * Phase 29 — sound migration: active delivery uses *_v2 channels with Scrolith sound "scrolith"
 * (res/raw/scrolith.wav). Pronunciation guidance only: "Scroll it".
 * Legacy *_v1 ids remain valid for devices still holding those channels.
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
  scrolitha: 'scrolith_scrolitha_v2',
  /** Legacy umbrella social */
  social: 'scrolith_social_v2',
  /** Freelancing alias → gigs channel */
  freelancing: 'scrolith_gigs_v2',
  alerts: 'scrolith_alerts_v2'
} as const;

/** Phase 29 — retained for legacy payload compatibility (do not delete on device). */
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

/** Scrolith notification sound resource (no extension). Pronunciation: "Scroll it". */
export const SCROLITH_NOTIFICATION_SOUND = 'scrolith';
export const SCROLITH_NOTIFICATION_SOUND_PRONUNCIATION = 'Scroll it';
export const SCROLITH_NOTIFICATION_SMALL_ICON = 'ic_stat_scrolith';

export type AndroidChannelId = (typeof ANDROID_CHANNEL_IDS)[keyof typeof ANDROID_CHANNEL_IDS];

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

const LABEL_BY_CATEGORY: Record<NotificationCategoryKey, string> = {
  message: 'Message',
  story: 'Story',
  scroll: 'Scroll',
  comment: 'Comment',
  reply: 'Reply',
  mention: 'Mention',
  reaction: 'Reaction',
  follow: 'Follow',
  post: 'Post',
  community: 'Community',
  marketplace: 'Marketplace',
  order: 'Order',
  job: 'Job',
  gig: 'Gig',
  freelancing: 'Gig',
  event: 'Event',
  live: 'Live',
  series: 'Series',
  playlist: 'Playlist',
  scrolitha: 'Scrolitha',
  admin: 'Admin',
  security: 'Security',
  system: 'System',
  social: 'Social',
  wallet: 'Wallet',
  payment: 'Payment'
};

const CHANNEL_BY_CATEGORY: Record<NotificationCategoryKey, AndroidChannelId> = {
  message: ANDROID_CHANNEL_IDS.messages,
  story: ANDROID_CHANNEL_IDS.stories,
  scroll: ANDROID_CHANNEL_IDS.scroll,
  comment: ANDROID_CHANNEL_IDS.comments,
  reply: ANDROID_CHANNEL_IDS.comments,
  mention: ANDROID_CHANNEL_IDS.mentions,
  reaction: ANDROID_CHANNEL_IDS.posts,
  follow: ANDROID_CHANNEL_IDS.follows,
  post: ANDROID_CHANNEL_IDS.posts,
  community: ANDROID_CHANNEL_IDS.community,
  marketplace: ANDROID_CHANNEL_IDS.marketplace,
  order: ANDROID_CHANNEL_IDS.orders,
  job: ANDROID_CHANNEL_IDS.jobs,
  gig: ANDROID_CHANNEL_IDS.gigs,
  freelancing: ANDROID_CHANNEL_IDS.gigs,
  event: ANDROID_CHANNEL_IDS.community,
  live: ANDROID_CHANNEL_IDS.scroll,
  series: ANDROID_CHANNEL_IDS.posts,
  playlist: ANDROID_CHANNEL_IDS.posts,
  scrolitha: ANDROID_CHANNEL_IDS.scrolitha,
  admin: ANDROID_CHANNEL_IDS.admin,
  security: ANDROID_CHANNEL_IDS.security,
  system: ANDROID_CHANNEL_IDS.system,
  social: ANDROID_CHANNEL_IDS.posts,
  wallet: ANDROID_CHANNEL_IDS.wallet,
  payment: ANDROID_CHANNEL_IDS.payments
};

/** Allowlist for FCM channelId — reject arbitrary client channel ids. */
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

/**
 * Sanitize optional override channelId from payload/meta.
 * Arbitrary ids are rejected; category resolution is used instead.
 */
export const sanitizeAndroidChannelId = (
  requested: unknown,
  fallback: AndroidChannelId
): AndroidChannelId => {
  const id = String(requested || '').trim();
  if (!id) return fallback;
  if (!isAllowedAndroidChannelId(id)) return fallback;
  // Prefer active allowlisted ids; cast only when on allowlist.
  return id as AndroidChannelId;
};

const coerce = (value: unknown) => String(value ?? '').trim().toLowerCase();

export const resolveNotificationCategory = (input: {
  type?: unknown;
  category?: unknown;
  entityType?: unknown;
  title?: unknown;
  data?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
}): NotificationCategoryKey => {
  const bag = {
    ...(input.meta && typeof input.meta === 'object' ? input.meta : {}),
    ...(input.data && typeof input.data === 'object' ? input.data : {})
  } as Record<string, unknown>;

  const explicit = coerce(input.category || bag.category || bag.notificationCategory);
  if (explicit && explicit in LABEL_BY_CATEGORY) {
    return explicit as NotificationCategoryKey;
  }

  const type = coerce(input.type || bag.type || bag.notificationType);
  const entity = coerce(input.entityType || bag.entityType || bag.entity_type);
  const haystack = `${type} ${entity} ${coerce(input.title)}`;

  // Admin "Send App Campaign" and similar blasts → system (alerts channel override).
  if (
    type === 'app_campaign' ||
    type === 'campaign' ||
    type.includes('app_campaign') ||
    (type.includes('campaign') && !type.includes('ad'))
  ) {
    return 'system';
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
  // Phase 29 — wallet / payment
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
    type === 'message_reaction' ||
    type.includes('message') ||
    type.includes('chat')
  ) {
    return 'message';
  }
  // Jobs before story / status substring collisions.
  if (type.includes('job') || type.includes('application') || type.includes('recruiter')) return 'job';
  if (type.includes('story')) return 'story';
  if (type.includes('scroll') || type.includes('short_video') || type.includes('reel')) return 'scroll';
  if (type.includes('live') || type.includes('livestream')) return 'live';
  if (type.includes('event') || type.includes('meetup')) return 'event';
  if (type.includes('reply')) return 'reply';
  if (type.includes('mention')) return 'mention';
  if (type.includes('reaction') || type.includes('like') || type === 'repost') return 'reaction';
  if (type.includes('comment')) return 'comment';
  // Publication-from-follow before generic follow.
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
  if (type.includes('community') || type.includes('group') || type.includes('club')) return 'community';
  if (
    type.includes('freelance') ||
    type.includes('gig') ||
    type.includes('proposal') ||
    type.includes('contract') ||
    type.includes('brief')
  ) {
    return 'gig';
  }
  if (type.includes('order') || entity === 'order') return 'order';
  if (type.includes('marketplace') || type.includes('listing') || type.includes('commerce')) {
    return 'marketplace';
  }
  if (type.includes('series') || type.includes('episode')) return 'series';
  if (type.includes('playlist')) return 'playlist';
  if (type.includes('scrolitha') || haystack.includes('scrolitha')) return 'scrolitha';
  if (
    type.includes('security') ||
    type.includes('password') ||
    type.includes('login') ||
    type.includes('2fa') ||
    type.includes('mfa')
  ) {
    return 'security';
  }
  if (type.includes('admin') || type.includes('moderation') || type.includes('moderator')) return 'admin';
  if (type.includes('post') || type.includes('publication')) return 'post';
  if (type.includes('social')) return 'social';
  if (type.includes('system') || type.includes('account')) return 'system';
  return 'system';
};

export const getNotificationCategoryLabel = (
  input: Parameters<typeof resolveNotificationCategory>[0]
): string => LABEL_BY_CATEGORY[resolveNotificationCategory(input)];

export const resolveAndroidChannelId = (
  input: Parameters<typeof resolveNotificationCategory>[0]
): AndroidChannelId => {
  const category = resolveNotificationCategory(input);
  const type = coerce(input.type || input.data?.type || input.meta?.type || input.data?.notificationType);
  // Campaigns use alerts channel so the custom Scrolith ("Scroll it") sound plays at MAX.
  if (
    type === 'app_campaign' ||
    type === 'campaign' ||
    type.includes('app_campaign') ||
    (type.includes('campaign') && !type.includes('ad') && category === 'system')
  ) {
    return ANDROID_CHANNEL_IDS.alerts;
  }
  // Optional explicit channel from data — allowlist only.
  const requested =
    (input.data && (input.data.channelId || input.data.androidChannelId)) ||
    (input.meta && (input.meta.channelId || input.meta.androidChannelId));
  const mapped = CHANNEL_BY_CATEGORY[category];
  return sanitizeAndroidChannelId(requested, mapped);
};

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
  if (lower.includes(' · ')) {
    const existing = lower.split(' · ')[0];
    if (existing === label.toLowerCase() || existing === 'freelancing' || existing === 'social') {
      return raw;
    }
  }
  return `${label} · ${raw}`;
};

/** Collapse / grouping key for Android notification tags. */
export const resolveAndroidNotificationTag = (input: {
  type?: unknown;
  data?: Record<string, unknown> | null;
  meta?: Record<string, unknown> | null;
  id?: unknown;
}): string => {
  const bag = {
    ...(input.meta && typeof input.meta === 'object' ? input.meta : {}),
    ...(input.data && typeof input.data === 'object' ? input.data : {})
  } as Record<string, unknown>;
  const category = resolveNotificationCategory(input);
  const candidates = [
    bag.conversationId,
    bag.conversation_id,
    bag.groupKey,
    bag.group_key,
    bag.entityId,
    bag.entity_id,
    bag.postId,
    bag.storyId,
    bag.orderId,
    bag.listingId,
    bag.groupId,
    input.id,
    category
  ];
  for (const c of candidates) {
    const v = String(c || '').trim();
    if (v) return `${category}:${v}`.slice(0, 64);
  }
  return `scrolith:${category}`.slice(0, 64);
};
