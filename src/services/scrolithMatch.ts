import api from './api';

export type MatchAccountType = 'FREELANCER' | 'CLIENT';
export type MatchTab = 'matches' | 'mutual';

export interface ScrolithMatchItem {
  id: string;
  name: string;
  username?: string | null;
  avatar?: string | null;
  profilePhotoFileId?: string | null;
  title: string;
  bio: string;
  location: string;
  skills: string[];
  accountType: MatchAccountType;
  matchScore: number;
  reasons: string[];
  interaction: 'INTERESTED' | 'DISMISSED' | null;
  mutual: boolean;
  href: string;
}

export interface ScrolithMatchFeed {
  enabled: boolean;
  accountType: MatchAccountType;
  items: ScrolithMatchItem[];
  mutual: ScrolithMatchItem[];
  reason?: string;
  limits: { dailyInterestLimit: number; interestsUsed: number };
}

export interface ScrolithMatchConfig {
  enabled: boolean;
  minimumScore: number;
  maxCandidates: number;
  dailyInterestLimit: number;
  dismissCooldownDays: number;
  weights: {
    skills: number;
    experience: number;
    location: number;
    completeness: number;
    activity: number;
  };
  updatedAt?: string;
}

const unwrap = <T>(response: any): T => response?.data?.data ?? response?.data ?? response;

const getFeed = async (accountType: MatchAccountType, tab: MatchTab = 'matches') => {
  const response = await api.get('/match', { params: { accountType, tab } });
  return unwrap<ScrolithMatchFeed>(response);
};

const postAction = async (path: 'interest' | 'dismiss', targetId: string, accountType: MatchAccountType) => {
  const response = await api.post(`/match/${path}`, { targetId, accountType });
  return unwrap<{ targetId: string; action: string; mutual: boolean }>(response);
};

const createMutualConversation = async (targetId: string) => {
  const response = await api.post('/match/conversation', { targetId });
  return unwrap<{ id: string }>(response);
};

const getAdminConfig = async () => unwrap<ScrolithMatchConfig>(await api.get('/admin/scrolith-match'));
const updateAdminConfig = async (config: Partial<ScrolithMatchConfig>) =>
  unwrap<ScrolithMatchConfig>(await api.put('/admin/scrolith-match', config));
const getAdminAnalytics = async (days = 30) =>
  unwrap<{ days: number; shown: number; interests: number; dismissals: number; mutualConnections: number; conversionRate: number }>(
    await api.get('/admin/scrolith-match/analytics', { params: { days } })
  );

export const ScrolithMatchService = { getFeed, postAction, createMutualConversation, getAdminConfig, updateAdminConfig, getAdminAnalytics };
