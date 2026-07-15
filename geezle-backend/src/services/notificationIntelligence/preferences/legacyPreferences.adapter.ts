/**
 * Compatibility adapter: UserSettings + platform toggles + quiet hours → NI preference model.
 * Does not change how engagement/journey code runs today.
 */
import prisma from '../../../utils/prismaClient';
import type {
  CategoryPreference,
  PreferenceCategoryKey,
  QuietHoursPlaceholder,
  UserNotificationPreferences
} from './preference.types';
import { ALL_PREFERENCE_CATEGORIES } from './preference.types';

type UserSettingsRow = {
  userId: string;
  emailNotifications: boolean;
  inAppNotifications: boolean;
  messageRequestsNotifications: boolean;
  notifyMentions: boolean;
  notifyFollowedPosts: boolean;
  notifyFollowedYou: boolean;
  notifyCommentsOnPosts: boolean;
  notifyReactionsOnPosts: boolean;
  notifyReposts: boolean;
  notifyJobApplications: boolean;
  notifyApplicationUpdates: boolean;
};

const bool = (value: unknown, fallback = true) => {
  if (value === undefined || value === null) return fallback;
  return value !== false;
};

const channelPrefs = (enabled: boolean) => ({
  inApp: { enabled },
  // Placeholders: mirror in-app until delivery engine exists
  email: { enabled, reserved: true as const },
  push: { enabled, reserved: true as const },
  digest: { enabled: false, reserved: true as const }
});

const category = (
  key: PreferenceCategoryKey,
  enabled: boolean,
  legacyField?: string | null
): CategoryPreference => ({
  category: key,
  enabled,
  channels: channelPrefs(enabled),
  legacyField: legacyField ?? null
});

/** Build category map from UserSettings row (or defaults when missing). */
export const mapUserSettingsToCategories = (
  settings: Partial<UserSettingsRow> | null | undefined
): Record<PreferenceCategoryKey, CategoryPreference> => {
  const s = settings || {};
  const global = bool(s.inAppNotifications, true);

  const mentions = global && bool(s.notifyMentions, true);
  const comments = global && bool(s.notifyCommentsOnPosts, true);
  const likes = global && bool(s.notifyReactionsOnPosts, true);
  const followers = global && bool(s.notifyFollowedYou, true);
  const followedPosts = global && bool(s.notifyFollowedPosts, true);
  const reposts = global && bool(s.notifyReposts, true);
  const jobsApps = global && bool(s.notifyJobApplications, true);
  const jobUpdates = global && bool(s.notifyApplicationUpdates, true);
  const messages = global && bool(s.messageRequestsNotifications, true);

  // Categories without dedicated UserSettings columns: inherit global (future-ready)
  const inheritGlobal = global;

  return {
    messages: category('messages', messages, 'messageRequestsNotifications'),
    mentions: category('mentions', mentions, 'notifyMentions'),
    comments: category('comments', comments, 'notifyCommentsOnPosts'),
    likes: category('likes', likes || reposts, 'notifyReactionsOnPosts'),
    replies: category('replies', comments, 'notifyCommentsOnPosts'),
    followers: category('followers', followers || followedPosts, 'notifyFollowedYou'),
    jobs: category('jobs', jobsApps || jobUpdates, 'notifyJobApplications'),
    marketplace: category('marketplace', inheritGlobal, null),
    communities: category('communities', inheritGlobal, null),
    companies: category('companies', inheritGlobal, null),
    system: category('system', inheritGlobal, null),
    future: category('future', false, null)
  };
};

export const loadUserSettingsRow = async (userId: string): Promise<UserSettingsRow | null> => {
  const id = String(userId || '').trim();
  if (!id) return null;
  try {
    const row = await prisma.userSettings.findUnique({
      where: { userId: id },
      select: {
        userId: true,
        emailNotifications: true,
        inAppNotifications: true,
        messageRequestsNotifications: true,
        notifyMentions: true,
        notifyFollowedPosts: true,
        notifyFollowedYou: true,
        notifyCommentsOnPosts: true,
        notifyReactionsOnPosts: true,
        notifyReposts: true,
        notifyJobApplications: true,
        notifyApplicationUpdates: true
      }
    });
    return row as UserSettingsRow | null;
  } catch {
    return null;
  }
};

