import api from './api';

const SCROLITHA_CHAT_TIMEOUT_MS = 95_000;
const SCROLITHA_EXECUTE_TIMEOUT_MS = 95_000;
const SCROLITHA_ADMIN_LLM_TIMEOUT_MS = 240_000;

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const normalizeRewriteResponse = (payload: any) => {
  const rewrittenText = String(
    payload?.rewrittenText ||
      payload?.enhancedText ||
      payload?.rewrite ||
      payload?.text ||
      payload?.reply ||
      ''
  ).trim();

  return {
    ...(payload && typeof payload === 'object' ? payload : {}),
    rewrittenText,
    enhancedText: rewrittenText,
    rewrite: rewrittenText,
    text: rewrittenText || String(payload?.text || '').trim()
  };
};

export type ScrolithaSuggestedAction = {
  actionId: string;
  actionKey: string;
  toolKey: string;
  summary: string;
  requiresConfirmation: boolean;
  paramsPreview?: Record<string, any>;
  agent?: {
    mode: 'skill';
    skillId?: string | null;
    skillKey: string;
    skillName?: string | null;
    stepCount: number;
    executableStepCount: number;
    steps: Array<{
      index: number;
      type: string;
      mode: 'fetch' | 'preview' | 'execute' | 'confirm' | 'other';
      toolKey?: string | null;
      summary: string;
      requiresConfirmation: boolean;
    }>;
  } | null;
  tool?: {
    endpoint: string;
    method: string;
  };
};

export type ScrolithaRewriteMode = 'grammar' | 'rephrase' | 'professional' | 'shorten' | 'expand';

export type ScrolithaChatResponse = {
  conversationId: string | null;
  reply: string;
  suggestedActions: ScrolithaSuggestedAction[];
  needsConfirmation: boolean;
  responseMode?: 'llm' | 'fallback' | 'blocked';
  followUpPrompts?: string[];
  knowledgeHighlights?: string[];
  draftChanges?: Record<string, any> | null;
  learning?: {
    totalInteractions: number;
    topTopics: Array<{ topic: string; count: number }>;
    lastGoal?: string | null;
    updatedAt?: string;
  } | null;
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
  placeholderText?: string;
  emptyStateText?: string;
  offlineMessage?: string;
  disclaimerText?: string;
  starterPrompts?: string[];
  guestStarterPrompts?: string[];
  allowVoiceInput?: boolean;
  allowFileUpload?: boolean;
  showStatusBadge?: boolean;
  maxHistoryItems?: number;
};

export type ScrolithaChatContext = {
  page?: string;
  entityId?: string;
  surface?: string;
  accountType?: string;
  userName?: string;
  userRole?: string;
  userId?: string;
  locale?: string;
  source?: string;
  route?: string;
  [key: string]: unknown;
};

export class ScrolithaService {
  static async chat(payload: {
    message: string;
    context?: ScrolithaChatContext;
    conversationId?: string;
  }): Promise<ScrolithaChatResponse> {
    const response = await api.post('/scrolitha/chat', payload, { timeout: SCROLITHA_CHAT_TIMEOUT_MS });
    return extractData<ScrolithaChatResponse>(response);
  }

  static async execute(payload: {
    actionId: string;
    confirmed: boolean;
    params?: Record<string, any>;
  }): Promise<any> {
    const response = await api.post('/scrolitha/execute', payload, { timeout: SCROLITHA_EXECUTE_TIMEOUT_MS });
    return extractData<any>(response);
  }

  static async rewrite(payload: {
    text: string;
    tone?: string;
    goal?: string;
    scope?: string;
    mode?: ScrolithaRewriteMode;
  }): Promise<any> {
    const response = await api.post('/scrolitha/rewrite', payload, { timeout: SCROLITHA_EXECUTE_TIMEOUT_MS });
    return normalizeRewriteResponse(extractData<any>(response));
  }

  static async hashtags(payload: { text: string; scope?: string; limit?: number }): Promise<any> {
    const response = await api.post('/scrolitha/hashtags', payload, { timeout: SCROLITHA_EXECUTE_TIMEOUT_MS });
    return extractData<any>(response);
  }

