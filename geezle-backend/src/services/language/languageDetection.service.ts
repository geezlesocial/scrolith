/**
 * Phase 26 — Hardened language detection helpers used by content translation.
 * Does not replace the m2m100/fastText runtime; layers classification + short-text policy.
 */

import {
  LANGUAGE_CONFIDENCE,
  type LanguageDetectionStatus,
  normalizeLanguageCode,
  listTranslationSupportedCodes
} from './supportedLanguages.catalog';

export type LanguageDetectionResult = {
  languageCode: string | null;
  confidence: number;
  source: 'provider' | 'model' | 'heuristic' | 'cached' | 'manual';
  script?: string;
  isMixedLanguage: boolean;
  candidates: Array<{ languageCode: string; confidence: number }>;
  status: LanguageDetectionStatus;
  reason?: string;
};

const ARABIC = /[\u0600-\u06ff]/;
const CHINESE = /[\u4e00-\u9fff]/;
const DEVANAGARI = /[\u0900-\u097f]/;
const HANGUL = /[\uac00-\ud7af]/;
const HIRAGANA_KATAKANA = /[\u3040-\u30ff]/;
const CYRILLIC = /[\u0400-\u04ff]/;
const BENGALI = /[\u0980-\u09ff]/;
const URL_RE = /https?:\/\/\S+|www\.\S+/gi;
const MENTION_RE = /@\w[\w.-]*/g;
const HASHTAG_RE = /#\w[\w-]*/g;
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}]/gu;

