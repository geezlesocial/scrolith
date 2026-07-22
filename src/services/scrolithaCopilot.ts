/**
 * Phase 33.3 — Platform Copilot client.
 */
import api from './api';

const unwrap = <T>(res: any): T => {
  if (res?.data?.data !== undefined) return res.data.data as T;
  if (res?.data !== undefined) return res.data as T;
  return res as T;
};

export type CopilotSurface =
  | 'feed'
  | 'jobs'
  | 'marketplace'
  | 'communities'
  | 'messaging'
  | 'profiles'
  | 'business_pages'
  | 'recruiting'
  | 'freelancing'
  | 'administration'
  | 'notifications'
  | 'search'
  | 'generic';

export const ScrolithaCopilotService = {
  async getStatus() {
    const res = await api.get('/ai/copilot/status');
    return unwrap(res);
  },
  async ask(body: {
    message: string;
    surface: CopilotSurface;
    pagePath?: string;
    entityId?: string;
    entityType?: string;
    includeTools?: boolean;
    locale?: string;
  }) {
    const res = await api.post('/ai/copilot', body);
    return unwrap(res);
  },
  async listSkills() {
    const res = await api.get('/ai/skills');
    return unwrap(res);
  },
  async runSkills(message: string, surface: CopilotSurface) {
    const res = await api.post('/ai/skills/run', { message, surface });
    return unwrap(res);
  },
  async detectIntent(text: string) {
    const res = await api.post('/ai/intent', { text });
    return unwrap(res);
  },
  async orchestrate(message: string, args?: Record<string, unknown>) {
    const res = await api.post('/ai/orchestrate', { message, args });
    return unwrap(res);
  }
};

export default ScrolithaCopilotService;
