/**
 * Preference validation helpers (Phase 10.3).
 */
import {
  ALL_PREFERENCE_CATEGORIES,
  ENGAGEMENT_TYPE_TO_CATEGORY,
  type PreferenceCategoryKey,
  type PreferenceEvaluationInput
} from './preference.types';

const CATEGORY_SET = new Set<string>(ALL_PREFERENCE_CATEGORIES);

export class PreferenceValidationError extends Error {
  statusCode = 400;
  code = 'PREFERENCE_VALIDATION_ERROR';

  constructor(message: string) {
    super(message);
    this.name = 'PreferenceValidationError';
  }
};

export const isPreferenceCategoryKey = (value: unknown): value is PreferenceCategoryKey =>
  CATEGORY_SET.has(String(value || ''));

export const normalizePreferenceCategory = (value: unknown): PreferenceCategoryKey => {
  const raw = String(value || '').trim().toLowerCase();
  if (isPreferenceCategoryKey(raw)) return raw;
  // aliases
  if (raw === 'reactions' || raw === 'likes_reactions') return 'likes';
  if (raw === 'follow' || raw === 'follows') return 'followers';
  if (raw === 'job' || raw === 'applications' || raw === 'proposals') return 'jobs';
  if (raw === 'message' || raw === 'messaging' || raw === 'dm') return 'messages';
  if (raw === 'mention') return 'mentions';
  if (raw === 'comment') return 'comments';
  if (raw === 'reply') return 'replies';
  if (raw === 'community' || raw === 'groups') return 'communities';
  if (raw === 'company' || raw === 'pages') return 'companies';
  if (raw === 'market' || raw === 'commerce' || raw === 'orders') return 'marketplace';
  throw new PreferenceValidationError(`Unknown preference category: ${value}`);
};

export const categoryFromLegacyEngagementType = (type: unknown): PreferenceCategoryKey | null => {
  const key = String(type || '').trim();
  if (!key) return null;
  return ENGAGEMENT_TYPE_TO_CATEGORY[key] || null;
};

export const validatePreferenceEvaluationInput = (
  input: PreferenceEvaluationInput
): PreferenceEvaluationInput => {
  const userId = String(input.userId || '').trim();
  if (!userId) throw new PreferenceValidationError('userId is required');

  let category: PreferenceCategoryKey;
  if (input.legacyEngagementType) {
    category =
      categoryFromLegacyEngagementType(input.legacyEngagementType) ||
      normalizePreferenceCategory(input.category);
  } else {
    category = normalizePreferenceCategory(input.category);
  }

  const channel = input.channel || 'inApp';
  if (!['inApp', 'email', 'push', 'digest'].includes(channel)) {
    throw new PreferenceValidationError(`Invalid channel: ${channel}`);
  }

  return {
    userId,
    category,
    channel,
    legacyEngagementType: input.legacyEngagementType || null
  };
};

export const validatePartialCategoryUpdate = (raw: unknown): Partial<Record<PreferenceCategoryKey, boolean>> => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new PreferenceValidationError('categories must be an object');
  }
  const out: Partial<Record<PreferenceCategoryKey, boolean>> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const cat = normalizePreferenceCategory(key);
    if (typeof value !== 'boolean') {
      throw new PreferenceValidationError(`Category ${cat} must be boolean`);
    }
    out[cat] = value;
  }
  return out;
};
