import api from './api';

export type ResumeProfileSource = {
  name: string;
  title: string;
  bio: string;
  skills: string[];
  services: any[];
  portfolio: any[];
  education: any[];
  certifications: any[];
  workHistory: any[];
  location: string;
  profilePhotoUrl: string;
  links: Array<{ label: string; url: string }>;
};

export type ResumeDocument = {
  id: string;
  title: string;
  targetRole?: string | null;
  targetIndustry?: string | null;
  template: string;
  includePhoto: boolean;
  photoUrl?: string | null;
  status: string;
  sourceSnapshot?: ResumeProfileSource;
  editableData?: any;
  aiOutput?: any;
  pdfUrl?: string | null;
  createdAt: string;
  updatedAt: string;
  versions?: any[];
};

const unwrap = <T>(response: { data: { data: T } }) => response.data.data;
const RESUME_REQUEST_TIMEOUT_MS = 120000;

export const ResumeService = {
  async getProfileSource() {
    return unwrap<ResumeProfileSource>(await api.get('/freelancer/resumes/profile-source'));
  },

  async list() {
    return unwrap<ResumeDocument[]>(await api.get('/freelancer/resumes'));
  },

  async generate(payload: any) {
    return unwrap<ResumeDocument>(
      await api.post('/freelancer/resumes/generate', payload, { timeout: RESUME_REQUEST_TIMEOUT_MS })
    );
  },

  async update(id: string, payload: any) {
    return unwrap<ResumeDocument>(await api.patch(`/freelancer/resumes/${id}`, payload));
  },

  async regenerate(id: string, payload: any) {
    return unwrap<ResumeDocument>(
      await api.post(`/freelancer/resumes/${id}/regenerate`, payload, { timeout: RESUME_REQUEST_TIMEOUT_MS })
    );
  },

  async renderPdf(id: string) {
    return unwrap<{ resume: ResumeDocument; pdfStorageKey: string; fileName: string }>(
      await api.post(`/freelancer/resumes/${id}/render-pdf`, undefined, { timeout: RESUME_REQUEST_TIMEOUT_MS })
    );
  },

  async downloadPdf(id: string) {
    return api.get(`/freelancer/resumes/${id}/download`, {
      responseType: 'blob',
      timeout: RESUME_REQUEST_TIMEOUT_MS
    });
  },

  async remove(id: string) {
    return unwrap<{ deleted: boolean }>(await api.delete(`/freelancer/resumes/${id}`));
  }
};
