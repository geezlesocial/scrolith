import api from './api';

export type HiringRecommendationAccountType = 'FREELANCER' | 'CLIENT';

export type HiringRecommendation = {
  eligible: boolean;
  accountType: HiringRecommendationAccountType;
  recommendation: 'AVAILABLE_FOR_HIRE' | 'WE_ARE_HIRING';
  title: string;
  description: string;
  ctaLabel: string;
  secondaryLabel: string;
  delaySeconds: number;
  reason?: string;
  signals?: Record<string, boolean | number>;
};

const extractData = <T>(response: any): T => response?.data?.data !== undefined ? response.data.data as T : response?.data as T;

const sessionKey = () => {
  if (typeof window === 'undefined') return null;
  try {
    const key = 'scrolith:hiring-recommendation:session';
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return null;
  }
};

class HiringRecommendationsService {
  static async get(accountType: HiringRecommendationAccountType): Promise<HiringRecommendation | null> {
    const response = await api.get('/recommendations/hiring', { params: { accountType, sessionKey: sessionKey() } });
    return extractData<HiringRecommendation | null>(response);
  }

  static async impression(accountType: HiringRecommendationAccountType) {
    const response = await api.post('/recommendations/hiring/impression', { accountType, sessionKey: sessionKey() });
    return extractData<any>(response);
  }

  static async dismiss(accountType: HiringRecommendationAccountType) {
    const response = await api.post('/recommendations/hiring/dismiss', { accountType });
    return extractData<any>(response);
  }

  static async snooze(accountType: HiringRecommendationAccountType) {
    const response = await api.post('/recommendations/hiring/snooze', { accountType });
    return extractData<any>(response);
  }

  static async click(accountType: HiringRecommendationAccountType) {
    const response = await api.post('/recommendations/hiring/click', { accountType });
    return extractData<any>(response);
  }

  static async getAdminConfig() {
    const response = await api.get('/admin/hiring-recommendations');
    return extractData<any>(response);
  }

  static async updateAdminConfig(config: any) {
    const response = await api.put('/admin/hiring-recommendations', config);
    return extractData<any>(response);
  }

  static async resetAdminConfig() {
    const response = await api.post('/admin/hiring-recommendations/reset');
    return extractData<any>(response);
  }

  static async setAdminEnabled(enabled: boolean) {
    const response = await api.post(`/admin/hiring-recommendations/${enabled ? 'enable' : 'disable'}`);
    return extractData<any>(response);
  }

  static async getAdminAnalytics(days = 30) {
    const response = await api.get(`/admin/hiring-recommendations/analytics?days=${Math.max(1, Math.floor(days))}`);
    return extractData<any>(response);
  }
}

export { HiringRecommendationsService };
