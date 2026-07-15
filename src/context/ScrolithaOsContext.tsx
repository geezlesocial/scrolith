import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

export type ScrolithaPageContext = {
  route?: string;
  surface?: string;
  pageType?: string;
  entityType?: string;
  entityId?: string;
  postId?: string;
  selectedText?: string;
  title?: string;
  module?: string;
};

type ScrolithaOsContextValue = {
  page: ScrolithaPageContext;
  setPageContext: (patch: ScrolithaPageContext) => void;
  clearPageContext: () => void;
  openOs: (opts?: { prompt?: string; mode?: string }) => void;
  closeOs: () => void;
  isOpen: boolean;
  launchPrompt: string;
  sessionId: string;
  registerOpenHandler: (fn: ((opts?: { prompt?: string; mode?: string }) => void) | null) => void;
};

const ScrolithaOsContext = createContext<ScrolithaOsContextValue | null>(null);

const readTabSessionId = () => {
  try {
    const key = 'scrolitha:os-tab-session';
    const existing = window.sessionStorage.getItem(key);
    if (existing) return existing;
    const next = `os_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
    window.sessionStorage.setItem(key, next);
    return next;
  } catch {
    return `os_${Date.now()}`;
  }
};

export const ScrolithaOsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [page, setPage] = useState<ScrolithaPageContext>({});
  const [isOpen, setIsOpen] = useState(false);
  const [launchPrompt, setLaunchPrompt] = useState('');
  const [sessionId] = useState(() => readTabSessionId());
  const openHandlerRef = useRef<((opts?: { prompt?: string; mode?: string }) => void) | null>(null);

  const setPageContext = useCallback((patch: ScrolithaPageContext) => {
    setPage((prev) => ({ ...prev, ...patch }));
  }, []);

  const clearPageContext = useCallback(() => setPage({}), []);

  const openOs = useCallback((opts?: { prompt?: string; mode?: string }) => {
    if (opts?.prompt) setLaunchPrompt(opts.prompt);
    setIsOpen(true);
    openHandlerRef.current?.(opts);
  }, []);

  const closeOs = useCallback(() => {
    setIsOpen(false);
    setLaunchPrompt('');
  }, []);

  const registerOpenHandler = useCallback((fn: ((opts?: { prompt?: string; mode?: string }) => void) | null) => {
    openHandlerRef.current = fn;
  }, []);

  const value = useMemo(
    () => ({
      page,
      setPageContext,
      clearPageContext,
      openOs,
      closeOs,
      isOpen,
      launchPrompt,
      sessionId,
      registerOpenHandler
    }),
    [page, setPageContext, clearPageContext, openOs, closeOs, isOpen, launchPrompt, sessionId, registerOpenHandler]
  );

  return <ScrolithaOsContext.Provider value={value}>{children}</ScrolithaOsContext.Provider>;
};

export const useScrolithaOs = () => {
  const ctx = useContext(ScrolithaOsContext);
  if (!ctx) {
    // Safe no-op fallback when provider is absent (non-breaking)
    return {
      page: {},
      setPageContext: () => undefined,
      clearPageContext: () => undefined,
      openOs: () => undefined,
      closeOs: () => undefined,
      isOpen: false,
      launchPrompt: '',
      sessionId: 'none',
      registerOpenHandler: () => undefined
    } as ScrolithaOsContextValue;
  }
  return ctx;
};

export default ScrolithaOsContext;
