/**
 * Request validation for Enterprise Search v2.
 */
import {
  ALL_SEARCH_DOMAINS,
  RESERVED_SEARCH_DOMAINS,
  SEARCH_DEFAULT_LIMIT,
  SEARCH_MAX_LIMIT,
  SEARCH_QUERY_MAX_LEN,
  SEARCH_SUGGEST_DEFAULT_LIMIT,
  SEARCH_SUGGEST_MAX_LIMIT,
  SEARCH_SUGGEST_QUERY_MAX_LEN,
  SUPPORTED_SEARCH_DOMAINS
} from '../contracts/constants';
import {
  SearchContractError,
  type SearchDomain,
  type SearchFilters,
  type SearchQueryRequest,
  type SearchRetrievalMode,
  type SearchSort,
  type SearchSurface
} from '../contracts/types';

const text = (v: unknown) => String(v || '').replace(/\s+/g, ' ').trim();

const DOMAIN_SET = new Set<string>(ALL_SEARCH_DOMAINS as unknown as string[]);
const RESERVED = new Set<string>(RESERVED_SEARCH_DOMAINS as unknown as string[]);
const SUPPORTED = new Set<string>(SUPPORTED_SEARCH_DOMAINS as unknown as string[]);

const VALID_SORT: SearchSort[] = ['relevance', 'recent', 'price_asc', 'price_desc', 'popular'];
const VALID_RETRIEVAL: SearchRetrievalMode[] = ['keyword', 'hybrid', 'semantic'];
const VALID_SURFACES: SearchSurface[] = [
  'search_results',
  'search_suggest',
  'search_hero',
  'search_member_home',
  'search_public',
  'global'
];

export const normalizeQueryText = (q: unknown, max = SEARCH_QUERY_MAX_LEN): string => {
  const cleaned = text(q);
  if (cleaned.length > max) {
    throw new SearchContractError('VALIDATION_ERROR', `Query exceeds ${max} characters`);
  }
  return cleaned;
};

export const clampLimit = (value: unknown, fallback: number, max: number): number => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.trunc(n)));
};

export const parseDomains = (
  raw: unknown,
  strict = true
): { domains: SearchDomain[]; unsupported: SearchDomain[]; warnings: Array<{ code: string; message: string }> } => {
  const warnings: Array<{ code: string; message: string }> = [];
  let list: string[] = [];
  if (raw == null || raw === '') {
    return { domains: [...SUPPORTED_SEARCH_DOMAINS] as SearchDomain[], unsupported: [], warnings };
  }
  if (Array.isArray(raw)) list = raw.map(String);
  else if (typeof raw === 'string') list = raw.split(',').map((s) => s.trim()).filter(Boolean);
  else throw new SearchContractError('VALIDATION_ERROR', 'Invalid domains');

  const domains: SearchDomain[] = [];
  const unsupported: SearchDomain[] = [];
  for (const item of list) {
    const d = aliasToDomain(item);
    if (!DOMAIN_SET.has(d)) {
      if (strict) throw new SearchContractError('VALIDATION_ERROR', `Unknown domain: ${item}`);
      warnings.push({ code: 'UNKNOWN_DOMAIN', message: `Ignored unknown domain: ${item}` });
      continue;
    }
    if (RESERVED.has(d)) {
      if (strict) throw new SearchContractError('DOMAIN_UNSUPPORTED', `Domain not supported yet: ${d}`);
      unsupported.push(d as SearchDomain);
      continue;
    }
    if (!SUPPORTED.has(d)) {
      if (strict) throw new SearchContractError('VALIDATION_ERROR', `Domain not enabled: ${d}`);
      unsupported.push(d as SearchDomain);
      continue;
    }
    if (!domains.includes(d as SearchDomain)) domains.push(d as SearchDomain);
  }
  if (!domains.length) {
    throw new SearchContractError('VALIDATION_ERROR', 'No supported domains requested');
  }
  return { domains, unsupported, warnings };
};

