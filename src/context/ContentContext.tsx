
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { PlatformSettings } from '../types';
import { CMSService } from '../services/cms';

interface ContentContextType {
  settings: PlatformSettings | null;
  loading: boolean;
  updateSettings: (settings: Partial<PlatformSettings>) => Promise<void>;
}

const ContentContext = createContext<ContentContextType | undefined>(undefined);

export const ContentProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    CMSService.getSettings().then(data => {
      setSettings(data);
      setLoading(false);
    });
  }, []);

  // Fix: Wrapped in useCallback to maintain stable reference across renders
  const updateSettings = useCallback(async (newSettings: Partial<PlatformSettings>) => {
      const updated = await CMSService.updateSettings(newSettings);
      setSettings(updated);
  }, []);

  return (
    <ContentContext.Provider value={{ settings, loading, updateSettings }}>
      {children}
    </ContentContext.Provider>
  );
};

export const useContent = () => {
  const context = useContext(ContentContext);
  if (!context) throw new Error('useContent must be used within ContentProvider');
  return context;
};