  static async commentSuggestions(payload: { text: string; scope?: string; limit?: number }): Promise<any> {
    const response = await api.post('/scrolitha/comment-suggestions', payload, {
      timeout: SCROLITHA_EXECUTE_TIMEOUT_MS
    });
    return extractData<any>(response);
  }

  static async proposalDraft(payload: { text: string; context?: Record<string, any> }): Promise<any> {
    const response = await api.post('/scrolitha/proposal-draft', payload, {
      timeout: SCROLITHA_EXECUTE_TIMEOUT_MS
    });
    return extractData<any>(response);
  }

  static async gigImprove(payload: { text: string; context?: Record<string, any> }): Promise<any> {
    const response = await api.post('/scrolitha/gig-improve', payload, { timeout: SCROLITHA_EXECUTE_TIMEOUT_MS });
    return extractData<any>(response);
  }

  static async jobImprove(payload: { text: string; context?: Record<string, any> }): Promise<any> {
    const response = await api.post('/scrolitha/job-improve', payload, { timeout: SCROLITHA_EXECUTE_TIMEOUT_MS });
    return extractData<any>(response);
  }

  static async toxicityCheck(payload: { text: string; scope?: string }): Promise<any> {
    const response = await api.post('/scrolitha/toxicity-check', payload, { timeout: SCROLITHA_EXECUTE_TIMEOUT_MS });
    return extractData<any>(response);
  }

  static async adminChat(payload: {
    message: string;
    context?: { page?: string; entityId?: string };
    conversationId?: string;
  }): Promise<ScrolithaChatResponse> {
    const response = await api.post('/admin/scrolitha/chat', payload, { timeout: SCROLITHA_CHAT_TIMEOUT_MS });
    return extractData<ScrolithaChatResponse>(response);
  }

  static async adminExecute(payload: {
    actionId: string;
    confirmed: boolean;
    params?: Record<string, any>;
  }): Promise<any> {
    const response = await api.post('/admin/scrolitha/execute', payload, { timeout: SCROLITHA_EXECUTE_TIMEOUT_MS });
    return extractData<any>(response);
  }

  static async history(limit = 20): Promise<any[]> {
    const response = await api.get(`/scrolitha/history?limit=${Math.max(1, Math.floor(limit))}`);
    const data = extractData<any>(response);
    return Array.isArray(data) ? data : [];
  }

  static async records(payload?: {
    limit?: number;
    conversationId?: string;
  }): Promise<{ total: number; items: any[] }> {
    const params = new URLSearchParams();
    if (typeof payload?.limit === 'number') params.set('limit', String(Math.max(1, Math.floor(payload.limit))));
    if (payload?.conversationId) params.set('conversationId', payload.conversationId);
    const query = params.toString();
    const response = await api.get(`/scrolitha/records${query ? `?${query}` : ''}`);
    const data = extractData<any>(response);
    return {
      total: Number(data?.total || 0),
      items: Array.isArray(data?.items) ? data.items : []
    };
  }

  static async knowledge(message?: string): Promise<any> {
    const query = message ? `?message=${encodeURIComponent(message)}` : '';
    const response = await api.get(`/scrolitha/knowledge${query}`);
    return extractData<any>(response);
  }

  static async feedback(payload: {
    conversationId: string;
    rating: number;
    note?: string;
  }): Promise<any> {
    const response = await api.post('/scrolitha/feedback', payload);
    return extractData<any>(response);
  }

  static async platformIdentity(): Promise<{
    id: string;
    username: string;
    name: string;
    avatar: string | null;
    isVerified: boolean;
    isScrolitha: boolean;
    systemLabel: string;
    disclosure: string;
    capabilities?: string[];
    limitations?: string[];
    featureFlags?: { enabled?: boolean; proactiveSuggestions?: boolean };
  }> {
    const response = await api.get('/scrolitha/platform-identity');
    return extractData<any>(response);
  }

