
import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Currency } from '../types';
import { INITIAL_CURRENCIES } from '../constants';
import api from '../services/api';
import { useSocket } from './SocketContext';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (code: string) => void;
  availableCurrencies: Currency[];
  formatPrice: (amount: number | string | null | undefined, options?: { fromCurrency?: string }) => string;
  /** Convert major units between currencies using catalog rates (preview). */
  convertAmount: (amount: number, fromCurrency: string, toCurrency: string) => number;
  baseCurrency: string;
  ratesReady: boolean;
  refreshCurrencies: () => Promise<void>;
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

      // Prefer server preference when authenticated
      let preferredCode: string | null = localStorage.getItem(STORAGE_KEY);
      try {
        const prefRes = await api.get('/currencies/preference');
        const pref = prefRes?.data?.data?.preferredCurrency;
        if (pref) preferredCode = String(pref).toUpperCase();
      } catch {
        /* unauthenticated or endpoint unavailable */
      }

      const selected =
        list.find((c: any) => c.code === preferredCode) ||
        list.find((c: any) => c.isDefault) ||
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
    socket.on('settings:updated', handleSettings);
    return () => {
      socket.off('settings:updated', handleSettings);
    };
  }, [socket, refreshCurrencies]);

  const setCurrency = useCallback(
    (code: string) => {
      const found = availableCurrencies.find((c) => c.code === code);
      if (!found) return;
      setCurrencyState(found);
      localStorage.setItem(STORAGE_KEY, found.code);
      // Persist server-side when authenticated (Phase 28)
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

  const rateMap = useMemo(() => {
    const map = new Map<string, number>();
    availableCurrencies.forEach((c) => {
      const rate = Number((c as any).rate);
      map.set(String(c.code).toUpperCase(), Number.isFinite(rate) && rate > 0 ? rate : 1);
    });
    map.set(baseCurrency, 1);
    return map;
  }, [availableCurrencies, baseCurrency]);

  /** Rates are "quote per 1 base". Cross: amount_in_to = amount_in_from / fromRate * toRate */
  const convertAmount = useCallback(
    (amount: number, fromCurrency: string, toCurrency: string) => {
      const from = String(fromCurrency || baseCurrency).toUpperCase();
      const to = String(toCurrency || baseCurrency).toUpperCase();
      if (!Number.isFinite(amount)) return 0;
      if (from === to) return amount;
      const fromRate = rateMap.get(from);
      const toRate = rateMap.get(to);
      if (!fromRate || !toRate) return amount;
      return (amount / fromRate) * toRate;
    },
    [baseCurrency, rateMap]
  );

  const formatPrice = useCallback(
    (amount: number | string | null | undefined, options?: { fromCurrency?: string }) => {
      const base = coerceNumber(amount);
      const safeBase = base ?? 0;
      const from = String(options?.fromCurrency || baseCurrency || 'USD').toUpperCase();
      const value = convertAmount(safeBase, from, currency.code);
      return new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency: currency.code
      }).format(value);
    },
    [baseCurrency, convertAmount, currency.code]
  );

  return (
    <CurrencyContext.Provider
      value={{
        currency,
        setCurrency,
        availableCurrencies,
        formatPrice,
        convertAmount,
        baseCurrency,
        ratesReady,
        refreshCurrencies
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
