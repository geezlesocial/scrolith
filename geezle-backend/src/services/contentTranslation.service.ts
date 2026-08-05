import { createHash } from 'crypto';
import prisma from '../utils/prismaClient';
import { buildLanguageDetectionResult } from './language/languageDetection.service';
import { normalizeLanguageCode, listTranslationSupportedCodes } from './language/supportedLanguages.catalog';

const CONTENT_TRANSLATION_SCOPE = 'translation_content';
const CONTENT_ENTITY_POST = 'community_post';
const TEXT_PREVIEW_LIMIT = 220;

export type ContentTranslationRuntimeMode = 'self_hosted_m2m100' | 'mock';

export type ContentTranslationConfig = {
  scope: string;
  enabled: boolean;
  runtimeMode: ContentTranslationRuntimeMode;
  runtimeBaseUrl: string;
  runtimeApiKey: string;
  runtimeApiKeyConfigured: boolean;
  engineKey: string;
  detectorKey: string;
  defaultTargetLocale: string;
  enabledSourceLocales: string[];
  enabledTargetLocales: string[];
  autoTranslatePosts: boolean;
  translateOnDemand: boolean;
  maxCharactersPerRequest: number;
  timeoutMs: number;
  cacheTtlSeconds: number;
  preserveHashtags: boolean;
  preserveMentions: boolean;
  preserveUrls: boolean;
  preserveGlossaryTerms: boolean;
};

type StoredContentTranslationConfig = Omit<ContentTranslationConfig, 'runtimeApiKeyConfigured'>;

type RuntimeDetectionResult = {
  language: string;
  confidence: number | null;
  detectorKey: string | null;
  metadata?: Record<string, any>;
};

type RuntimeTranslationResult = {
  translatedText: string;
  engineKey: string;
  modelVersion: string | null;
  latencyMs: number | null;
  metadata?: Record<string, any>;
};

type TranslationGlossaryInput = {
  sourceText?: unknown;
  replacementText?: unknown;
  locale?: unknown;
  targetLocale?: unknown;
  enabled?: unknown;
  caseSensitive?: unknown;
  priority?: unknown;
};

const DEFAULT_CONTENT_TRANSLATION_CONFIG: StoredContentTranslationConfig = {
  scope: 'default',
  enabled: true,
  runtimeMode: 'mock',
  runtimeBaseUrl: '',
  runtimeApiKey: '',
  engineKey: 'm2m100_418m',
  detectorKey: 'fasttext_lid_176',
  defaultTargetLocale: 'en',
  enabledSourceLocales: ['en', 'es', 'fr', 'tl', 'ha', 'sw', 'zh', 'ar'],
  enabledTargetLocales: ['en', 'es', 'fr', 'tl', 'ha', 'sw', 'zh', 'ar'],
  autoTranslatePosts: false,
  translateOnDemand: true,
  maxCharactersPerRequest: 5000,
  timeoutMs: 30000,
  cacheTtlSeconds: 60 * 60 * 24 * 30,
  preserveHashtags: true,
  preserveMentions: true,
  preserveUrls: true,
  preserveGlossaryTerms: true
};

const asString = (value: unknown) => String(value ?? '').trim();

const normalizeLocale = (value: unknown, fallback = 'en') => {
  const normalized = normalizeLanguageCode(value);
  if (normalized) return normalized;
  const locale = asString(value).toLowerCase().replace(/_/g, '-');
  return locale || fallback;
};

const normalizeLocaleList = (value: unknown, fallback: string[]) => {
  const items = Array.isArray(value)
    ? value
    : typeof value === 'string'
      ? value.split(/[\n,]/)
      : [];
  const locales = Array.from(new Set(items.map((item) => normalizeLocale(item)).filter(Boolean)));
  return locales.length ? locales : fallback;
};

const normalizeBoolean = (value: unknown, fallback: boolean) => {
  if (typeof value === 'boolean') return value;
  const normalized = asString(value).toLowerCase();
  if (!normalized) return fallback;
  if (['1', 'true', 'yes', 'on', 'enabled'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off', 'disabled'].includes(normalized)) return false;
  return fallback;
};

const normalizeInt = (value: unknown, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, parsed));
};

const normalizeFloat = (value: unknown, fallback: number | null = null) => {
  const parsed = Number.parseFloat(String(value ?? ''));
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
};

const summarizeText = (value: unknown, maxLength = TEXT_PREVIEW_LIMIT) => {
  const text = asString(value).replace(/\s+/g, ' ');
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
};

const normalizeRuntimeMode = (value: unknown, fallback: ContentTranslationRuntimeMode): ContentTranslationRuntimeMode => {
  const normalized = asString(value).toLowerCase();
  if (normalized === 'mock') return 'mock';
  if (normalized === 'self_hosted_m2m100' || normalized === 'm2m100' || normalized === 'http_m2m100') {
    return 'self_hosted_m2m100';
  }
  return fallback;
};

