import api from './api';

export type MatchAccountType = 'FREELANCER' | 'CLIENT';
export type MatchTab = 'matches' | 'mutual';

export interface MatchFilters {
  skills?: string[];
  location?: string;
  remoteOnly?: boolean;
  experience?: string;
  availability?: string;
  minimumScore?: number;
}

export interface MatchPreferences {
  freelancer: { skills: string[]; locations: string[]; remoteOnly: boolean; minRate: number | null; maxRate: number | null; workTypes: string[] };
  client: { skills: string[]; locations: string[]; remoteOnly: boolean; minBudget: number | null; maxBudget: number | null; experience: string; workTypes: string[] };
}

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
  filters?: { enabled: boolean; applied: MatchFilters; resultCount: number };
  insights?: { enabled: boolean };
}

export interface ScrolithMatchConfig {
  enabled: boolean;
  filtersEnabled: boolean;
  insightsEnabled: boolean;
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

const getFeed = async (accountType: MatchAccountType, tab: MatchTab = 'matches', filters: MatchFilters = {}) => {
  const response = await api.get('/match', { params: { accountType, tab, ...filters, skills: filters.skills?.join(',') } });
  return unwrap<ScrolithMatchFeed>(response);
};

const getPreferences = async () => unwrap<MatchPreferences>(await api.get('/match/preferences'));
const updatePreferences = async (preferences: MatchPreferences) => unwrap<MatchPreferences>(await api.put('/match/preferences', preferences));

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
  unwrap<{ days: number; shown: number; interests: number; dismissals: number; mutualConnections: number; conversionRate: number; filtersUsed: number; insightsShown: number }>(
    await api.get('/admin/scrolith-match/analytics', { params: { days } })
  );

export const ScrolithMatchService = { getFeed, getPreferences, updatePreferences, postAction, createMutualConversation, getAdminConfig, updateAdminConfig, getAdminAnalytics };
