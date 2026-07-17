/**
 * Phase 18.5 — Guest Marketplace category label safety.
 * Resolves listing category fields that may be strings or objects without
 * ever coercing objects via String() → "[object Object]".
 */

const MAX_LABEL_LENGTH = 64;
const MAX_DEPTH = 6;

const INVALID_LITERALS = new Set([
  '',
  '[object object]',
  'null',
  'undefined',
  'nan',
  'false',
  'true'
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Prisma-style cuid / opaque ids */
const OPAQUE_ID_RE = /^(c[a-z0-9]{20,}|[0-9a-f]{16,}|[0-9]+)$/i;
const URL_RE = /^(https?:)?\/\//i;
const PATH_RE = /^(\/|\\|\.\/|\.\.\/)/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\x00-\x1F\x7F]/g;

const OBJECT_LABEL_KEYS = [
  'name',
  'title',
  'label',
  'categoryName',
  'category_name',
  'displayName',
  'display_name',
  'value'
] as const;

const SLUG_LAST_RESORT_KEYS = ['slug', 'code', 'key'] as const;

const NESTED_CONTAINER_KEYS = [
  'category',
  'parent',
  'parentCategory',
  'parent_category',
  'subcategory',
  'subCategory',
  'sub_category'
] as const;

const isInvalidLiteral = (value: string): boolean => {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return true;
  if (INVALID_LITERALS.has(normalized)) return true;
  if (normalized.includes('[object object]')) return true;
  return false;
};

const stripControlChars = (value: string): string => value.replace(CONTROL_CHARS_RE, '').trim();

const clampLabel = (value: string): string => {
  const trimmed = value.trim();
  if (trimmed.length <= MAX_LABEL_LENGTH) return trimmed;
  return `${trimmed.slice(0, MAX_LABEL_LENGTH - 1).trimEnd()}…`;
};

/**
 * Humanize slug-like tokens only (consumer-electronics → Consumer Electronics).
 * Returns null when the token is not confidently a slug.
 */
export const humanizeCategorySlug = (raw: string): string | null => {
  const value = stripControlChars(raw);
  if (!value || isInvalidLiteral(value)) return null;
  if (value.includes(' ')) return null; // already human text; not a slug path
  if (URL_RE.test(value) || PATH_RE.test(value)) return null;
  if (UUID_RE.test(value) || OPAQUE_ID_RE.test(value)) return null;
  if (value.length > 48) return null;
  // Require slug-like separators or single alphabetic token
  if (!/^[a-zA-Z][a-zA-Z0-9]*(?:[-_][a-zA-Z0-9]+)*$/.test(value)) return null;

  const words = value
    .split(/[-_]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (!words.length || words.length > 8) return null;

  const humanized = words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');

  return clampLabel(humanized);
};

const finalizeLabel = (raw: string, allowSlugHumanize: boolean): string | null => {
  const value = stripControlChars(raw);
  if (!value || isInvalidLiteral(value)) return null;
  if (URL_RE.test(value) || PATH_RE.test(value)) return null;
  if (UUID_RE.test(value)) return null;
  // Pure numeric / opaque database ids
  if (/^\d+$/.test(value) || OPAQUE_ID_RE.test(value)) return null;

  // JSON-encoded category blob (bounded). Incomplete / malformed JSON → null.
  const looksLikeJson =
    value.startsWith('{') ||
    value.startsWith('[') ||
    (value.includes('{') && value.includes('}'));
  if (looksLikeJson) {
    const balanced =
      (value.startsWith('{') && value.endsWith('}')) ||
      (value.startsWith('[') && value.endsWith(']'));
    if (!balanced || value.length > 2000) return null;
    try {
      const parsed = JSON.parse(value);
      return resolveCategoryLabel(parsed);
    } catch {
      return null;
    }
  }

  // Slug-like only when explicitly allowed (last-resort path)
  if (allowSlugHumanize && /^[a-zA-Z][a-zA-Z0-9]*(?:[-_][a-zA-Z0-9]+)+$/.test(value)) {
    return humanizeCategorySlug(value);
  }

  // Single-token slugs without separators (e.g. "electronics") — keep as-is title-cased lightly if all lower
  if (allowSlugHumanize && /^[a-z]+$/.test(value) && value.length <= 32) {
    return clampLabel(value.charAt(0).toUpperCase() + value.slice(1));
  }

  // Preserve valid human-readable category strings unchanged (trim/clamp only)
  return clampLabel(value);
};

/**
 * Safely resolve a human-readable category label from unknown payload shapes.
 * Returns a display string or null. Never returns "[object Object]".
 */
export const resolveCategoryLabel = (
  input: unknown,
  depth = 0,
  seen?: WeakSet<object>
): string | null => {
  if (input == null || depth > MAX_DEPTH) return null;

  if (typeof input === 'string') {
    // Prefer explicit labels; do not humanize plain strings that already look human
    const direct = finalizeLabel(input, false);
    if (direct) return direct;
    // Last-resort: humanize slug-only strings
    return finalizeLabel(input, true);
  }

  // Reject bare numbers (IDs / amounts) as category labels
  if (typeof input === 'number') {
    return null;
  }

  if (typeof input === 'boolean' || typeof input === 'bigint' || typeof input === 'function') {
    return null;
  }

  if (Array.isArray(input)) {
    const labels: string[] = [];
    for (const entry of input) {
      const resolved = resolveCategoryLabel(entry, depth + 1, seen);
      if (!resolved) continue;
      if (!labels.some((label) => label.toLowerCase() === resolved.toLowerCase())) {
        labels.push(resolved);
      }
      // First valid human-readable label wins for badge display
      if (labels.length === 1) return labels[0];
    }
    return null;
  }

  if (typeof input === 'object') {
    const tracker = seen || new WeakSet<object>();
    if (tracker.has(input as object)) return null;
    tracker.add(input as object);

    const record = input as Record<string, unknown>;

    for (const key of OBJECT_LABEL_KEYS) {
      if (record[key] == null) continue;
      const resolved = resolveCategoryLabel(record[key], depth + 1, tracker);
      if (resolved) return resolved;
    }

    for (const key of NESTED_CONTAINER_KEYS) {
      if (record[key] == null) continue;
      const resolved = resolveCategoryLabel(record[key], depth + 1, tracker);
      if (resolved) return resolved;
    }

    // Slug last-resort only (humanized)
    for (const key of SLUG_LAST_RESORT_KEYS) {
      if (record[key] == null) continue;
      const raw = record[key];
      if (typeof raw === 'string') {
        const humanized = humanizeCategorySlug(raw) || finalizeLabel(raw, true);
        if (humanized) return humanized;
      }
    }

    return null;
  }

  return null;
};

/**
 * Guest marketplace listing category selection with field priority and safe fallback.
 * Priority: categoryName → category_name → category → subcategory* → "Marketplace"
 */
export const resolveGuestMarketplaceCategoryLabel = (listing: unknown): string => {
  if (listing == null) return 'Marketplace';

  if (typeof listing !== 'object' || Array.isArray(listing)) {
    return resolveCategoryLabel(listing) || 'Marketplace';
  }

  const row = listing as Record<string, unknown>;
  const candidates: unknown[] = [
    row.categoryName,
    row.category_name,
    row.category,
    row.subcategoryName,
    row.subcategory_name,
    row.subcategory,
    row.subCategory
  ];

  for (const candidate of candidates) {
    const resolved = resolveCategoryLabel(candidate);
    if (resolved) return resolved;
  }

  return 'Marketplace';
};