export const stripForDetection = (text: string): string =>
  String(text || '')
    .replace(URL_RE, ' ')
    .replace(MENTION_RE, ' ')
    .replace(HASHTAG_RE, ' ')
    .replace(EMOJI_RE, ' ')
    .replace(/[0-9]+/g, ' ')
    .replace(/[^\p{L}\p{M}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();

export const classifyLinguisticContent = (rawText: string): LanguageDetectionStatus | null => {
  const original = String(rawText || '').trim();
  if (!original) return 'no_linguistic_content';
  const stripped = stripForDetection(original);
  if (!stripped) return 'no_linguistic_content';
  if (stripped.length < 2 && !ARABIC.test(original) && !CHINESE.test(original)) {
    return 'no_linguistic_content';
  }
  return null;
};

const detectScriptHints = (text: string): Array<{ languageCode: string; confidence: number; script: string }> => {
  const hints: Array<{ languageCode: string; confidence: number; script: string }> = [];
  if (ARABIC.test(text)) hints.push({ languageCode: 'ar', confidence: 0.72, script: 'Arab' });
  if (CHINESE.test(text)) hints.push({ languageCode: 'zh', confidence: 0.72, script: 'Hans' });
  if (DEVANAGARI.test(text)) hints.push({ languageCode: 'hi', confidence: 0.7, script: 'Deva' });
  if (HANGUL.test(text)) hints.push({ languageCode: 'ko', confidence: 0.75, script: 'Kore' });
  if (HIRAGANA_KATAKANA.test(text)) hints.push({ languageCode: 'ja', confidence: 0.75, script: 'Jpan' });
  if (CYRILLIC.test(text)) hints.push({ languageCode: 'ru', confidence: 0.7, script: 'Cyrl' });
  if (BENGALI.test(text)) hints.push({ languageCode: 'bn', confidence: 0.7, script: 'Beng' });
  return hints;
};

const LEXICAL: Array<{ languageCode: string; pattern: RegExp; confidence: number }> = [
  { languageCode: 'es', pattern: /\b(hola|gracias|buenos|por favor|qué|cómo)\b/i, confidence: 0.58 },
  { languageCode: 'fr', pattern: /\b(bonjour|merci|salut|s'il vous plaît|comment)\b/i, confidence: 0.58 },
  { languageCode: 'sw', pattern: /\b(salamu|habari|asante|karibu|sasa)\b/i, confidence: 0.58 },
  { languageCode: 'tl', pattern: /\b(kumusta|salamat|po|opo|maganda|mabuhay)\b/i, confidence: 0.58 },
  { languageCode: 'ha', pattern: /\b(sannu|na gode|yaya|ina kwana)\b/i, confidence: 0.58 },
  { languageCode: 'id', pattern: /\b(terima kasih|selamat|apa kabar|baik)\b/i, confidence: 0.55 },
  { languageCode: 'pt', pattern: /\b(obrigado|olá|bom dia|por favor)\b/i, confidence: 0.55 },
  { languageCode: 'de', pattern: /\b(danke|bitte|guten tag|wie geht)\b/i, confidence: 0.55 },
  { languageCode: 'en', pattern: /\b(the|and|you|thanks|hello|please|what|this)\b/i, confidence: 0.45 }
];

/**
 * Build a detection result from runtime provider output + heuristics.
 */
export const buildLanguageDetectionResult = (input: {
  rawText: string;
  providerLanguage?: string | null;
  providerConfidence?: number | null;
  providerKey?: string | null;
  source?: LanguageDetectionResult['source'];
}): LanguageDetectionResult => {
  const emptyStatus = classifyLinguisticContent(input.rawText);
  if (emptyStatus) {
    return {
      languageCode: null,
      confidence: 0,
      source: 'heuristic',
      isMixedLanguage: false,
      candidates: [],
      status: emptyStatus,
      reason: emptyStatus
    };
  }

  const stripped = stripForDetection(input.rawText);
  const candidates: Array<{ languageCode: string; confidence: number }> = [];
  const scripts = detectScriptHints(input.rawText);
  for (const s of scripts) {
    candidates.push({ languageCode: s.languageCode, confidence: s.confidence });
  }
  for (const lex of LEXICAL) {
    if (lex.pattern.test(stripped) || lex.pattern.test(input.rawText)) {
      candidates.push({ languageCode: lex.languageCode, confidence: lex.confidence });
    }
  }

  const providerCode = normalizeLanguageCode(input.providerLanguage);
  const providerConfidence =
    typeof input.providerConfidence === 'number' && Number.isFinite(input.providerConfidence)
      ? Math.max(0, Math.min(1, input.providerConfidence))
      : null;

  if (providerCode && providerConfidence != null) {
    candidates.push({ languageCode: providerCode, confidence: providerConfidence });
  } else if (providerCode) {
    candidates.push({ languageCode: providerCode, confidence: 0.55 });
  }

  // Aggregate by language
  const scoreMap = new Map<string, number>();
  for (const c of candidates) {
    scoreMap.set(c.languageCode, Math.max(scoreMap.get(c.languageCode) || 0, c.confidence));
  }
  const ranked = Array.from(scoreMap.entries())
    .map(([languageCode, confidence]) => ({ languageCode, confidence }))
    .sort((a, b) => b.confidence - a.confidence);

  const top = ranked[0] || null;
  const second = ranked[1] || null;
  const isMixedLanguage = Boolean(
    top &&
      second &&
      top.confidence >= LANGUAGE_CONFIDENCE.low &&
      second.confidence >= LANGUAGE_CONFIDENCE.low &&
      top.languageCode !== second.languageCode &&
      Math.abs(top.confidence - second.confidence) < 0.2
  );

  if (!top) {
    return {
      languageCode: null,
      confidence: 0,
      source: input.source || 'heuristic',
      isMixedLanguage: false,
      candidates: [],
      status: 'detection_failed',
      reason: 'no_candidates'
    };
  }

  const translationCodes = new Set(listTranslationSupportedCodes());
  let status: LanguageDetectionStatus = 'detected';
  if (isMixedLanguage) status = 'mixed';
  else if (top.confidence < LANGUAGE_CONFIDENCE.low) status = 'low_confidence';
  else if (top.confidence < LANGUAGE_CONFIDENCE.medium) status = 'low_confidence';
  else if (!translationCodes.has(top.languageCode) && top.confidence < LANGUAGE_CONFIDENCE.high) {
    // keep label but mark unsupported for translation engines
    status = 'detected';
  }

  // Very low: do not assign a false label
  if (top.confidence < 0.35 && !scripts.length) {
    return {
      languageCode: null,
      confidence: top.confidence,
      source: input.source || (providerCode ? 'provider' : 'heuristic'),
      script: scripts[0]?.script,
      isMixedLanguage: false,
      candidates: ranked.slice(0, 5),
      status: 'low_confidence',
      reason: 'confidence_below_floor'
    };
  }

  return {
    languageCode: top.languageCode,
    confidence: top.confidence,
    source: input.source || (providerCode ? 'provider' : 'heuristic'),
    script: scripts.find((s) => s.languageCode === top.languageCode)?.script || scripts[0]?.script,
    isMixedLanguage,
    candidates: ranked.slice(0, 5),
    status,
    reason: isMixedLanguage ? 'mixed_language' : undefined
  };
};
