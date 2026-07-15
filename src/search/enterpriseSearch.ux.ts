/**
 * Enterprise Search UX gates & local history (Phase 9.5).
 * Default OFF — no production-visible change until VITE_ENTERPRISE_SEARCH_UX is enabled.
 */
import type { SearchDomain } from '../services/enterpriseSearch.types';

const UX_STORAGE_KEY = 'scrolith:enterprise-search-ux';
const RECENTS_KEY = 'scrolith:enterprise-search-recents:v1';
const SAVED_KEY = 'scrolith:enterprise-search-saved:v1';

export type SearchUxTab =
  | 'all'
  | 'person'
  | 'post'
  | 'company'
  | 'page'
  | 'community'
  | 'group'
  | 'job'
  | 'freelancer'
  | 'service'
  | 'marketplace_listing'
  | 'product'
  | 'discussion';

export type SearchUxSort = 'relevance' | 'recent' | 'price_asc' | 'price_desc' | 'popular';

export type SearchUxFilters = {
  location?: string;
  category?: string;
  datePreset?: '24h' | '7d' | '30d' | 'any';
  priceMin?: number;
  priceMax?: number;
  salaryMin?: number;
  salaryMax?: number;
  verified?: boolean;
  availability?: string;
  language?: string;
  relationship?: 'anyone' | 'following' | 'connections' | 'in_community';
  sort?: SearchUxSort;
};

/** Client UX flag — default OFF. Backend ENTERPRISE_SEARCH_* remains separate. */
export const isEnterpriseSearchUxEnabled = (): boolean => {
  try {
    const env = String((import.meta as any)?.env?.VITE_ENTERPRISE_SEARCH_UX || '').toLowerCase();
    if (env === '1' || env === 'true' || env === 'on') return true;
    if (env === '0' || env === 'false' || env === 'off') return false;
  } catch {
    // ignore
  }
  try {
    if (typeof window === 'undefined') return false;
    const raw = String(window.localStorage.getItem(UX_STORAGE_KEY) || '').toLowerCase();
    return raw === '1' || raw === 'true' || raw === 'on';
  } catch {
    return false;
  }
};

export const readRecentSearches = (limit = 8): string[] => {
  try {
    if (typeof window === 'undefined') return [];
    const parsed = JSON.parse(window.localStorage.getItem(RECENTS_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.map((x) => String(x || '').trim()).filter(Boolean).slice(0, limit);
  } catch {
    return [];
  }
};

export const pushRecentSearch = (query: string, limit = 8): string[] => {
  const clean = String(query || '').replace(/\s+/g, ' ').trim();
  if (!clean) return readRecentSearches(limit);
  const next = [clean, ...readRecentSearches(limit).filter((q) => q.toLowerCase() !== clean.toLowerCase())].slice(
    0,
    limit
  );
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next));
  } catch {
    // optional
  }
  return next;
};

export const clearRecentSearches = () => {
  try {
    window.localStorage.removeItem(RECENTS_KEY);
  } catch {
    // optional
  }
};

export const readSavedSearches = (): Array<{ id: string; query: string; createdAt: string }> => {
  try {
    if (typeof window === 'undefined') return [];
    const parsed = JSON.parse(window.localStorage.getItem(SAVED_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        id: String(row?.id || ''),
        query: String(row?.query || '').trim(),
        createdAt: String(row?.createdAt || '')
      }))
      .filter((r) => r.id && r.query)
      .slice(0, 20);
  } catch {
    return [];
  }
};

export const toggleSavedSearch = (query: string): Array<{ id: string; query: string; createdAt: string }> => {
  const clean = String(query || '').replace(/\s+/g, ' ').trim();
  if (!clean) return readSavedSearches();
  const existing = readSavedSearches();
  const found = existing.find((e) => e.query.toLowerCase() === clean.toLowerCase());
  const next = found
    ? existing.filter((e) => e.id !== found.id)
    : [
        { id: `sv_${Date.now().toString(36)}`, query: clean, createdAt: new Date().toISOString() },
        ...existing
      ].slice(0, 20);
  try {
    window.localStorage.setItem(SAVED_KEY, JSON.stringify(next));
  } catch {
    // optional
  }
  return next;
};

export const isSearchSaved = (query: string): boolean => {
  const clean = String(query || '').trim().toLowerCase();
  return readSavedSearches().some((s) => s.query.toLowerCase() === clean);
};

export const TAB_TO_DOMAINS: Record<SearchUxTab, SearchDomain[] | null> = {
  all: null,
  person: ['person'],
  post: ['post'],
  company: ['company'],
  page: ['page'],
  community: ['community'],
  group: ['group'],
  job: ['job'],
  freelancer: ['freelancer'],
  service: ['service'],
  marketplace_listing: ['marketplace_listing'],
  product: ['product'],
  discussion: ['discussion']
};

export const SEARCH_TABS: Array<{ key: SearchUxTab; label: string; shortcut?: string }> = [
  { key: 'all', label: 'All', shortcut: '1' },
  { key: 'person', label: 'People', shortcut: '2' },
  { key: 'post', label: 'Posts', shortcut: '3' },
  { key: 'company', label: 'Companies', shortcut: '4' },
  { key: 'page', label: 'Pages' },
  { key: 'community', label: 'Communities' },
  { key: 'group', label: 'Groups' },
  { key: 'job', label: 'Jobs', shortcut: '5' },
  { key: 'freelancer', label: 'Freelancers' },
  { key: 'service', label: 'Services' },
  { key: 'marketplace_listing', label: 'Marketplace' },
  { key: 'product', label: 'Products' },
  { key: 'discussion', label: 'Discussions' }
];

export const RESERVED_UX_DOMAINS = [
  { key: 'event', label: 'Events' },
  { key: 'course', label: 'Courses' },
  { key: 'project', label: 'Projects' }
] as const;

export const DEFAULT_TRENDING = [
  'remote work',
  'logo design',
  'frontend developer',
  'product manager',
  'AI tools',
  'social media marketing'
];

/** Escape for safe highlight regex */
export const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const filtersRelevantToTab = (tab: SearchUxTab): Array<keyof SearchUxFilters | 'sort'> => {
  const base: Array<keyof SearchUxFilters | 'sort'> = ['sort', 'datePreset'];
  if (tab === 'all') return [...base, 'location', 'verified', 'relationship'];
  if (tab === 'person' || tab === 'freelancer') return [...base, 'location', 'verified', 'availability', 'language', 'relationship'];
  if (tab === 'job') return [...base, 'location', 'category', 'salaryMin', 'salaryMax', 'verified'];
  if (tab === 'service' || tab === 'marketplace_listing' || tab === 'product') {
    return [...base, 'location', 'category', 'priceMin', 'priceMax', 'verified'];
  }
  if (tab === 'company' || tab === 'page' || tab === 'community' || tab === 'group') {
    return [...base, 'location', 'category', 'verified'];
  }
  if (tab === 'post' || tab === 'discussion') return [...base, 'language', 'relationship'];
  return base;
};
