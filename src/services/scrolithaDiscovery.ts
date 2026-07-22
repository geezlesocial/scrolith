/**
 * Phase 33.2 — Discovery / recommendations / memory client.
 */
import api from './api';

const unwrap = <T>(res: any): T => {
  if (res?.data?.data !== undefined) return res.data.data as T;
  if (res?.data !== undefined) return res.data as T;
  return res as T;
};

export const ScrolithaDiscoveryService = {
  async getStatus() {
    const res = await api.get('/ai/discovery/status');
    return unwrap(res);
  },
  async scoreFeed(candidates: any[], useModelAssist = false) {
    const res = await api.post('/ai/discovery/feed-scores', { candidates, useModelAssist });
    return unwrap(res);
  },
  async getRecommendations(params?: { types?: string; limit?: number }) {
    const res = await api.get('/ai/discovery/recommendations', { params });
    return unwrap(res);
  },
  async getDashboard() {
    const res = await api.get('/ai/discovery/dashboard');
    return unwrap(res);
  },
  async feedback(body: {
    entityType: string;
    entityId: string;
    action: 'useful' | 'not_interested' | 'hide_similar';
    topic?: string;
    recommendationId?: string;
  }) {
    const res = await api.post('/ai/discovery/feedback', body);
    return unwrap(res);
  },
  async searchAssist(query: string, domain?: string) {
    const res = await api.post('/ai/discovery/search-assist', { query, domain });
    return unwrap(res);
  },
  async getMemory() {
    const res = await api.get('/ai/discovery/memory');
    return unwrap(res);
  },
  async updateMemory(partial: Record<string, unknown>) {
    const res = await api.patch('/ai/discovery/memory', partial);
    return unwrap(res);
  },
  async deleteMemory() {
    const res = await api.delete('/ai/discovery/memory');
    return unwrap(res);
  },
  async exportMemory() {
    const res = await api.get('/ai/discovery/memory/export');
    return unwrap(res);
  },
  async recordSignal(body: {
    type: string;
    topic?: string;
    entityId?: string;
    entityType?: string;
  }) {
    const res = await api.post('/ai/discovery/signals', body);
    return unwrap(res);
  },
  async adminAnalytics() {
    const res = await api.get('/admin/ai/discovery/analytics');
    return unwrap(res);
  }
};

export default ScrolithaDiscoveryService;