/** Map v1 aliases to canonical SearchDomain */
export const aliasToDomain = (raw: string): string => {
  const key = String(raw || '').trim().toLowerCase();
  const map: Record<string, string> = {
    people: 'person',
    person: 'person',
    users: 'person',
    user: 'person',
    pages: 'page',
    page: 'page',
    company: 'company',
    companies: 'company',
    posts: 'post',
    post: 'post',
    jobs: 'job',
    job: 'job',
    gigs: 'service',
    gig: 'service',
    services: 'service',
    service: 'service',
    freelancer: 'freelancer',
    freelancers: 'freelancer',
    marketplace: 'marketplace_listing',
    listing: 'marketplace_listing',
    marketplace_listing: 'marketplace_listing',
    product: 'product',
    products: 'product',
    item: 'marketplace_listing',
    community: 'community',
    communities: 'community',
    group: 'group',
    groups: 'group',
    discussion: 'discussion',
    discussions: 'discussion',
    event: 'event',
    course: 'course',
    project: 'project'
  };
  return map[key] || key;
};

export const validateFilters = (raw: unknown): SearchFilters => {
  if (raw == null || raw === '') return {};
  if (typeof raw === 'string') {
    try {
      return validateFilters(JSON.parse(raw));
    } catch {
      throw new SearchContractError('VALIDATION_ERROR', 'Invalid filters JSON');
    }
  }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    throw new SearchContractError('VALIDATION_ERROR', 'Filters must be an object');
  }
  const src = raw as Record<string, unknown>;
  const json = JSON.stringify(src);
  if (json.length > 8 * 1024) {
    throw new SearchContractError('VALIDATION_ERROR', 'Filters payload too large');
  }
  const filters: SearchFilters = {};
  if (src.skills) {
    const skills = Array.isArray(src.skills) ? src.skills.map(String).slice(0, 20) : [];
    filters.skills = skills.map((s) => s.slice(0, 64));
  }
  if (src.categoryIds) {
    filters.categoryIds = Array.isArray(src.categoryIds) ? src.categoryIds.map(String).slice(0, 20) : [];
  }
  if (src.verified !== undefined) filters.verified = Boolean(src.verified);
  if (src.companyId) filters.companyId = String(src.companyId).slice(0, 128);
  if (src.communityId) filters.communityId = String(src.communityId).slice(0, 128);
  if (src.groupId) filters.groupId = String(src.groupId).slice(0, 128);
  if (src.relationship) {
    const r = String(src.relationship);
    if (!['anyone', 'following', 'connections', 'in_community'].includes(r)) {
      throw new SearchContractError('VALIDATION_ERROR', 'Invalid relationship filter');
    }
    filters.relationship = r as SearchFilters['relationship'];
  }
  if (src.price && typeof src.price === 'object') {
    const p = src.price as Record<string, unknown>;
    filters.price = {
      min: p.min != null ? Number(p.min) : undefined,
      max: p.max != null ? Number(p.max) : undefined,
      currency: p.currency ? String(p.currency).slice(0, 8) : undefined
    };
    if (filters.price.min != null && (!Number.isFinite(filters.price.min) || filters.price.min < 0)) {
      throw new SearchContractError('VALIDATION_ERROR', 'Invalid price.min');
    }
    if (filters.price.max != null && (!Number.isFinite(filters.price.max) || filters.price.max < 0)) {
      throw new SearchContractError('VALIDATION_ERROR', 'Invalid price.max');
    }
  }
  if (src.location && typeof src.location === 'object') {
    const loc = src.location as Record<string, unknown>;
    filters.location = {
      placeId: loc.placeId ? String(loc.placeId) : undefined,
      label: loc.label ? String(loc.label).slice(0, 200) : undefined,
      lat: loc.lat != null ? Number(loc.lat) : undefined,
      lng: loc.lng != null ? Number(loc.lng) : undefined,
      radiusKm: loc.radiusKm != null ? Number(loc.radiusKm) : undefined
    };
    if (filters.location.lat != null && (filters.location.lat < -90 || filters.location.lat > 90)) {
      throw new SearchContractError('VALIDATION_ERROR', 'Invalid location.lat');
    }
    if (filters.location.lng != null && (filters.location.lng < -180 || filters.location.lng > 180)) {
      throw new SearchContractError('VALIDATION_ERROR', 'Invalid location.lng');
    }
    if (filters.location.radiusKm != null) {
      if (!Number.isFinite(filters.location.radiusKm) || filters.location.radiusKm < 1 || filters.location.radiusKm > 500) {
        throw new SearchContractError('VALIDATION_ERROR', 'location.radiusKm must be 1..500');
      }
    }
  }
  // Pass-through remaining known shallow keys without deep clone of untrusted nests
  if (src.date && typeof src.date === 'object') filters.date = src.date as SearchFilters['date'];
  if (src.salary && typeof src.salary === 'object') filters.salary = src.salary as SearchFilters['salary'];
  if (src.availability) filters.availability = src.availability as SearchFilters['availability'];
  if (Array.isArray(src.language)) filters.language = src.language.map(String).slice(0, 10);
  if (src.jobStatus) filters.jobStatus = src.jobStatus as SearchFilters['jobStatus'];
  if (src.listingStatus) filters.listingStatus = src.listingStatus as SearchFilters['listingStatus'];
  return filters;
};

