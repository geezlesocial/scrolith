import React, { useEffect, useMemo, useState } from 'react';
import { Download, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { useUser } from '../context/UserContext';

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
};

const isStandalone = () => {
  if (typeof window === 'undefined') return false;
  const mq = window.matchMedia?.('(display-mode: standalone)').matches;
  const nav = (navigator as any);
  return Boolean(mq || nav?.standalone);
};

const PwaInstallPrompt: React.FC = () => {
  const { isAuthenticated } = useUser();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const isNative = useMemo(() => {
    try {
      return Capacitor.isNativePlatform();
    } catch {
      return false;
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated || isNative || isStandalone()) return;
    const handler = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
      setVisible(true);
    };
    const installedHandler = () => {
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', installedHandler);
    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
      window.removeEventListener('appinstalled', installedHandler);
    };
  }, [isAuthenticated, isNative]);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    try {
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === 'accepted') {
        setVisible(false);
      }
    } catch {
      // ignore
    } finally {
      setDeferredPrompt(null);
    }
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-1/2 z-[60] w-[min(92vw,520px)] -translate-x-1/2 rounded-2xl border border-slate-200 bg-white/95 px-4 py-3 shadow-xl backdrop-blur">
      <div className="flex items-start gap-3">
        <div className="mt-1 rounded-xl bg-slate-900 p-2 text-white">
          <Download className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-slate-900">Install Scrolith</p>
          <p className="text-xs text-slate-500">Get quick access from your desktop and receive a more app-like experience.</p>
          <div className="mt-2 flex items-center gap-2">
            <button
              onClick={handleInstall}
              className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white"
            >
              Install
            </button>
            <button
              onClick={() => setVisible(false)}
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-600"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          onClick={() => setVisible(false)}
          className="text-slate-400 hover:text-slate-600"
          aria-label="Dismiss install prompt"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
};

export default PwaInstallPrompt;

