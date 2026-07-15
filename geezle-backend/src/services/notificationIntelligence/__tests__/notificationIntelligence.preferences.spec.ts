/**
 * Phase 10.3 — Notification preferences layer tests.
 */
import {
  DEFAULT_NOTIF_INTEL_FLAGS,
  invalidateNotificationIntelRolloutCache,
  resolveNotificationIntelRolloutFlags,
  notificationPreferenceService,
  ALL_PREFERENCE_CATEGORIES,
  PreferenceValidationError
} from '../index';
import { mapUserSettingsToCategories, legacyEngagementWouldAllow } from '../preferences/legacyPreferences.adapter';
import {
  normalizePreferenceCategory,
  categoryFromLegacyEngagementType,
  validatePreferenceEvaluationInput
} from '../preferences/preference.validation';

const mockFindUnique = jest.fn();
const mockQuietFindMany = jest.fn();

jest.mock('../../../utils/prismaClient', () => ({
  __esModule: true,
  default: {
    userSettings: {
      findUnique: (...args: any[]) => mockFindUnique(...args)
    },
    quietHourRule: {
      findMany: (...args: any[]) => mockQuietFindMany(...args)
    }
  }
}));

describe('Preference validation', () => {
  test('normalizes category aliases', () => {
    expect(normalizePreferenceCategory('mentions')).toBe('mentions');
    expect(normalizePreferenceCategory('DM')).toBe('messages');
    expect(normalizePreferenceCategory('reactions')).toBe('likes');
    expect(normalizePreferenceCategory('groups')).toBe('communities');
  });

  test('rejects unknown category', () => {
    expect(() => normalizePreferenceCategory('spaceships')).toThrow(PreferenceValidationError);
  });

  test('maps engagement types', () => {
    expect(categoryFromLegacyEngagementType('mention_post')).toBe('mentions');
    expect(categoryFromLegacyEngagementType('job_application_created')).toBe('jobs');
    expect(categoryFromLegacyEngagementType('unknown_x')).toBe(null);
  });

  test('validatePreferenceEvaluationInput requires userId', () => {
    expect(() =>
      validatePreferenceEvaluationInput({ userId: '', category: 'messages' })
    ).toThrow(PreferenceValidationError);
  });
});

describe('Legacy preference adapter', () => {
  test('maps UserSettings fields to categories', () => {
    const cats = mapUserSettingsToCategories({
      userId: 'u1',
      inAppNotifications: true,
      notifyMentions: false,
      notifyCommentsOnPosts: true,
      notifyReactionsOnPosts: false,
      notifyFollowedYou: true,
      notifyFollowedPosts: true,
      notifyReposts: true,
      notifyJobApplications: false,
      notifyApplicationUpdates: true,
      messageRequestsNotifications: true,
      emailNotifications: true
    });
    expect(cats.mentions.enabled).toBe(false);
    expect(cats.comments.enabled).toBe(true);
    // likes category ORs reactions + reposts (repost true → likes enabled)
    expect(cats.likes.enabled).toBe(true);
    expect(cats.jobs.enabled).toBe(true); // application updates true
    expect(cats.messages.enabled).toBe(true);
    expect(cats.future.enabled).toBe(false);
    expect(ALL_PREFERENCE_CATEGORIES.every((k) => cats[k])).toBe(true);
  });

  test('global in-app false disables categories', () => {
    const cats = mapUserSettingsToCategories({
      userId: 'u1',
      inAppNotifications: false,
      notifyMentions: true,
      messageRequestsNotifications: true
    } as any);
    expect(cats.mentions.enabled).toBe(false);
    expect(cats.messages.enabled).toBe(false);
  });

  test('legacyEngagementWouldAllow mirrors missing-settings allow', () => {
    expect(legacyEngagementWouldAllow(null, 'mention_post')).toBe(true);
    expect(
      legacyEngagementWouldAllow(
        { inAppNotifications: true, notifyMentions: false } as any,
        'mention_post'
      )
    ).toBe(false);
    expect(
      legacyEngagementWouldAllow(
        { inAppNotifications: true, notifyMentions: true } as any,
        'mention_post'
      )
    ).toBe(true);
  });
});

