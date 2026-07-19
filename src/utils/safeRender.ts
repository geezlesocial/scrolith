/**
 * Phase 21.1.1 — Safe rendering helpers.
 * Never surface [object Object], null, undefined, NaN, or bare {}.
 */

export const SAFE_RENDER_VERSION = '21.1.1';

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);

/** Extract a human-readable string from any nested value. */
export const extractDisplayString = (value: unknown, depth = 0): string => {
  if (value == null) return '';
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t || t === '[object Object]' || t === 'null' || t === 'undefined' || t === 'NaN') return '';
    return t;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '';
    return String(value);
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    try {
      return value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
    } catch {
      return value.toISOString();
    }
  }
  if (Array.isArray(value)) {
    if (depth > 2) return '';
    return value
      .map((entry) => extractDisplayString(entry, depth + 1))
      .filter(Boolean)
      .slice(0, 4)
      .join(', ');
  }
  if (isPlainObject(value)) {
    if (depth > 3) return '';
    // Prefer common display keys on nested DTOs.
    const preferred = [
      'label',
      'name',
      'title',
      'displayName',
      'display_name',
      'text',
      'value',
      'slug',
      'code',
      'city',
      'country',
      'formatted',
      'amount',
      'symbol'
    ];
    for (const key of preferred) {
      if (key in value) {
        const nested = extractDisplayString((value as any)[key], depth + 1);
        if (nested) return nested;
      }
    }
    // Location-like composites
    if ('city' in value || 'country' in value || 'region' in value) {
      const parts = [value.city, value.region, value.state, value.country]
        .map((p) => extractDisplayString(p, depth + 1))
        .filter(Boolean);
      if (parts.length) return parts.join(', ');
    }
    // Never dump whole object
    return '';
  }
  // Functions / symbols / etc.
  return '';
};

export const SafeText = (value: unknown, fallback = ''): string => {
  const text = extractDisplayString(value);
  return text || fallback;
};

export const SafeNumber = (value: unknown, fallback: number | null = null): number | null => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const n = Number(value.replace(/,/g, ''));
    if (Number.isFinite(n)) return n;
  }
  if (isPlainObject(value)) {
    const amount = SafeNumber((value as any).amount ?? (value as any).value ?? (value as any).minAmount);
    if (amount != null) return amount;
  }
  return fallback;
};

export const SafeCurrencyCode = (value: unknown, fallback = 'USD'): string => {
  const code = SafeText(
    typeof value === 'string'
      ? value
      : isPlainObject(value)
        ? (value as any).currency || (value as any).code || (value as any).currencyCode
        : '',
    fallback
  )
    .toUpperCase()
    .slice(0, 3);
  return /^[A-Z]{3}$/.test(code) ? code : fallback;
};

export const SafePrice = (
  value: unknown,
  options?: { currency?: unknown; fallback?: string; maximumFractionDigits?: number }
): string => {
  const amount = SafeNumber(value);
  if (amount == null) {
    // Nested price object may only have min/max
    if (isPlainObject(value)) {
      const min = SafeNumber((value as any).minAmount ?? (value as any).min);
      const max = SafeNumber((value as any).maxAmount ?? (value as any).max);
      const currency = SafeCurrencyCode((value as any).currency ?? options?.currency);
      if (min != null && max != null && min !== max) {
        return `${formatMoney(min, currency, options?.maximumFractionDigits)} – ${formatMoney(max, currency, options?.maximumFractionDigits)}`;
      }
      if (min != null) return formatMoney(min, currency, options?.maximumFractionDigits);
      if (max != null) return formatMoney(max, currency, options?.maximumFractionDigits);
    }
    return options?.fallback || '';
  }
  const currency =
    SafeCurrencyCode(
      isPlainObject(value) ? (value as any).currency ?? options?.currency : options?.currency
    ) || 'USD';
  return formatMoney(amount, currency, options?.maximumFractionDigits);
};

const formatMoney = (amount: number, currency: string, maximumFractionDigits = 0): string => {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: maximumFractionDigits ?? 0
    }).format(amount);
  } catch {
    return `${currency} ${amount}`;
  }
};

export const SafeCurrency = SafePrice;

export const SafeLocation = (value: unknown, fallback = ''): string => {
  if (typeof value === 'string') return SafeText(value, fallback);
  if (isPlainObject(value)) {
    const parts = [
      (value as any).city,
      (value as any).region,
      (value as any).state,
      (value as any).country,
      (value as any).label,
      (value as any).name,
      (value as any).formatted
    ]
      .map((p) => extractDisplayString(p))
      .filter(Boolean);
    if (parts.length) return Array.from(new Set(parts)).join(', ');
  }
  return SafeText(value, fallback);
};

