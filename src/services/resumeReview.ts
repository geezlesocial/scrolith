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

export const ResumeReviewService = {
  async list() {
    return unwrap<ResumeAnalysis[]>(await api.get('/client/resume-reviews'));
  },

  async upload(file: File, payload: any) {
    const form = new FormData();
    form.append('file', file);
    Object.entries(payload || {}).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        form.append(key, value.join(','));
      } else if (value !== undefined && value !== null) {
        form.append(key, String(value));
      }
    });
    return unwrap<ResumeAnalysis>(await api.post('/client/resume-reviews/upload', form));
  },

  async analyzeProfileUrl(payload: any) {
    return unwrap<ResumeAnalysis>(await api.post('/client/resume-reviews/profile-url', payload));
  },

  async get(id: string) {
    return unwrap<ResumeAnalysis>(await api.get(`/client/resume-reviews/${id}`));
  },

  async remove(id: string) {
    return unwrap<{ deleted: boolean }>(await api.delete(`/client/resume-reviews/${id}`));
  }
};
