// src/services/ai/ai.service.ts
const _hasBackendEnv = Boolean(
  import.meta.env.VITE_BACKEND_URL || import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL
);
if (import.meta.env.PROD && !_hasBackendEnv) {
  throw new Error('VITE_BACKEND_URL (or VITE_API_URL) must be set when building for production');
}

const API_URL =
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.VITE_BACKEND_URL ? `${String(import.meta.env.VITE_BACKEND_URL).replace(/\/$/, '')}/api` : '') ||
  '/api';

const unwrap = (payload: any) => payload?.data?.data ?? payload?.data ?? payload;

const api = {
  get: async (endpoint: string) => {
    const res = await fetch(`${API_URL}${endpoint}`);
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`HTTP ${res.status}: ${errorText || res.statusText}`);
    }
    return res.json();
  },
  post: async (endpoint: string, data: any) => {
    const res = await fetch(`${API_URL}${endpoint}`, {
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

export const AIService = {
  getConfig: async () => {
    const data = unwrap(await api.get('/ai/config'));
    return data || null;
  },
  answerQuestion: async (payload: { question: string; context?: string; audience?: string; format?: string }) => {
    const data = unwrap(await api.post('/ai/answer', payload));
    return data;
  },
  generateGuide: async (payload: { topic: string; audience?: string; depth?: string; format?: string }) => {
    const data = unwrap(await api.post('/ai/guide', payload));
    return data;
  }
  ,
  matchTrendsToCategories: async (input: { trends: string[]; categories: { id: string; name: string }[] }) => {
    // Try backend AI matching endpoint(s) first, fall back to a safe empty response
    try {
      const res = unwrap(await api.post('/ai/match-trends', input));
      return res || { categoryIds: [] };
    } catch (e) {
      try {
        // Alternative path used in some deployments
        const res2 = unwrap(await api.post('/ai/match/trends', input));
        return res2 || { categoryIds: [] };
      } catch (e2) {
        console.warn('AI matchTrendsToCategories fallback: backend endpoints missing, returning empty result', e2);
        return { categoryIds: [] };
      }
    }
  }
};

export default AIService;