export const parseSearchQueryRequest = (input: Record<string, unknown>, viewerId?: string | null): SearchQueryRequest => {
  const q = normalizeQueryText(input.q ?? input.query);
  const strictDomains = input.strictDomains === undefined ? true : Boolean(input.strictDomains);
  const { domains, unsupported, warnings } = parseDomains(input.domains ?? input.entityTypes, strictDomains);
  const sortRaw = text(input.sort || 'relevance').toLowerCase() as SearchSort;
  const sort = VALID_SORT.includes(sortRaw) ? sortRaw : 'relevance';
  const retrievalRaw = text(input.retrieval || 'keyword').toLowerCase() as SearchRetrievalMode;
  const retrieval = VALID_RETRIEVAL.includes(retrievalRaw) ? retrievalRaw : 'keyword';
  const surfaceRaw = text(input.surface || 'search_results') as SearchSurface;
  const surface = VALID_SURFACES.includes(surfaceRaw) ? surfaceRaw : 'search_results';

  const req: SearchQueryRequest & { _unsupported?: SearchDomain[]; _warnings?: typeof warnings } = {
    q,
    domains,
    limit: clampLimit(input.limit, SEARCH_DEFAULT_LIMIT, SEARCH_MAX_LIMIT),
    cursor: input.cursor != null ? String(input.cursor) : null,
    filters: validateFilters(input.filters),
    sort,
    retrieval,
    includeExplanations: input.includeExplanations === undefined ? true : Boolean(input.includeExplanations),
    includeDebug: Boolean(input.includeDebug),
    sessionId: input.sessionId != null ? String(input.sessionId).slice(0, 128) : null,
    requestId: input.requestId != null ? String(input.requestId).slice(0, 128) : null,
    surface,
    strictDomains,
    viewerId: viewerId ?? null
  };
  (req as any)._unsupported = unsupported;
  (req as any)._warnings = warnings;
  return req;
};

export const parseSuggestRequest = (input: Record<string, unknown>) => {
  const q = normalizeQueryText(input.q ?? input.query, SEARCH_SUGGEST_QUERY_MAX_LEN);
  return {
    q,
    limit: clampLimit(input.limit, SEARCH_SUGGEST_DEFAULT_LIMIT, SEARCH_SUGGEST_MAX_LIMIT),
    domains: input.domains,
    surface: (text(input.surface || 'search_suggest') || 'search_suggest') as SearchSurface
  };
};
