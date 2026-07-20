/**
 * Phase 26 — Canonical content-language catalog for Scrolith translation.
 * Source of truth aligned with contentTranslation.service enabled locales
 * (en, es, fr, tl, ha, sw, zh, ar) plus high-value aliases and related languages
 * for onboarding display without claiming false translation support.
 */

export type SupportedLanguage = {
  code: string;
  name: string;
  nativeName: string;
  aliases: string[];
  script?: string;
  direction: 'ltr' | 'rtl';
  translationSupported: boolean;
  detectionSupported: boolean;
  onboardingVisible: boolean;
  searchKeywords?: string[];
};

/** Confidence thresholds (single source). */
export const LANGUAGE_CONFIDENCE = {
  high: 0.85,
  medium: 0.65,
  low: 0.4
} as const;

export type LanguageDetectionStatus =
  | 'detected'
  | 'low_confidence'
  | 'mixed'
  | 'no_linguistic_content'
  | 'unsupported'
  | 'detection_failed'
  | 'not_processed';

const CATALOG: SupportedLanguage[] = [
  {
    code: 'en',
    name: 'English',
    nativeName: 'English',
    aliases: ['english', 'en-us', 'en_us', 'en-gb', 'eng'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: true,
    detectionSupported: true,
    onboardingVisible: true,
    searchKeywords: ['english']
  },
  {
    code: 'es',
    name: 'Spanish',
    nativeName: 'Español',
    aliases: ['spanish', 'castellano', 'es-es', 'es-mx', 'spa'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: true,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'fr',
    name: 'French',
    nativeName: 'Français',
    aliases: ['french', 'fr-fr', 'fra', 'fre'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: true,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'tl',
    name: 'Filipino / Tagalog',
    nativeName: 'Filipino',
    aliases: ['tagalog', 'filipino', 'fil', 'tl-ph'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: true,
    detectionSupported: true,
    onboardingVisible: true,
    searchKeywords: ['philippines', 'tagalog', 'filipino']
  },
  {
    code: 'ha',
    name: 'Hausa',
    nativeName: 'Hausa',
    aliases: ['hausa', 'ha-ng'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: true,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'sw',
    name: 'Swahili',
    nativeName: 'Kiswahili',
    aliases: ['swahili', 'kiswahili', 'sw-ke', 'sw-tz'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: true,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'zh',
    name: 'Chinese',
    nativeName: '中文',
    aliases: ['chinese', 'zh-cn', 'zh-hans', 'zh-hant', 'zh-tw', 'cmn', 'mandarin'],
    script: 'Hans',
    direction: 'ltr',
    translationSupported: true,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'ar',
    name: 'Arabic',
    nativeName: 'العربية',
    aliases: ['arabic', 'ar-sa', 'ar-eg', 'ara'],
    script: 'Arab',
    direction: 'rtl',
    translationSupported: true,
    detectionSupported: true,
    onboardingVisible: true
  },
  // Onboarding-visible companions (detection via script/heuristic; translation may use nearest engine locale later)
  {
    code: 'hi',
    name: 'Hindi',
    nativeName: 'हिन्दी',
    aliases: ['hindi', 'hin'],
    script: 'Deva',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'id',
    name: 'Indonesian',
    nativeName: 'Bahasa Indonesia',
    aliases: ['indonesian', 'bahasa', 'ind'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'ur',
    name: 'Urdu',
    nativeName: 'اردو',
    aliases: ['urdu', 'urd'],
    script: 'Arab',
    direction: 'rtl',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'pt',
    name: 'Portuguese',
    nativeName: 'Português',
    aliases: ['portuguese', 'pt-br', 'pt-pt', 'por'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'de',
    name: 'German',
    nativeName: 'Deutsch',
    aliases: ['german', 'deu', 'ger'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'ja',
    name: 'Japanese',
    nativeName: '日本語',
    aliases: ['japanese', 'jpn'],
    script: 'Jpan',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'ko',
    name: 'Korean',
    nativeName: '한국어',
    aliases: ['korean', 'kor'],
    script: 'Kore',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'tr',
    name: 'Turkish',
    nativeName: 'Türkçe',
    aliases: ['turkish', 'tur'],
    script: 'Latn',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'ru',
    name: 'Russian',
    nativeName: 'Русский',
    aliases: ['russian', 'rus'],
    script: 'Cyrl',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  },
  {
    code: 'bn',
    name: 'Bengali',
    nativeName: 'বাংলা',
    aliases: ['bengali', 'bangla', 'ben'],
    script: 'Beng',
    direction: 'ltr',
    translationSupported: false,
    detectionSupported: true,
    onboardingVisible: true
  }
];

const byCode = new Map(CATALOG.map((entry) => [entry.code, entry]));
const aliasToCode = new Map<string, string>();
for (const entry of CATALOG) {
  aliasToCode.set(entry.code, entry.code);
  for (const alias of entry.aliases) {
    aliasToCode.set(alias.toLowerCase(), entry.code);
  }
  aliasToCode.set(entry.name.toLowerCase(), entry.code);
  aliasToCode.set(entry.nativeName.toLowerCase(), entry.code);
}

export const listSupportedLanguages = (): SupportedLanguage[] => CATALOG.map((e) => ({ ...e }));

export const listOnboardingLanguages = (): SupportedLanguage[] =>
  CATALOG.filter((e) => e.onboardingVisible).map((e) => ({ ...e }));

export const listTranslationSupportedCodes = (): string[] =>
  CATALOG.filter((e) => e.translationSupported).map((e) => e.code);

export const normalizeLanguageCode = (value: unknown): string | null => {
  const raw = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-');
  if (!raw) return null;
  if (raw === 'unknown' || raw === 'und' || raw === 'zxx') return null;
  const base = raw.split('-')[0];
  if (aliasToCode.has(raw)) return aliasToCode.get(raw)!;
  if (aliasToCode.has(base)) return aliasToCode.get(base)!;
  // fil -> tl
  if (base === 'fil') return 'tl';
  if (byCode.has(base)) return base;
  return null;
};

export const normalizeLanguageCodeList = (value: unknown, max = 24): string[] => {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]/)
      : [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const code = normalizeLanguageCode(item);
    if (!code || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
    if (out.length >= max) break;
  }
  return out;
};

export const getLanguageMeta = (code: unknown): SupportedLanguage | null => {
  const normalized = normalizeLanguageCode(code);
  if (!normalized) return null;
  return byCode.get(normalized) || null;
};

export const isRtlLanguage = (code: unknown): boolean => getLanguageMeta(code)?.direction === 'rtl';

export const formatLanguageLabel = (code: unknown): string => {
  const meta = getLanguageMeta(code);
  if (!meta) {
    const raw = String(code || '').trim();
    if (!raw || raw.toLowerCase() === 'unknown') return '';
    return raw.toUpperCase();
  }
  if (meta.nativeName && meta.nativeName !== meta.name) {
    return `${meta.nativeName} — ${meta.name}`;
  }
  return meta.name;
};
