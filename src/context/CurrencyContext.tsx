
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Currency } from '../types';
import { INITIAL_CURRENCIES } from '../constants';
import api from '../services/api';
import { useSocket } from './SocketContext';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (code: string) => void;
  availableCurrencies: Currency[];
  formatPrice: (amount: number | string | null | undefined) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>(INITIAL_CURRENCIES);
  
  // Find default or fallback to USD
  const defaultCurrency = INITIAL_CURRENCIES.find(c => c.isDefault) || INITIAL_CURRENCIES[0];
  const [currency, setCurrencyState] = useState<Currency>(defaultCurrency);
  const storageKey = 'Scrolith.pref.currency';
  const { socket } = useSocket();

  useEffect(() => {
    const stored = localStorage.getItem(storageKey);
    if (!stored) return;
    const found = INITIAL_CURRENCIES.find(c => c.code === stored);
    if (found) setCurrencyState(found);
  }, []);

  const refreshCurrencies = useCallback(async () => {
    try {
      const response = await api.get('/currencies/active');
      const data = response?.data?.data ?? response?.data ?? [];
      const list = Array.isArray(data) && data.length ? data : INITIAL_CURRENCIES;
      setAvailableCurrencies(list);
      const stored = localStorage.getItem(storageKey);
      const selected = list.find((c: any) => c.code === stored) || list.find((c: any) => c.isDefault) || list[0];
      if (selected) setCurrencyState(selected);
    } catch (error) {
      console.warn('Failed to load currencies, using defaults.', error);
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

  const setCurrency = (code: string) => {
    const found = availableCurrencies.find(c => c.code === code);
    if (found) {
      setCurrencyState(found);
      localStorage.setItem(storageKey, found.code);
    }
  };

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

  const formatPrice = (amount: number | string | null | undefined) => {
    const base = coerceNumber(amount);
    const safeBase = base ?? 0;
    const rate = Number.isFinite(Number(currency.rate)) ? Number(currency.rate) : 1;
    const value = safeBase * rate;
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency.code,
    }).format(value);
  };

  return (
    <CurrencyContext.Provider value={{ currency, setCurrency, availableCurrencies, formatPrice }}>
      {children}
    </CurrencyContext.Provider>
  );
};

export const useCurrency = () => {
  const context = useContext(CurrencyContext);
  if (!context) throw new Error('useCurrency must be used within CurrencyProvider');
  return context;
};

