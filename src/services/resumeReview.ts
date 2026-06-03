import api from './api';

export type ResumeAnalysis = {
  id: string;
  jobTitle?: string | null;
  jobDescription: string;
  requiredSkills?: string[];
  preferredSkills?: string[];
  seniorityLevel?: string | null;
  sourceType: string;
  sourceFileName?: string | null;
  profileUrl?: string | null;
  extractedText?: string | null;
  normalizedCandidate?: any;
  analysisResult?: any;
  overallScore?: number | null;
  roleFitScore?: number | null;
  status: string;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
};

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;
const RESUME_REVIEW_TIMEOUT_MS = 120000;

const resolveDashboardRoleScope = () => {
  if (typeof window === 'undefined') return '';
  try {
    const url = new URL(window.location.href);
    const queryRole = String(url.searchParams.get('as') || url.searchParams.get('role') || '').trim().toLowerCase();
    if (queryRole) return queryRole;
  } catch {
    // ignore URL parsing failures
  }

  try {
    return String(sessionStorage.getItem('activeRole') || '').trim().toLowerCase();
  } catch {
    return '';
  }
};

const normalizeReviewScope = (scope?: string) => {
  const normalized = String(scope || '').trim().toLowerCase();
  if (normalized === 'client' || normalized === 'buyer' || normalized === 'employer') return 'employer';
  if (normalized === 'freelancer' || normalized === 'seller' || normalized === 'user') return 'freelancer';
  return '';
};

const getReviewRequestConfig = (scopeOverride?: string) => {
  const scope = normalizeReviewScope(scopeOverride) || resolveDashboardRoleScope();
  return {
    timeout: RESUME_REVIEW_TIMEOUT_MS,
    ...(scope
      ? {
          params: { as: scope },
          headers: { 'X-Scrolith-Dashboard-Role': scope }
        }
      : {})
  };
};

export const ResumeReviewService = {
  async list(scopeOverride?: string) {
    return unwrap<ResumeAnalysis[]>(await api.get('/client/resume-reviews', getReviewRequestConfig(scopeOverride)));
  },

  async upload(file: File, payload: any, scopeOverride?: string) {
    const form = new FormData();
    form.append('file', file);
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        form.append(key, value.join(','));
      } else if (value !== undefined && value !== null) {
        form.append(key, String(value));
      }
    });
    return unwrap<ResumeAnalysis>(await api.post('/client/resume-reviews/upload', form, getReviewRequestConfig(scopeOverride)));
  },

  async analyzeProfileUrl(payload: any, scopeOverride?: string) {
    return unwrap<ResumeAnalysis>(await api.post('/client/resume-reviews/profile-url', payload, getReviewRequestConfig(scopeOverride)));
  },

  async get(id: string, scopeOverride?: string) {
    return unwrap<ResumeAnalysis>(await api.get(`/client/resume-reviews/${id}`, getReviewRequestConfig(scopeOverride)));
  },

  async remove(id: string, scopeOverride?: string) {
    return unwrap<{ deleted: boolean }>(await api.delete(`/client/resume-reviews/${id}`, getReviewRequestConfig(scopeOverride)));
  }
};
