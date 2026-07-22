/**
 * Phase 33.0 — Privacy-safe AI response cache.
 * Never cache private messages across users. Only PUBLIC/INTERNAL when allowed.
 */
import { createHash } from 'crypto';
import type { AICapabilityId, PrivacyLevel } from './types';

type CacheEntry = {
  value: { text: string; data?: unknown; provider: string; model: string; promptVersion: string };
  expiresAt: number;
};

const store = new Map<string, CacheEntry>();
const MAX_ENTRIES = 500;
const DEFAULT_TTL_MS = 10 * 60_000;

const CACHEABLE_CAPABILITIES = new Set<AICapabilityId>([
  'TEXT_SUMMARIZATION',
  'TEXT_REWRITING',
  'TEXT_CLASSIFICATION',
  'SEMANTIC_SEARCH_PREPARATION'
]);

const CACHEABLE_PRIVACY = new Set<PrivacyLevel>(['PUBLIC', 'INTERNAL']);

export function canCache(input: {
  capability: AICapabilityId;
  privacyLevel: PrivacyLevel;
  consentAllows: boolean;
  personalized: boolean;
  allowCache?: boolean;
}): boolean {
  if (input.allowCache === false) return false;
  if (!input.consentAllows) return false;
  if (input.personalized) return false;
  if (!CACHEABLE_CAPABILITIES.has(input.capability)) return false;
  if (!CACHEABLE_PRIVACY.has(input.privacyLevel)) return false;
  return true;
}

export function buildCacheKey(parts: {
  capability: AICapabilityId;
  promptVersion: string;
  model: string;
  inputHash: string;
  policyVersion: string;
  locale: string;
}): string {
  return [
    parts.capability,
    parts.promptVersion,
    parts.model,
    parts.inputHash,
    parts.policyVersion,
    parts.locale || 'en'
  ].join('|');
}

export function hashInput(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 32);
}

export function cacheGet(key: string): CacheEntry['value'] | null {
  const e = store.get(key);
  if (!e) return null;
  if (Date.now() > e.expiresAt) {
    store.delete(key);
    return null;
  }
  return e.value;
}

export function cacheSet(key: string, value: CacheEntry['value'], ttlMs = DEFAULT_TTL_MS) {
  if (store.size >= MAX_ENTRIES) {
    // drop oldest ~10%
    const keys = Array.from(store.keys()).slice(0, Math.ceil(MAX_ENTRIES * 0.1));
    for (const k of keys) store.delete(k);
  }
  store.set(key, { value, expiresAt: Date.now() + ttlMs });
}

export function cacheStats() {
  return { size: store.size, max: MAX_ENTRIES };
}

export default { canCache, buildCacheKey, hashInput, cacheGet, cacheSet, cacheStats };
