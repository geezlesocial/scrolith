export const normalizeAllowedHosts = (hosts: Iterable<string>) =>
  new Set(
    Array.from(hosts)
      .map((host) => String(host || '').trim().toLowerCase())
      .filter(Boolean)
  );

export const extractPathFromAppUrl = (
  url: string,
  allowedHosts: Iterable<string>,
  customScheme = 'scrolith'
) => {
  try {
    const raw = String(url || '').trim();
    if (!raw) return null;

    const schemeIndex = raw.indexOf('://');
    if (schemeIndex > 0) {
      const scheme = raw.slice(0, schemeIndex).toLowerCase();
      const rest = raw.slice(schemeIndex + 3);
      if (scheme === customScheme.toLowerCase()) {
        const normalized = rest.replace(/^\/+/, '');
        return normalized ? `/${normalized}` : '/';
      }
    }

    const parsed = new URL(raw);
    const normalizedHosts = normalizeAllowedHosts(allowedHosts);
    if (!normalizedHosts.has(parsed.hostname.toLowerCase())) return null;
    return `${parsed.pathname}${parsed.search || ''}${parsed.hash || ''}`;
  } catch {
    return null;
  }
};