const normalizeContentTranslationConfig = (value: unknown): StoredContentTranslationConfig => {
  const raw = value && typeof value === 'object' ? (value as Record<string, any>) : {};
  return {
    scope: asString(raw.scope) || DEFAULT_CONTENT_TRANSLATION_CONFIG.scope,
    enabled: normalizeBoolean(raw.enabled, DEFAULT_CONTENT_TRANSLATION_CONFIG.enabled),
    runtimeMode: normalizeRuntimeMode(raw.runtimeMode, DEFAULT_CONTENT_TRANSLATION_CONFIG.runtimeMode),
    runtimeBaseUrl: asString(raw.runtimeBaseUrl || raw.baseUrl),
    runtimeApiKey: asString(raw.runtimeApiKey || raw.apiKey),
    engineKey: asString(raw.engineKey) || DEFAULT_CONTENT_TRANSLATION_CONFIG.engineKey,
    detectorKey: asString(raw.detectorKey) || DEFAULT_CONTENT_TRANSLATION_CONFIG.detectorKey,
    defaultTargetLocale: normalizeLocale(raw.defaultTargetLocale, DEFAULT_CONTENT_TRANSLATION_CONFIG.defaultTargetLocale),
    enabledSourceLocales: normalizeLocaleList(raw.enabledSourceLocales, DEFAULT_CONTENT_TRANSLATION_CONFIG.enabledSourceLocales),
    enabledTargetLocales: normalizeLocaleList(raw.enabledTargetLocales, DEFAULT_CONTENT_TRANSLATION_CONFIG.enabledTargetLocales),
    autoTranslatePosts: normalizeBoolean(raw.autoTranslatePosts, DEFAULT_CONTENT_TRANSLATION_CONFIG.autoTranslatePosts),
    translateOnDemand: normalizeBoolean(raw.translateOnDemand, DEFAULT_CONTENT_TRANSLATION_CONFIG.translateOnDemand),
    maxCharactersPerRequest: normalizeInt(raw.maxCharactersPerRequest, DEFAULT_CONTENT_TRANSLATION_CONFIG.maxCharactersPerRequest, 120, 20000),
    timeoutMs: normalizeInt(raw.timeoutMs, DEFAULT_CONTENT_TRANSLATION_CONFIG.timeoutMs, 1000, 60000),
    cacheTtlSeconds: normalizeInt(raw.cacheTtlSeconds, DEFAULT_CONTENT_TRANSLATION_CONFIG.cacheTtlSeconds, 60, 60 * 60 * 24 * 90),
    preserveHashtags: normalizeBoolean(raw.preserveHashtags, DEFAULT_CONTENT_TRANSLATION_CONFIG.preserveHashtags),
    preserveMentions: normalizeBoolean(raw.preserveMentions, DEFAULT_CONTENT_TRANSLATION_CONFIG.preserveMentions),
    preserveUrls: normalizeBoolean(raw.preserveUrls, DEFAULT_CONTENT_TRANSLATION_CONFIG.preserveUrls),
    preserveGlossaryTerms: normalizeBoolean(raw.preserveGlossaryTerms, DEFAULT_CONTENT_TRANSLATION_CONFIG.preserveGlossaryTerms)
  };
};

const sanitizeContentTranslationConfig = (config: StoredContentTranslationConfig): ContentTranslationConfig => ({
  ...config,
  runtimeApiKey: '',
  runtimeApiKeyConfigured: Boolean(asString(config.runtimeApiKey))
});

const buildContentHash = (title: unknown, content: unknown) =>
  createHash('sha256').update(`${asString(title)}\n${asString(content)}`).digest('hex');

const buildTranslationVersion = (config: StoredContentTranslationConfig) =>
  `${config.runtimeMode}:${config.engineKey}`;

const buildAuditLog = async (
  eventType: string,
  metadata: Record<string, any>,
  actorId?: string | null,
  entityType?: string | null,
  entityId?: string | null
) => {
  try {
    await prisma.contentTranslationAuditLog.create({
      data: {
        actorId: asString(actorId) || null,
        eventType,
        entityType: asString(entityType) || null,
        entityId: asString(entityId) || null,
        metadata
      }
    });
  } catch (error) {
    console.warn('[contentTranslation] Failed to persist audit log', eventType, error);
  }
};

