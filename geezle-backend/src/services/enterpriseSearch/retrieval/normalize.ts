/**
 * Query normalization + small LRU-ish cache.
 */
import { SEARCH_NORMALIZE_CACHE_MAX, SEARCH_QUERY_MAX_LEN } from '../contracts/constants';

export type NormalizedQuery = {
  raw: string;
  normalized: string;
  tokens: string[];
  /** lowercased for matching */
  lower: string;
};

const cache = new Map<string, NormalizedQuery>();

const collapse = (s: string) => s.replace(/\s+/g, ' ').trim();

export const normalizeSearchQuery = (input: unknown, maxLen = SEARCH_QUERY_MAX_LEN): NormalizedQuery => {
  const raw = collapse(String(input || ''));
  const clipped = raw.length > maxLen ? raw.slice(0, maxLen) : raw;
  const key = clipped.toLowerCase();
  const hit = cache.get(key);
  if (hit) {
    // refresh LRU order
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  const normalized = clipped
    .normalize('NFKC')
    .replace(/[^\p{L}\p{N}\s@._+-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lower = normalized.toLowerCase();
  const tokens = lower.split(' ').filter((t) => t.length >= 1).slice(0, 24);

  const value: NormalizedQuery = { raw: clipped, normalized, tokens, lower };
  if (cache.size >= SEARCH_NORMALIZE_CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(key, value);
  return value;
};

export const clearNormalizeCacheForTests = () => cache.clear();

/**
 * Lexical relevance: exact > prefix > token-all > partial contains.
 * Returns 0..1
 */
export const lexicalMatchScore = (haystack: string, nq: NormalizedQuery): number => {
  const h = String(haystack || '').toLowerCase().trim();
  if (!h || !nq.lower) return 0;
  if (h === nq.lower) return 1;
  if (h.startsWith(nq.lower)) return 0.92;
  if (nq.lower.startsWith(h) && h.length >= 2) return 0.88;
  if (h.includes(nq.lower)) return 0.75;
  if (nq.tokens.length) {
    const hits = nq.tokens.filter((t) => t.length >= 2 && h.includes(t)).length;
    if (hits === nq.tokens.length) return 0.7;
    if (hits > 0) return 0.45 + (hits / nq.tokens.length) * 0.2;
  }
  return 0;
};

/** Best score across multiple text fields */
export const bestLexicalScore = (fields: Array<string | null | undefined>, nq: NormalizedQuery): number => {
  let best = 0;
  for (const f of fields) {
    best = Math.max(best, lexicalMatchScore(String(f || ''), nq));
  }
  return best;
};

export const containsFilter = (q: string) => ({ contains: q, mode: 'insensitive' as const });
