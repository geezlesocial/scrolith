export type MessageLinkToken =
  | { type: 'text'; value: string }
  | {
      type: 'url';
      value: string;
      href: string;
      hostname: string;
      internalPath: string | null;
    };

export const TRUSTED_SCROLITH_HOSTS = [
  'scrolith.com',
  'www.scrolith.com',
  'api.scrolith.com'
] as const;

const TRUSTED_HOST_SET = new Set<string>(TRUSTED_SCROLITH_HOSTS);
const MAX_MESSAGE_URL_LENGTH = 2048;
const URL_START_RE = /(?:https?:\/\/|www\.|(?:api\.)?scrolith\.com(?:\/|$))[^\s<>"']*/gi;
const DISALLOWED_SCHEMES_RE = /^(?:javascript|data|vbscript|file|intent|blob|about|chrome):/i;
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;
const TRAILING_PUNCTUATION_RE = /[.,!?;:]+$/;
const USER_FACING_INTERNAL_PREFIXES = [
  '/messages',
  '/profile',
  '/u',
  '/jobs',
  '/browse-jobs',
  '/marketplace',
  '/groups',
  '/community',
  '/post',
  '/member-home',
  '/m',
  '/notifications',
  '/browse',
  '/company',
  '/companies',
  '/p',
  '/scroll',
  '/live',
  '/freelancer',
  '/client',
  '/admin'
];

const countChar = (value: string, char: string) => {
  let count = 0;
  for (const next of value) {
    if (next === char) count += 1;
  }
  return count;
};

const splitTrailingText = (candidate: string) => {
  let urlText = candidate;
  let trailing = '';

  const punctuation = urlText.match(TRAILING_PUNCTUATION_RE)?.[0] || '';
  if (punctuation) {
    urlText = urlText.slice(0, -punctuation.length);
    trailing = punctuation + trailing;
  }

  while (urlText.endsWith(')') && countChar(urlText, ')') > countChar(urlText, '(')) {
    urlText = urlText.slice(0, -1);
    trailing = `)${trailing}`;
  }
  while (urlText.endsWith(']') && countChar(urlText, ']') > countChar(urlText, '[')) {
    urlText = urlText.slice(0, -1);
    trailing = `]${trailing}`;
  }
  while (urlText.endsWith('}') && countChar(urlText, '}') > countChar(urlText, '{')) {
    urlText = urlText.slice(0, -1);
    trailing = `}${trailing}`;
  }

  return { urlText, trailing };
};

export const normalizeMessageUrl = (value: string): string | null => {
  const raw = String(value || '').trim();
  if (!raw || raw.length > MAX_MESSAGE_URL_LENGTH || CONTROL_CHARS_RE.test(raw)) return null;
  if (DISALLOWED_SCHEMES_RE.test(raw)) return null;

  const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    if (!parsed.hostname || parsed.username || parsed.password) return null;
    if (parsed.href.length > MAX_MESSAGE_URL_LENGTH || CONTROL_CHARS_RE.test(parsed.href)) return null;
    return parsed.href;
  } catch {
    return null;
  }
};

export const getInternalScrolithPath = (href: string): string | null => {
  try {
    const parsed = new URL(href);
    const hostname = parsed.hostname.toLowerCase();
    if (!TRUSTED_HOST_SET.has(hostname)) return null;
    if (hostname === 'api.scrolith.com' || parsed.pathname.startsWith('/api')) return null;
    const path = `${parsed.pathname || '/'}${parsed.search || ''}${parsed.hash || ''}`;
    return USER_FACING_INTERNAL_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`))
      ? path
      : null;
  } catch {
    return null;
  }
};

export const tokenizeMessageLinks = (text: string): MessageLinkToken[] => {
  const raw = String(text || '');
  const tokens: MessageLinkToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  URL_START_RE.lastIndex = 0;

  while ((match = URL_START_RE.exec(raw))) {
    const candidate = match[0];
    const start = match.index;

    if (start > 0 && raw[start - 1] === '@') continue;
    if (start > lastIndex) tokens.push({ type: 'text', value: raw.slice(lastIndex, start) });

    const { urlText, trailing } = splitTrailingText(candidate);
    const href = normalizeMessageUrl(urlText);
    if (!href) {
      tokens.push({ type: 'text', value: candidate });
    } else {
      const parsed = new URL(href);
      tokens.push({
        type: 'url',
        value: urlText,
        href,
        hostname: parsed.hostname,
        internalPath: getInternalScrolithPath(href)
      });
      if (trailing) tokens.push({ type: 'text', value: trailing });
    }
    lastIndex = start + candidate.length;
  }

  if (lastIndex < raw.length) tokens.push({ type: 'text', value: raw.slice(lastIndex) });
  return tokens.length ? tokens : [{ type: 'text', value: raw }];
};

export const isNativeCapacitorRuntime = (): boolean => {
  try {
    const runtime = typeof window !== 'undefined' ? (window as any).Capacitor : null;
    if (!runtime) return false;
    if (typeof runtime.isNativePlatform === 'function') return Boolean(runtime.isNativePlatform());
    return Boolean(runtime);
  } catch {
    return false;
  }
};

export const openSafeExternalMessageUrl = async (href: string): Promise<void> => {
  const normalized = normalizeMessageUrl(href);
  if (!normalized) return;

  if (isNativeCapacitorRuntime()) {
    try {
      const { Browser } = await import('@capacitor/browser');
      await Browser.open({ url: normalized });
      return;
    } catch {
      // Fall back to isolated browser window below.
    }
  }

  if (typeof window !== 'undefined') {
    window.open(normalized, '_blank', 'noopener,noreferrer,nofollow');
  }
};