const withAbortTimeout = async <T>(timeoutMs: number, work: (signal: AbortSignal) => Promise<T>) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await work(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

const unwrapPayload = (payload: any) => {
  if (payload?.data && typeof payload.data === 'object') return payload.data;
  return payload;
};

const extractRuntimeTranslationText = (payload: any) => {
  const data = unwrapPayload(payload);
  return asString(data?.translatedText ?? data?.translation ?? data?.text ?? data?.output ?? data?.result);
};

const detectLanguageWithMock = (text: string, detectorKey: string): RuntimeDetectionResult => {
  const normalized = String(text || '').toLowerCase();
  const hasArabic = /[\u0600-\u06ff]/.test(normalized);
  const hasChinese = /[\u4e00-\u9fff]/.test(normalized);
  if (hasArabic) return { language: 'ar', confidence: 0.6, detectorKey, metadata: { runtimeMode: 'mock' } };
  if (hasChinese) return { language: 'zh', confidence: 0.6, detectorKey, metadata: { runtimeMode: 'mock' } };
  if (/\b(hola|gracias|buenos)\b/.test(normalized)) return { language: 'es', confidence: 0.55, detectorKey, metadata: { runtimeMode: 'mock' } };
  if (/\b(bonjour|merci|salut)\b/.test(normalized)) return { language: 'fr', confidence: 0.55, detectorKey, metadata: { runtimeMode: 'mock' } };
  if (/\b(salamu|habari|asante)\b/.test(normalized)) return { language: 'sw', confidence: 0.55, detectorKey, metadata: { runtimeMode: 'mock' } };
  if (/\b(kumusta|salamat|po)\b/.test(normalized)) return { language: 'tl', confidence: 0.55, detectorKey, metadata: { runtimeMode: 'mock' } };
  if (/\b(sannu|na gode)\b/.test(normalized)) return { language: 'ha', confidence: 0.55, detectorKey, metadata: { runtimeMode: 'mock' } };
  return { language: 'en', confidence: 0.5, detectorKey, metadata: { runtimeMode: 'mock' } };
};

const LOCAL_TRANSLATION_DICTIONARIES: Record<string, Record<string, string>> = {
  'es:en': {
    'publicación de prueba': 'test post',
    'publicacion de prueba': 'test post',
    'hola desde': 'hello from',
    publicación: 'post',
    publicacion: 'post',
    prueba: 'test',
    hola: 'hello',
    desde: 'from',
    para: 'for',
    con: 'with',
    gracias: 'thank you',
    buenos: 'good',
    dias: 'morning',
    días: 'morning',
    equipo: 'team',
    trabajo: 'work',
    oportunidad: 'opportunity',
    profesional: 'professional',
    comunidad: 'community',
    y: 'and',
    de: 'of'
  },
  'fr:en': {
    'publication de test': 'test post',
    bonjour: 'hello',
    depuis: 'from',
    merci: 'thank you',
    travail: 'work',
    équipe: 'team',
    equipe: 'team',
    opportunité: 'opportunity',
    opportunite: 'opportunity',
    professionnel: 'professional',
    communauté: 'community',
    communaute: 'community',
    et: 'and',
    de: 'of',
    avec: 'with'
  },
  'tl:en': {
    kumusta: 'hello',
    salamat: 'thank you',
    mula: 'from',
    trabaho: 'work',
    koponan: 'team',
    oportunidad: 'opportunity',
    komunidad: 'community',
    at: 'and'
  },
  'sw:en': {
    habari: 'hello',
    asante: 'thank you',
    kutoka: 'from',
    kazi: 'work',
    timu: 'team',
    nafasi: 'opportunity',
    jamii: 'community',
    na: 'and'
  },
  'ha:en': {
    sannu: 'hello',
    'na gode': 'thank you',
    daga: 'from',
    aiki: 'work',
    kungiya: 'team',
    dama: 'opportunity',
    aluma: 'community',
    da: 'and'
  },
  'en:es': {
    'test post': 'publicación de prueba',
    hello: 'hola',
    from: 'desde',
    work: 'trabajo',
    team: 'equipo',
    opportunity: 'oportunidad',
    community: 'comunidad',
    and: 'y'
  },
  'en:fr': {
    'test post': 'publication de test',
    hello: 'bonjour',
    from: 'depuis',
    work: 'travail',
    team: 'équipe',
    opportunity: 'opportunité',
    community: 'communauté',
    and: 'et'
  }
};

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const applyLocalDictionaryTranslation = (text: string, sourceLocale: string, targetLocale: string) => {
  const source = normalizeLocale(sourceLocale, '');
  const target = normalizeLocale(targetLocale, 'en');
  if (!text || !source || source === target) return text;

  const dictionary = LOCAL_TRANSLATION_DICTIONARIES[`${source}:${target}`];
  if (!dictionary) return text;

  let translated = text;
  const entries = Object.entries(dictionary).sort((a, b) => b[0].length - a[0].length);
  for (const [sourcePhrase, translatedPhrase] of entries) {
    const pattern = new RegExp(`(^|[^\\p{L}\\p{N}_])(${escapeRegExp(sourcePhrase)})(?=$|[^\\p{L}\\p{N}_])`, 'giu');
    translated = translated.replace(pattern, (_match, prefix: string, phrase: string) => {
      const replacement =
        phrase === phrase.toUpperCase()
          ? translatedPhrase.toUpperCase()
          : /^[A-ZÁÉÍÓÚÑ]/.test(phrase)
            ? `${translatedPhrase.charAt(0).toUpperCase()}${translatedPhrase.slice(1)}`
            : translatedPhrase;
      return `${prefix}${replacement}`;
    });
  }

  return translated.replace(/\s+/g, ' ').trim();
};

export const translateWithLocalFallback = (
  text: string,
  sourceLocale: string,
  targetLocale: string,
  engineKey: string
): RuntimeTranslationResult => ({
  translatedText: applyLocalDictionaryTranslation(text, sourceLocale, targetLocale),
  engineKey,
  modelVersion: 'local-dictionary-v1',
  latencyMs: 0,
  metadata: { runtimeMode: 'mock', fallback: 'local_dictionary' }
});

const protectSegments = async (
  text: string,
  sourceLocale: string,
  targetLocale: string,
  config: StoredContentTranslationConfig
) => {
  const protectedEntries: Array<{ token: string; value: string }> = [];
  let nextText = String(text || '');
  if (!nextText) {
    return { text: nextText, glossaryApplied: false, restore: (value: string) => value };
  }

  const addProtectedValue = (value: string) => {
    if (!value || protectedEntries.some((entry) => entry.value === value)) return;
    const token = `__SCROLITH_KEEP_${protectedEntries.length}__`;
    protectedEntries.push({ token, value });
    nextText = nextText.split(value).join(token);
  };

  if (config.preserveUrls) {
    const matches = Array.from(new Set(nextText.match(/https?:\/\/[^\s]+|www\.[^\s]+/gi) || []));
    matches.forEach((match) => addProtectedValue(match));
  }

  if (config.preserveMentions) {
    const matches = Array.from(new Set(nextText.match(/(^|\s)(@\w[\w.-]*)/g) || []))
      .map((entry) => entry.trim())
      .filter(Boolean);
    matches.forEach((match) => addProtectedValue(match));
  }

  if (config.preserveHashtags) {
    const matches = Array.from(new Set(nextText.match(/(^|\s)(#\w[\w-]*)/g) || []))
      .map((entry) => entry.trim())
      .filter(Boolean);
    matches.forEach((match) => addProtectedValue(match));
  }

  let glossaryApplied = false;
  if (config.preserveGlossaryTerms) {
    const glossaryEntries = await prisma.contentTranslationGlossaryEntry.findMany({
      where: {
        enabled: true,
        OR: [{ locale: null }, { locale: sourceLocale }],
        AND: [
          {
            OR: [{ targetLocale: null }, { targetLocale }]
          }
        ]
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
    });

    glossaryEntries.forEach((entry) => {
      const sourceText = asString(entry.sourceText);
      const replacementText = asString(entry.replacementText || entry.sourceText);
      if (!sourceText || !replacementText) return;
      const matcher = entry.caseSensitive ? sourceText : sourceText.toLowerCase();
      const haystack = entry.caseSensitive ? nextText : nextText.toLowerCase();
      if (!haystack.includes(matcher)) return;
      glossaryApplied = true;
      addProtectedValue(replacementText === sourceText ? sourceText : replacementText);
    });
  }

  return {
    text: nextText,
    glossaryApplied,
    restore: (value: string) => {
      let restored = String(value || '');
      protectedEntries.forEach((entry) => {
        restored = restored.split(entry.token).join(entry.value);
      });
      return restored;
    }
  };
};

const callRuntimeDetect = async (text: string, config: StoredContentTranslationConfig): Promise<RuntimeDetectionResult> => {
  if (config.runtimeMode === 'mock') {
    return detectLanguageWithMock(text, config.detectorKey);
  }
  if (!config.runtimeBaseUrl) {
    throw new Error('Content translation runtime URL is not configured.');
  }

  const startedAt = Date.now();
  const response = await withAbortTimeout(config.timeoutMs, async (signal) =>
    fetch(`${config.runtimeBaseUrl.replace(/\/+$/, '')}/detect`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.runtimeApiKey ? { Authorization: `Bearer ${config.runtimeApiKey}` } : {})
      },
      body: JSON.stringify({
        text,
        detector: config.detectorKey,
        allowedLocales: config.enabledSourceLocales
      }),
      signal
    })
  );

  if (!response.ok) {
    throw new Error(`Content translation detection failed with status ${response.status}`);
  }

  const payload = unwrapPayload(await response.json());
  return {
    language: normalizeLocale(payload?.language ?? payload?.locale ?? payload?.detectedLanguage ?? payload?.sourceLanguage),
    confidence: normalizeFloat(payload?.confidence ?? payload?.score),
    detectorKey: asString(payload?.detectorKey || config.detectorKey) || null,
    metadata: { runtimeMode: config.runtimeMode, latencyMs: Date.now() - startedAt, raw: payload }
  };
};

const callRuntimeTranslate = async (
  text: string,
  sourceLocale: string,
  targetLocale: string,
  config: StoredContentTranslationConfig
): Promise<RuntimeTranslationResult> => {
  if (config.runtimeMode === 'mock') {
    return translateWithLocalFallback(text, sourceLocale, targetLocale, config.engineKey);
  }
  if (!config.runtimeBaseUrl) {
    return translateWithLocalFallback(text, sourceLocale, targetLocale, config.engineKey);
  }

  const startedAt = Date.now();
  let response: Response;
  try {
    response = await withAbortTimeout(config.timeoutMs, async (signal) =>
      fetch(`${config.runtimeBaseUrl.replace(/\/+$/, '')}/translate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(config.runtimeApiKey ? { Authorization: `Bearer ${config.runtimeApiKey}` } : {})
        },
        body: JSON.stringify({
          text,
          sourceLanguage: sourceLocale,
          targetLanguage: targetLocale,
          model: config.engineKey
        }),
        signal
      })
    );
  } catch (error: any) {
    const fallback = translateWithLocalFallback(text, sourceLocale, targetLocale, config.engineKey);
    return {
      ...fallback,
      metadata: {
        ...(fallback.metadata || {}),
        runtimeMode: config.runtimeMode,
        runtimeFallbackReason: String(error?.message || error || 'runtime_fetch_failed')
      }
    };
  }

  if (!response.ok) {
    const fallback = translateWithLocalFallback(text, sourceLocale, targetLocale, config.engineKey);
    return {
      ...fallback,
      metadata: {
        ...(fallback.metadata || {}),
        runtimeMode: config.runtimeMode,
        runtimeFallbackReason: `runtime_status_${response.status}`
      }
    };
  }

  const rawPayload = await response.json();
  const payload = unwrapPayload(rawPayload);
  const translatedText = extractRuntimeTranslationText(rawPayload);
  if (!translatedText) {
    throw new Error('Content translation runtime returned an empty translation.');
  }

  return {
    translatedText,
    engineKey: asString(payload?.engineKey || payload?.model || config.engineKey) || config.engineKey,
    modelVersion: asString(payload?.modelVersion || payload?.version) || null,
    latencyMs: Date.now() - startedAt,
    metadata: { runtimeMode: config.runtimeMode, raw: payload }
  };
};

const detectTextLanguage = async (
  text: string,
  config?: StoredContentTranslationConfig
): Promise<RuntimeDetectionResult> => {
  const effectiveConfig = config || (await getStoredContentTranslationConfig());
  return callRuntimeDetect(text, effectiveConfig);
};

const translateText = async (
  text: string,
  sourceLocale: string,
  targetLocale: string,
  config: StoredContentTranslationConfig
) => {
  const protectedSegments = await protectSegments(text, sourceLocale, targetLocale, config);
  const runtimeResult = await callRuntimeTranslate(protectedSegments.text, sourceLocale, targetLocale, config);
  return {
    translatedText: protectedSegments.restore(runtimeResult.translatedText),
    engineKey: runtimeResult.engineKey,
    modelVersion: runtimeResult.modelVersion,
    latencyMs: runtimeResult.latencyMs,
    metadata: runtimeResult.metadata,
    glossaryApplied: protectedSegments.glossaryApplied
  };
};

const getStoredContentTranslationConfig = async (): Promise<StoredContentTranslationConfig> => {
  const record = await prisma.appSetting.findUnique({ where: { scope: CONTENT_TRANSLATION_SCOPE } });
  if (!record) {
    await prisma.appSetting.create({
      data: {
        scope: CONTENT_TRANSLATION_SCOPE,
        data: DEFAULT_CONTENT_TRANSLATION_CONFIG
      }
    });
    return { ...DEFAULT_CONTENT_TRANSLATION_CONFIG };
  }
  const normalized = normalizeContentTranslationConfig(record.data);
  const raw = record.data && typeof record.data === 'object' ? (record.data as Record<string, any>) : {};
  const isLegacyDisabledDefault =
    normalized.enabled === false &&
    normalized.runtimeMode === 'self_hosted_m2m100' &&
    !normalized.runtimeBaseUrl &&
    !normalized.runtimeApiKey &&
    normalized.scope === DEFAULT_CONTENT_TRANSLATION_CONFIG.scope &&
    normalized.engineKey === DEFAULT_CONTENT_TRANSLATION_CONFIG.engineKey &&
    normalized.detectorKey === DEFAULT_CONTENT_TRANSLATION_CONFIG.detectorKey &&
    raw.enabled === false;

  if (isLegacyDisabledDefault) {
    await prisma.appSetting.update({
      where: { scope: CONTENT_TRANSLATION_SCOPE },
      data: { data: DEFAULT_CONTENT_TRANSLATION_CONFIG }
    });
    await buildAuditLog(
      'translation.config_auto_activated',
      {
        reason: 'legacy_disabled_default',
        runtimeMode: DEFAULT_CONTENT_TRANSLATION_CONFIG.runtimeMode,
        translateOnDemand: DEFAULT_CONTENT_TRANSLATION_CONFIG.translateOnDemand
      },
      null,
      'translation_config',
      DEFAULT_CONTENT_TRANSLATION_CONFIG.scope
    );
    return { ...DEFAULT_CONTENT_TRANSLATION_CONFIG };
  }

  return normalized;
};

export const getContentTranslationConfig = async (): Promise<ContentTranslationConfig> => {
  const config = await getStoredContentTranslationConfig();
  return sanitizeContentTranslationConfig(config);
};

export const updateContentTranslationConfig = async (
  patch: Partial<StoredContentTranslationConfig>,
  actorId?: string | null
) => {
  const current = await getStoredContentTranslationConfig();
  const merged = normalizeContentTranslationConfig({
    ...current,
    ...patch,
    runtimeApiKey: patch.runtimeApiKey !== undefined ? patch.runtimeApiKey : current.runtimeApiKey
  });
  await prisma.appSetting.upsert({
    where: { scope: CONTENT_TRANSLATION_SCOPE },
    create: { scope: CONTENT_TRANSLATION_SCOPE, data: merged },
    update: { data: merged }
  });
  await buildAuditLog(
    'translation.config_updated',
    {
      enabled: merged.enabled,
      runtimeMode: merged.runtimeMode,
      runtimeBaseUrlConfigured: Boolean(merged.runtimeBaseUrl),
      runtimeApiKeyConfigured: Boolean(merged.runtimeApiKey),
      engineKey: merged.engineKey,
      detectorKey: merged.detectorKey,
      enabledSourceLocales: merged.enabledSourceLocales,
      enabledTargetLocales: merged.enabledTargetLocales,
      translateOnDemand: merged.translateOnDemand
    },
    actorId,
    'translation_config',
    merged.scope
  );
  return sanitizeContentTranslationConfig(merged);
};

export const getContentTranslationOverview = async () => {
  const [config, glossaryCount, translationStats, detectionCount, latestAudit, latestTranslation] = await Promise.all([
    getContentTranslationConfig(),
    prisma.contentTranslationGlossaryEntry.count({ where: { enabled: true } }),
    prisma.contentTranslation.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.contentLanguageDetection.count(),
    prisma.contentTranslationAuditLog.findFirst({ orderBy: { createdAt: 'desc' }, select: { createdAt: true, eventType: true } }),
    prisma.contentTranslation.findFirst({
      where: { status: 'ready' },
      orderBy: { updatedAt: 'desc' },
      select: { updatedAt: true, targetLocale: true, sourceLocale: true }
    })
  ]);

  const totals = translationStats.reduce(
    (acc, row) => {
      acc.total += row._count._all;
      if (row.status === 'ready') acc.ready += row._count._all;
      if (row.status === 'failed') acc.failed += row._count._all;
      return acc;
    },
    { total: 0, ready: 0, failed: 0 }
  );

  return {
    config,
    stats: {
      glossaryCount,
      detectionCount,
      totalTranslations: totals.total,
      readyTranslations: totals.ready,
      failedTranslations: totals.failed,
      latestAuditAt: latestAudit?.createdAt?.toISOString?.() || null,
      latestAuditEvent: latestAudit?.eventType || null,
      latestTranslationAt: latestTranslation?.updatedAt?.toISOString?.() || null,
      latestTranslationTargetLocale: latestTranslation?.targetLocale || null,
      latestTranslationSourceLocale: latestTranslation?.sourceLocale || null
    }
  };
};

export const listContentTranslationGlossary = async () =>
  prisma.contentTranslationGlossaryEntry.findMany({
    orderBy: [{ priority: 'asc' }, { updatedAt: 'desc' }]
  });

const normalizeGlossaryEntry = (payload: TranslationGlossaryInput) => {
  const sourceText = asString(payload.sourceText);
  const replacementText = asString(payload.replacementText || payload.sourceText);
  if (!sourceText || !replacementText) {
    throw new Error('sourceText and replacementText are required.');
  }
  return {
    sourceText,
    replacementText,
    locale: asString(payload.locale) || null,
    targetLocale: asString(payload.targetLocale) || null,
    enabled: normalizeBoolean(payload.enabled, true),
    caseSensitive: normalizeBoolean(payload.caseSensitive, false),
    priority: normalizeInt(payload.priority, 100, 1, 10000)
  };
};

export const createContentTranslationGlossaryEntry = async (
  payload: TranslationGlossaryInput,
  actorId?: string | null
) => {
  const normalized = normalizeGlossaryEntry(payload);
  const entry = await prisma.contentTranslationGlossaryEntry.create({
    data: {
      ...normalized,
      createdById: asString(actorId) || null,
      updatedById: asString(actorId) || null
    }
  });
  await buildAuditLog(
    'translation.glossary_created',
    {
      sourceText: summarizeText(entry.sourceText, 80),
      replacementText: summarizeText(entry.replacementText, 80),
      locale: entry.locale,
      targetLocale: entry.targetLocale
    },
    actorId,
    'translation_glossary',
    entry.id
  );
  return entry;
};

export const updateContentTranslationGlossaryEntry = async (
  id: string,
  payload: TranslationGlossaryInput,
  actorId?: string | null
) => {
  const normalized = normalizeGlossaryEntry(payload);
  const entry = await prisma.contentTranslationGlossaryEntry.update({
    where: { id },
    data: {
      ...normalized,
      updatedById: asString(actorId) || null
    }
  });
  await buildAuditLog(
    'translation.glossary_updated',
    {
      sourceText: summarizeText(entry.sourceText, 80),
      replacementText: summarizeText(entry.replacementText, 80),
      locale: entry.locale,
      targetLocale: entry.targetLocale
    },
    actorId,
    'translation_glossary',
    entry.id
  );
  return entry;
};

export const deleteContentTranslationGlossaryEntry = async (
  id: string,
  actorId?: string | null
) => {
  const existing = await prisma.contentTranslationGlossaryEntry.findUnique({ where: { id } });
  if (!existing) {
    throw new Error('Glossary entry not found.');
  }
  await prisma.contentTranslationGlossaryEntry.delete({ where: { id } });
  await buildAuditLog(
    'translation.glossary_deleted',
    {
      sourceText: summarizeText(existing.sourceText, 80),
      replacementText: summarizeText(existing.replacementText, 80)
    },
    actorId,
    'translation_glossary',
    id
  );
};

export const listContentTranslationAuditLogs = async (limit = 40) =>
  prisma.contentTranslationAuditLog.findMany({
    orderBy: { createdAt: 'desc' },
    take: Math.max(1, Math.min(200, limit))
  });

export const upsertCommunityPostLanguageMetadata = async (
  postId: string,
  title: string | null | undefined,
  content: string | null | undefined,
  options?: { force?: boolean }
) => {
  const normalizedPostId = asString(postId);
  if (!normalizedPostId) return null;

  const existing = await prisma.communityPost.findUnique({
    where: { id: normalizedPostId },
    select: {
      languageManuallySet: true,
      sourceLanguage: true,
      sourceLanguageConfidence: true
    }
  });

  // Manual correction must not be overwritten by automatic reprocessing.
  if (existing?.languageManuallySet && !options?.force) {
    return prisma.communityPost.findUnique({ where: { id: normalizedPostId } });
  }

  const normalizedTitle = asString(title);
  const normalizedContent = asString(content);
  const contentHash = buildContentHash(normalizedTitle, normalizedContent);
  const config = await getStoredContentTranslationConfig();
  const translationVersion = buildTranslationVersion(config);
  const sourceText = [normalizedTitle, normalizedContent].filter(Boolean).join('\n\n').trim();

  if (!sourceText) {
    return prisma.communityPost.update({
      where: { id: normalizedPostId },
      data: {
        sourceLanguage: null,
        sourceLanguageConfidence: null,
        languageDetectionStatus: 'no_linguistic_content',
        isMixedLanguage: false,
        detectedLanguageCodes: [],
        languageDetectedAt: new Date(),
        contentHash,
        translationVersion
      }
    });
  }

  let runtimeDetection: RuntimeDetectionResult | null = null;
  let detectionError: string | null = null;
  if (config.enabled) {
    try {
      runtimeDetection = await detectTextLanguage(sourceText.slice(0, config.maxCharactersPerRequest), config);
    } catch (error: any) {
      detectionError = String(error?.message || error || 'detection_failed');
      console.warn('[contentTranslation] post language detection failed', normalizedPostId, detectionError);
    }
  }

  const hardened = buildLanguageDetectionResult({
    rawText: sourceText,
    providerLanguage: runtimeDetection?.language,
    providerConfidence: runtimeDetection?.confidence,
    providerKey: runtimeDetection?.detectorKey,
    source: config.runtimeMode === 'mock' ? 'heuristic' : 'provider'
  });

  if (detectionError && !hardened.languageCode) {
    hardened.status = 'detection_failed';
    hardened.reason = detectionError;
  }

  const languageCode =
    hardened.status === 'no_linguistic_content' || hardened.status === 'detection_failed'
      ? null
      : hardened.languageCode;

  const updated = await prisma.communityPost.update({
    where: { id: normalizedPostId },
    data: {
      sourceLanguage: languageCode,
      sourceLanguageConfidence: hardened.confidence || null,
      languageDetectionStatus: hardened.status,
      isMixedLanguage: hardened.isMixedLanguage,
      detectedLanguageCodes: hardened.candidates.map((c) => c.languageCode).slice(0, 5),
      languageDetectedAt: new Date(),
      contentHash,
      translationVersion
    }
  });

  if (languageCode) {
    await prisma.contentLanguageDetection.upsert({
      where: {
        entityType_entityId_contentHash: {
          entityType: CONTENT_ENTITY_POST,
          entityId: normalizedPostId,
          contentHash
        }
      },
      create: {
        entityType: CONTENT_ENTITY_POST,
        entityId: normalizedPostId,
        sourceLocale: languageCode,
        confidence: hardened.confidence ?? null,
        detectorKey: runtimeDetection?.detectorKey || hardened.source,
        contentHash,
        metadata: {
          ...(runtimeDetection?.metadata || {}),
          status: hardened.status,
          isMixedLanguage: hardened.isMixedLanguage,
          candidates: hardened.candidates
        }
      },
      update: {
        sourceLocale: languageCode,
        confidence: hardened.confidence ?? null,
        detectorKey: runtimeDetection?.detectorKey || hardened.source,
        metadata: {
          ...(runtimeDetection?.metadata || {}),
          status: hardened.status,
          isMixedLanguage: hardened.isMixedLanguage,
          candidates: hardened.candidates
        }
      }
    });
  }

  return updated;
};

/** Author/moderator manual language override. */
export const setCommunityPostLanguageManual = async (
  postId: string,
  languageCode: string,
  actorId?: string | null
) => {
  const code = normalizeLanguageCode(languageCode);
  if (!code) throw new Error('Invalid language code.');
  const normalizedPostId = asString(postId);
  if (!normalizedPostId) throw new Error('Post id required.');

  const updated = await prisma.communityPost.update({
    where: { id: normalizedPostId },
    data: {
      sourceLanguage: code,
      sourceLanguageConfidence: 1,
      languageDetectionStatus: 'detected',
      isMixedLanguage: false,
      detectedLanguageCodes: [code],
      languageManuallySet: true,
      languageDetectedAt: new Date()
    }
  });

  await buildAuditLog(
    'translation.language_manual_set',
    { languageCode: code },
    actorId,
    CONTENT_ENTITY_POST,
    normalizedPostId
  );

  return updated;
};

export const getTranslationSupportedLocales = () => listTranslationSupportedCodes();

export const isLegacyPlaceholderTranslation = (value: {
  translatedTitle?: string | null;
  translatedContent?: string | null;
  modelVersion?: string | null;
}) => {
  const title = asString(value.translatedTitle);
  const content = asString(value.translatedContent);
  const modelVersion = asString(value.modelVersion).toLowerCase();
  const markerPattern = /^\[[a-z]{2,3}(?:-[a-z0-9]+)?->[a-z]{2,3}(?:-[a-z0-9]+)?\]\s*/i;
  return modelVersion === 'mock-v1' || markerPattern.test(title) || markerPattern.test(content);
};

export const translateCommunityPostForLocale = async (
  postId: string,
  targetLocale: string
) => {
  const normalizedPostId = asString(postId);
  if (!normalizedPostId) {
    throw new Error('Post ID is required.');
  }

  const config = await getStoredContentTranslationConfig();
  if (!config.enabled) {
    throw new Error('Content translation is disabled.');
  }
  if (!config.translateOnDemand) {
    throw new Error('On-demand content translation is disabled.');
  }

  const normalizedTargetLocale = normalizeLocale(targetLocale, config.defaultTargetLocale);
  if (!config.enabledTargetLocales.includes(normalizedTargetLocale)) {
    throw new Error('Target locale is not enabled for content translation.');
  }

  const post = await prisma.communityPost.findUnique({
    where: { id: normalizedPostId },
    select: {
      id: true,
      title: true,
      content: true,
      status: true,
      sourceLanguage: true,
      sourceLanguageConfidence: true,
      contentHash: true,
      translationVersion: true
    }
  });

  if (!post || post.status === 'deleted') {
    throw new Error('Post not found.');
  }

  const normalizedTitle = asString(post.title);
  const normalizedContent = asString(post.content);
  const contentHash = post.contentHash || buildContentHash(normalizedTitle, normalizedContent);
  const translationVersion = asString(post.translationVersion) || buildTranslationVersion(config);

  let sourceLanguage = normalizeLocale(post.sourceLanguage, '');
  let sourceLanguageConfidence = normalizeFloat(post.sourceLanguageConfidence, null);

  if (!sourceLanguage) {
    const updated = await upsertCommunityPostLanguageMetadata(post.id, post.title, post.content);
    sourceLanguage = normalizeLocale(updated?.sourceLanguage, '');
    sourceLanguageConfidence = normalizeFloat(updated?.sourceLanguageConfidence, null);
  }

  if (!sourceLanguage) {
    sourceLanguage = config.defaultTargetLocale;
  }

  if (normalizeLocale(sourceLanguage) === normalizedTargetLocale) {
    return {
      postId: post.id,
      sourceLanguage,
      sourceLanguageConfidence,
      targetLocale: normalizedTargetLocale,
      translatedTitle: normalizedTitle || null,
      translatedContent: normalizedContent,
      cacheHit: true,
      engineKey: config.engineKey,
      modelVersion: translationVersion,
      glossaryApplied: false,
      translatedAt: new Date().toISOString()
    };
  }

  const existing = await prisma.contentTranslation.findUnique({
    where: {
      entityType_entityId_targetLocale_contentHash: {
        entityType: CONTENT_ENTITY_POST,
        entityId: post.id,
        targetLocale: normalizedTargetLocale,
        contentHash
      }
    }
  });

  if (existing?.status === 'ready' && !isLegacyPlaceholderTranslation(existing)) {
    return {
      postId: post.id,
      sourceLanguage,
      sourceLanguageConfidence,
      targetLocale: normalizedTargetLocale,
      translatedTitle: existing.translatedTitle || null,
      translatedContent: existing.translatedContent,
      cacheHit: true,
      engineKey: existing.engineKey,
      modelVersion: existing.modelVersion || null,
      glossaryApplied: existing.glossaryApplied,
      translatedAt: existing.updatedAt.toISOString()
    };
  }

  let translatedTitle = normalizedTitle || null;
  let translatedContent = normalizedContent;
  let latencyMsTotal = 0;
  let glossaryApplied = false;
  let modelVersion: string | null = translationVersion;
  let engineKey = config.engineKey;

  try {
    if (normalizedTitle) {
      const titleResult = await translateText(normalizedTitle.slice(0, config.maxCharactersPerRequest), sourceLanguage, normalizedTargetLocale, config);
      translatedTitle = titleResult.translatedText || normalizedTitle;
      engineKey = titleResult.engineKey || engineKey;
      modelVersion = titleResult.modelVersion || modelVersion;
      latencyMsTotal += titleResult.latencyMs || 0;
      glossaryApplied = glossaryApplied || titleResult.glossaryApplied;
    }

    const contentResult = await translateText(normalizedContent.slice(0, config.maxCharactersPerRequest), sourceLanguage, normalizedTargetLocale, config);
    translatedContent = contentResult.translatedText || normalizedContent;
    engineKey = contentResult.engineKey || engineKey;
    modelVersion = contentResult.modelVersion || modelVersion;
    latencyMsTotal += contentResult.latencyMs || 0;
    glossaryApplied = glossaryApplied || contentResult.glossaryApplied;

    const stored = await prisma.contentTranslation.upsert({
      where: {
        entityType_entityId_targetLocale_contentHash: {
          entityType: CONTENT_ENTITY_POST,
          entityId: post.id,
          targetLocale: normalizedTargetLocale,
          contentHash
        }
      },
      create: {
        entityType: CONTENT_ENTITY_POST,
        entityId: post.id,
        sourceLocale: sourceLanguage,
        targetLocale: normalizedTargetLocale,
        contentHash,
        translatedTitle,
        translatedContent,
        engineKey,
        modelVersion,
        status: 'ready',
        glossaryApplied,
        latencyMs: latencyMsTotal,
        metadata: { translationVersion }
      },
      update: {
        sourceLocale: sourceLanguage,
        translatedTitle,
        translatedContent,
        engineKey,
        modelVersion,
        status: 'ready',
        glossaryApplied,
        latencyMs: latencyMsTotal,
        errorMessage: null,
        metadata: { translationVersion }
      }
    });

    await buildAuditLog(
      'translation.generated',
      {
        targetLocale: normalizedTargetLocale,
        sourceLanguage,
        cacheHit: false,
        engineKey,
        modelVersion
      },
      null,
      CONTENT_ENTITY_POST,
      post.id
    );

    return {
      postId: post.id,
      sourceLanguage,
      sourceLanguageConfidence,
      targetLocale: normalizedTargetLocale,
      translatedTitle: stored.translatedTitle || null,
      translatedContent: stored.translatedContent,
      cacheHit: false,
      engineKey: stored.engineKey,
      modelVersion: stored.modelVersion || null,
      glossaryApplied: stored.glossaryApplied,
      translatedAt: stored.updatedAt.toISOString()
    };
  } catch (error: any) {
    await prisma.contentTranslation.upsert({
      where: {
        entityType_entityId_targetLocale_contentHash: {
          entityType: CONTENT_ENTITY_POST,
          entityId: post.id,
          targetLocale: normalizedTargetLocale,
          contentHash
        }
      },
      create: {
        entityType: CONTENT_ENTITY_POST,
        entityId: post.id,
        sourceLocale: sourceLanguage,
        targetLocale: normalizedTargetLocale,
        contentHash,
        translatedTitle: null,
        translatedContent: '',
        engineKey: config.engineKey,
        modelVersion: translationVersion,
        status: 'failed',
        glossaryApplied: false,
        errorMessage: String(error?.message || 'Translation failed')
      },
      update: {
        status: 'failed',
        errorMessage: String(error?.message || 'Translation failed'),
        engineKey: config.engineKey,
        modelVersion: translationVersion
      }
    });
    await buildAuditLog(
      'translation.failed',
      {
        targetLocale: normalizedTargetLocale,
        sourceLanguage,
        message: String(error?.message || 'Translation failed')
      },
      null,
      CONTENT_ENTITY_POST,
      post.id
    );
    throw error;
  }
};

export const runContentTranslationTest = async (input: {
  text?: string;
  sourceLocale?: string;
  targetLocale?: string;
}) => {
  const config = await getStoredContentTranslationConfig();
  const text = asString(input.text);
  if (!text) {
    throw new Error('Text is required.');
  }
  const detection = input.sourceLocale
    ? {
        language: normalizeLocale(input.sourceLocale),
        confidence: null,
        detectorKey: config.detectorKey,
        metadata: { bypassed: true }
      }
    : await detectTextLanguage(text, config);
  const targetLocale = normalizeLocale(input.targetLocale, config.defaultTargetLocale);
  const translation = await translateText(text.slice(0, config.maxCharactersPerRequest), detection.language, targetLocale, config);
  return {
    sourceLanguage: detection.language,
    confidence: detection.confidence,
    targetLocale,
    translatedText: translation.translatedText,
    engineKey: translation.engineKey,
    modelVersion: translation.modelVersion,
    glossaryApplied: translation.glossaryApplied
  };
};
