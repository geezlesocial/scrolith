/**
 * Phase 33.0 — Frontend client for Scrolitha AI foundation APIs.
 */
import api from './api';

export type AIConsentState = {
  aiFeaturesEnabled: boolean;
  privateMessageAnalysisAllowed: boolean;
  personalizationAllowed: boolean;
  externalProviderProcessingAllowed: boolean;
  aiSuggestionsAllowed: boolean;
  aiActivityHistoryEnabled: boolean;
  productImprovementDataAllowed: boolean;
  consentVersion: string;
  updatedAt?: string | null;
};

export type AIStatus = {
  platform: string;
  phase: string;
  masterEnabled: boolean;
  killSwitch: boolean;
  enableProviderCalls: boolean;
  capabilities: Array<{ id: string; enabled: boolean; availableToUser: boolean }>;
  consent: { aiFeaturesEnabled: boolean; consentVersion: string };
  disclosure: string;
  productionSafeDefaults: boolean;
};

const unwrap = <T>(res: any): T => {
  if (res?.data?.data !== undefined) return res.data.data as T;
  if (res?.data !== undefined) return res.data as T;
  return res as T;
};

export const ScrolithaAIService = {
  async getStatus(): Promise<AIStatus> {
    const res = await api.get('/ai/status');
    return unwrap(res);
  },

  async getPreferences(): Promise<AIConsentState> {
    const res = await api.get('/ai/preferences');
    return unwrap(res);
  },

  async updatePreferences(partial: Partial<AIConsentState>): Promise<AIConsentState> {
    const res = await api.patch('/ai/preferences', partial);
    return unwrap(res);
  },

  async resetPreferences(): Promise<AIConsentState> {
    const res = await api.post('/ai/preferences/reset');
    return unwrap(res);
  },

  async getUsage() {
    const res = await api.get('/ai/usage');
    return unwrap(res);
  },

  async getHistory(limit = 50) {
    const res = await api.get('/ai/history', { params: { limit } });
    return unwrap(res);
  },

  async deleteHistory() {
    const res = await api.delete('/ai/history');
    return unwrap(res);
  },

  async summarize(text: string, locale = 'en') {
    const res = await api.post('/ai/summarize', { text, locale });
    return unwrap(res);
  },

  async rewrite(text: string, locale = 'en') {
    const res = await api.post('/ai/rewrite', { text, locale });
    return unwrap(res);
  },

  // Admin
  async adminOverview() {
    const res = await api.get('/admin/ai/overview');
    return unwrap(res);
  },
  async adminProviders() {
    const res = await api.get('/admin/ai/providers');
    return unwrap(res);
  },
  async adminPutProvider(provider: string, body: Record<string, unknown>) {
    const res = await api.put(`/admin/ai/providers/${provider}`, body);
    return unwrap(res);
  },
  async adminTestProvider(provider: string) {
    const res = await api.post(`/admin/ai/providers/${provider}/test`);
    return unwrap(res);
  },
  async adminModels() {
    const res = await api.get('/admin/ai/models');
    return unwrap(res);
  },
  async adminPrompts() {
    const res = await api.get('/admin/ai/prompts');
    return unwrap(res);
  },
  async adminUsage() {
    const res = await api.get('/admin/ai/usage');
    return unwrap(res);
  },
  async adminHealth() {
    const res = await api.get('/admin/ai/health');
    return unwrap(res);
  },
  async adminAudit(limit = 50) {
    const res = await api.get('/admin/ai/audit', { params: { limit } });
    return unwrap(res);
  },
  async adminGetFlags() {
    const res = await api.get('/admin/ai/feature-flags');
    return unwrap(res);
  },
  async adminPutFlags(body: Record<string, unknown>, confirmRisk = false) {
    const res = await api.put('/admin/ai/feature-flags', body, {
      headers: confirmRisk ? { 'X-Confirm-AI-Risk': 'CONFIRM' } : {}
    });
    return unwrap(res);
  }
};

export default ScrolithaAIService;
