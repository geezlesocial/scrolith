export type ApiRateLimitRoute = 'media' | 'telemetry' | 'default';

type RequestPathLike = {
  path?: string;
  originalUrl?: string;
  baseUrl?: string;
};

const requestPathHaystack = ({ path, originalUrl, baseUrl }: RequestPathLike): string =>
  `${String(path || '')} ${String(originalUrl || '')} ${String(baseUrl || '')}`.toLowerCase();

/** Keep high-volume browser media reads from consuming the general API budget. */
export const classifyApiRateLimitRoute = (request: RequestPathLike): ApiRateLimitRoute => {
  const haystack = requestPathHaystack(request);
  if (haystack.includes('/files/content')) return 'media';
  if (haystack.includes('/apps/track')) return 'telemetry';
  return 'default';
};