export const SafeDate = (value: unknown, fallback = ''): string => {
  if (value == null || value === '') return fallback;
  try {
    const d = value instanceof Date ? value : new Date(String(value));
    if (Number.isNaN(d.getTime())) return fallback;
    const now = Date.now();
    const diff = now - d.getTime();
    if (diff >= 0 && diff < 60_000) return 'Just now';
    if (diff >= 0 && diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff >= 0 && diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    if (diff >= 0 && diff < 7 * 86_400_000) return `${Math.floor(diff / 86_400_000)}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return fallback;
  }
};

/** Join display parts, dropping empty / object-junk. */
export const safeJoin = (parts: unknown[], separator = ' · '): string =>
  parts
    .map((p) => extractDisplayString(p))
    .filter(Boolean)
    .filter((p) => p !== '[object Object]')
    .join(separator);

/** First usable media URL from listing-like payloads. */
export const SafeMedia = (source: unknown): string => {
  if (!source) return '';
  if (typeof source === 'string') {
    const t = source.trim();
    if (!t || t === '[object Object]') return '';
    return t;
  }
  if (Array.isArray(source)) {
    for (const entry of source) {
      const found = SafeMedia(entry);
      if (found) return found;
    }
    return '';
  }
  if (isPlainObject(source)) {
    const candidates = [
      (source as any).url,
      (source as any).src,
      (source as any).href,
      (source as any).imageUrl,
      (source as any).image_url,
      (source as any).thumbnailUrl,
      (source as any).thumbnail_url,
      (source as any).thumbnail,
      (source as any).coverUrl,
      (source as any).cover_url,
      (source as any).previewImage,
      (source as any).mediaUrl,
      (source as any).path
    ];
    for (const c of candidates) {
      const found = SafeMedia(c);
      if (found) return found;
    }
  }
  return '';
};

export const resolveListingMediaCandidates = (data: any): string[] => {
  const out: string[] = [];
  const push = (v: unknown) => {
    const s = SafeMedia(v);
    if (s && !out.includes(s)) out.push(s);
  };
  push(data?.primaryImage);
  push(data?.primary_image);
  push(data?.image);
  push(data?.imageUrl);
  push(data?.image_url);
  push(data?.thumbnail);
  push(data?.thumbnailUrl);
  push(data?.thumbnail_url);
  push(data?.coverImage);
  push(data?.cover);
  push(data?.coverUrl);
  push(data?.previewImage);
  push(data?.mediaUrl);
  if (Array.isArray(data?.images)) data.images.forEach(push);
  if (Array.isArray(data?.media)) data.media.forEach(push);
  if (Array.isArray(data?.photos)) data.photos.forEach(push);
  if (Array.isArray(data?.attachments)) data.attachments.forEach(push);
  return out;
};

export const SafeAvatarName = (userLike: any, fallback = 'Member'): string => {
  const name = SafeText(
    userLike?.displayName ||
      userLike?.name ||
      userLike?.fullName ||
      userLike?.full_name ||
      [userLike?.firstName, userLike?.lastName].filter(Boolean).join(' ') ||
      userLike?.username ||
      userLike?.handle,
    fallback
  );
  return name || fallback;
};

/** Initials for avatar (1–2 chars). */
export const SafeAvatarInitials = (userLike: any, fallback = '?'): string => {
  const name = SafeAvatarName(userLike, '');
  if (!name) return fallback;
  const cleaned = name.replace(/[@._-]+/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] || ''}${parts[1][0] || ''}`.toUpperCase().slice(0, 2) || fallback;
  }
  return cleaned.slice(0, 2).toUpperCase() || fallback;
};

/** Deterministic pastel-ish background from a seed string. */
export const SafeAvatarColor = (seed: unknown): { bg: string; fg: string } => {
  const text = SafeText(seed, 'scrolith');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  const hues = [210, 230, 250, 270, 190, 160, 20, 340, 300, 175];
  const hue = hues[hash % hues.length];
  const sat = 48 + (hash % 18);
  const light = 42 + (hash % 12);
  return {
    bg: `hsl(${hue} ${sat}% ${light}%)`,
    fg: '#ffffff'
  };
};

/** True if a React child would be unsafe to render raw. */
export const isUnsafeRenderValue = (value: unknown): boolean => {
  if (value == null) return true;
  if (typeof value === 'number' && !Number.isFinite(value)) return true;
  if (typeof value === 'object') return true;
  if (typeof value === 'string') {
    const t = value.trim();
    return !t || t === '[object Object]' || t === 'null' || t === 'undefined' || t === 'NaN';
  }
  return false;
};
