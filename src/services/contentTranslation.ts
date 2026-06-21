import api from './api';
import { AuthService } from './authService';

const ADMIN_BASE = '/admin/i18n/translation';
const POST_BASE = '/community/posts';

const extractData = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  if (response?.data !== undefined) return response.data as T;
  return response as T;
};

const getAuthHeaders = async () => {
  const token = await AuthService.getToken();
  const user = AuthService.getStoredUser();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (user?.id) headers['x-user-id'] = String(user.id);
  headers['x-user-role'] = user?.role ? String(user.role).toLowerCase() : 'admin';
  return headers;
};

export type ContentTranslationConfig = {
  scope: string;
  enabled: boolean;
  runtimeMode: 'self_hosted_m2m100' | 'mock';
  runtimeBaseUrl: string;
  runtimeApiKey: string;
  runtimeApiKeyConfigured: boolean;
  engineKey: string;
  detectorKey: string;
  defaultTargetLocale: string;
  enabledSourceLocales: string[];
  enabledTargetLocales: string[];
  autoTranslatePosts: boolean;
  translateOnDemand: boolean;
  maxCharactersPerRequest: number;
  timeoutMs: number;
  cacheTtlSeconds: number;
  preserveHashtags: boolean;
  preserveMentions: boolean;
  preserveUrls: boolean;
  preserveGlossaryTerms: boolean;
};

export type ContentTranslationOverview = {
  config: ContentTranslationConfig;
  stats: {
    glossaryCount: number;
    detectionCount: number;
    totalTranslations: number;
    readyTranslations: number;
    failedTranslations: number;
    latestAuditAt?: string | null;
    latestAuditEvent?: string | null;
    latestTranslationAt?: string | null;
    latestTranslationTargetLocale?: string | null;
    latestTranslationSourceLocale?: string | null;
  };
};

export type ContentTranslationGlossaryEntry = {
  id: string;
  sourceText: string;
  replacementText: string;
  locale?: string | null;
  targetLocale?: string | null;
  enabled: boolean;
  caseSensitive: boolean;
  priority: number;
  createdById?: string | null;
  updatedById?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentTranslationAuditLog = {
  id: string;
  actorId?: string | null;
  eventType: string;
  entityType?: string | null;
  entityId?: string | null;
  metadata?: Record<string, any> | null;
  createdAt: string;
};

export type PostTranslationResult = {
  postId: string;
  sourceLanguage?: string | null;
  sourceLanguageConfidence?: number | null;
  targetLocale: string;
  translatedTitle?: string | null;
  translatedContent: string;
  cacheHit: boolean;
  engineKey: string;
  modelVersion?: string | null;
  glossaryApplied?: boolean;
  translatedAt: string;
};

const translationCache = new Map<string, Promise<PostTranslationResult> | PostTranslationResult>();

const buildCacheKey = (postId: string, targetLocale: string, translationVersion?: string | null) =>
  `${postId}:${targetLocale}:${String(translationVersion || 'v0').trim() || 'v0'}`;

export const ContentTranslationService = {
  async getAdminOverview(): Promise<ContentTranslationOverview> {
    const response = await api.get(`${ADMIN_BASE}/config`, { headers: await getAuthHeaders() });
    return extractData<ContentTranslationOverview>(response);
  },

  async updateAdminConfig(payload: Partial<ContentTranslationConfig> & { runtimeApiKey?: string }) {
    const response = await api.put(`${ADMIN_BASE}/config`, payload, { headers: await getAuthHeaders() });
    return extractData<ContentTranslationConfig>(response);
  },

  async listAdminGlossary() {
    const response = await api.get(`${ADMIN_BASE}/glossary`, { headers: await getAuthHeaders() });
    return extractData<{ items: ContentTranslationGlossaryEntry[] }>(response);
  },

  async createAdminGlossaryEntry(payload: Partial<ContentTranslationGlossaryEntry>) {
    const response = await api.post(`${ADMIN_BASE}/glossary`, payload, { headers: await getAuthHeaders() });
    return extractData<ContentTranslationGlossaryEntry>(response);
  },

  async updateAdminGlossaryEntry(id: string, payload: Partial<ContentTranslationGlossaryEntry>) {
    const response = await api.put(`${ADMIN_BASE}/glossary/${encodeURIComponent(id)}`, payload, { headers: await getAuthHeaders() });
    return extractData<ContentTranslationGlossaryEntry>(response);
  },

  async deleteAdminGlossaryEntry(id: string) {
    const response = await api.delete(`${ADMIN_BASE}/glossary/${encodeURIComponent(id)}`, { headers: await getAuthHeaders() });
    return extractData<{ deleted: boolean }>(response);
  },

  async listAdminAudit(limit = 40) {
    const response = await api.get(`${ADMIN_BASE}/audit`, {
      params: { limit },
      headers: await getAuthHeaders()
    });
    return extractData<{ items: ContentTranslationAuditLog[] }>(response);
  },

  async runAdminTest(payload: { text: string; sourceLocale?: string; targetLocale?: string }) {
    const response = await api.post(`${ADMIN_BASE}/test`, payload, { headers: await getAuthHeaders() });
    return extractData<{
      sourceLanguage: string;
      confidence?: number | null;
      targetLocale: string;
      translatedText: string;
      engineKey: string;
      modelVersion?: string | null;
      glossaryApplied?: boolean;
    }>(response);
  },

  async getPostTranslation(postId: string, targetLocale: string, translationVersion?: string | null) {
    const key = buildCacheKey(postId, targetLocale, translationVersion);
    const cached = translationCache.get(key);
    if (cached) {
      return cached instanceof Promise ? cached : Promise.resolve(cached);
    }

    const request = api
      .get(`${POST_BASE}/${encodeURIComponent(postId)}/translation`, {
        params: { targetLocale }
      })
      .then((response) => {
        const result = extractData<PostTranslationResult>(response);
        translationCache.set(key, result);
        return result;
      })
      .catch((error) => {
        translationCache.delete(key);
        throw error;
      });

    translationCache.set(key, request);
    return request;
  },

  clearPostTranslationCache(postId?: string) {
    if (!postId) {
      translationCache.clear();
      return;
    }
    Array.from(translationCache.keys())
      .filter((key) => key.startsWith(`${postId}:`))
      .forEach((key) => translationCache.delete(key));
  }
};
