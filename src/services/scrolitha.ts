import api from './api';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

export type ScrolithaSuggestedAction = {
  actionId: string;
  actionKey: string;
  toolKey: string;
  summary: string;
  requiresConfirmation: boolean;
  paramsPreview?: Record<string, any>;
  tool?: {
    endpoint: string;
    method: string;
  };
};

export type ScrolithaChatResponse = {
  conversationId: string | null;
  reply: string;
  suggestedActions: ScrolithaSuggestedAction[];
  needsConfirmation: boolean;
  draftChanges?: Record<string, any> | null;
};

export type ScrolithaWidgetConfig = {
  enabled: boolean;
  assistantName: string;
  assistantRoleLabel: string;
  textColor: string;
  accentColor: string;
  agentBubbleColor: string;
  userBubbleColor: string;
  logoUrl: string;
  logoFileId: string;
  welcomeText: string;
  typingText: string;
};

export class ScrolithaService {
  static async chat(payload: {
    message: string;
    context?: { page?: string; entityId?: string };
    conversationId?: string;
  }): Promise<ScrolithaChatResponse> {
    const response = await api.post('/scrolitha/chat', payload);
    return extractData<ScrolithaChatResponse>(response);
  }

  static async execute(payload: {
    actionId: string;
    confirmed: boolean;
    params?: Record<string, any>;
  }): Promise<any> {
    const response = await api.post('/scrolitha/execute', payload);
    return extractData<any>(response);
  }

  static async adminChat(payload: {
    message: string;
    context?: { page?: string; entityId?: string };
    conversationId?: string;
  }): Promise<ScrolithaChatResponse> {
    const response = await api.post('/admin/scrolitha/chat', payload);
    return extractData<ScrolithaChatResponse>(response);
  }

  static async adminExecute(payload: {
    actionId: string;
    confirmed: boolean;
    params?: Record<string, any>;
  }): Promise<any> {
    const response = await api.post('/admin/scrolitha/execute', payload);
    return extractData<any>(response);
  }

  static async history(limit = 20): Promise<any[]> {
    const response = await api.get(`/scrolitha/history?limit=${Math.max(1, Math.floor(limit))}`);
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async feedback(payload: {
    conversationId: string;
    rating: number;
    note?: string;
  }): Promise<any> {
    const response = await api.post('/scrolitha/feedback', payload);
    return extractData<any>(response);
  }

  static async adminGetConfig(scope?: 'user' | 'admin'): Promise<any> {
    const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    const response = await api.get(`/admin/scrolitha/config${query}`);
    return extractData<any>(response);
  }

  static async adminUpdateConfig(payload: any): Promise<any> {
    const response = await api.put('/admin/scrolitha/config', payload);
    return extractData<any>(response);
  }

  static async adminGetSkills(includeInactive = true): Promise<any[]> {
    const response = await api.get(`/admin/scrolitha/skills?includeInactive=${String(includeInactive)}`);
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async adminCreateSkill(payload: any): Promise<any> {
    const response = await api.post('/admin/scrolitha/skills', payload);
    return extractData<any>(response);
  }

  static async adminUpdateSkill(id: string, payload: any): Promise<any> {
    const response = await api.put(`/admin/scrolitha/skills/${encodeURIComponent(id)}`, payload);
    return extractData<any>(response);
  }

  static async adminDeleteSkill(id: string): Promise<any> {
    const response = await api.delete(`/admin/scrolitha/skills/${encodeURIComponent(id)}`);
    return extractData<any>(response);
  }

  static async adminGetAudit(payload?: {
    cursor?: string;
    limit?: number;
    scope?: string;
    actorId?: string;
  }): Promise<{ items: any[]; nextCursor?: string | null }> {
    const params = new URLSearchParams();
    if (payload?.cursor) params.set('cursor', payload.cursor);
    if (payload?.scope) params.set('scope', payload.scope);
    if (payload?.actorId) params.set('actorId', payload.actorId);
    if (typeof payload?.limit === 'number') params.set('limit', String(Math.max(1, Math.floor(payload.limit))));
    const query = params.toString();
    const response = await api.get(`/admin/scrolitha/audit${query ? `?${query}` : ''}`);
    const data = extractData<any>(response);
    return {
      items: Array.isArray(data?.items) ? data.items : [],
      nextCursor: data?.nextCursor || null
    };
  }

  static async adminGetAnalytics(): Promise<any> {
    const response = await api.get('/admin/scrolitha/analytics');
    return extractData<any>(response);
  }

  static async adminGetTools(): Promise<any[]> {
    const response = await api.get('/admin/scrolitha/tools');
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async getWidgetConfig(): Promise<ScrolithaWidgetConfig> {
    const response = await api.get('/scrolitha/widget-config');
    return extractData<ScrolithaWidgetConfig>(response);
  }

  static async adminGetChatRecords(payload?: {
    limit?: number;
    userId?: string;
    scope?: 'user' | 'admin';
    conversationId?: string;
  }): Promise<{ items: any[] }> {
    const params = new URLSearchParams();
    if (typeof payload?.limit === 'number') params.set('limit', String(Math.max(1, Math.floor(payload.limit))));
    if (payload?.userId) params.set('userId', payload.userId);
    if (payload?.scope) params.set('scope', payload.scope);
    if (payload?.conversationId) params.set('conversationId', payload.conversationId);
    const query = params.toString();
    const response = await api.get(`/admin/scrolitha/chat-records${query ? `?${query}` : ''}`);
    const data = extractData<any>(response);
    return {
      items: Array.isArray(data?.items) ? data.items : []
    };
  }
}

export default ScrolithaService;
