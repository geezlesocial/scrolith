/**
 * Thin client for /api/discovery-engine (fail-closed when flags off).
 */
import api from './api';

export type DiscoveryEngineRecommendRequest = {
  surface?: string;
  entityTypes?: string[];
  limit?: number;
  query?: string;
};

export type DiscoveryEngineItem = {
  id?: string;
  entityId?: string;
  entityType?: string;
  type?: string;
  title?: string;
  name?: string;
  subtitle?: string;
  description?: string;
  score?: number;
  url?: string;
  imageUrl?: string | null;
  reasons?: string[];
  meta?: Record<string, any>;
};

const unwrap = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const DiscoveryEngineService = {
  async recommend(payload: DiscoveryEngineRecommendRequest = {}): Promise<DiscoveryEngineItem[]> {
    try {
      const response = await api.post('/discovery-engine/recommend', payload, { timeout: 15000 });
      const data = unwrap<any>(response);
      if (Array.isArray(data)) return data;
      if (Array.isArray(data?.items)) return data.items;
      if (Array.isArray(data?.results)) return data.results;
      if (Array.isArray(data?.recommendations)) return data.recommendations;
      return [];
    } catch {
      // Master flag often OFF in production — fail closed.
      return [];
    }
  },

  async feedback(payload: {
    entityId: string;
    entityType?: string;
    action: string;
    surface?: string;
  }): Promise<boolean> {
    try {
      await api.post('/discovery-engine/feedback', payload, { timeout: 10000 });
      return true;
    } catch {
      return false;
    }
  }
};
