/**
 * Phase 26 — Frontend mirror of canonical content-language catalog.
 * Keep aligned with geezle-backend/src/services/language/supportedLanguages.catalog.ts
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

export const LANGUAGE_CONFIDENCE = {
  high: 0.85,
  medium: 0.65,
  low: 0.4
} as const;

const CATALOG: SupportedLanguage[] = [
  { code: 'en', name: 'English', nativeName: 'English', aliases: ['english', 'en-us', 'eng'], direction: 'ltr', translationSupported: true, detectionSupported: true, onboardingVisible: true },
  { code: 'es', name: 'Spanish', nativeName: 'Español', aliases: ['spanish', 'spa'], direction: 'ltr', translationSupported: true, detectionSupported: true, onboardingVisible: true },
  { code: 'fr', name: 'French', nativeName: 'Français', aliases: ['french', 'fra'], direction: 'ltr', translationSupported: true, detectionSupported: true, onboardingVisible: true },
  { code: 'tl', name: 'Filipino / Tagalog', nativeName: 'Filipino', aliases: ['tagalog', 'filipino', 'fil'], direction: 'ltr', translationSupported: true, detectionSupported: true, onboardingVisible: true, searchKeywords: ['philippines'] },
  { code: 'ha', name: 'Hausa', nativeName: 'Hausa', aliases: ['hausa'], direction: 'ltr', translationSupported: true, detectionSupported: true, onboardingVisible: true },
  { code: 'sw', name: 'Swahili', nativeName: 'Kiswahili', aliases: ['swahili', 'kiswahili'], direction: 'ltr', translationSupported: true, detectionSupported: true, onboardingVisible: true },
  { code: 'zh', name: 'Chinese', nativeName: '中文', aliases: ['chinese', 'zh-cn', 'zh-hans', 'mandarin'], direction: 'ltr', translationSupported: true, detectionSupported: true, onboardingVisible: true },
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', aliases: ['arabic', 'ara'], direction: 'rtl', translationSupported: true, detectionSupported: true, onboardingVisible: true },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', aliases: ['hindi'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', aliases: ['indonesian', 'bahasa'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'ur', name: 'Urdu', nativeName: 'اردو', aliases: ['urdu'], direction: 'rtl', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'pt', name: 'Portuguese', nativeName: 'Português', aliases: ['portuguese', 'pt-br'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'de', name: 'German', nativeName: 'Deutsch', aliases: ['german'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', aliases: ['japanese'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'ko', name: 'Korean', nativeName: '한국어', aliases: ['korean'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', aliases: ['turkish'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', aliases: ['russian'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা', aliases: ['bengali', 'bangla'], direction: 'ltr', translationSupported: false, detectionSupported: true, onboardingVisible: true }
];

const aliasToCode = new Map<string, string>();
for (const entry of CATALOG) {
  aliasToCode.set(entry.code, entry.code);
  entry.aliases.forEach((a) => aliasToCode.set(a.toLowerCase(), entry.code));
  aliasToCode.set(entry.name.toLowerCase(), entry.code);
  aliasToCode.set(entry.nativeName.toLowerCase(), entry.code);
}

export const listOnboardingLanguages = () => CATALOG.filter((e) => e.onboardingVisible);
export const listSupportedLanguages = () => CATALOG.slice();

export const normalizeLanguageCode = (value: unknown): string | null => {
  const raw = String(value ?? '').trim().toLowerCase().replace(/_/g, '-');
  if (!raw || raw === 'unknown' || raw === 'und') return null;
  const base = raw.split('-')[0];
  if (base === 'fil') return 'tl';
  return aliasToCode.get(raw) || aliasToCode.get(base) || null;
};

export const normalizeLanguageCodeList = (value: unknown, max = 24): string[] => {
  const items = Array.isArray(value) ? value : typeof value === 'string' ? value.split(/[\n,]/) : [];
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

export const formatLanguageLabel = (code: unknown): string => {
  const normalized = normalizeLanguageCode(code);
  const entry = CATALOG.find((e) => e.code === normalized);
  if (!entry) {
    const raw = String(code || '').trim();
    return !raw || raw.toLowerCase() === 'unknown' ? '' : raw.toUpperCase();
  }
  return entry.nativeName !== entry.name ? `${entry.nativeName} — ${entry.name}` : entry.name;
};

export const searchLanguages = (query: string, list = listOnboardingLanguages()) => {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return list;
  return list.filter((entry) => {
    const bag = [entry.code, entry.name, entry.nativeName, ...(entry.aliases || []), ...(entry.searchKeywords || [])]
      .join(' ')
      .toLowerCase();
    return bag.includes(q);
  });
};
