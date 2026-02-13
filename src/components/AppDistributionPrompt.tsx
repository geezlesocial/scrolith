import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Download, Monitor, Smartphone, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useLocation } from 'react-router-dom';
import { useUser } from '../context/UserContext';
import {
  AppDistributionConfig,
  AppDistributionPlatform,
  AppDistributionService
} from '../services/appDistribution';

type PromptHistory = {
  shows: number[];
  installed: {
    android: boolean;
    desktop: boolean;
  };
};

const HISTORY_KEY = 'Scrolith.app_distribution.prompt_history.v1';
const SESSION_KEY = 'Scrolith.app_distribution.prompt_session.v1';

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  const nav = navigator as any;
  return Boolean(mq || nav?.standalone);
};

const getDeviceCategory = (): AppDistributionPlatform => {
  if (typeof navigator === 'undefined') return 'all';
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes('android')) return 'android';
  const isMobile =
    /iphone|ipad|ipod|mobile|phone|opera mini|silk|blackberry/i.test(ua);
  if (!isMobile) return 'desktop';
  return 'all';
};

const readHistory = (): PromptHistory => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) {
      return {
        shows: [],
        installed: { android: false, desktop: false }
      };
    }
    const parsed = JSON.parse(raw) as PromptHistory;
    return {
      shows: Array.isArray(parsed?.shows)
        ? parsed.shows.map((value) => Number(value)).filter((value) => !Number.isNaN(value))
        : [],
      installed: {
        android: Boolean(parsed?.installed?.android),
        desktop: Boolean(parsed?.installed?.desktop)
      }
    };
  } catch {
    return {
      shows: [],
      installed: { android: false, desktop: false }
    };
  }
};

const saveHistory = (history: PromptHistory) => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
  } catch {
    // ignore storage failures
  }
};

