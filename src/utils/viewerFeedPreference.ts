/**
 * Phase 19.1 — frontend viewer feed preference mapping.
 * Aligns Insights feed-focus modes with Member Home / member-feed intents.
 * Read-only normalization over existing Insights feed-mode API (no new store).
 */

export type InsightsFeedMode = 'growth' | 'opportunity' | 'network' | 'learning';
export type MemberFeedIntent = 'for_you' | 'following' | 'hire' | 'sell' | 'learn' | 'local';

export const PREFERENCE_MAPPING_VERSION = '19.1.0';

const INSIGHTS_MODES = new Set<InsightsFeedMode>(['growth', 'opportunity', 'network', 'learning']);
const FEED_INTENTS = new Set<MemberFeedIntent>(['for_you', 'following', 'hire', 'sell', 'learn', 'local']);

export type ViewerRoleContext = 'employer' | 'freelancer' | 'unknown';

export type NormalizedViewerFeedPreference = {
  feedIntent: MemberFeedIntent;
  insightsMode: InsightsFeedMode;
  source: 'insights' | 'member_home' | 'default';
  personalizationEnabled: boolean;
  version: string;
  mapped: {
    insightsMode: InsightsFeedMode;
    memberFeedIntent: MemberFeedIntent;
  };
};

export const normalizeInsightsFeedMode = (
  value: unknown,
  fallback: InsightsFeedMode = 'growth'
): InsightsFeedMode => {
  const raw = String(value || '')
    .trim()
    .toLowerCase() as InsightsFeedMode;
  return INSIGHTS_MODES.has(raw) ? raw : fallback;
};

export const normalizeMemberFeedIntent = (
  value: unknown,
  fallback: MemberFeedIntent = 'for_you'
): MemberFeedIntent => {
  const raw = String(value || '')
    .trim()
    .toLowerCase() as MemberFeedIntent;
  return FEED_INTENTS.has(raw) ? raw : fallback;
};

export const resolveViewerRoleContext = (roleLike: unknown): ViewerRoleContext => {
  const role = String(roleLike || '')
    .trim()
    .toLowerCase();
  if (role.includes('employ') || role.includes('client') || role.includes('hir') || role === 'company') {
    return 'employer';
  }
  if (role.includes('freelance') || role.includes('creator') || role.includes('seller') || role.includes('talent')) {
    return 'freelancer';
  }
  return 'unknown';
};

export const mapInsightsModeToFeedIntent = (
  insightsModeInput: unknown,
  roleLike?: unknown
): MemberFeedIntent => {
  const insightsMode = normalizeInsightsFeedMode(insightsModeInput, 'growth');
  const role = resolveViewerRoleContext(roleLike);
  switch (insightsMode) {
    case 'growth':
      return 'for_you';
    case 'opportunity':
      return role === 'freelancer' ? 'sell' : 'hire';
    case 'network':
      return 'following';
    case 'learning':
      return 'learn';
    default:
      return 'for_you';
  }
};

export const mapFeedIntentToInsightsMode = (feedIntentInput: unknown): InsightsFeedMode => {
  const intent = normalizeMemberFeedIntent(feedIntentInput, 'for_you');
  switch (intent) {
    case 'for_you':
      return 'growth';
    case 'following':
      return 'network';
    case 'hire':
    case 'sell':
      return 'opportunity';
    case 'learn':
      return 'learning';
    case 'local':
      return 'growth';
    default:
      return 'growth';
  }
};

export const buildNormalizedViewerFeedPreference = (input: {
  insightsMode?: unknown;
  feedIntent?: unknown;
  roleLike?: unknown;
  source?: 'insights' | 'member_home' | 'default';
  personalizationEnabled?: boolean;
}): NormalizedViewerFeedPreference => {
  const personalizationEnabled = input.personalizationEnabled !== false;
  if (!personalizationEnabled) {
    return {
      feedIntent: 'for_you',
      insightsMode: 'growth',
      source: input.source || 'default',
      personalizationEnabled: false,
      version: PREFERENCE_MAPPING_VERSION,
      mapped: { insightsMode: 'growth', memberFeedIntent: 'for_you' }
    };
  }

  let feedIntent: MemberFeedIntent;
  let insightsMode: InsightsFeedMode;
  let source: 'insights' | 'member_home' | 'default' = input.source || 'default';

  if (input.feedIntent != null && String(input.feedIntent).trim()) {
    feedIntent = normalizeMemberFeedIntent(input.feedIntent, 'for_you');
    insightsMode = mapFeedIntentToInsightsMode(feedIntent);
    source = input.source || 'member_home';
  } else if (input.insightsMode != null && String(input.insightsMode).trim()) {
    insightsMode = normalizeInsightsFeedMode(input.insightsMode, 'growth');
    feedIntent = mapInsightsModeToFeedIntent(insightsMode, input.roleLike);
    source = input.source || 'insights';
  } else {
    feedIntent = 'for_you';
    insightsMode = 'growth';
    source = 'default';
  }

  return {
    feedIntent,
    insightsMode,
    source,
    personalizationEnabled: true,
    version: PREFERENCE_MAPPING_VERSION,
    mapped: { insightsMode, memberFeedIntent: feedIntent }
  };
};
