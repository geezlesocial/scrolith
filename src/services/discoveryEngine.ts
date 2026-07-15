/**
 * Enterprise discovery recommendation client (Phase 8.0).
 * Surfaces stay empty/hidden unless backend DISCOVERY_ENGINE_* flags permit.
 */
import api from './api';

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

export type RankedRecommendation = {
  entityType: DiscoveryEntityType;
  entityId: string;
  score: number;
  explanation: string;
  reasonCodes: string[];
  source: string;
  rank: number;
  trackingToken: string;
  generatedAt: string;
  label: string;
  summary?: string | null;
  hrefHint?: string | null;
  category?: string | null;
};

export type DiscoveryRecommendationResponse = {
  items: RankedRecommendation[];
  nextCursor: string | null;
  requestId: string;
  modelVersion: string;
  generatedAt: string;
  fallbackUsed: boolean;
  surface: DiscoverySurface;
};

const extractData = <T>(response: any): T => {
  const body = response?.data;
  if (body && typeof body === 'object' && 'data' in body) return body.data as T;
  return body as T;
};

export class DiscoveryEngineService {
  static async recommend(payload: {
    surface?: DiscoverySurface;
    entityTypes?: DiscoveryEntityType[];
    limit?: number;
    cursor?: string | null;
    query?: string;
    topic?: string;
    region?: string;
  }): Promise<DiscoveryRecommendationResponse> {
    const response = await api.post('/discovery-engine/recommend', {
      surface: payload.surface || 'discovery',
      entityTypes: payload.entityTypes,
      limit: payload.limit ?? 12,
      cursor: payload.cursor || null,
      context: {
        query: payload.query,
        topic: payload.topic,
        region: payload.region
      }
    });
    return extractData<DiscoveryRecommendationResponse>(response);
  }

  static async feedback(payload: {
    surface?: DiscoverySurface;
    entityType: DiscoveryEntityType | string;
    entityId: string;
    action: string;
    trackingToken?: string | null;
    metadata?: Record<string, unknown>;
  }): Promise<{ ok?: boolean; skipped?: boolean }> {
    const response = await api.post('/discovery-engine/feedback', {
      surface: payload.surface || 'discovery',
      entityType: payload.entityType,
      entityId: payload.entityId,
      action: payload.action,
      trackingToken: payload.trackingToken,
      metadata: payload.metadata
    });
    return extractData(response);
  }
}

export default DiscoveryEngineService;