const getSessionId = () => {
  try {
    const existing = localStorage.getItem(SESSION_KEY);
    if (existing) return existing;
    const generated =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `session-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(SESSION_KEY, generated);
    return generated;
  } catch {
    return `session-${Date.now()}`;
  }
};

const countShowsToday = (timestamps: number[]) => {
  const dayKey = new Date().toISOString().slice(0, 10);
  return timestamps.filter((timestamp) => {
    const key = new Date(timestamp).toISOString().slice(0, 10);
    return key === dayKey;
  }).length;
};

const AppDistributionPrompt: React.FC = () => {
  const { isAuthenticated } = useUser();
  const location = useLocation();
  const [config, setConfig] = useState<AppDistributionConfig | null>(null);
  const [visible, setVisible] = useState(false);
  const [platform, setPlatform] = useState<AppDistributionPlatform>('all');
  const timeoutRef = useRef<number | null>(null);
  const sessionId = useMemo(() => getSessionId(), []);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const loaded = await AppDistributionService.getPublicConfig();
      if (!mounted) return;
      setConfig(loaded);
    };
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (timeoutRef.current) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }

    const isNative = (() => {
      try {
        return Capacitor.isNativePlatform();
      } catch {
        return false;
      }
    })();

    const targetPlatform = getDeviceCategory();
    setPlatform(targetPlatform);

    if (!config?.enabled) return;
    if (isNative || isStandalone()) return;
    if (isAuthenticated) return;
    if (location.pathname.startsWith('/admin')) return;
    if (targetPlatform !== 'android' && targetPlatform !== 'desktop') return;

    if (targetPlatform === 'android' && !config.android.enabled) return;
    if (targetPlatform === 'desktop' && !config.desktop.enabled) return;

    const history = readHistory();
    if (history.installed[targetPlatform]) return;

    const now = Date.now();
    const maxShowsPerDay = Number(config.maxShowsPerDay || 2);
    const cooldownMs = Number(config.cooldownHours || 2) * 60 * 60 * 1000;
    const showsToday = countShowsToday(history.shows);
    const lastShown = history.shows.length
      ? Math.max(...history.shows)
      : 0;

    if (showsToday >= maxShowsPerDay) {
      void AppDistributionService.trackEvent({
        event: 'prompt_suppressed',
        platform: targetPlatform,
        deviceCategory: targetPlatform,
        sessionId,
        sourcePath: location.pathname,
        details: { reason: 'daily_limit' }
      });
      return;
    }
    if (lastShown && now - lastShown < cooldownMs) {
      void AppDistributionService.trackEvent({
        event: 'prompt_suppressed',
        platform: targetPlatform,
        deviceCategory: targetPlatform,
        sessionId,
        sourcePath: location.pathname,
        details: { reason: 'cooldown' }
      });
      return;
    }

    history.shows = [...history.shows, now].slice(-50);
    saveHistory(history);
    setVisible(true);

    void AppDistributionService.trackEvent({
      event: 'prompt_shown',
      platform: targetPlatform,
      deviceCategory: targetPlatform,
      sessionId,
      sourcePath: location.pathname
    });

    timeoutRef.current = window.setTimeout(() => {
      setVisible(false);
      void AppDistributionService.trackEvent({
        event: 'prompt_dismissed',
        platform: targetPlatform,
        deviceCategory: targetPlatform,
        sessionId,
        sourcePath: location.pathname,
        details: { reason: 'auto_hide' }
      });
    }, Math.max(3, Number(config.autoHideSeconds || 8)) * 1000);

    return () => {
      if (timeoutRef.current) {
        window.clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [config, isAuthenticated, location.pathname, sessionId]);

  if (!visible || !config) return null;

  const target = platform === 'android' ? config.android : config.desktop;
  const icon = target.iconUrl || config.branding.iconUrl || config.branding.logoUrl;
  const hasDownload = Boolean(target.downloadUrl);

  const dismiss = (reason: string) => {
    setVisible(false);
    void AppDistributionService.trackEvent({
      event: 'prompt_dismissed',
      platform,
      deviceCategory: platform,
      sessionId,
      sourcePath: location.pathname,
      details: { reason }
    });
  };

  const onDownload = () => {
    if (!target.downloadUrl) return;
    window.open(target.downloadUrl, '_blank', 'noopener,noreferrer');
    void AppDistributionService.trackEvent({
      event: 'download_clicked',
      platform,
      deviceCategory: platform,
      sessionId,
      sourcePath: location.pathname,
      details: { url: target.downloadUrl }
    });
  };

  const markInstalled = () => {
    const history = readHistory();
    history.installed[platform] = true;
    saveHistory(history);
    setVisible(false);
    void AppDistributionService.trackEvent({
      event: 'install_marked',
      platform,
      deviceCategory: platform,
      sessionId,
      sourcePath: location.pathname
    });
  };

  return (
    <div className="fixed bottom-4 left-1/2 z-[70] w-[min(94vw,540px)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-2xl">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-11 w-11 items-center justify-center overflow-hidden rounded-xl bg-slate-100">
          {icon ? (
            <img src={icon} alt="Scrolith app" className="h-full w-full object-cover" />
          ) : platform === 'android' ? (
            <Smartphone className="h-5 w-5 text-slate-700" />
          ) : (
            <Monitor className="h-5 w-5 text-slate-700" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-slate-900">{target.title || config.branding.title}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {target.message || config.branding.subtitle}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              onClick={onDownload}
              disabled={!hasDownload}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-2 text-xs font-semibold ${
                hasDownload
                  ? 'bg-blue-600 text-white hover:bg-blue-700'
                  : 'cursor-not-allowed bg-slate-200 text-slate-500'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              {target.ctaLabel}
            </button>
            <button
              onClick={markInstalled}
              className="rounded-full border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              {target.secondaryCtaLabel}
            </button>
            <button
              onClick={() => dismiss('dismiss_button')}
              className="rounded-full px-2 py-2 text-xs font-semibold text-slate-500 hover:text-slate-700"
            >
              Not now
            </button>
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            Version: {target.version || 'beta'}
          </p>
        </div>
        <button
          onClick={() => dismiss('close_icon')}
          aria-label="Close app prompt"
          className="text-slate-400 hover:text-slate-600"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default AppDistributionPrompt;

