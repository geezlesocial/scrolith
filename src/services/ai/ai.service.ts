// src/services/ai/ai.service.ts
import apiClient from '../api';
import { getApiBaseUrl } from '../../utils/apiBase';
import type { AITagInput, AIProjectBriefInput, AIProjectBriefResponse, AIReplyInput, AISkillMatchInput } from './ai.types';

export type PostEnhanceMode = 'grammar' | 'rephrase' | 'professional' | 'shorten' | 'expand';

const hasBackendEnv = Boolean(
  import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_URL ||
    import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_MOBILE_API_URL ||
    import.meta.env.VITE_MOBILE_API_BASE_URL
);
if (import.meta.env.PROD && !hasBackendEnv) {
  throw new Error('VITE_BACKEND_URL (or VITE_API_URL) must be set when building for production');
}

const getPublicApiUrl = () => getApiBaseUrl();
const unwrap = (payload: any) => payload?.data?.data ?? payload?.data ?? payload;

const publicApi = {
  get: async (endpoint: string) => {
    const res = await fetch(`${getPublicApiUrl()}${endpoint}`);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
    }
    return res.json();
  },
  post: async (endpoint: string, data: any) => {
    const res = await fetch(`${getPublicApiUrl()}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
    }
    return res.json();
  }
};

const toWords = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length >= 3);

const unique = (items: string[]) => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = item.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const defaultProjectBrief = (prompt: string): AIProjectBriefResponse => {
  const words = unique(toWords(prompt)).slice(0, 6);
  return {
    title: prompt.trim().slice(0, 80) || 'New Project',
    category: 'General',
    budgetRange: 'TBD',
    timeline: '2-4 weeks',
    description: `Project overview:\n${prompt.trim()}\n\nDeliverables and milestones will be refined after kickoff.`,
    requiredSkills: words.length ? words : ['planning', 'communication'],
    screeningQuestions: [
      'Describe a similar project you have delivered.',
      'What approach would you take to deliver this on time?'
    ]
  };
};

const normalizeProjectBrief = (payload: any, prompt: string): AIProjectBriefResponse => {
  const fallback = defaultProjectBrief(prompt);
  return {
    title: payload?.title || fallback.title,
    category: payload?.category || fallback.category,
    budgetRange: payload?.budgetRange || payload?.budget_range || fallback.budgetRange,
    timeline: payload?.timeline || fallback.timeline,
    description: payload?.description || fallback.description,
    requiredSkills: Array.isArray(payload?.requiredSkills || payload?.required_skills)
      ? (payload.requiredSkills || payload.required_skills)
      : fallback.requiredSkills,
    screeningQuestions: Array.isArray(payload?.screeningQuestions || payload?.screening_questions)
      ? (payload.screeningQuestions || payload.screening_questions)
      : fallback.screeningQuestions
  };
};

const defaultReplySuggestion = (input: AIReplyInput) => {
  const latestOther = [...(input.history || [])].reverse().find((entry) => String(entry?.sender || '').toLowerCase() !== 'me');
  if (!latestOther?.text) return '';
  return `Thanks for the update. ${latestOther.text.slice(0, 120)}${latestOther.text.length > 120 ? '...' : ''}`;
};

const inferSkillMatch = (query: string) => {
  const q = query.toLowerCase();
  const categories: string[] = [];

  if (/(logo|branding|ui|ux|design|figma)/.test(q)) categories.push('Design');
  if (/(react|node|api|web|frontend|backend|fullstack|developer|typescript|javascript)/.test(q)) categories.push('Web Development');
  if (/(seo|content|ads|marketing|social)/.test(q)) categories.push('Digital Marketing');
  if (/(video|animation|editing|motion)/.test(q)) categories.push('Video & Animation');
  if (/(data|analysis|excel|dashboard|power bi|python)/.test(q)) categories.push('Data & Analytics');
  if (/(write|copy|blog|article)/.test(q)) categories.push('Writing & Translation');
  if (!categories.length) categories.push('General Freelance Services');

  const gigs = categories.slice(0, 3).map((category) => `${category} specialist for ${query}`);
  return {
    recommendedCategories: categories.slice(0, 4),
    suggestedGigs: gigs,
    pricingRange: '$100 - $500',
    nextActions: ['Create a gig', 'Add portfolio samples', 'Publish and share your profile']
  };
};

export const AIService = {
  getConfig: async () => {
    const data = unwrap(await publicApi.get('/ai/config'));
    return data || null;
  },

  answerQuestion: async (payload: { question: string; context?: string; audience?: string; format?: string }) => {
    const data = unwrap(await publicApi.post('/ai/answer', payload));
    return data;
  },

  generateGuide: async (payload: { topic: string; audience?: string; depth?: string; format?: string }) => {
    const data = unwrap(await publicApi.post('/ai/guide', payload));
    return data;
  },

  getTagSuggestions: async (input: AITagInput): Promise<{ tags: string[] }> => {
    try {
      const data = unwrap(await publicApi.post('/ai/tags', input));
      const tags = Array.isArray(data?.tags) ? data.tags : [];
      if (tags.length) return { tags };
    } catch {
      // Fall back to local extraction.
    }

    const fallbackTags = unique(
      toWords(`${input.title || ''} ${input.description || ''} ${input.category || ''}`)
    ).slice(0, input.maxTags || 5);
    return { tags: fallbackTags };
  },

  suggestReply: async (input: AIReplyInput): Promise<{ suggestion: string }> => {
    const endpoints = ['/ai/suggest-reply', '/ai/reply-suggestion'];
    for (const endpoint of endpoints) {
      try {
        const data = unwrap(await publicApi.post(endpoint, input));
        const suggestion = String(data?.suggestion || data?.reply || data?.text || '').trim();
        if (suggestion) return { suggestion };
      } catch {
        // Try next endpoint.
      }
    }
    return { suggestion: defaultReplySuggestion(input) };
  },

  generateProjectBrief: async (input: AIProjectBriefInput): Promise<AIProjectBriefResponse> => {
    const prompt = String(input?.prompt || '').trim();
    if (!prompt) throw new Error('Prompt is required');

    try {
      const res = await apiClient.post('/briefs/generate', { prompt });
      const data = unwrap(res);
      return normalizeProjectBrief(data, prompt);
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      if (status === 401) throw new Error('Please login to generate a project brief.');
      if (status === 403) throw new Error('Your role is not allowed to generate project briefs.');
      // Graceful fallback keeps UX stable if AI/brief endpoint is unavailable.
      return defaultProjectBrief(prompt);
    }
  },

  freelancerSkillMatch: async (input: AISkillMatchInput) => {
    const payload = { query: String(input?.query || '').trim(), userRole: input?.userRole };
    if (!payload.query) return inferSkillMatch('');

    const endpoints = ['/ai/freelancer-skill-match', '/ai/skill-match', '/ai/skills/match'];
    for (const endpoint of endpoints) {
      try {
        const data = unwrap(await publicApi.post(endpoint, payload));
        if (data && (Array.isArray(data.recommendedCategories) || Array.isArray(data.suggestedGigs))) {
          return data;
        }
      } catch {
        // Try next endpoint.
      }
    }
    return inferSkillMatch(payload.query);
  },

  matchTrendsToCategories: async (input: { trends: string[]; categories: { id: string; name: string }[] }) => {
    try {
      const res = unwrap(await publicApi.post('/ai/match-trends', input));
      return res || { categoryIds: [] };
    } catch {
      try {
        const res2 = unwrap(await publicApi.post('/ai/match/trends', input));
        return res2 || { categoryIds: [] };
      } catch (error) {
        console.warn('AI matchTrendsToCategories fallback: backend endpoints missing, returning empty result', error);
        return { categoryIds: [] };
      }
    }
  },

  enhancePostDraft: async (payload: { text: string; mode: PostEnhanceMode }): Promise<{ enhancedText: string }> => {
    const text = String(payload?.text || '').trim();
    if (!text) throw new Error('Text is required');

    const res = await apiClient.post('/ai/post-enhance', {
      text,
      mode: payload.mode
    });
    const data = unwrap(res);
    return {
      enhancedText: String(data?.enhancedText || '').trim()
    };
  },

  generatePostInsight: async (payload: { postId?: string; text?: string; force?: boolean }): Promise<{ insightText?: string; aiInsightText?: string; generated?: boolean; reason?: string | null }> => {
    const res = await apiClient.post('/ai/post-insight', payload || {});
    const data = unwrap(res);
    return {
      insightText: data?.insightText,
      aiInsightText: data?.aiInsightText,
      generated: data?.generated,
      reason: data?.reason ?? null
    };
  }
};

export default AIService;
