import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

const getAllowedHosts = () => {
  const envHost = String(import.meta.env.VITE_APP_DOMAIN || '').trim();
  const envAltHost = String(import.meta.env.VITE_PUBLIC_APP_DOMAIN || '').trim();
  const base = ['Scrolith.com', 'www.Scrolith.com'];
  if (envHost) base.push(envHost);
  if (envAltHost) base.push(envAltHost);
  return new Set(base.filter(Boolean));
};

export const extractPathFromUrl = (url: string): string | null => {
  try {
    if (url.startsWith('Scrolith://')) {
      return url.replace('Scrolith://', '/');
    }
    const parsed = new URL(url);
    const allowedHosts = getAllowedHosts();
    if (!allowedHosts.has(parsed.hostname)) return null;
    return `${parsed.pathname}${parsed.search || ''}`;
  } catch {
    return null;
  }
};

export const registerDeepLinks = (navigate: (path: string) => void) => {
  if (!Capacitor.isNativePlatform()) return;
  App.addListener('appUrlOpen', (event) => {
    const path = extractPathFromUrl(event.url || '');
    if (path) navigate(path);
  });
};


