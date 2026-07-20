import { describe, expect, it } from 'vitest';
import {
  formatLanguageLabel,
  normalizeLanguageCode,
  normalizeLanguageCodeList,
  searchLanguages
} from '../supportedLanguages';
import { evaluateTranslationDecision } from '../translationDecisionPolicy';

describe('Phase 26 frontend multilingual', () => {
  it('normalizes language aliases', () => {
    expect(normalizeLanguageCode('EN')).toBe('en');
    expect(normalizeLanguageCode('fil')).toBe('tl');
    expect(normalizeLanguageCodeList(['en', 'EN', 'tl', 'fil'])).toEqual(['en', 'tl']);
  });

  it('searches languages without flags', () => {
    const hits = searchLanguages('arab');
    expect(hits.some((h) => h.code === 'ar')).toBe(true);
    expect(formatLanguageLabel('ar')).toContain('Arabic');
  });

  it('suppresses translation recommendation for understood languages', () => {
    const decision = evaluateTranslationDecision({
      viewerUnderstoodLanguages: ['en', 'tl'],
      viewerPreferencesConfirmed: true,
      postLanguageCode: 'tl'
    });
    expect(decision.recommendTranslation).toBe(false);
    expect(decision.reason).toBe('USER_UNDERSTANDS_LANGUAGE');
  });

  it('recommends for not understood languages', () => {
    const decision = evaluateTranslationDecision({
      viewerUnderstoodLanguages: ['en'],
      viewerPreferencesConfirmed: true,
      postLanguageCode: 'ar'
    });
    expect(decision.recommendTranslation).toBe(true);
  });
});
