import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { I18nService, I18nConfig, TextOverrideRow } from '../services/i18n';
import { applyOverrides } from './applyOverrides';
import { useSocket } from '../context/SocketContext';

type TranslateParams = Record<string, string | number>;

type I18nContextValue = {
  locale: string;
  defaultLocale: string;
  enabledLocales: string[];
  rtlLocales: string[];
  dictionary: Record<string, string>;
  overrides: TextOverrideRow[];
  loading: boolean;
  setLocale: (locale: string) => Promise<void>;
  refresh: () => Promise<void>;
  t: (key: string, fallback?: string, params?: TranslateParams) => string;
  applyTextOverrides: (value: string) => string;
};

const STORAGE_LOCALE_KEY = 'Scrolith.i18n.locale';
const STORAGE_CACHE_PREFIX = 'Scrolith.i18n.cache.';
const STORAGE_CONFIG_KEY = 'Scrolith.i18n.config';

const DEFAULT_CONFIG: I18nConfig = {
  defaultLocale: 'en',
  enabledLocales: ['en'],
  rtlLocales: ['ar', 'he', 'fa', 'ur'],
  dictionaryCacheSeconds: 300,
  overridesCacheSeconds: 300
};

const normalizeLocale = (value: unknown, fallback = 'en') => {
  const locale = String(value || '').trim().toLowerCase().replace('_', '-');
  return locale || fallback;
};

const withParams = (template: string, params?: TranslateParams) => {
  if (!params) return template;
  return template.replace(/\{\{(\w+)\}\}/g, (_, token) => String(params[token] ?? ''));
};

const I18nContext = createContext<I18nContextValue | undefined>(undefined);

