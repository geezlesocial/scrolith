import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export type TopicSummary = {
  id: string;
  slug: string;
  label: string;
  kind?: string;
  followerCount?: number;
  usageCount?: number;
  createdAt?: string;
};

export class TopicsService {
  static async listTopics(params?: { query?: string; kind?: string; limit?: number }): Promise<{ items: TopicSummary[] }> {
    const search = new URLSearchParams();
    if (params?.query) search.set('query', params.query);
    if (params?.kind) search.set('kind', params.kind);
    if (params?.limit !== undefined) search.set('limit', String(params.limit));
    const response = await api.get(`/topics${search.toString() ? `?${search.toString()}` : ''}`);
    return extractData<{ items: TopicSummary[] }>(response);
  }

  static async listMyTopicFollows(): Promise<TopicSummary[]> {
    const response = await api.get('/topics/follows/me');
    return extractData<TopicSummary[]>(response);
  }

  static async followTopic(topicId: string, payload?: { label?: string; kind?: string }): Promise<any> {
    const response = await api.post(`/topics/${encodeURIComponent(topicId)}/follow`, payload || {});
    return extractData<any>(response);
  }

  static async unfollowTopic(topicId: string): Promise<any> {
    const response = await api.delete(`/topics/${encodeURIComponent(topicId)}/follow`);
    return extractData<any>(response);
  }
}
