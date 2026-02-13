import api from './api';
import { AuthService } from './authService';

const ADMIN_BASE = '/admin/i18n';
const PUBLIC_BASE = '/i18n';

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

export type I18nConfig = {
  id?: string;
  scope?: string;
  defaultLocale: string;
  enabledLocales: string[];
  rtlLocales: string[];
  dictionaryCacheSeconds?: number;
  overridesCacheSeconds?: number;
};

export type TranslationKeyRow = {
  id: string;
  key: string;
  namespace?: string | null;
  description?: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  _count?: { values: number };
};

export type TranslationValueRow = {
  id: string;
  translationKeyId: string;
  locale: string;
  value: string;
  updatedByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TextOverrideRow = {
  id: string;
  locale: string;
  matchText: string;
  replacementText: string;
  isRegex: boolean;
  enabled: boolean;
  priority: number;
  updatedByAdminId?: string | null;
  createdAt: string;
  updatedAt: string;
};

export const I18nService = {
  async getPublicConfig(): Promise<I18nConfig> {
    const response = await api.get(`${PUBLIC_BASE}/config`);
    return extractData<I18nConfig>(response);
  },

  async getDictionary(locale: string): Promise<{ locale: string; defaultLocale: string; dictionary: Record<string, string> }> {
    const response = await api.get(`${PUBLIC_BASE}/dictionary`, { params: { locale } });
    return extractData(response);
  },

  async getOverrides(locale: string): Promise<{ locale: string; overrides: TextOverrideRow[] }> {
    const response = await api.get(`${PUBLIC_BASE}/overrides`, { params: { locale } });
    return extractData(response);
  },

  async getAdminConfig(): Promise<I18nConfig> {
    const response = await api.get(`${ADMIN_BASE}/config`, { headers: await getAuthHeaders() });
    return extractData<I18nConfig>(response);
  },

  async updateAdminConfig(payload: Partial<I18nConfig>): Promise<I18nConfig> {
    const response = await api.put(`${ADMIN_BASE}/config`, payload, { headers: await getAuthHeaders() });
    return extractData<I18nConfig>(response);
  },

  async listKeys(params?: { search?: string; page?: number; limit?: number; includeInactive?: boolean }) {
    const response = await api.get(`${ADMIN_BASE}/keys`, { params, headers: await getAuthHeaders() });
    return extractData<{ items: TranslationKeyRow[]; page: number; limit: number; total: number; totalPages: number }>(response);
  },

  async createKey(payload: { key: string; namespace?: string; description?: string; isActive?: boolean }) {
    const response = await api.post(`${ADMIN_BASE}/keys`, payload, { headers: await getAuthHeaders() });
    return extractData<TranslationKeyRow>(response);
  },

  async updateKey(id: string, payload: Partial<TranslationKeyRow>) {
    const response = await api.put(`${ADMIN_BASE}/keys/${encodeURIComponent(id)}`, payload, { headers: await getAuthHeaders() });
    return extractData<TranslationKeyRow>(response);
  },

  async deleteKey(id: string) {
    const response = await api.delete(`${ADMIN_BASE}/keys/${encodeURIComponent(id)}`, { headers: await getAuthHeaders() });
    return extractData(response);
  },

  async listValues(params: { keyId?: string; key?: string; locale?: string }) {
    const response = await api.get(`${ADMIN_BASE}/values`, { params, headers: await getAuthHeaders() });
    return extractData<{ items: TranslationValueRow[] }>(response);
  },

  async upsertValue(payload: { key: string; locale: string; value: string; namespace?: string; description?: string }) {
    const response = await api.put(`${ADMIN_BASE}/values`, payload, { headers: await getAuthHeaders() });
    return extractData(response);
  },

  async listOverrides(params?: { locale?: string; page?: number; limit?: number }) {
    const response = await api.get(`${ADMIN_BASE}/overrides`, { params, headers: await getAuthHeaders() });
    return extractData<{ items: TextOverrideRow[]; page: number; limit: number; total: number; totalPages: number }>(response);
  },

  async createOverride(payload: Partial<TextOverrideRow> & { locale: string; matchText: string; replacementText: string }) {
    const response = await api.post(`${ADMIN_BASE}/overrides`, payload, { headers: await getAuthHeaders() });
    return extractData<TextOverrideRow>(response);
  },

  async updateOverride(id: string, payload: Partial<TextOverrideRow>) {
    const response = await api.put(`${ADMIN_BASE}/overrides/${encodeURIComponent(id)}`, payload, { headers: await getAuthHeaders() });
    return extractData<TextOverrideRow>(response);
  },

  async deleteOverride(id: string) {
    const response = await api.delete(`${ADMIN_BASE}/overrides/${encodeURIComponent(id)}`, { headers: await getAuthHeaders() });
    return extractData(response);
  },

  async importData(payload: Record<string, any>) {
    const response = await api.post(`${ADMIN_BASE}/import`, payload, { headers: await getAuthHeaders() });
    return extractData(response);
  },

  async exportData(params: { format: 'json' | 'csv'; locale: string }) {
    const response = await api.get(`${ADMIN_BASE}/export`, { params, headers: await getAuthHeaders() });
    return extractData<{
      format: string;
      locale: string;
      filename: string;
      content: string;
      dictionary?: Record<string, string>;
      dictionaries?: Record<string, Record<string, string>>;
    }>(response);
  }
};
