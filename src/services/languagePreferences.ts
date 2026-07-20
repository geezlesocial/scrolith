import api from './api';
import type { SupportedLanguage } from '../utils/supportedLanguages';

export type UserLanguagePreferences = {
  understoodLanguages: string[];
  preferredTranslationLanguage: string | null;
  languageSuggestionsEnabled: boolean;
  autoTranslateEnabled: boolean;
  languagePreferencesConfirmed: boolean;
  languagePreferencesUpdatedAt: string | null;
};

const extract = <T>(response: any): T => {
  if (response?.data?.data !== undefined) return response.data.data as T;
  return response?.data as T;
};

export const LanguagePreferencesService = {
  async getCatalog() {
    const response = await api.get('/auth/languages/catalog');
    return extract<{ languages: SupportedLanguage[]; onboardingLanguages: SupportedLanguage[] }>(response);
  },

  async getMine() {
    const response = await api.get('/auth/me/language-preferences');
    return extract<UserLanguagePreferences>(response);
  },

  async updateMine(payload: Partial<UserLanguagePreferences> & { confirm?: boolean }) {
    const response = await api.put('/auth/me/language-preferences', payload);
    return extract<UserLanguagePreferences>(response);
  }
};
