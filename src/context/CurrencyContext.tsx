
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Currency } from '../types';
import { INITIAL_CURRENCIES } from '../constants';
import api from '../services/api';
import { useSocket } from './SocketContext';
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

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>(INITIAL_CURRENCIES);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [ratesReady, setRatesReady] = useState(false);

  const defaultCurrency = INITIAL_CURRENCIES.find((c) => c.isDefault) || INITIAL_CURRENCIES[0];
  const [currency, setCurrencyState] = useState<Currency>(defaultCurrency);
  const { socket } = useSocket();

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    const found = INITIAL_CURRENCIES.find((c) => c.code === stored);
    if (found) setCurrencyState(found);
  }, []);

  const refreshCurrencies = useCallback(async () => {
    try {
      const response = await api.get('/currencies/active');
      const payload = response?.data?.data ?? response?.data ?? [];
      const meta = response?.data?.meta || {};
      const list = Array.isArray(payload) && payload.length ? payload : INITIAL_CURRENCIES;
      setAvailableCurrencies(list);
      if (meta.baseCurrency) setBaseCurrency(String(meta.baseCurrency).toUpperCase());
      else setBaseCurrency('USD');

      let preferredCode: string | null = localStorage.getItem(STORAGE_KEY);
      try {
        const prefRes = await api.get('/currencies/preference');
        const pref = prefRes?.data?.data?.preferredCurrency;
        if (pref) preferredCode = String(pref).toUpperCase();
      } catch {
        /* unauthenticated or endpoint unavailable */
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
  }, []);

  useEffect(() => {
    refreshCurrencies();
  }, [refreshCurrencies]);

  useEffect(() => {
    if (!socket) return;
    const handleSettings = () => refreshCurrencies();
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
      void api.put('/currencies/preference', { preferredCurrency: found.code }).catch(() => undefined);
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
