/**
 * Phase 33.1 — Frontend client for Scrolitha AI Assistant APIs.
 */
import api from './api';

const unwrap = <T>(res: any): T => {
  if (res?.data?.data !== undefined) return res.data.data as T;
  if (res?.data !== undefined) return res.data as T;
  return res as T;
};

export type AssistantResult = {
  ok: boolean;
  blocked?: boolean;
  reason?: string;
  text?: string;
  disclosure?: {
    generatedByAI: boolean;
    provider: string;
    model: string;
    promptVersion: string;
    generatedAt: string;
    notice?: string;
  };
  conversationId?: string | null;
  messageId?: string | null;
  correlationId?: string;
  latencyMs?: number;
  mode?: string;
  domain?: string;
  suggestions?: string[];
  detectedLanguage?: string | null;
  draftOnly: true;
  autoPublished: false;
};

export const ScrolithaAssistantService = {
  async getStatus() {
    const res = await api.get('/ai/assistant/status');
    return unwrap(res);
  },
  async chat(body: { message: string; conversationId?: string | null; locale?: string }) {
    const res = await api.post('/ai/assistant/chat', body);
    return unwrap<AssistantResult>(res);
  },
  async rewrite(body: { text: string; mode: string; locale?: string }) {
    const res = await api.post('/ai/assistant/rewrite', body);
    return unwrap<AssistantResult>(res);
  },
  async composer(body: { text: string; mode: string; surface?: string; locale?: string }) {
    // Profile editing is interactive. Keep this request below the global
    // client timeout so a slow model cannot hold the editor hostage.
    const res = await api.post('/ai/assistant/composer', body, { timeout: 10000 });
    return unwrap<AssistantResult>(res);
  },
  async translate(body: { text: string; targetLocale: string; sourceLocale?: string }) {
    const res = await api.post('/ai/assistant/translate', body);
    return unwrap<AssistantResult>(res);
  },
  async draft(body: { kind: string; topic: string; extra?: string; locale?: string }) {
    const res = await api.post('/ai/assistant/draft', body);
    return unwrap<AssistantResult>(res);
  },
  async searchSuggest(body: { domain: string; query: string; locale?: string }) {
    const res = await api.post('/ai/assistant/search-suggest', body);
    return unwrap<AssistantResult>(res);
  },
  async notificationAssist(body: { action: string; items: any[]; locale?: string }) {
    const res = await api.post('/ai/assistant/notifications', body);
    return unwrap(res);
  },
  async listConversations(q?: string) {
    const res = await api.get('/ai/assistant/conversations', { params: { q } });
    return unwrap(res);
  },
  async createConversation(title?: string) {
    const res = await api.post('/ai/assistant/conversations', { title });
    return unwrap(res);
  },
  async getConversation(id: string) {
    const res = await api.get(`/ai/assistant/conversations/${id}`);
    return unwrap(res);
  },
  async patchConversation(id: string, body: { title?: string; pinned?: boolean; archived?: boolean }) {
    const res = await api.patch(`/ai/assistant/conversations/${id}`, body);
    return unwrap(res);
  },
  async deleteConversation(id: string) {
    const res = await api.delete(`/ai/assistant/conversations/${id}`);
    return unwrap(res);
  },
  async clearConversations() {
    const res = await api.delete('/ai/assistant/conversations');
    return unwrap(res);
  },
  async exportConversations() {
    const res = await api.get('/ai/assistant/export');
    return unwrap(res);
  },
  async listPrompts(params?: { category?: string; q?: string }) {
    const res = await api.get('/ai/assistant/prompts', { params });
    return unwrap(res);
  },
  async usePrompt(id: string, body: { topic: string; conversationId?: string; locale?: string }) {
    const res = await api.post(`/ai/assistant/prompts/${id}/use`, body);
    return unwrap<AssistantResult>(res);
  },
  async feedback(body: {
    rating: 'helpful' | 'not_helpful';
    comment?: string;
    capability?: string;
    correlationId?: string;
    conversationId?: string;
    messageId?: string;
  }) {
    const res = await api.post('/ai/assistant/feedback', body);
    return unwrap(res);
  }
};

export default ScrolithaAssistantService;
