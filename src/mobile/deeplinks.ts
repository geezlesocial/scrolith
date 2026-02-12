import { App } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';

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
  try {
    const raw = String(url || '').trim();
    if (!raw) return null;

    // Custom scheme: scrolith://<path>  (case-insensitive)
    // We intentionally treat everything after `://` as the web path so
    // `scrolith://freelancer/dashboard` becomes `/freelancer/dashboard`.
    const schemeMatch = raw.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):\\/\\/(.*)$/);
    if (schemeMatch) {
      const scheme = (schemeMatch[1] || '').toLowerCase();
      const rest = schemeMatch[2] || '';
      if (scheme === CUSTOM_SCHEME) {
        const normalized = rest.replace(/^\\/+/, '');
        return `/${normalized}`;
      }
    }

    const parsed = new URL(raw);
    const allowedHosts = getAllowedHosts();
    if (!allowedHosts.has(parsed.hostname.toLowerCase())) return null;
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


