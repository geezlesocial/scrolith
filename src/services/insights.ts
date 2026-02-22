import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export type FeedMode = 'growth' | 'opportunity' | 'network' | 'learning';

export type ProfessionalScore = {
  userId: string;
  score: number;
  breakdown: Record<string, any>;
  riskFlags: Record<string, any>;
  updatedAt: string;
};

class InsightsService {
  static async getMyPgs(): Promise<ProfessionalScore | null> {
    const response = await api.get('/insights/pgs/me');
    return extractData<ProfessionalScore | null>(response);
  }

  static async getMyAchievements(): Promise<any[]> {
    const response = await api.get('/insights/achievements/me');
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async getMyStreak(): Promise<any> {
    const response = await api.get('/insights/streak/me');
    return extractData<any>(response);
  }

  static async getLeaderboard(scope: 'global' | 'freelancer' | 'employer' = 'global'): Promise<any> {
    const response = await api.get(`/insights/leaderboard?scope=${encodeURIComponent(scope)}`);
    return extractData<any>(response);
  }

  static async getMatches(type: 'job' | 'gig' | 'all' = 'all'): Promise<any[]> {
    const query = type === 'all' ? '' : `?type=${encodeURIComponent(type)}`;
    const response = await api.get(`/insights/matches/me${query}`);
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async getRevenue(): Promise<any> {
    const response = await api.get('/insights/revenue/me');
    return extractData<any>(response);
  }

  static async getPostPrediction(postId: string, force = false): Promise<any> {
    const query = force ? '?force=true' : '';
    const response = await api.get(`/insights/post/${encodeURIComponent(postId)}/prediction${query}`);
    return extractData<any>(response);
  }

  static async generateSkillGap(): Promise<any> {
    const response = await api.post('/insights/skill-gap/generate', {});
    return extractData<any>(response);
  }

  static async getSkillGap(): Promise<any> {
    const response = await api.get('/insights/skill-gap/me');
    return extractData<any>(response);
  }

  static async setFeedMode(mode: FeedMode): Promise<any> {
    const response = await api.post('/insights/feed-mode', { mode });
    return extractData<any>(response);
  }

  static async getFeedMode(): Promise<{ mode: FeedMode }> {
    const response = await api.get('/insights/feed-mode');
    return extractData<{ mode: FeedMode }>(response);
  }

  static async getAdminConfig(): Promise<any> {
    const response = await api.get('/admin/insights/config');
    return extractData<any>(response);
  }

  static async updateAdminConfig(payload: any): Promise<any> {
    const response = await api.put('/admin/insights/config', payload);
    return extractData<any>(response);
  }

  static async recomputeUser(userId: string): Promise<any> {
    const response = await api.post(`/admin/insights/recompute/${encodeURIComponent(userId)}`, {});
    return extractData<any>(response);
  }

  static async recomputeAll(limit = 300): Promise<any> {
    const response = await api.post('/admin/insights/recompute-all', { limit });
    return extractData<any>(response);
  }

  static async getAdminAchievements(): Promise<any[]> {
    const response = await api.get('/admin/insights/achievements');
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async createAdminAchievement(payload: any): Promise<any> {
    const response = await api.post('/admin/insights/achievements', payload);
    return extractData<any>(response);
  }

  static async updateAdminAchievement(id: string, payload: any): Promise<any> {
    const response = await api.put(`/admin/insights/achievements/${encodeURIComponent(id)}`, payload);
    return extractData<any>(response);
  }

  static async toggleAdminAchievement(id: string): Promise<any> {
    const response = await api.post(`/admin/insights/achievements/${encodeURIComponent(id)}/toggle`, {});
    return extractData<any>(response);
  }

  static async getAdminLeaderboard(weekKey: string, scope: 'global' | 'freelancer' | 'employer' = 'global'): Promise<any> {
    const response = await api.get(
      `/admin/insights/leaderboard/${encodeURIComponent(weekKey)}?scope=${encodeURIComponent(scope)}`
    );
    return extractData<any>(response);
  }

  static async rebuildAdminLeaderboard(scopes: Array<'global' | 'freelancer' | 'employer'>): Promise<any> {
    const response = await api.post('/admin/insights/leaderboard/rebuild', { scopes });
    return extractData<any>(response);
  }
}

export { InsightsService };
