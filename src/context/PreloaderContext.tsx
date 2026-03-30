import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useLocation } from 'react-router-dom';
import api from '../services/api';
import { PreloaderConfig, PreloaderService } from '../services/preloader';
import { useSocket } from './SocketContext';

const DEFAULT_PRELOADER: PreloaderConfig = {
  id: 'default-preloader',
  name: 'Default Loader',
  status: 'active',
  isActive: true,
  minDurationMs: 800,
  maxDurationMs: 5000,
  showOnInitialLoad: true,
  showOnRouteChange: true,
  showOnApiLoading: false,
  headlineText: 'Loading Scrolith...',
  subText: 'Please wait while we prepare your experience.',
  loaderType: 'spinner',
  logoFileId: null,
  logoUrl: '/logo.png',
  backgroundFileId: null,
  backgroundImageUrl: null,
  backgroundType: 'solid',
  backgroundColor: '#0f172a',
  gradientFrom: '#0f172a',
  gradientTo: '#1d4ed8',
  overlayOpacity: 0.85,
  blurPx: 0,
  accentColor: '#3b82f6',
  textColor: '#ffffff',
  animationSpeed: 1,
  position: 'center',
  customCss: null,
};

type Reason = 'boot' | 'route' | 'api' | 'manual' | string;

type PreloaderContextType = {
  config: PreloaderConfig;
  isVisible: boolean;
  show: (reason?: Reason) => void;
  hide: (reason?: Reason) => void;
  forceHide: () => void;
  refreshConfig: () => Promise<void>;
};

const PreloaderContext = createContext<PreloaderContextType | undefined>(undefined);

const normalizeConfig = (incoming?: Partial<PreloaderConfig> | null): PreloaderConfig => {
  const source = incoming || {};
  const minDurationMs = Math.max(0, Number(source.minDurationMs ?? DEFAULT_PRELOADER.minDurationMs));
  const maxDurationMs = Math.max(
    minDurationMs,
    Number(source.maxDurationMs ?? DEFAULT_PRELOADER.maxDurationMs)
  );

  return {
    ...DEFAULT_PRELOADER,
    ...source,
    minDurationMs,
    maxDurationMs,
    showOnInitialLoad:
      source.showOnInitialLoad !== undefined
        ? Boolean(source.showOnInitialLoad)
        : DEFAULT_PRELOADER.showOnInitialLoad,
    showOnRouteChange:
      source.showOnRouteChange !== undefined
        ? Boolean(source.showOnRouteChange)
        : DEFAULT_PRELOADER.showOnRouteChange,
    showOnApiLoading:
      source.showOnApiLoading !== undefined
        ? Boolean(source.showOnApiLoading)
        : DEFAULT_PRELOADER.showOnApiLoading,
    overlayOpacity: Math.min(1, Math.max(0, Number(source.overlayOpacity ?? DEFAULT_PRELOADER.overlayOpacity))),
    blurPx: Math.max(0, Number(source.blurPx ?? DEFAULT_PRELOADER.blurPx)),
    animationSpeed: Math.max(0.2, Number(source.animationSpeed ?? DEFAULT_PRELOADER.animationSpeed)),
  };
};

const shouldTrackApiRequest = (url?: string) => {
  const normalized = String(url || '').toLowerCase();
  if (!normalized) return false;
  if (normalized.includes('/public/preloader/active')) return false;
  if (normalized.includes('/socket.io')) return false;
  return true;
};

