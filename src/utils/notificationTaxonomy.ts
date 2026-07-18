/**
 * Enterprise notification taxonomy for labels, Android channels, and deep-link routing.
 * Pure helpers — no network side effects.
 */

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

/** Android notification channel ids (must match push.ts + FCM android.notification.channelId). */
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
    channelId: ANDROID_CHANNEL_IDS.social,
    i18nKey: 'notification.category.story'
  },
  comment: {
    key: 'comment',
    label: 'Comment',
    channelId: ANDROID_CHANNEL_IDS.social,
    i18nKey: 'notification.category.comment'
  },
  reply: {
    key: 'reply',
    label: 'Reply',
    channelId: ANDROID_CHANNEL_IDS.social,
    i18nKey: 'notification.category.reply'
  },
  mention: {
    key: 'mention',
    label: 'Mention',
    channelId: ANDROID_CHANNEL_IDS.social,
    i18nKey: 'notification.category.mention'
  },
  reaction: {
    key: 'reaction',
    label: 'Reaction',
    channelId: ANDROID_CHANNEL_IDS.social,
    i18nKey: 'notification.category.reaction'
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
  job: {
    key: 'job',
    label: 'Job',
    channelId: ANDROID_CHANNEL_IDS.jobs,
    i18nKey: 'notification.category.job'
  },
  freelancing: {
    key: 'freelancing',
    label: 'Freelancing',
    channelId: ANDROID_CHANNEL_IDS.freelancing,
    i18nKey: 'notification.category.freelancing'
  },
  series: {
    key: 'series',
    label: 'Series',
    channelId: ANDROID_CHANNEL_IDS.social,
    i18nKey: 'notification.category.series'
  },
  playlist: {
    key: 'playlist',
    label: 'Playlist',
    channelId: ANDROID_CHANNEL_IDS.social,
    i18nKey: 'notification.category.playlist'
  },
  scrolitha: {
    key: 'scrolitha',
    label: 'Scrolitha',
    channelId: ANDROID_CHANNEL_IDS.scrolitha,
    i18nKey: 'notification.category.scrolitha'
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
    channelId: ANDROID_CHANNEL_IDS.social,
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

  if (
    type === 'message' ||
    type === 'new_message' ||
    type.includes('message') ||
    type.includes('chat') ||
    type.includes('dm')
  ) {
    return 'message';
  }
  if (type.includes('story') || type.includes('status')) return 'story';
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
  if (
    type.includes('community') ||
    type.includes('group') ||
    type.includes('club') ||
    type.includes('channel')
  ) {
    return 'community';
  }
  if (
    type.includes('marketplace') ||
    type.includes('listing') ||
    type.includes('order') ||
    type.includes('commerce')
  ) {
    return 'marketplace';
  }
  if (type.includes('job') || type.includes('application') || type.includes('recruiter')) {
    return 'job';
  }
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
    type.includes('follow') ||
    type.includes('friend') ||
    type.includes('social') ||
    type.includes('campaign')
  ) {
    return 'social';
  }
  if (type.includes('system') || type.includes('account') || type.includes('admin')) {
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
  return `${label} · ${raw}`;
};

export const listNotificationCategoryMeta = (): NotificationCategoryMeta[] =>
  Object.values(CATEGORY_META);
