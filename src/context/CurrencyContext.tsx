
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Currency } from '../types';
import { INITIAL_CURRENCIES } from '../constants';
import api from '../services/api';
import { tokenStore } from '../services/tokenStore';
import { useSocket } from './SocketContext';
import { useUser } from './UserContext';
import { convertMajorUnits, formatConvertedMoney, formatMoneyMajor } from '../utils/moneyConversion';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (code: string) => void;
  availableCurrencies: Currency[];
  /**
   * Format amount for display in preferred currency.
   * Converts from fromCurrency (default: platform base).
   * Never attaches a foreign symbol without conversion when rates exist.
   */
  formatPrice: (amount: number | string | null | undefined, options?: { fromCurrency?: string }) => string;
  /** Convert major units; returns original amount only when currencies match or conversion fails (check ok). */
  convertAmount: (amount: number, fromCurrency: string, toCurrency: string) => number;
  /** Full conversion result with ok flag — prefer this for guards. */
  convertAmountDetailed: (
    amount: number,
    fromCurrency: string,
    toCurrency: string
  ) => { ok: boolean; amount: number; rate?: number; error?: string };
  baseCurrency: string;
  ratesReady: boolean;
  ratesMap: Map<string, number>;
  refreshCurrencies: () => Promise<void>;
  /** Convert a base-currency limit (e.g. ads min USD) into display currency. */
  convertFromBase: (baseAmount: number, toCurrency?: string) => number;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

const STORAGE_KEY = 'Scrolith.pref.currency';
const PUBLIC_CURRENCY_CACHE_TTL_MS = 60 * 1000;

type ActiveCurrencyCatalog = {
  list: Currency[];
  baseCurrency: string;
};

let publicCurrencyCache: { catalog: ActiveCurrencyCatalog; cachedAt: number } | null = null;
let publicCurrencyRequest: Promise<ActiveCurrencyCatalog> | null = null;

type PublicCurrencyCatalogState = {
  cache: { catalog: ActiveCurrencyCatalog; cachedAt: number } | null;
  request: Promise<ActiveCurrencyCatalog> | null;
};

const getSharedPublicCurrencyState = (): PublicCurrencyCatalogState => {
  const globalScope = globalThis as typeof globalThis & {
    __SCROLITH_PUBLIC_CURRENCY_CATALOG__?: PublicCurrencyCatalogState;
  };
  if (!globalScope.__SCROLITH_PUBLIC_CURRENCY_CATALOG__) {
    globalScope.__SCROLITH_PUBLIC_CURRENCY_CATALOG__ = {
      cache: publicCurrencyCache,
      request: publicCurrencyRequest
    };
  }
  return globalScope.__SCROLITH_PUBLIC_CURRENCY_CATALOG__;
};

