import api from './api';
import { DealFlowSettings, ProjectBrief } from '../types';
import { normalizeDealFlowSettings } from '../utils/dealFlow';

const BRIEFS_AI_TIMEOUT_MS = 95_000;

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
  updated_at: brief.updated_at ?? brief.updatedAt ?? new Date().toISOString(),
  conversation_id: brief.conversation_id ?? brief.conversationId ?? undefined,
  conversationId: brief.conversationId ?? brief.conversation_id ?? undefined,
  template_id: brief.template_id ?? brief.templateId ?? undefined,
  templateId: brief.templateId ?? brief.template_id ?? undefined,
  participant_summary: Array.isArray(brief.participant_summary ?? brief.participantSummary)
    ? (brief.participant_summary ?? brief.participantSummary)
    : [],
  participantSummary: Array.isArray(brief.participantSummary ?? brief.participant_summary)
    ? (brief.participantSummary ?? brief.participant_summary)
    : [],
  source_messages: Array.isArray(brief.source_messages ?? brief.sourceMessages)
    ? (brief.source_messages ?? brief.sourceMessages)
    : [],
  sourceMessages: Array.isArray(brief.sourceMessages ?? brief.source_messages)
    ? (brief.sourceMessages ?? brief.source_messages)
    : [],
  linked_job_id: brief.linked_job_id ?? brief.linkedJobId ?? null,
  linkedJobId: brief.linkedJobId ?? brief.linked_job_id ?? null,
  linked_proposals: Array.isArray(brief.linked_proposals ?? brief.linkedProposals)
    ? (brief.linked_proposals ?? brief.linkedProposals)
    : [],
  linkedProposals: Array.isArray(brief.linkedProposals ?? brief.linked_proposals)
    ? (brief.linkedProposals ?? brief.linked_proposals)
    : [],
  linked_contract: brief.linked_contract ?? brief.linkedContract ?? null,
  linkedContract: brief.linkedContract ?? brief.linked_contract ?? null,
  history: Array.isArray(brief.history) ? brief.history : []
});

export const BriefsService = {
  async listBriefs(): Promise<ProjectBrief[]> {
    const res = await api.get('/briefs');
    const data = extractData<ProjectBrief[]>(res);
    return Array.isArray(data) ? data.map(normalizeBrief) : [];
  },

  async getConfig(): Promise<DealFlowSettings> {
    const res = await api.get('/briefs/config');
    return normalizeDealFlowSettings(extractData<any>(res));
  },

  async getBrief(id: string): Promise<ProjectBrief> {
    const res = await api.get(`/briefs/${id}`);
    return normalizeBrief(extractData<ProjectBrief>(res));
  },

  async generateBrief(prompt: string) {
    const res = await api.post('/briefs/generate', { prompt }, { timeout: BRIEFS_AI_TIMEOUT_MS });
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

  async draftFromConversation(payload: {
    conversationId: string;
    templateId?: string;
    category?: string;
  }): Promise<ProjectBrief> {
    const res = await api.post('/briefs/from-conversation/draft', payload);
    return normalizeBrief(extractData<ProjectBrief>(res));
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
