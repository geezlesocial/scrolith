/**
 * Notification Preferences service — Phase 10.3.
 * Single source of truth for NI preference evaluation when flags allow.
 * When preferences flag is OFF, evaluate() reports inactive and does not alter producers.
 */
import {
  resolveNotificationIntelRolloutFlags
} from '../rollout/rollout';
import {
  recordNotifIntelMetric,
  startNotifIntelTimer,
  logNotifIntelLifecycle
} from '../observability/observability';
import {
  buildPreferencesFromLegacy,
  legacyEngagementWouldAllow,
  loadUserSettingsRow
} from './legacyPreferences.adapter';
import {
  validatePreferenceEvaluationInput,
  PreferenceValidationError
} from './preference.validation';
import type {
  PreferenceEvaluationInput,
  PreferenceEvaluationResult,
  PreferenceCategoryKey,
  UserNotificationPreferences
} from './preference.types';

const isPreferencesFeatureActive = () => {
  const flags = resolveNotificationIntelRolloutFlags();
  // Preferences engine only active when master AND preferences flag are on
  return Boolean(flags.master && flags.preferences);
};

export class NotificationPreferenceService {
  /**
   * Resolve full preference snapshot for a user (legacy-backed).
   * Safe to call anytime; does not write.
   */
  async getPreferences(userId: string): Promise<UserNotificationPreferences> {
    const end = startNotifIntelTimer('prefs_get');
    recordNotifIntelMetric('prefs_get', 1);
    try {
      const active = isPreferencesFeatureActive();
      return await buildPreferencesFromLegacy(userId, active);
    } finally {
      end();
    }
  }

  /**
   * Evaluate whether a notification of a given category/channel is allowed.
   *
   * When preferences engine inactive (flags OFF):
   * - returns allowed:true with reason preferences_engine_inactive
   *   so callers that only use this under feature flags stay no-ops.
   * - use evaluateLegacyEngagementParity for dual-run comparisons.
   */
  async evaluate(raw: PreferenceEvaluationInput): Promise<PreferenceEvaluationResult> {
    const end = startNotifIntelTimer('prefs_evaluate');
    recordNotifIntelMetric('prefs_evaluate', 1);
    const input = validatePreferenceEvaluationInput(raw);
    const active = isPreferencesFeatureActive();
    const channel = input.channel || 'inApp';

    if (!active) {
      recordNotifIntelMetric('prefs_evaluate_inactive', 1);
      return {
        allowed: true,
        reason: 'preferences_engine_inactive',
        preferencesEngineActive: false,
        category: input.category,
        channel
      };
    }

    const prefs = await buildPreferencesFromLegacy(input.userId, true);
    if (!prefs.globalEnabled && channel === 'inApp') {
      return {
        allowed: false,
        reason: 'global_disabled',
        preferencesEngineActive: true,
        category: input.category,
        channel
      };
    }

    const cat = prefs.categories[input.category];
    if (!cat) {
      return {
        allowed: false,
        reason: 'unknown_category',
        preferencesEngineActive: true,
        category: input.category,
        channel
      };
    }

    if (!cat.enabled) {
      return {
        allowed: false,
        reason: 'category_disabled',
        preferencesEngineActive: true,
        category: input.category,
        channel
      };
    }

    const ch = cat.channels[channel];
    if (ch && ch.enabled === false) {
      return {
        allowed: false,
        reason: 'channel_disabled',
        preferencesEngineActive: true,
        category: input.category,
        channel
      };
    }

    if (resolveNotificationIntelRolloutFlags().diagnostics) {
      logNotifIntelLifecycle({
        phase: 'prefs_allow',
        extra: { userId: input.userId, category: input.category, channel }
      });
    }

    return {
      allowed: true,
      reason: 'allowed',
      preferencesEngineActive: true,
      category: input.category,
      channel
    };
  }

  /**
   * Parity probe: does legacy engagement logic allow this user+type?
   * Used for dual-run validation later; does not change production producers.
   */
  async evaluateLegacyEngagementParity(
    userId: string,
    engagementType: string
  ): Promise<{ allowed: boolean; source: 'legacy_settings' | 'defaults' }> {
    const settings = await loadUserSettingsRow(userId);
    return {
      allowed: legacyEngagementWouldAllow(settings, engagementType),
      source: settings ? 'legacy_settings' : 'defaults'
    };
  }

  /** List supported category keys (stable contract for FE later). */
  listCategories(): PreferenceCategoryKey[] {
    return [
      'messages',
      'mentions',
      'comments',
      'likes',
      'replies',
      'followers',
      'jobs',
      'marketplace',
      'communities',
      'companies',
      'system',
      'future'
    ];
  }

  isEngineActive() {
    return isPreferencesFeatureActive();
  }
}

export const notificationPreferenceService = new NotificationPreferenceService();
export { PreferenceValidationError };
