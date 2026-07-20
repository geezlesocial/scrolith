/**
 * Phase 26 — Centralized translation recommendation policy for feed + Scrolitha.
 */

import { normalizeLanguageCode, normalizeLanguageCodeList } from './supportedLanguages.catalog';

export type TranslationDecisionInput = {
  viewerUnderstoodLanguages?: string[] | null;
  viewerPreferredTranslationLanguage?: string | null;
  viewerSuggestionsEnabled?: boolean;
  viewerAutoTranslateEnabled?: boolean;
  viewerPreferencesConfirmed?: boolean;
  postLanguageCode?: string | null;
  detectedLanguageCodes?: string[] | null;
  detectionConfidence?: number | null;
  isMixedLanguage?: boolean;
  translationAvailable?: boolean;
  languageDetectionStatus?: string | null;
};

export type TranslationDecision = {
  showTranslationAction: boolean;
  recommendTranslation: boolean;
  autoTranslate: boolean;
  targetLanguage?: string;
  reason:
    | 'USER_UNDERSTANDS_LANGUAGE'
    | 'LANGUAGE_NOT_UNDERSTOOD'
    | 'MIXED_LANGUAGE_PARTIAL_GAP'
    | 'LANGUAGE_UNRESOLVED'
    | 'TRANSLATION_UNAVAILABLE'
    | 'USER_DISABLED_SUGGESTIONS'
    | 'NO_CONFIRMED_LANGUAGE_PREFERENCES'
    | 'NO_LINGUISTIC_CONTENT';
};

const base = (code: string | null | undefined) => {
  const n = normalizeLanguageCode(code);
  return n || null;
};

export const evaluateTranslationDecision = (input: TranslationDecisionInput): TranslationDecision => {
  const understood = new Set(normalizeLanguageCodeList(input.viewerUnderstoodLanguages || []));
  const preferred =
    base(input.viewerPreferredTranslationLanguage) ||
    (understood.size ? Array.from(understood)[0] : 'en');
  const suggestionsEnabled = input.viewerSuggestionsEnabled !== false;
  const autoTranslateEnabled = Boolean(input.viewerAutoTranslateEnabled);
  const confirmed = Boolean(input.viewerPreferencesConfirmed);
  const postLang = base(input.postLanguageCode);
  const detected = normalizeLanguageCodeList(input.detectedLanguageCodes || []);
  const status = String(input.languageDetectionStatus || '').trim().toLowerCase();
  const translationAvailable = input.translationAvailable !== false;

  if (status === 'no_linguistic_content') {
    return {
      showTranslationAction: false,
      recommendTranslation: false,
      autoTranslate: false,
      reason: 'NO_LINGUISTIC_CONTENT'
    };
  }

  if (!translationAvailable) {
    return {
      showTranslationAction: false,
      recommendTranslation: false,
      autoTranslate: false,
      reason: 'TRANSLATION_UNAVAILABLE'
    };
  }

  if (!suggestionsEnabled) {
    return {
      showTranslationAction: true,
      recommendTranslation: false,
      autoTranslate: false,
      targetLanguage: preferred || undefined,
      reason: 'USER_DISABLED_SUGGESTIONS'
    };
  }

  // Existing users without confirmed prefs: keep current behavior (show action).
  if (!confirmed || understood.size === 0) {
    const unresolved = !postLang || status === 'detection_failed' || status === 'low_confidence';
    return {
      showTranslationAction: true,
      recommendTranslation: true,
      autoTranslate: false,
      targetLanguage: preferred || undefined,
      reason: unresolved ? 'LANGUAGE_UNRESOLVED' : 'NO_CONFIRMED_LANGUAGE_PREFERENCES'
    };
  }

  if (input.isMixedLanguage || detected.length > 1) {
    const unknownParts = detected.filter((code) => !understood.has(code));
    if (unknownParts.length > 0 || (postLang && !understood.has(postLang))) {
      return {
        showTranslationAction: true,
        recommendTranslation: true,
        autoTranslate: autoTranslateEnabled,
        targetLanguage: preferred || undefined,
        reason: 'MIXED_LANGUAGE_PARTIAL_GAP'
      };
    }
  }

  if (!postLang || status === 'detection_failed' || status === 'not_processed') {
    return {
      showTranslationAction: true,
      recommendTranslation: false,
      autoTranslate: false,
      targetLanguage: preferred || undefined,
      reason: 'LANGUAGE_UNRESOLVED'
    };
  }

  if (understood.has(postLang)) {
    return {
      showTranslationAction: true, // manual still allowed, unobtrusive
      recommendTranslation: false,
      autoTranslate: false,
      targetLanguage: preferred || undefined,
      reason: 'USER_UNDERSTANDS_LANGUAGE'
    };
  }

  return {
    showTranslationAction: true,
    recommendTranslation: true,
    autoTranslate: autoTranslateEnabled,
    targetLanguage: preferred || undefined,
    reason: 'LANGUAGE_NOT_UNDERSTOOD'
  };
};
