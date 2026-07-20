/**
 * Phase 26 — Client-side translation recommendation policy (mirrors backend).
 */

import { normalizeLanguageCode, normalizeLanguageCodeList } from './supportedLanguages';

export type TranslationDecisionInput = {
  viewerUnderstoodLanguages?: string[] | null;
  viewerPreferredTranslationLanguage?: string | null;
  viewerSuggestionsEnabled?: boolean;
  viewerAutoTranslateEnabled?: boolean;
  viewerPreferencesConfirmed?: boolean;
  postLanguageCode?: string | null;
  detectedLanguageCodes?: string[] | null;
  isMixedLanguage?: boolean;
  translationAvailable?: boolean;
  languageDetectionStatus?: string | null;
};

export type TranslationDecision = {
  showTranslationAction: boolean;
  recommendTranslation: boolean;
  autoTranslate: boolean;
  targetLanguage?: string;
  reason: string;
};

export const evaluateTranslationDecision = (input: TranslationDecisionInput): TranslationDecision => {
  const understood = new Set(normalizeLanguageCodeList(input.viewerUnderstoodLanguages || []));
  const preferred =
    normalizeLanguageCode(input.viewerPreferredTranslationLanguage) ||
    (understood.size ? Array.from(understood)[0] : 'en') ||
    'en';
  const suggestionsEnabled = input.viewerSuggestionsEnabled !== false;
  const autoTranslateEnabled = Boolean(input.viewerAutoTranslateEnabled);
  const confirmed = Boolean(input.viewerPreferencesConfirmed);
  const postLang = normalizeLanguageCode(input.postLanguageCode);
  const detected = normalizeLanguageCodeList(input.detectedLanguageCodes || []);
  const status = String(input.languageDetectionStatus || '').trim().toLowerCase();
  const translationAvailable = input.translationAvailable !== false;

  if (status === 'no_linguistic_content') {
    return { showTranslationAction: false, recommendTranslation: false, autoTranslate: false, reason: 'NO_LINGUISTIC_CONTENT' };
  }
  if (!translationAvailable) {
    return { showTranslationAction: false, recommendTranslation: false, autoTranslate: false, reason: 'TRANSLATION_UNAVAILABLE' };
  }
  if (!suggestionsEnabled) {
    return {
      showTranslationAction: true,
      recommendTranslation: false,
      autoTranslate: false,
      targetLanguage: preferred,
      reason: 'USER_DISABLED_SUGGESTIONS'
    };
  }
  if (!confirmed || understood.size === 0) {
    const unresolved = !postLang || status === 'detection_failed' || status === 'low_confidence';
    return {
      showTranslationAction: true,
      recommendTranslation: true,
      autoTranslate: false,
      targetLanguage: preferred,
      reason: unresolved ? 'LANGUAGE_UNRESOLVED' : 'NO_CONFIRMED_LANGUAGE_PREFERENCES'
    };
  }
  if (input.isMixedLanguage || detected.length > 1) {
    const gap = detected.some((code) => !understood.has(code)) || (postLang ? !understood.has(postLang) : false);
    if (gap) {
      return {
        showTranslationAction: true,
        recommendTranslation: true,
        autoTranslate: autoTranslateEnabled,
        targetLanguage: preferred,
        reason: 'MIXED_LANGUAGE_PARTIAL_GAP'
      };
    }
  }
  if (!postLang || status === 'detection_failed' || status === 'not_processed') {
    return {
      showTranslationAction: true,
      recommendTranslation: false,
      autoTranslate: false,
      targetLanguage: preferred,
      reason: 'LANGUAGE_UNRESOLVED'
    };
  }
  if (understood.has(postLang)) {
    return {
      showTranslationAction: true,
      recommendTranslation: false,
      autoTranslate: false,
      targetLanguage: preferred,
      reason: 'USER_UNDERSTANDS_LANGUAGE'
    };
  }
  return {
    showTranslationAction: true,
    recommendTranslation: true,
    autoTranslate: autoTranslateEnabled,
    targetLanguage: preferred,
    reason: 'LANGUAGE_NOT_UNDERSTOOD'
  };
};
