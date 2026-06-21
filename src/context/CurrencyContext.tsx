
import React, { createContext, useContext, useState, useEffect } from 'react';
import { Currency } from '../types';
import { INITIAL_CURRENCIES } from '../constants';

interface CurrencyContextType {
  currency: Currency;
  setCurrency: (code: string) => void;
  availableCurrencies: Currency[];
  formatPrice: (amount: number) => string;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

export const CurrencyProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // In a real app, these would come from an API/Global Config
  // For now, we simulate dynamic updates by using state initialized from constants
  const [availableCurrencies, setAvailableCurrencies] = useState<Currency[]>(INITIAL_CURRENCIES);
  
  // Find default or fallback to USD
  const defaultCurrency = INITIAL_CURRENCIES.find(c => c.isDefault) || INITIAL_CURRENCIES[0];
  const [currency, setCurrencyState] = useState<Currency>(defaultCurrency);

  // Effect to listen for potential updates (simulating real-time config change)
  // In a real app, this would be a socket listener or polling mechanism 
  // tied to the Admin Service updates.

  const setCurrency = (code: string) => {
    const found = availableCurrencies.find(c => c.code === code);
    if (found) setCurrencyState(found);
  };

  const formatPrice = (amount: number) => {
    const value = amount * currency.rate;
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