export const PreloaderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  const { socket, isConnected } = useSocket();
  const [config, setConfig] = useState<PreloaderConfig>(DEFAULT_PRELOADER);
  const [isVisible, setIsVisible] = useState<boolean>(DEFAULT_PRELOADER.showOnInitialLoad);
  const configRef = useRef<PreloaderConfig>(DEFAULT_PRELOADER);
  const reasonsRef = useRef<Set<string>>(new Set(DEFAULT_PRELOADER.showOnInitialLoad ? ['boot'] : []));
  const shownAtRef = useRef<number | null>(DEFAULT_PRELOADER.showOnInitialLoad ? Date.now() : null);
  const hideTimerRef = useRef<number | null>(null);
  const forceHideTimerRef = useRef<number | null>(null);
  const apiCounterRef = useRef(0);
  const routeInitRef = useRef(true);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const clearForceHideTimer = () => {
    if (forceHideTimerRef.current) {
      window.clearTimeout(forceHideTimerRef.current);
      forceHideTimerRef.current = null;
    }
  };

  const scheduleForceHide = useCallback(() => {
    clearForceHideTimer();
    const maxDuration = Math.max(
      configRef.current.minDurationMs,
      configRef.current.maxDurationMs
    );
    forceHideTimerRef.current = window.setTimeout(() => {
      reasonsRef.current.clear();
      apiCounterRef.current = 0;
      clearHideTimer();
      clearForceHideTimer();
      shownAtRef.current = null;
      setIsVisible(false);
    }, maxDuration);
  }, []);

  const show = useCallback((reason: Reason = 'manual') => {
    clearHideTimer();
    reasonsRef.current.add(String(reason));
    if (!shownAtRef.current) shownAtRef.current = Date.now();
    setIsVisible(true);
    scheduleForceHide();
  }, [scheduleForceHide]);

  const forceHide = useCallback(() => {
    reasonsRef.current.clear();
    apiCounterRef.current = 0;
    clearHideTimer();
    clearForceHideTimer();
    shownAtRef.current = null;
    setIsVisible(false);
  }, []);

  const hide = useCallback((reason: Reason = 'manual') => {
    reasonsRef.current.delete(String(reason));
    if (reasonsRef.current.size > 0) return;

    const shownAt = shownAtRef.current || Date.now();
    const elapsed = Date.now() - shownAt;
    const wait = Math.max(0, configRef.current.minDurationMs - elapsed);

    clearHideTimer();
    hideTimerRef.current = window.setTimeout(() => {
      shownAtRef.current = null;
      clearForceHideTimer();
      setIsVisible(false);
    }, wait);
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const active = await PreloaderService.getActivePreloader();
      setConfig(normalizeConfig(active));
    } catch (error) {
      console.warn('Failed to load active preloader config, using default fallback.', error);
      setConfig(DEFAULT_PRELOADER);
    }
  }, []);

  // Boot lifecycle
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (configRef.current.showOnInitialLoad) show('boot');
      await refreshConfig();
      if (cancelled) return;
      hide('boot');
    };
    void run();

    return () => {
      cancelled = true;
      forceHide();
    };
  }, [forceHide, hide, refreshConfig, show]);

  // Route transitions
  useEffect(() => {
    if (routeInitRef.current) {
      routeInitRef.current = false;
      return;
    }
    if (!configRef.current.showOnRouteChange) return;
    show('route');
    const done = window.setTimeout(() => hide('route'), 120);
    return () => window.clearTimeout(done);
  }, [location.pathname, location.search, location.hash, show, hide]);

  // API loading (optional)
  useEffect(() => {
    const requestInterceptor = api.interceptors.request.use((requestConfig) => {
      if (!configRef.current.showOnApiLoading) return requestConfig;
      if (!shouldTrackApiRequest(requestConfig.url)) return requestConfig;
      apiCounterRef.current += 1;
      (requestConfig as any).__preloaderTracked = true;
      if (apiCounterRef.current === 1) show('api');
      return requestConfig;
    });

    const releaseApiReason = (cfg?: any) => {
      if (!cfg?.__preloaderTracked) return;
      apiCounterRef.current = Math.max(0, apiCounterRef.current - 1);
      if (apiCounterRef.current === 0) hide('api');
    };

    const responseInterceptor = api.interceptors.response.use(
      (response) => {
        releaseApiReason(response?.config);
        return response;
      },
      (error) => {
        releaseApiReason(error?.config);
        return Promise.reject(error);
      }
    );

    return () => {
      api.interceptors.request.eject(requestInterceptor);
      api.interceptors.response.eject(responseInterceptor);
    };
  }, [hide, show]);

  // Live updates from sockets
  useEffect(() => {
    if (!socket) return;
    const onUpdated = (payload: any) => {
      const incoming = payload?.active ?? null;
      setConfig(normalizeConfig(incoming || DEFAULT_PRELOADER));
    };
    socket.on('preloader:updated', onUpdated);
    return () => {
      socket.off('preloader:updated', onUpdated);
    };
  }, [socket]);

  // Fallback polling when socket disconnects
  useEffect(() => {
    if (isConnected) return;
    const timer = window.setInterval(() => {
      void refreshConfig();
    }, 60000);
    return () => window.clearInterval(timer);
  }, [isConnected, refreshConfig]);

  const value = useMemo<PreloaderContextType>(() => ({
    config,
    isVisible,
    show,
    hide,
    forceHide,
    refreshConfig,
  }), [config, forceHide, hide, isVisible, refreshConfig, show]);

  return <PreloaderContext.Provider value={value}>{children}</PreloaderContext.Provider>;
};

export const usePreloader = () => {
  const context = useContext(PreloaderContext);
  if (!context) throw new Error('usePreloader must be used within a PreloaderProvider');
  return context;
};

