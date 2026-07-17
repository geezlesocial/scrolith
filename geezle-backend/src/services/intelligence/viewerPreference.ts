/**
 * Phase 19.1 — unified viewer feed preference mapping.
 * Maps Insights feed-focus modes ↔ Member Home feed intents without schema changes.
 * Read-only normalization over existing feedModePreference store.
 */
import type { FeedSurfaceMode } from '../opportunityGraph.service';
import { normalizeFeedSurfaceMode, FEED_SURFACE_MODES } from '../opportunityGraph.service';

export const PREFERENCE_MAPPING_VERSION = '19.1.0';

export type InsightsFeedMode = 'growth' | 'opportunity' | 'network' | 'learning';

export const INSIGHTS_FEED_MODES: readonly InsightsFeedMode[] = [
  'growth',
  'opportunity',
  'network',
  'learning'
] as const;

export type ViewerRoleContext = 'employer' | 'freelancer' | 'unknown';

export type NormalizedViewerFeedPreference = {
  /** Canonical member-feed intent used by orchestrator. */
  feedIntent: FeedSurfaceMode;
  /** Source Insights mode when known. */
  insightsMode: InsightsFeedMode;
  /** Which surface last expressed the preference. */
  source: 'insights' | 'member_home' | 'default';
  personalizationEnabled: boolean;
  version: string;
  mapped: {
    insightsMode: InsightsFeedMode;
    memberFeedIntent: FeedSurfaceMode;
  };
};

export const normalizeInsightsFeedMode = (
  value: unknown,
  fallback: InsightsFeedMode = 'growth'
): InsightsFeedMode => {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if ((INSIGHTS_FEED_MODES as readonly string[]).includes(raw)) {
    return raw as InsightsFeedMode;
  }
  return fallback;
};

export const resolveViewerRoleContext = (roleLike: unknown): ViewerRoleContext => {
  const role = String(roleLike || '')
    .trim()
    .toLowerCase();
  if (
    role.includes('employ') ||
    role.includes('client') ||
    role.includes('hir') ||
    role === 'company' ||
    role === 'business'
  ) {
    return 'employer';
  }
  if (
    role.includes('freelance') ||
    role.includes('creator') ||
    role.includes('seller') ||
    role.includes('talent') ||
    role === 'worker'
  ) {
    return 'freelancer';
  }
  return 'unknown';
};

/**
 * Insights mode → member-feed intent.
 * opportunity uses role: employer→hire, freelancer→sell, unknown→hire (conservative hiring discovery).
 * network maps to following when supported, else for_you.
 */
export const mapInsightsModeToFeedIntent = (
  insightsModeInput: unknown,
  roleLike?: unknown
): FeedSurfaceMode => {
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

/**
 * Member-feed intent → Insights mode (surface vocabulary).
 * local is specialized feed intent; Insights has no local mode → growth.
 * following → network; hire/sell → opportunity.
 */
export const mapFeedIntentToInsightsMode = (feedIntentInput: unknown): InsightsFeedMode => {
  const intent = normalizeFeedSurfaceMode(feedIntentInput, 'for_you');
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

  let feedIntent: FeedSurfaceMode;
  let insightsMode: InsightsFeedMode;
  let source: 'insights' | 'member_home' | 'default' = input.source || 'default';

  if (input.feedIntent != null && String(input.feedIntent).trim()) {
    feedIntent = normalizeFeedSurfaceMode(input.feedIntent, 'for_you');
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

  // Guard unsupported values
  if (!(FEED_SURFACE_MODES as readonly string[]).includes(feedIntent)) {
    feedIntent = 'for_you';
  }

  return {
    feedIntent,
    insightsMode,
    source,
    personalizationEnabled: true,
    version: PREFERENCE_MAPPING_VERSION,
    mapped: {
      insightsMode,
      memberFeedIntent: feedIntent
    }
  };
};
