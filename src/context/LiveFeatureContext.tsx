import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_LIVE_EXPERIENCE_CONFIG,
  LiveService,
  normalizeLiveExperienceConfig,
  type LiveFeatureStatus
} from '../services/live';

type LiveFeatureContextValue = {
  loading: boolean;
  status: LiveFeatureStatus;
  refresh: () => Promise<void>;
};

const DEFAULT_LIVE_FEATURE_STATUS: LiveFeatureStatus = {
  enabled: true,
  enableConference: true,
  enableGifts: true,
  enableRecording: true,
  minGiftGcoin: 1,
  maxGiftGcoin: 50000,
  rateLimitReactionsPerMinute: 80,
  rateLimitChatPerMinute: 40,
  experienceConfig: DEFAULT_LIVE_EXPERIENCE_CONFIG
};

const normalizeLiveFeatureStatus = (input: Partial<LiveFeatureStatus> | null | undefined): LiveFeatureStatus => {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enabled: source.enabled !== false,
    enableConference: source.enableConference !== false,
    enableGifts: source.enableGifts !== false,
    enableRecording: source.enableRecording !== false,
    minGiftGcoin: Number(source.minGiftGcoin || DEFAULT_LIVE_FEATURE_STATUS.minGiftGcoin || 1),
    maxGiftGcoin: Number(source.maxGiftGcoin || DEFAULT_LIVE_FEATURE_STATUS.maxGiftGcoin || 50000),
    rateLimitReactionsPerMinute: Number(
      source.rateLimitReactionsPerMinute || DEFAULT_LIVE_FEATURE_STATUS.rateLimitReactionsPerMinute || 80
    ),
    rateLimitChatPerMinute: Number(
      source.rateLimitChatPerMinute || DEFAULT_LIVE_FEATURE_STATUS.rateLimitChatPerMinute || 40
    ),
    experienceConfig: normalizeLiveExperienceConfig(source.experienceConfig),
    realtimeConfig: source.realtimeConfig
  };
};

const LiveFeatureContext = createContext<LiveFeatureContextValue | undefined>(undefined);

export const LiveFeatureProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<LiveFeatureStatus>(DEFAULT_LIVE_FEATURE_STATUS);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      const next = await LiveService.getFeatureStatus();
      setStatus(normalizeLiveFeatureStatus(next));
    } catch {
      setStatus((prev) => normalizeLiveFeatureStatus(prev));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const handleConfigUpdated = (event: Event) => {
      const customEvent = event as CustomEvent<any>;
      const nextStatus = normalizeLiveFeatureStatus(customEvent?.detail?.config || customEvent?.detail);
      setStatus((prev) => ({ ...prev, ...nextStatus }));
      setLoading(false);
    };

    window.addEventListener('live:config_updated', handleConfigUpdated as EventListener);
    return () => {
      window.removeEventListener('live:config_updated', handleConfigUpdated as EventListener);
    };
  }, []);

  const value = useMemo(
    () => ({
      loading,
      status,
      refresh
    }),
    [loading, refresh, status]
  );

  return <LiveFeatureContext.Provider value={value}>{children}</LiveFeatureContext.Provider>;
};

export const useLiveFeature = () => {
  const context = useContext(LiveFeatureContext);
  if (!context) {
    throw new Error('useLiveFeature must be used within a LiveFeatureProvider');
  }
  return context;
};
