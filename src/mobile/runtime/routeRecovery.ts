export const normalizeRouteHref = (value: string) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) {
    try {
      const parsed = new URL(raw);
      return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      return raw;
    }
  }
  return raw;
};

export const isLikelyChunkLoadError = (error: unknown) => {
  const message = String(
    (error as { message?: unknown } | null)?.message ||
      (error as { reason?: { message?: unknown } } | null)?.reason?.message ||
      error ||
      ''
  ).toLowerCase();

  return (
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('dynamically imported module') ||
    message.includes('chunkloaderror') ||
    message.includes('loading css chunk') ||
    message.includes('unable to preload css')
  );
};