export const loadPublicCurrencyCatalog = async (options?: { force?: boolean }): Promise<ActiveCurrencyCatalog> => {
  const sharedState = getSharedPublicCurrencyState();
  const now = Date.now();
  if (!options?.force && sharedState.cache && now - sharedState.cache.cachedAt < PUBLIC_CURRENCY_CACHE_TTL_MS) {
    return sharedState.cache.catalog;
  }
  if (!options?.force && sharedState.request) return sharedState.request;

  const request = api
    .get('/currencies/active')
    .then((response) => {
      const payload = response?.data?.data ?? response?.data ?? [];
      const meta = response?.data?.meta || {};
      const list = Array.isArray(payload) && payload.length ? payload : INITIAL_CURRENCIES;
      const catalog = {
        list,
        baseCurrency: meta.baseCurrency ? String(meta.baseCurrency).toUpperCase() : 'USD'
      };
      const cache = { catalog, cachedAt: Date.now() };
      publicCurrencyCache = cache;
      sharedState.cache = cache;
      return catalog;
    })
    .finally(() => {
      publicCurrencyRequest = null;
      sharedState.request = null;
    });

  publicCurrencyRequest = request;
  sharedState.request = request;
  return request;
};

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>(INITIAL_CURRENCIES);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [ratesReady, setRatesReady] = useState(false);

  const defaultCurrency = INITIAL_CURRENCIES.find((c) => c.isDefault) || INITIAL_CURRENCIES[0];
  const [currency, setCurrencyState] = useState<Currency>(defaultCurrency);
  const { socket } = useSocket();
  const { isAuthenticated, isLoading: authLoading } = useUser();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const found = INITIAL_CURRENCIES.find((c) => c.code === stored);
    if (found) setCurrencyState(found);
  }, []);

  const refreshCurrencies = useCallback(async () => {
    try {
      // Public catalog — safe for guest login/signup surfaces.
      const { list, baseCurrency: loadedBaseCurrency } = await loadPublicCurrencyCatalog();
      setAvailableCurrencies(list);
      setBaseCurrency(loadedBaseCurrency || 'USD');

      let preferredCode: string | null = localStorage.getItem(STORAGE_KEY);

      // Auth-only preference endpoint. Skip when guest so DevTools never logs 401
      // on Welcome/Login/Signup (browser still surfaces failed XHR even if caught).
      const token = await tokenStore.get();
      const canLoadServerPreference = Boolean(token) && !authLoading && isAuthenticated;
      if (canLoadServerPreference) {
        try {
          const prefRes = await api.get('/currencies/preference');
          const pref = prefRes?.data?.data?.preferredCurrency;
          if (pref) preferredCode = String(pref).toUpperCase();
        } catch {
          /* token expired or endpoint unavailable — keep local preference */
        }
      }

      const selected =
        list.find((c: any) => c.code === preferredCode && c.isActive !== false) ||
        list.find((c: any) => c.isDefault) ||
        list.find((c: any) => c.code === 'USD') ||
        list[0];
      if (selected) {
        setCurrencyState(selected);
        localStorage.setItem(STORAGE_KEY, selected.code);
      }
      setRatesReady(true);
    } catch (error) {
      console.warn('Failed to load currencies, using defaults.', error);
      setRatesReady(false);
    }
  }, [authLoading, isAuthenticated]);

  useEffect(() => {
    void refreshCurrencies();
  }, [refreshCurrencies]);

  useEffect(() => {
    if (!socket) return;
    const handleSettings = () => {
      void refreshCurrencies();
    };
    // Phase 28D — real-time pricing/catalog invalidation hooks (project conventions)
    socket.on('settings:updated', handleSettings);
    socket.on('currency:catalog:updated', handleSettings);
    socket.on('currency:rates:updated', handleSettings);
    socket.on('currency:policy:updated', handleSettings);
    return () => {
      socket.off('settings:updated', handleSettings);
      socket.off('currency:catalog:updated', handleSettings);
      socket.off('currency:rates:updated', handleSettings);
      socket.off('currency:policy:updated', handleSettings);
    };
  }, [socket, refreshCurrencies]);

  const setCurrency = useCallback(
    (code: string) => {
      const found = availableCurrencies.find((c) => c.code === code && (c as any).isActive !== false);
      if (!found) return;
      setCurrencyState(found);
      localStorage.setItem(STORAGE_KEY, found.code);
      // Persist server-side only when a session exists (guest stays localStorage-only).
      void (async () => {
        const token = await tokenStore.get();
        if (!token) return;
        try {
          await api.put('/currencies/preference', { preferredCurrency: found.code });
        } catch {
          /* ignore unauthenticated / transient failures */
        }
      })();
    },
    [availableCurrencies]
  );

  const coerceNumber = (input: any): number | null => {
    if (typeof input === 'number' && Number.isFinite(input)) return input;
    if (typeof input === 'string') {
      const cleaned = input.replace(/[^0-9.-]/g, '');
      if (!cleaned) return null;
      const parsed = Number(cleaned);
      return Number.isFinite(parsed) ? parsed : null;
    }
    if (input && typeof input === 'object') {
      if (input.amount !== undefined) return coerceNumber(input.amount);
      if (input.value !== undefined) return coerceNumber(input.value);
      if (input.total !== undefined) return coerceNumber(input.total);
      if (input.minAmount !== undefined) return coerceNumber(input.minAmount);
    }
    return null;
  };

  const ratesMap = useMemo(() => {
    const map = new Map<string, number>();
    availableCurrencies.forEach((c) => {
      const rate = Number((c as any).rate);
      // Phase 28D — never invent rate 1 for non-base codes
      if (Number.isFinite(rate) && rate > 0) {
        map.set(String(c.code).toUpperCase(), rate);
      }
    });
    map.set(String(baseCurrency || 'USD').toUpperCase(), 1);
    map.set('USD', map.get('USD') || 1);
    return map;
  }, [availableCurrencies, baseCurrency]);

  const convertAmountDetailed = useCallback(
    (amount: number, fromCurrency: string, toCurrency: string) => {
      const result = convertMajorUnits({
        amount,
        fromCurrency,
        toCurrency,
        rates: ratesMap,
        baseCurrency
      });
      if (!result.ok) return { ok: false, amount, error: result.error };
      return { ok: true, amount: result.amount, rate: result.rate };
    },
    [baseCurrency, ratesMap]
  );

  /**
   * Preview conversion. When rate is missing, returns the original amount (caller should
   * not re-label with toCurrency). Prefer convertAmountDetailed for strict checks.
   */
  const convertAmount = useCallback(
    (amount: number, fromCurrency: string, toCurrency: string) => {
      const detailed = convertAmountDetailed(amount, fromCurrency, toCurrency);
      return detailed.amount;
    },
    [convertAmountDetailed]
  );

  const convertFromBase = useCallback(
    (baseAmount: number, toCurrency?: string) => {
      const to = String(toCurrency || currency.code || baseCurrency).toUpperCase();
      const detailed = convertAmountDetailed(baseAmount, baseCurrency || 'USD', to);
      return detailed.ok ? detailed.amount : baseAmount;
    },
    [baseCurrency, convertAmountDetailed, currency.code]
  );

  const formatPrice = useCallback(
    (amount: number | string | null | undefined, options?: { fromCurrency?: string }) => {
      const base = coerceNumber(amount);
      const safeBase = base ?? 0;
      const from = String(options?.fromCurrency || baseCurrency || 'USD').toUpperCase();
      const to = String(currency.code || baseCurrency || 'USD').toUpperCase();
      const formatted = formatConvertedMoney({
        amount: safeBase,
        fromCurrency: from,
        toCurrency: to,
        rates: ratesMap,
        baseCurrency
      });
      // If conversion failed, format in source currency (never ₱10 for $10)
      return formatted.text;
    },
    [baseCurrency, currency.code, ratesMap]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        availableCurrencies,
        formatPrice,
        convertAmount,
        convertAmountDetailed,
        baseCurrency,
        ratesReady,
        ratesMap,
        refreshCurrencies,
        convertFromBase
      }}
    >
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within CurrencyProvider');
  return context;
};

export { formatMoneyMajor };
