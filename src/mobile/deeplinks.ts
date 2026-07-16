import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { trackMobileRuntimeEvent } from './mobileTelemetry';
import { extractPathFromAppUrl } from './runtime/deepLinkUtils';

const CUSTOM_SCHEME = 'scrolith';

const getAllowedHosts = () => {
  const envHost = String(import.meta.env.VITE_APP_DOMAIN || '').trim();
  const envAltHost = String(import.meta.env.VITE_PUBLIC_APP_DOMAIN || '').trim();
  const base = ['scrolith.com', 'www.scrolith.com'];
  if (envHost) base.push(envHost);
  if (envAltHost) base.push(envAltHost);
  return new Set(base.map((h) => String(h).trim().toLowerCase()).filter(Boolean));
};

export const extractPathFromUrl = (url: string): string | null => {
  return extractPathFromAppUrl(url, getAllowedHosts(), CUSTOM_SCHEME);
};

export const registerDeepLinks = (navigate: (path: string) => void) => {
  if (!Capacitor.isNativePlatform()) return () => {};

  let disposed = false;
  const handleUrl = (url?: string | null, source: 'launch' | 'app_url_open' = 'app_url_open') => {
    if (disposed) return;
    const rawUrl = String(url || '').trim();
    const path = extractPathFromUrl(rawUrl);
    if (!path) {
      if (rawUrl) {
        void trackMobileRuntimeEvent(
          'deep_link_invalid',
          { url: rawUrl, source },
          { dedupeMs: 10_000, sourcePath: '/mobile/deeplinks' }
        );
      }
      return;
    }
    void trackMobileRuntimeEvent(
      'deep_link_opened',
      { url: rawUrl, path, source },
      { dedupeMs: 3_000, sourcePath: path }
    );
    try {
      navigate(path);
    } catch (error: any) {
      void trackMobileRuntimeEvent(
        'deep_link_navigation_failed',
        {
          url: rawUrl,
          path,
          source,
          message: error?.message || 'navigate_failed'
        },
        { dedupeMs: 5_000, sourcePath: path }
      );
    }
  };

  void App.getLaunchUrl()
    .then((result) => handleUrl(result?.url, 'launch'))
    .catch(() => {});

  const listenerPromise = App.addListener('appUrlOpen', (event) => {
    handleUrl(event.url || '', 'app_url_open');
  });

  return async () => {
    disposed = true;
    try {
      const listener = await listenerPromise;
      await listener.remove();
    } catch {}
  };
};