export const I18nProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { socket } = useSocket();
  const [config, setConfig] = useState<I18nConfig>(DEFAULT_CONFIG);
  const [locale, setLocaleState] = useState(DEFAULT_CONFIG.defaultLocale);
  const [dictionary, setDictionary] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<TextOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);

  const cacheKey = useMemo(() => `${STORAGE_CACHE_PREFIX}${locale}`, [locale]);

  const loadRemote = useCallback(
    async (targetLocale: string) => {
      const normalized = normalizeLocale(targetLocale, config.defaultLocale);
      const [dictPayload, overridePayload] = await Promise.all([
        I18nService.getDictionary(normalized),
        I18nService.getOverrides(normalized)
      ]);

      const dictionaryData = dictPayload?.dictionary || {};
      const overrideData = overridePayload?.overrides || [];

      setDictionary(dictionaryData);
      setOverrides(overrideData);

      try {
        localStorage.setItem(
          cacheKey,
          JSON.stringify({
            locale: normalized,
            dictionary: dictionaryData,
            overrides: overrideData,
            updatedAt: Date.now()
          })
        );
      } catch {
        // Ignore cache write failures (private mode/quota).
      }
    },
    [cacheKey, config.defaultLocale]
  );

  const refresh = useCallback(async () => {
    await loadRemote(locale);
  }, [loadRemote, locale]);

  const setLocale = useCallback(
    async (nextLocale: string) => {
      const normalized = normalizeLocale(nextLocale, config.defaultLocale);
      setLocaleState(normalized);
      try {
        localStorage.setItem(STORAGE_LOCALE_KEY, normalized);
      } catch {
        // ignore
      }
      await loadRemote(normalized);
    },
    [config.defaultLocale, loadRemote]
  );

  useEffect(() => {
    let mounted = true;
    const init = async () => {
      setLoading(true);
      try {
        const remoteConfig = await I18nService.getPublicConfig();
        if (!mounted) return;
        const merged: I18nConfig = {
          ...DEFAULT_CONFIG,
          ...(remoteConfig || {})
        };
        setConfig(merged);
        try {
          localStorage.setItem(STORAGE_CONFIG_KEY, JSON.stringify(merged));
        } catch {
          // ignore
        }

        const preferredLocale = normalizeLocale(
          localStorage.getItem(STORAGE_LOCALE_KEY) || merged.defaultLocale,
          merged.defaultLocale
        );
        const supportedLocale = merged.enabledLocales.includes(preferredLocale)
          ? preferredLocale
          : merged.defaultLocale;
        setLocaleState(supportedLocale);

        let usedCache = false;
        try {
          const cached = localStorage.getItem(`${STORAGE_CACHE_PREFIX}${supportedLocale}`);
          if (cached) {
            const parsed = JSON.parse(cached);
            if (parsed?.dictionary && typeof parsed.dictionary === 'object') {
              setDictionary(parsed.dictionary);
              setOverrides(Array.isArray(parsed.overrides) ? parsed.overrides : []);
              usedCache = true;
            }
          }
        } catch {
          // ignore malformed cache
        }

        if (!usedCache) {
          await loadRemote(supportedLocale);
        } else {
          // Refresh in background even when cache exists.
          void loadRemote(supportedLocale);
        }
      } catch {
        // Try to fallback to cached config even if network fails.
        try {
          const raw = localStorage.getItem(STORAGE_CONFIG_KEY);
          if (raw) {
            const parsed = JSON.parse(raw);
            setConfig({ ...DEFAULT_CONFIG, ...(parsed || {}) });
          }
        } catch {
          // ignore
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, [loadRemote]);

  useEffect(() => {
    const isRtl = config.rtlLocales.includes(locale);
    document.documentElement.setAttribute('lang', locale || config.defaultLocale);
    document.documentElement.setAttribute('dir', isRtl ? 'rtl' : 'ltr');
  }, [config.defaultLocale, config.rtlLocales, locale]);

  useEffect(() => {
    if (!socket) return;

    const onDictionaryUpdated = (payload: any) => {
      const payloadLocale = normalizeLocale(payload?.locale || '*');
      if (payloadLocale === '*' || payloadLocale === locale) {
        void loadRemote(locale);
      }
    };

    const onOverrideUpdated = (payload: any) => {
      const payloadLocale = normalizeLocale(payload?.locale || '*');
      if (payloadLocale === '*' || payloadLocale === locale) {
        void loadRemote(locale);
      }
    };

    socket.on('i18n:updated', onDictionaryUpdated);
    socket.on('i18n:override_updated', onOverrideUpdated);

    return () => {
      socket.off('i18n:updated', onDictionaryUpdated);
      socket.off('i18n:override_updated', onOverrideUpdated);
    };
  }, [loadRemote, locale, socket]);

  useEffect(() => {
    // Poll fallback every 60s in case socket is unavailable.
    const timer = window.setInterval(() => {
      void loadRemote(locale);
    }, 60000);
    return () => window.clearInterval(timer);
  }, [loadRemote, locale]);

  const applyTextOverrides = useCallback(
    (value: string) => applyOverrides(value, overrides),
    [overrides]
  );

  useEffect(() => {
    if (!overrides.length) return;

    const shouldSkipElement = (el: Element | null) => {
      if (!el) return true;
      const tag = el.tagName.toLowerCase();
      return tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'textarea' || tag === 'input';
    };

    const applyToNode = (node: Node | null) => {
      if (!node || node.nodeType !== Node.TEXT_NODE) return;
      const textNode = node as Text;
      const original = textNode.nodeValue || '';
      const trimmed = original.trim();
      if (!trimmed || trimmed.length > 500) return;
      if (shouldSkipElement(textNode.parentElement)) return;
      const replaced = applyOverrides(original, overrides);
      if (replaced !== original) {
        textNode.nodeValue = replaced;
      }
    };

    const applyToTree = () => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      const batch: Node[] = [];
      let current = walker.nextNode();
      while (current) {
        batch.push(current);
        current = walker.nextNode();
      }
      batch.forEach((node) => applyToNode(node));
    };

    applyToTree();
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          applyToNode(mutation.target);
          return;
        }
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            applyToNode(node);
            return;
          }
          if (node.nodeType === Node.ELEMENT_NODE) {
            const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
            let current = walker.nextNode();
            while (current) {
              applyToNode(current);
              current = walker.nextNode();
            }
          }
        });
      });
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true
    });

    return () => observer.disconnect();
  }, [overrides]);

  const t = useCallback(
    (key: string, fallback?: string, params?: TranslateParams) => {
      const normalizedKey = String(key || '').trim();
      const fromDict = normalizedKey ? dictionary[normalizedKey] : '';
      const base = fromDict ?? fallback ?? normalizedKey;
      const interpolated = withParams(String(base ?? ''), params);
      return applyOverrides(interpolated, overrides);
    },
    [dictionary, overrides]
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({
      locale,
      defaultLocale: config.defaultLocale,
      enabledLocales: config.enabledLocales,
      rtlLocales: config.rtlLocales,
      dictionary,
      overrides,
      loading,
      setLocale,
      refresh,
      t,
      applyTextOverrides
    }),
    [
      applyTextOverrides,
      config.defaultLocale,
      config.enabledLocales,
      config.rtlLocales,
      dictionary,
      loading,
      locale,
      overrides,
      refresh,
      setLocale,
      t
    ]
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
};

export const useI18n = () => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return context;
};
