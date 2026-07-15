/**
 * Phase 8.0 — Unified discovery & recommendation contracts.
 * Provider-neutral; no private feature values in client payloads.
 */

export type DiscoveryEntityType =
  | 'post'
  | 'person'
  | 'company'
  | 'page'
  | 'community'
  | 'group'
  | 'job'
  | 'freelancer'
  | 'service'
  | 'product'
  | 'marketplace_listing'
  | 'event'
  | 'course'
  | 'project'
  | 'discussion';

export type DiscoverySurface =
  | 'member_home'
  | 'discovery'
  | 'who_to_follow'
  | 'jobs'
  | 'marketplace'
  | 'communities'
  | 'sidebar'
  | 'search_suggest'
  | 'onboarding'
  | 'global';

export type DiscoverySource =
  | 'followed_author'
  | 'connected_activity'
  | 'community_membership'
  | 'similar_interest'
  | 'trending'
  | 'quality_creator'
  | 'related_job'
  | 'related_freelancer'
  | 'related_service'
  | 'related_company'
  | 'related_community'
  | 'marketplace_relevance'
  | 'recent'
  | 'exploration'
  | 'cold_start'
  | 'collaborative'
  | 'content_based'
  | 'legacy_reco'
  | 'scrolitha_optional';

export type DiscoveryReasonCode =
  | 'shared_interest'
  | 'shared_community'
  | 'followed_similar'
  | 'trending_now'
  | 'high_quality'
  | 'fresh_content'
  | 'skills_match'
  | 'location_affinity'
  | 'popular_in_network'
  | 'new_for_you'
  | 'because_you_engaged'
  | 'exploration'
  | 'cold_start';

export type ScoreComponents = {
  interest: number;
  relationship: number;
  behavioral: number;
  quality: number;
  freshness: number;
  trending: number;
  content: number;
  collaborative: number;
  diversity: number;
  exploration: number;
  coldStart: number;
  penalty: number;
};

export type RecommendationCandidate = {
  entityType: DiscoveryEntityType;
  entityId: string;
  source: DiscoverySource;
  authorOrOwnerId?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
  /** Internal only — never sent to clients */
  baseFeatures?: Record<string, number | string | boolean | null>;
  eligibility?: { visible: boolean; reasons?: string[] };
  visibility?: string;
  metadata?: Record<string, unknown>;
  label?: string;
  summary?: string | null;
  hrefHint?: string | null;
  tags?: string[];
  category?: string | null;
};

export type RankedRecommendation = {
  entityType: DiscoveryEntityType;
  entityId: string;
  score: number;
  /** Internal diagnostics only when debug allowed */
  scoreComponents?: ScoreComponents;
  explanation: string;
  reasonCodes: DiscoveryReasonCode[];
  source: DiscoverySource;
  rank: number;
  trackingToken: string;
  generatedAt: string;
  label: string;
  summary?: string | null;
  hrefHint?: string | null;
  category?: string | null;
  authorOrOwnerId?: string | null;
};

export type DiscoveryRecommendationRequest = {
  viewerId: string | null;
  surface: DiscoverySurface;
  entityTypes?: DiscoveryEntityType[];
  cursor?: string | null;
  limit?: number;
  context?: {
    route?: string;
    topic?: string;
    region?: string;
    query?: string;
    seedEntityType?: DiscoveryEntityType;
    seedEntityId?: string;
  };
  exclusions?: Array<{ entityType: DiscoveryEntityType; entityId: string }>;
  sessionId?: string | null;
  requestId?: string | null;
  includeDebug?: boolean;
};

export type DiscoveryRecommendationResponse = {
  items: RankedRecommendation[];
  nextCursor: string | null;
  requestId: string;
  modelVersion: string;
  generatedAt: string;
  fallbackUsed: boolean;
  surface: DiscoverySurface;
  diagnostics?: {
    generatorCounts: Record<string, number>;
    filteredCount: number;
    scoredCount: number;
    latencyMs: number;
    generatorsFailed: string[];
  };
};

export type DiscoveryFeedbackAction =
  | 'impression'
  | 'click'
  | 'save'
  | 'share'
  | 'hide'
  | 'not_interested'
  | 'dismiss'
  | 'report'
  | 'follow'
  | 'apply'
  | 'inquire';

export type DiscoveryFeedbackInput = {
  viewerId: string;
  surface: DiscoverySurface;
  entityType: DiscoveryEntityType;
  entityId: string;
  action: DiscoveryFeedbackAction;
  trackingToken?: string | null;
  metadata?: Record<string, unknown>;
};

export type ViewerInterestProfile = {
  viewerId: string | null;
  skills: string[];
  topics: string[];
  communities: string[];
  categories: string[];
  locations: string[];
  negativeTokens: string[];
  explicitWeight: number;
  implicitWeight: number;
  coldStart: boolean;
  personalizationAllowed: boolean;
};

export const DISCOVERY_MODEL_VERSION = 'discovery-engine-v8.0.0';

export const ALL_ENTITY_TYPES: DiscoveryEntityType[] = [
  'post',
  'person',
  'company',
  'page',
  'community',
  'group',
  'job',
  'freelancer',
  'service',
  'product',
  'marketplace_listing',
  'event',
  'course',
  'project',
  'discussion'
];

export const emptyScoreComponents = (): ScoreComponents => ({
  interest: 0,
  relationship: 0,
  behavioral: 0,
  quality: 0,
  freshness: 0,
  trending: 0,
  content: 0,
  collaborative: 0,
  diversity: 0,
  exploration: 0,
  coldStart: 0,
  penalty: 0
});