describe('Preference service + rollout', () => {
  const prev = { ...process.env };

  beforeEach(() => {
    mockFindUnique.mockReset();
    mockQuietFindMany.mockReset();
    mockQuietFindMany.mockResolvedValue([]);
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  afterEach(() => {
    process.env = { ...prev };
    invalidateNotificationIntelRolloutCache();
  });

  test('defaults include preferences OFF', () => {
    expect(DEFAULT_NOTIF_INTEL_FLAGS.preferences).toBe(false);
    delete process.env.NOTIF_INTEL_MASTER;
    delete process.env.NOTIF_INTEL_PREFERENCES;
    invalidateNotificationIntelRolloutCache();
    const flags = resolveNotificationIntelRolloutFlags({ ...process.env });
    expect(flags.preferences).toBe(false);
  });

  test('evaluate is inactive when flags OFF (allowed no-op for callers)', async () => {
    delete process.env.NOTIF_INTEL_MASTER;
    invalidateNotificationIntelRolloutCache();
    const result = await notificationPreferenceService.evaluate({
      userId: 'u1',
      category: 'mentions'
    });
    expect(result.preferencesEngineActive).toBe(false);
    expect(result.allowed).toBe(true);
    expect(result.reason).toBe('preferences_engine_inactive');
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test('evaluate enforces category when master+preferences ON', async () => {
    process.env.NOTIF_INTEL_MASTER = 'true';
    process.env.NOTIF_INTEL_PREFERENCES = 'true';
    invalidateNotificationIntelRolloutCache();
    mockFindUnique.mockResolvedValue({
      userId: 'u1',
      emailNotifications: true,
      inAppNotifications: true,
      messageRequestsNotifications: true,
      notifyMentions: false,
      notifyFollowedPosts: true,
      notifyFollowedYou: true,
      notifyCommentsOnPosts: true,
      notifyReactionsOnPosts: true,
      notifyReposts: true,
      notifyJobApplications: true,
      notifyApplicationUpdates: true
    });

    const denied = await notificationPreferenceService.evaluate({
      userId: 'u1',
      category: 'mentions'
    });
    expect(denied.preferencesEngineActive).toBe(true);
    expect(denied.allowed).toBe(false);
    expect(denied.reason).toBe('category_disabled');

    const allowed = await notificationPreferenceService.evaluate({
      userId: 'u1',
      category: 'comments'
    });
    expect(allowed.allowed).toBe(true);
    expect(allowed.reason).toBe('allowed');
  });

  test('getPreferences returns snapshot with placeholders', async () => {
    mockFindUnique.mockResolvedValue({
      userId: 'u1',
      emailNotifications: false,
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
    });
    mockQuietFindMany.mockResolvedValue([
      {
        id: 'qh1',
        channel: 'PUSH',
        daysOfWeek: ['mon'],
        startMinute: 0,
        endMinute: 60,
        isActive: true,
        timezone: 'UTC',
        label: 'night'
      }
    ]);

    const prefs = await notificationPreferenceService.getPreferences('u1');
    expect(prefs.userId).toBe('u1');
    expect(prefs.globalEnabled).toBe(true);
    expect(prefs.emailEnabled).toBe(false);
    expect(prefs.digest.reserved).toBe(true);
    expect(prefs.delivery.reserved).toBe(true);
    expect(prefs.quietHours.engineReady).toBe(false);
    expect(prefs.quietHours.rules).toHaveLength(1);
    expect(prefs.categories.marketplace).toBeDefined();
    expect(prefs.source).toBe('legacy_user_settings');
  });

  test('listCategories is stable', () => {
    expect(notificationPreferenceService.listCategories()).toEqual(ALL_PREFERENCE_CATEGORIES);
  });
});
