import api from './api';
import { ProjectBrief } from '../types';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const normalizeBrief = (brief: any): ProjectBrief => ({
  id: brief.id,
  user_id: brief.user_id ?? brief.userId ?? '',
  prompt: brief.prompt ?? brief.description ?? '',
  title: brief.title ?? '',
  category: brief.category ?? 'General',
  budget_range: brief.budget_range ?? brief.budgetRange ?? 'TBD',
  timeline: brief.timeline ?? '2-4 weeks',
  description: brief.description ?? '',
  required_skills: Array.isArray(brief.required_skills ?? brief.requiredSkills)
    ? (brief.required_skills ?? brief.requiredSkills)
    : [],
  screening_questions: Array.isArray(brief.screening_questions ?? brief.screeningQuestions)
    ? (brief.screening_questions ?? brief.screeningQuestions)
    : [],
  created_at: brief.created_at ?? brief.createdAt ?? new Date().toISOString(),
  updated_at: brief.updated_at ?? brief.updatedAt ?? new Date().toISOString()
});

export const BriefsService = {
  async listBriefs(): Promise<ProjectBrief[]> {
    const res = await api.get('/briefs');
    const data = extractData<ProjectBrief[]>(res);
    return Array.isArray(data) ? data.map(normalizeBrief) : [];
  },

  async generateBrief(prompt: string) {
    const res = await api.post('/briefs/generate', { prompt });
    const data = extractData<any>(res);
    return {
      title: data.title ?? '',
      category: data.category ?? 'General',
      budgetRange: data.budgetRange ?? data.budget_range ?? 'TBD',
      timeline: data.timeline ?? '2-4 weeks',
      description: data.description ?? '',
      requiredSkills: Array.isArray(data.requiredSkills ?? data.required_skills)
        ? (data.requiredSkills ?? data.required_skills)
        : [],
      screeningQuestions: Array.isArray(data.screeningQuestions ?? data.screening_questions)
        ? (data.screeningQuestions ?? data.screening_questions)
        : []
    };
  },

  async saveBrief(payload: Partial<ProjectBrief>): Promise<ProjectBrief> {
    const res = await api.post('/briefs', payload);
    return normalizeBrief(extractData<ProjectBrief>(res));
  },

  async useBrief(id: string): Promise<{ brief: ProjectBrief; jobDraft: any }> {
    const res = await api.post(`/briefs/${id}/use-to-create-job`);
    const data = extractData<any>(res);
    return {
      brief: normalizeBrief(data.brief),
      jobDraft: data.jobDraft || {}
    };
  }
};
