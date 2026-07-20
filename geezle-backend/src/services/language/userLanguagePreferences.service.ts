/**
 * Phase 26 — User understood-language preferences (server-authoritative).
 */

import prisma from '../../utils/prismaClient';
import {
  listOnboardingLanguages,
  listSupportedLanguages,
  normalizeLanguageCode,
  normalizeLanguageCodeList
} from './supportedLanguages.catalog';

export type UserLanguagePreferences = {
  understoodLanguages: string[];
  preferredTranslationLanguage: string | null;
  languageSuggestionsEnabled: boolean;
  autoTranslateEnabled: boolean;
  languagePreferencesConfirmed: boolean;
  languagePreferencesUpdatedAt: string | null;
};

const toIso = (value: Date | null | undefined) => (value ? value.toISOString() : null);

export const getLanguageCatalogPayload = () => ({
  languages: listSupportedLanguages(),
  onboardingLanguages: listOnboardingLanguages()
});

export const mapUserLanguagePreferences = (user: {
  understoodLanguages?: string[] | null;
  preferredTranslationLanguage?: string | null;
  languageSuggestionsEnabled?: boolean | null;
  autoTranslateEnabled?: boolean | null;
  languagePreferencesConfirmed?: boolean | null;
  languagePreferencesUpdatedAt?: Date | null;
}): UserLanguagePreferences => ({
  understoodLanguages: normalizeLanguageCodeList(user.understoodLanguages || []),
  preferredTranslationLanguage: normalizeLanguageCode(user.preferredTranslationLanguage) || null,
  languageSuggestionsEnabled: user.languageSuggestionsEnabled !== false,
  autoTranslateEnabled: Boolean(user.autoTranslateEnabled),
  languagePreferencesConfirmed: Boolean(user.languagePreferencesConfirmed),
  languagePreferencesUpdatedAt: toIso(user.languagePreferencesUpdatedAt)
});

export const getUserLanguagePreferences = async (userId: string) => {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      understoodLanguages: true,
      preferredTranslationLanguage: true,
      languageSuggestionsEnabled: true,
      autoTranslateEnabled: true,
      languagePreferencesConfirmed: true,
      languagePreferencesUpdatedAt: true
    }
  });
  if (!user) return null;
  return mapUserLanguagePreferences(user);
};

export const updateUserLanguagePreferences = async (
  userId: string,
  input: {
    understoodLanguages?: unknown;
    preferredTranslationLanguage?: unknown;
    languageSuggestionsEnabled?: unknown;
    autoTranslateEnabled?: unknown;
    confirm?: unknown;
  }
) => {
  const understood = normalizeLanguageCodeList(input.understoodLanguages, 24);
  if (input.understoodLanguages !== undefined && understood.length < 1) {
    throw new Error('Select at least one language you understand.');
  }

  let preferred =
    input.preferredTranslationLanguage === undefined
      ? undefined
      : normalizeLanguageCode(input.preferredTranslationLanguage);

  if (preferred && understood.length && !understood.includes(preferred)) {
    // Preferred translation language may differ from understood set (e.g. translate into English).
    // Allow any catalog code.
  }

  const data: Record<string, unknown> = {
    languagePreferencesUpdatedAt: new Date()
  };

  if (input.understoodLanguages !== undefined) {
    data.understoodLanguages = understood;
    if (input.confirm !== false) {
      data.languagePreferencesConfirmed = true;
    }
  }
  if (input.preferredTranslationLanguage !== undefined) {
    data.preferredTranslationLanguage = preferred || null;
  }
  if (input.languageSuggestionsEnabled !== undefined) {
    data.languageSuggestionsEnabled = Boolean(input.languageSuggestionsEnabled);
  }
  if (input.autoTranslateEnabled !== undefined) {
    data.autoTranslateEnabled = Boolean(input.autoTranslateEnabled);
  }
  if (input.confirm === true) {
    data.languagePreferencesConfirmed = true;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data,
    select: {
      understoodLanguages: true,
      preferredTranslationLanguage: true,
      languageSuggestionsEnabled: true,
      autoTranslateEnabled: true,
      languagePreferencesConfirmed: true,
      languagePreferencesUpdatedAt: true
    }
  });

  return mapUserLanguagePreferences(updated);
};