  static async contextualAsk(payload: {
    postId: string;
    question: string;
    commentId?: string | null;
  }): Promise<{
    commentId: string;
    postId: string;
    status: string;
    message?: string;
    platformUserId?: string;
  }> {
    const response = await api.post('/scrolitha/contextual/ask', payload, {
      timeout: SCROLITHA_EXECUTE_TIMEOUT_MS
    });
    return extractData<any>(response);
  }

  static async contextualStatus(payload: {
    postId: string;
    commentId: string;
  }): Promise<{ requestId: string; status: string; responseCommentId?: string | null }> {
    const params = new URLSearchParams({
      postId: payload.postId,
      commentId: payload.commentId
    });
    const response = await api.get(`/scrolitha/contextual/status?${params.toString()}`);
    return extractData<any>(response);
  }

  static async contextualRetry(payload: {
    postId: string;
    commentId: string;
  }): Promise<{ postId: string; commentId: string; status: string }> {
    const response = await api.post('/scrolitha/contextual/retry', payload, {
      timeout: SCROLITHA_EXECUTE_TIMEOUT_MS
    });
    return extractData<any>(response);
  }

  static async contextualSuggestions(postId: string): Promise<{ suggestions: string[] }> {
    const response = await api.get(
      `/scrolitha/contextual/suggestions?postId=${encodeURIComponent(postId)}`
    );
    const data = extractData<any>(response);
    return {
      suggestions: Array.isArray(data?.suggestions) ? data.suggestions.map(String) : []
    };
  }

  static async intelligenceAsk(payload: {
    question: string;
    surface?: string;
    entityType?: string;
    entityId?: string;
    postId?: string;
    sessionId?: string;
    includeModeration?: boolean;
  }): Promise<{
    requestId: string;
    answer: string;
    intent: string;
    mode: string;
    classification: string;
    confidence: number;
    sources: string[];
    suggestedFollowUps: string[];
    recommendations: string[];
    sessionKey: string;
    disclosure: string;
    diagnostics?: Record<string, unknown>;
    moderation?: {
      summary?: string;
      autoActionTaken?: boolean;
      disclosure?: string;
      signals?: Array<{ signal: string; confidence: number; rationale: string; suggestedAction: string }>;
    } | null;
    confidenceBand?: string;
    confidenceLabel?: string;
    explanation?: {
      summary?: string;
      basis?: Array<{ label: string; detail?: string }>;
      skillsUsed?: string[];
      confidence?: { band: string; label: string; score: number };
      caveats?: string[];
    };
    explanationText?: string;
    workflow?: { workflowId?: string; pipeline?: string[]; skills?: string[] };
  }> {
    const response = await api.post('/scrolitha/intelligence/ask', payload, {
      timeout: SCROLITHA_CHAT_TIMEOUT_MS,
      headers: payload.sessionId ? { 'x-scrolitha-session': payload.sessionId } : undefined
    });
    return extractData<any>(response);
  }

  static async intelligenceDismiss(payload: {
    sessionKey: string;
    suggestionKey: string;
  }): Promise<{ sessionKey: string; dismissedSuggestionKeys: string[] }> {
    const response = await api.post('/scrolitha/intelligence/dismiss', payload);
    return extractData<any>(response);
  }

  static async moderationAssist(payload: {
    postId?: string;
    commentId?: string;
    postContent?: string;
    commentContent?: string;
    allowMemberPreview?: boolean;
  }): Promise<any> {
    const response = await api.post('/scrolitha/moderation/assist', payload, {
      timeout: SCROLITHA_EXECUTE_TIMEOUT_MS
    });
    return extractData<any>(response);
  }

  static async intelligenceSkills(): Promise<{ skills: Array<{ id: string; name: string; description: string }> }> {
    const response = await api.get('/scrolitha/intelligence/skills');
    return extractData<any>(response);
  }

  static async intelligenceNetworkStatus(): Promise<any> {
    const response = await api.get('/scrolitha/intelligence/network-status');
    return extractData<any>(response);
  }

  static async osBootstrap(payload: {
    page?: Record<string, unknown>;
    sessionId?: string;
    viewport?: string;
    activity?: string;
    questionHint?: string;
  }): Promise<any> {
    const response = await api.post('/scrolitha/os/bootstrap', payload, {
      timeout: SCROLITHA_EXECUTE_TIMEOUT_MS,
      headers: payload.sessionId ? { 'x-scrolitha-session': payload.sessionId } : undefined
    });
    return extractData<any>(response);
  }