export const loadQuietHoursPlaceholder = async (userId: string): Promise<QuietHoursPlaceholder> => {
  const id = String(userId || '').trim();
  const empty: QuietHoursPlaceholder = { rules: [], engineReady: false };
  if (!id) return empty;
  try {
    const delegate = (prisma as any).quietHourRule;
    if (!delegate?.findMany) return empty;
    const rows = await delegate.findMany({
      where: { userId: id, isActive: true },
      take: 50,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        channel: true,
        daysOfWeek: true,
        startMinute: true,
        endMinute: true,
        isActive: true,
        timezone: true,
        label: true
      }
    });
    return {
      engineReady: false,
      rules: (rows || []).map((r: any) => ({
        id: String(r.id),
        channel: r.channel || 'ALL',
        daysOfWeek: Array.isArray(r.daysOfWeek) ? r.daysOfWeek.map(String) : [],
        startMinute: Number(r.startMinute) || 0,
        endMinute: Number(r.endMinute) || 0,
        isActive: r.isActive !== false,
        timezone: r.timezone || null,
        label: r.label || null
      }))
    };
  } catch {
    return empty;
  }
};

export const buildPreferencesFromLegacy = async (
  userId: string,
  preferencesEngineActive: boolean
): Promise<UserNotificationPreferences> => {
  const settings = await loadUserSettingsRow(userId);
  const quietHours = await loadQuietHoursPlaceholder(userId);
  const categories = mapUserSettingsToCategories(settings);

  // Ensure all keys present
  for (const key of ALL_PREFERENCE_CATEGORIES) {
    if (!categories[key]) {
      categories[key] = category(key, settings ? bool(settings.inAppNotifications, true) : true, null);
    }
  }

  return {
    userId,
    globalEnabled: settings ? bool(settings.inAppNotifications, true) : true,
    emailEnabled: settings ? bool(settings.emailNotifications, true) : true,
    messageRequestsEnabled: settings ? bool(settings.messageRequestsNotifications, true) : true,
    categories,
    quietHours,
    digest: {
      enabled: false,
      frequency: 'off',
      reserved: true
    },
    delivery: {
      batchingEnabled: false,
      maxPerHour: null,
      reserved: true
    },
    preferencesEngineActive,
    source: settings ? 'legacy_user_settings' : 'defaults',
    resolvedAt: new Date().toISOString()
  };
};

/**
 * Parity helper: mirrors engagementNotifications filter for a single user + type
 * without importing private functions from that module.
 */
export const legacyEngagementWouldAllow = (
  settings: Partial<UserSettingsRow> | null,
  engagementType: string
): boolean => {
  if (!settings) return true; // engagement service: missing settings row → allow
  if (settings.inAppNotifications === false) return false;

  const fieldMap: Record<string, keyof UserSettingsRow | null> = {
    mention_post: 'notifyMentions',
    mention_comment: 'notifyMentions',
    followed_new_post: 'notifyFollowedPosts',
    followed_you: 'notifyFollowedYou',
    comment_on_post: 'notifyCommentsOnPosts',
    reaction_on_post: 'notifyReactionsOnPosts',
    job_application_created: 'notifyJobApplications',
    proposal_opened: 'notifyApplicationUpdates',
    proposal_reply: 'notifyApplicationUpdates',
    proposal_top_applicant: 'notifyApplicationUpdates',
    proposal_interview_scheduled: 'notifyApplicationUpdates',
    repost: 'notifyReposts'
  };
  const field = fieldMap[engagementType] || 'notifyReposts';
  if (!field) return true;
  const pref = settings[field];
  return pref !== false;
};
