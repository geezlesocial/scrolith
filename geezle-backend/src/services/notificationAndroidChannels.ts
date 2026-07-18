/**
 * Android FCM channel + enterprise category mapping for push delivery.
 * Keep channel ids aligned with geezle/src/utils/notificationTaxonomy.ts and mobile/push.ts.
 */

export const ANDROID_CHANNEL_IDS = {
  messages: 'scrolith_messages_v1',
  social: 'scrolith_social_v1',
  community: 'scrolith_community_v1',
  marketplace: 'scrolith_marketplace_v1',
  jobs: 'scrolith_jobs_v1',
  freelancing: 'scrolith_freelancing_v1',
  scrolitha: 'scrolith_scrolitha_v1',
  system: 'scrolith_system_v1',
  security: 'scrolith_security_v1',
  alerts: 'scrolith_alerts_v2'
} as const;

export type AndroidChannelId = (typeof ANDROID_CHANNEL_IDS)[keyof typeof ANDROID_CHANNEL_IDS];

export type NotificationCategoryKey =
  | 'message'
  | 'story'
  | 'comment'
  | 'reply'
  | 'mention'
  | 'reaction'
  | 'community'
  | 'marketplace'
  | 'job'
  | 'freelancing'
  | 'series'
  | 'playlist'
  | 'scrolitha'
  | 'security'
  | 'system'
  | 'social';

const LABEL_BY_CATEGORY: Record<NotificationCategoryKey, string> = {
  message: 'Message',
  story: 'Story',
  comment: 'Comment',
  reply: 'Reply',
  mention: 'Mention',
  reaction: 'Reaction',
  community: 'Community',
  marketplace: 'Marketplace',
  job: 'Job',
  freelancing: 'Freelancing',
  series: 'Series',
  playlist: 'Playlist',
  scrolitha: 'Scrolitha',
  security: 'Security',
  system: 'System',
  social: 'Social'
};

const CHANNEL_BY_CATEGORY: Record<NotificationCategoryKey, AndroidChannelId> = {
  message: ANDROID_CHANNEL_IDS.messages,
  story: ANDROID_CHANNEL_IDS.social,
  comment: ANDROID_CHANNEL_IDS.social,
  reply: ANDROID_CHANNEL_IDS.social,
  mention: ANDROID_CHANNEL_IDS.social,
  reaction: ANDROID_CHANNEL_IDS.social,
  community: ANDROID_CHANNEL_IDS.community,
  marketplace: ANDROID_CHANNEL_IDS.marketplace,
  job: ANDROID_CHANNEL_IDS.jobs,
  freelancing: ANDROID_CHANNEL_IDS.freelancing,
  series: ANDROID_CHANNEL_IDS.social,
  playlist: ANDROID_CHANNEL_IDS.social,
  scrolitha: ANDROID_CHANNEL_IDS.scrolitha,
  security: ANDROID_CHANNEL_IDS.security,
  system: ANDROID_CHANNEL_IDS.system,
  social: ANDROID_CHANNEL_IDS.social
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

  if (type === 'message' || type === 'new_message' || type.includes('message') || type.includes('chat')) {
    return 'message';
  }
  if (type.includes('story')) return 'story';
  if (type.includes('reply')) return 'reply';
  if (type.includes('mention')) return 'mention';
  if (type.includes('reaction') || type.includes('like') || type === 'repost') return 'reaction';
  if (type.includes('comment')) return 'comment';
  if (type.includes('community') || type.includes('group') || type.includes('club')) return 'community';
  if (type.includes('marketplace') || type.includes('listing') || type.includes('order')) {
    return 'marketplace';
  }
  if (type.includes('job') || type.includes('application') || type.includes('recruiter')) return 'job';
  if (
    type.includes('freelance') ||
    type.includes('gig') ||
    type.includes('proposal') ||
    type.includes('contract') ||
    type.includes('brief')
  ) {
    return 'freelancing';
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
  if (type.includes('follow') || type.includes('social') || type.includes('campaign')) return 'social';
  if (type.includes('system') || type.includes('account') || type.includes('admin')) return 'system';
  return 'system';
};

export const getNotificationCategoryLabel = (
  input: Parameters<typeof resolveNotificationCategory>[0]
): string => LABEL_BY_CATEGORY[resolveNotificationCategory(input)];

export const resolveAndroidChannelId = (
  input: Parameters<typeof resolveNotificationCategory>[0]
): AndroidChannelId => CHANNEL_BY_CATEGORY[resolveNotificationCategory(input)];

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
  return `${label} · ${raw}`;
};