  static async osAsk(
    payload: {
      question?: string;
      page?: Record<string, unknown>;
      sessionId?: string;
      viewport?: string;
      activity?: string;
      actionCardId?: string;
      includeModeration?: boolean;
      requestId?: string;
    },
    options?: { signal?: AbortSignal }
  ): Promise<any> {
    const response = await api.post('/scrolitha/os/ask', payload, {
      timeout: SCROLITHA_CHAT_TIMEOUT_MS,
      signal: options?.signal,
      headers: payload.sessionId ? { 'x-scrolitha-session': payload.sessionId } : undefined
    });
    return extractData<any>(response);
  }

  static async osCancel(requestId: string): Promise<{ cancelled: boolean }> {
    const response = await api.post('/scrolitha/os/cancel', { requestId });
    return extractData<any>(response);
  }

  static async deepSearch(payload: {
    query: string;
    limit?: number;
    intent?: string;
    mode?: string;
  }): Promise<any> {
    const response = await api.post('/scrolitha/intelligence/search', payload, {
      timeout: SCROLITHA_EXECUTE_TIMEOUT_MS
    });
    return extractData<any>(response);
  }

  static async intelligenceDiagnostics(): Promise<any> {
    const response = await api.get('/scrolitha/intelligence/diagnostics');
    return extractData<any>(response);
  }

  static async intelligenceHealth(): Promise<any> {
    const response = await api.get('/scrolitha/intelligence/health');
    return extractData<any>(response);
  }

  static async intelligenceRollout(): Promise<any> {
    const response = await api.get('/scrolitha/intelligence/rollout');
    return extractData<any>(response);
  }

  static async adminGetConfig(scope?: 'user' | 'admin'): Promise<any> {
    const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    const response = await api.get(`/admin/scrolitha/config${query}`);
    return extractData<any>(response);
  }

  static async adminGetSettings(): Promise<any> {
    const response = await api.get('/admin/scrolitha/settings');
    return extractData<any>(response);
  }

  static async adminGetHealth(scope?: 'user' | 'admin'): Promise<any> {
    const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    const response = await api.get(`/admin/scrolitha/health${query}`, { timeout: SCROLITHA_ADMIN_LLM_TIMEOUT_MS });
    return extractData<any>(response);
  }

  static async adminGetModels(scope?: 'user' | 'admin'): Promise<any> {
    const query = scope ? `?scope=${encodeURIComponent(scope)}` : '';
    const response = await api.get(`/admin/scrolitha/models${query}`, { timeout: SCROLITHA_ADMIN_LLM_TIMEOUT_MS });
    return extractData<any>(response);
  }

  static async adminUpdateConfig(payload: any): Promise<any> {
    const response = await api.put('/admin/scrolitha/config', payload);
    return extractData<any>(response);
  }

  static async adminUpdateSettings(payload: any): Promise<any> {
    const response = await api.put('/admin/scrolitha/settings', payload);
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

  static async adminGetLogs(payload?: {
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
    const response = await api.get(`/admin/scrolitha/logs${query ? `?${query}` : ''}`);
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

  static async adminGetLearningInsights(limitUsers = 400): Promise<any> {
    const response = await api.get(`/admin/scrolitha/learning-insights?limitUsers=${Math.max(1, Math.floor(limitUsers))}`);
    return extractData<any>(response);
  }

  static async adminRegeneratePostInsights(payload?: {
    postId?: string;
    postIds?: string[];
    limit?: number;
  }): Promise<any> {
    const response = await api.post('/admin/scrolitha/post-ai/regenerate-insights', payload || {});
    return extractData<any>(response);
  }

  static async adminClearPostInsights(payload?: { postIds?: string[] }): Promise<any> {
    const response = await api.delete('/admin/scrolitha/post-ai/insights', { data: payload || {} });
    return extractData<any>(response);
  }
}

export default ScrolithaService;
