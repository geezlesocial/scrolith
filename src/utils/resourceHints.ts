type ImagePreloadOptions = {
  fetchPriority?: 'high' | 'low' | 'auto';
};

const PRELOAD_ATTR = 'data-scrolith-preload';

const findExistingPreload = (key: string) => {
  if (typeof document === 'undefined') return null;
  return document.head.querySelector(`link[${PRELOAD_ATTR}="${key}"]`) as HTMLLinkElement | null;
};

export const clearImagePreloadLink = (key: string) => {
  const existing = findExistingPreload(key);
  existing?.remove();
};

export const upsertImagePreloadLink = (
  key: string,
  href: string | null | undefined,
  options: ImagePreloadOptions = {}
) => {
  if (typeof document === 'undefined') return;

  const normalizedHref = String(href || '').trim();
  if (!normalizedHref) {
    clearImagePreloadLink(key);
    return;
  }

  const existing = findExistingPreload(key);
  const link = existing || document.createElement('link');
  link.setAttribute(PRELOAD_ATTR, key);
  link.rel = 'preload';
  link.as = 'image';
  link.href = normalizedHref;
  link.setAttribute('fetchpriority', options.fetchPriority || 'high');

  if (!existing) {
    document.head.appendChild(link);
  }
};
