import api from './api';

export type GrowthAction = {
  id: string;
  title: string;
  caption: string;
  href: string;
  priority: number;
  category: string;
};

export type GrowthPulse = {
  version: string;
  generatedAt: string;
  roleContext: 'employer' | 'freelancer' | 'unknown' | string;
  feedIntent: string;
  insightsMode: string;
  personalizationEnabled: boolean;
  focusTopics: string[];
  postingGuidance: {
    bestWindowsLocal: string[];
    tip: string;
  };
  creator: {
    weeklyPostGoal: number;
    suggestedFormats: string[];
    audienceTip: string;
  };
  discovery: {
    headline: string;
    bullets: string[];
  };
  actions: GrowthAction[];
  scrolithaPrompts: Array<{ id: string; label: string; prompt: string; href: string }>;
};

const unwrap = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export const emptyGrowthPulse = (): GrowthPulse => ({
  version: '20.3.0',
  generatedAt: new Date().toISOString(),
  roleContext: 'unknown',
  feedIntent: 'for_you',
  insightsMode: 'growth',
  personalizationEnabled: true,
  focusTopics: [],
  postingGuidance: {
    bestWindowsLocal: ['Tue–Thu mornings', 'Weekday evenings'],
    tip: 'Post consistently and reply to early engagement.'
  },
  creator: {
    weeklyPostGoal: 3,
    suggestedFormats: ['Insight post', 'Case study', 'Scroll clip'],
    audienceTip: 'Lead with a concrete outcome.'
  },
  discovery: {
    headline: 'Grow your presence',
    bullets: ['Complete your profile', 'Engage daily', 'Ask Scrolitha for a plan']
  },
  actions: [],
  scrolithaPrompts: []
});

export const GrowthIntelligenceService = {
  async getPulse(): Promise<GrowthPulse> {
    try {
      return unwrap<GrowthPulse>(
        await api.get('/professional-discovery/growth-pulse', { timeout: 15000 })
      );
    } catch {
      return emptyGrowthPulse();
    }
  }
};
