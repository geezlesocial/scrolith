import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export type PipelineItem = {
  id: string;
  userId: string;
  entityType: string;
  entityId: string;
  sourceSurface?: string;
  note?: string | null;
  meta?: Record<string, any> | null;
  createdAt: string;
};

export class PipelineService {
  static async getMine(params?: { entityType?: string; limit?: number }): Promise<{ items: PipelineItem[] }> {
    const search = new URLSearchParams();
    if (params?.entityType) search.set('entityType', params.entityType);
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    const response = await api.get(`/pipeline/me${search.toString() ? `?${search.toString()}` : ''}`);
    return extractData<{ items: PipelineItem[] }>(response);
  }

  static async save(payload: {
    entityType: string;
    entityId: string;
    sourceSurface?: string;
    note?: string;
    meta?: Record<string, any>;
  }): Promise<{ saved: boolean; item: PipelineItem }> {
    const response = await api.post('/pipeline/save', payload);
    return extractData<{ saved: boolean; item: PipelineItem }>(response);
  }

  static async remove(entityType: string, entityId: string): Promise<{ saved: boolean; entityType: string; entityId: string }> {
    const response = await api.delete(`/pipeline/${encodeURIComponent(entityType)}/${encodeURIComponent(entityId)}`);
    return extractData<{ saved: boolean; entityType: string; entityId: string }>(response);
  }
}
