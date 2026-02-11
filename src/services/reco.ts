import api from './api';

type RecoEntityType = 'freelancer' | 'client' | 'page';
type RecoSurface = 'member_home' | 'who_to_follow' | 'search_suggest' | 'directory';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

class RecoService {
  static async getAccounts(params: {
    surface: RecoSurface;
    type: RecoEntityType;
    limit?: number;
    query?: string;
    debug?: boolean;
  }): Promise<any[]> {
    const search = new URLSearchParams();
    search.set('surface', params.surface);
    search.set('type', params.type);
    if (typeof params.limit === 'number') search.set('limit', String(params.limit));
    if (params.query) search.set('query', params.query);
    if (params.debug) search.set('debug', 'true');

    const response = await api.get(`/reco/accounts?${search.toString()}`);
    const payload = extractData<any>(response);
    if (Array.isArray(payload?.items)) return payload.items;
    return [];
  }

  static async submitFeedback(payload: {
    surface: RecoSurface;
    entityType: RecoEntityType;
    entityId: string;
    action: 'click' | 'follow' | 'dismiss' | 'hide' | 'report';
    metadata?: Record<string, any>;
  }): Promise<any> {
    const response = await api.post('/reco/feedback', payload);
    return extractData<any>(response);
  }

  static async getAdminConfig(params?: { surface?: RecoSurface; entityType?: RecoEntityType }): Promise<any> {
    const search = new URLSearchParams();
    if (params?.surface) search.set('surface', params.surface);
    if (params?.entityType) search.set('entityType', params.entityType);
    const endpoint = `/admin/reco/config${search.toString() ? `?${search.toString()}` : ''}`;
    const response = await api.get(endpoint);
    return extractData<any>(response);
  }

  static async updateAdminConfig(payload: any): Promise<any> {
    const response = await api.put('/admin/reco/config', payload);
    return extractData<any>(response);
  }

  static async listAdminRules(params?: {
    surface?: RecoSurface;
    entityType?: RecoEntityType;
    action?: string;
    includeInactive?: boolean;
  }): Promise<any[]> {
    const search = new URLSearchParams();
    if (params?.surface) search.set('surface', params.surface);
    if (params?.entityType) search.set('entityType', params.entityType);
    if (params?.action) search.set('action', params.action);
    if (typeof params?.includeInactive === 'boolean') {
      search.set('includeInactive', String(params.includeInactive));
    }
    const endpoint = `/admin/reco/rules${search.toString() ? `?${search.toString()}` : ''}`;
    const response = await api.get(endpoint);
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async createAdminRule(payload: any): Promise<any> {
    const response = await api.post('/admin/reco/rules', payload);
    return extractData<any>(response);
  }

  static async updateAdminRule(id: string, payload: any): Promise<any> {
    const response = await api.put(`/admin/reco/rules/${encodeURIComponent(id)}`, payload);
    return extractData<any>(response);
  }

  static async deleteAdminRule(id: string): Promise<any> {
    const response = await api.delete(`/admin/reco/rules/${encodeURIComponent(id)}`);
    return extractData<any>(response);
  }

  static async getAdminAudit(params: {
    viewerId: string;
    entityId: string;
    entityType: RecoEntityType;
    surface: RecoSurface;
  }): Promise<any> {
    const search = new URLSearchParams();
    search.set('viewerId', params.viewerId);
    search.set('entityId', params.entityId);
    search.set('entityType', params.entityType);
    search.set('surface', params.surface);
    const response = await api.get(`/admin/reco/audit?${search.toString()}`);
    return extractData<any>(response);
  }

  static async getAdminAnalytics(days = 30): Promise<any> {
    const response = await api.get(`/admin/reco/analytics?days=${Math.max(1, Math.floor(days))}`);
    return extractData<any>(response);
  }
}

export { RecoService };
