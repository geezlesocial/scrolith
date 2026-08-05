/**
 * Phase 26 — Multilingual catalog, detection, and translation decision policy.
 */
import {
  LANGUAGE_CONFIDENCE,
  formatLanguageLabel,
  listTranslationSupportedCodes,
  normalizeLanguageCode,
  normalizeLanguageCodeList
} from '../services/language/supportedLanguages.catalog';
import {
  buildLanguageDetectionResult,
  classifyLinguisticContent,
  stripForDetection
} from '../services/language/languageDetection.service';
import { evaluateTranslationDecision } from '../services/language/translationDecisionPolicy';
import { isLegacyPlaceholderTranslation, translateWithLocalFallback } from '../services/contentTranslation.service';

describe('Phase 26 language catalog', () => {
  test('normalizes legacy aliases to canonical codes', () => {
    expect(normalizeLanguageCode('EN')).toBe('en');
    expect(normalizeLanguageCode('en_US')).toBe('en');
    expect(normalizeLanguageCode('English')).toBe('en');
    expect(normalizeLanguageCode('fil')).toBe('tl');
    expect(normalizeLanguageCode('Tagalog')).toBe('tl');
    expect(normalizeLanguageCode('unknown')).toBeNull();
  });

  test('translation-supported set matches existing engine locales', () => {
    const codes = listTranslationSupportedCodes().sort();
    expect(codes).toEqual(['ar', 'en', 'es', 'fr', 'ha', 'sw', 'tl', 'zh'].sort());
  });

  test('dedupes language lists', () => {
    expect(normalizeLanguageCodeList(['en', 'EN', 'english', 'tl', 'fil'])).toEqual(['en', 'tl']);
  });

  test('formats bilingual labels', () => {
    expect(formatLanguageLabel('ar')).toContain('Arabic');
    expect(formatLanguageLabel('fr')).toContain('French');
  });
});

describe('Phase 26 detection hardening', () => {
  test('classifies emoji/url-only as no linguistic content', () => {
    expect(classifyLinguisticContent('❤️🔥')).toBe('no_linguistic_content');
    expect(classifyLinguisticContent('https://example.com')).toBe('no_linguistic_content');
    expect(classifyLinguisticContent('@username')).toBe('no_linguistic_content');
    expect(classifyLinguisticContent('')).toBe('no_linguistic_content');
  });

  test('strips urls mentions emoji for detection', () => {
    expect(stripForDetection('Hello https://x.com @bob #tag 🔥')).toMatch(/Hello/);
    expect(stripForDetection('Hello https://x.com @bob #tag 🔥')).not.toMatch(/https/);
  });

  test('arabic script yields ar', () => {
    const result = buildLanguageDetectionResult({ rawText: 'مرحبا بالعالم' });
    expect(result.languageCode).toBe('ar');
    expect(result.status).not.toBe('no_linguistic_content');
  });

  test('lexical french detection', () => {
    const result = buildLanguageDetectionResult({ rawText: 'Bonjour et merci beaucoup' });
    expect(result.languageCode).toBe('fr');
  });

  test('provider low confidence without script stays unresolved-ish', () => {
    const result = buildLanguageDetectionResult({
      rawText: 'Hi',
      providerLanguage: 'en',
      providerConfidence: 0.2
    });
    expect(result.status === 'low_confidence' || result.languageCode === 'en').toBe(true);
  });

  test('confidence thresholds exported', () => {
    expect(LANGUAGE_CONFIDENCE.high).toBeGreaterThan(LANGUAGE_CONFIDENCE.medium);
    expect(LANGUAGE_CONFIDENCE.medium).toBeGreaterThan(LANGUAGE_CONFIDENCE.low);
  });
});

describe('Phase 26 translation decision policy', () => {
  test('suppresses recommendation when user understands post language', () => {
    const decision = evaluateTranslationDecision({
      viewerUnderstoodLanguages: ['en', 'tl', 'ar'],
      viewerPreferencesConfirmed: true,
      postLanguageCode: 'tl',
      translationAvailable: true
    });
    expect(decision.recommendTranslation).toBe(false);
    expect(decision.reason).toBe('USER_UNDERSTANDS_LANGUAGE');
    expect(decision.showTranslationAction).toBe(true);
  });

  test('recommends when language not understood', () => {
    const decision = evaluateTranslationDecision({
      viewerUnderstoodLanguages: ['en'],
      viewerPreferencesConfirmed: true,
      postLanguageCode: 'ar',
      translationAvailable: true
    });
    expect(decision.recommendTranslation).toBe(true);
    expect(decision.reason).toBe('LANGUAGE_NOT_UNDERSTOOD');
  });

  test('mixed language partial gap', () => {
    const decision = evaluateTranslationDecision({
      viewerUnderstoodLanguages: ['en'],
      viewerPreferencesConfirmed: true,
      postLanguageCode: 'en',
      isMixedLanguage: true,
      detectedLanguageCodes: ['en', 'ar'],
      translationAvailable: true
    });
    expect(decision.recommendTranslation).toBe(true);
    expect(decision.reason).toBe('MIXED_LANGUAGE_PARTIAL_GAP');
  });

  test('no confirmed prefs keeps current behavior', () => {
    const decision = evaluateTranslationDecision({
      viewerUnderstoodLanguages: [],
      viewerPreferencesConfirmed: false,
      postLanguageCode: 'es',
      translationAvailable: true
    });
    expect(decision.recommendTranslation).toBe(true);
    expect(decision.reason).toBe('NO_CONFIRMED_LANGUAGE_PREFERENCES');
  });

  test('no linguistic content hides action', () => {
    const decision = evaluateTranslationDecision({
      viewerPreferencesConfirmed: true,
      viewerUnderstoodLanguages: ['en'],
      languageDetectionStatus: 'no_linguistic_content',
      translationAvailable: true
    });
    expect(decision.showTranslationAction).toBe(false);
    expect(decision.reason).toBe('NO_LINGUISTIC_CONTENT');
  });
});

describe('Phase 26 post-card translation fallback', () => {
  test('returns user-facing translated text instead of runtime markers', () => {
    const title = translateWithLocalFallback('Publicacion de prueba', 'es', 'en', 'local').translatedText;
    const content = translateWithLocalFallback('Hola desde Scrolith y Geezle', 'es', 'en', 'local').translatedText;

    expect(title).toBe('Test post');
    expect(content).toBe('Hello from Scrolith and Geezle');
    expect(title).not.toContain('[es->en]');
    expect(content).not.toContain('[es->en]');
  });

  test('marks legacy placeholder cache rows stale', () => {
    expect(isLegacyPlaceholderTranslation({
      translatedTitle: '[es->en] Publicacion de prueba',
      translatedContent: 'Hello from Scrolith',
      modelVersion: 'mock-v1'
    })).toBe(true);

    expect(isLegacyPlaceholderTranslation({
      translatedTitle: 'Test post',
      translatedContent: 'Hello from Scrolith',
      modelVersion: 'local-dictionary-v1'
    })).toBe(false);
  });

  test('supports external-runtime-free local translation fallback', () => {
    const content = translateWithLocalFallback('Gracias por usar Scrolith con equipos globales.', 'es', 'en', 'm2m100_418m');

    expect(content.translatedText).toContain('Thank you');
    expect(content.translatedText).toContain('Scrolith');
    expect(content.translatedText).not.toContain('[es->en]');
    expect(content.modelVersion).toBe('local-dictionary-v1');
  });
});
