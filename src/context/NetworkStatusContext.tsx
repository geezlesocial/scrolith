import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import type { PluginListenerHandle } from '@capacitor/core';
import {
  isRecentlyRestoredOnline,
  shouldAttemptRealtimeConnections
} from '../mobile/runtime/networkRuntime';

type NetworkStatusContextType = {
  isOnline: boolean;
  isVisible: boolean;
  isNativePlatform: boolean;
  isAppActive: boolean;
  shouldAttemptLiveConnections: boolean;
  recoveryTick: number;
  lastOfflineAt: number | null;
  lastOnlineAt: number | null;
  isRecentlyReconnected: boolean;
};

const NetworkStatusContext = createContext<NetworkStatusContextType | undefined>(undefined);

const getInitialOnlineState = () => {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine;
};

const getInitialVisibilityState = () => {
  if (typeof document === 'undefined') return true;
  return document.visibilityState !== 'hidden';
};

const detectNativePlatform = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const NetworkStatusProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const isNativePlatform = detectNativePlatform();
  const [isOnline, setIsOnline] = useState(getInitialOnlineState);
  const [isVisible, setIsVisible] = useState(getInitialVisibilityState);
  const [isAppActive, setIsAppActive] = useState(true);
  const [recoveryTick, setRecoveryTick] = useState(0);
  const [lastOfflineAt, setLastOfflineAt] = useState<number | null>(null);
  const [lastOnlineAt, setLastOnlineAt] = useState<number | null>(getInitialOnlineState() ? Date.now() : null);
  const lastOnlineRef = useRef(getInitialOnlineState());

  useEffect(() => {
    const markOnline = () => {
      const nextOnline = getInitialOnlineState();
      setIsOnline(nextOnline);
      if (nextOnline && !lastOnlineRef.current) {
        const now = Date.now();
        setLastOnlineAt(now);
        setRecoveryTick((value) => value + 1);
      }
      if (!nextOnline && lastOnlineRef.current) {
        setLastOfflineAt(Date.now());
      }
      lastOnlineRef.current = nextOnline;
    };

    const handleVisibilityChange = () => {
      setIsVisible(getInitialVisibilityState());
    };

    window.addEventListener('online', markOnline);
    window.addEventListener('offline', markOnline);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('online', markOnline);
      window.removeEventListener('offline', markOnline);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!isNativePlatform) return;

    let cancelled = false;
    let listenerHandle: PluginListenerHandle | null = null;
    const handlePromise = CapacitorApp.addListener('appStateChange', ({ isActive }) => {
      setIsAppActive(isActive);
      if (isActive && lastOnlineRef.current) {
        setRecoveryTick((value) => value + 1);
      }
    });

    void handlePromise
      .then((handle) => {
        if (cancelled) {
          void handle.remove();
          return;
        }
        listenerHandle = handle;
      })
      .catch(() => {
        listenerHandle = null;
      });

    return () => {
      cancelled = true;
      if (listenerHandle) {
        void listenerHandle.remove();
      }
    };
  }, [isNativePlatform]);

  const value = useMemo<NetworkStatusContextType>(() => {
    const shouldAttemptLiveConnections = shouldAttemptRealtimeConnections({
      isOnline,
      isNativePlatform,
      isAppActive
    });

    return {
      isOnline,
      isVisible,
      isNativePlatform,
      isAppActive,
      shouldAttemptLiveConnections,
      recoveryTick,
      lastOfflineAt,
      lastOnlineAt,
      isRecentlyReconnected: isRecentlyRestoredOnline({
        isOnline,
        lastOnlineAt
      })
    };
  }, [isAppActive, isNativePlatform, isOnline, isVisible, lastOfflineAt, lastOnlineAt, recoveryTick]);

  return <NetworkStatusContext.Provider value={value}>{children}</NetworkStatusContext.Provider>;
};

export const useNetworkStatus = () => {
  const context = useContext(NetworkStatusContext);
  if (!context) {
    throw new Error('useNetworkStatus must be used within NetworkStatusProvider');
  }
  return context;
};
