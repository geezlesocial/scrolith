/**
 * Enterprise Search client DTOs — aligned with Phase 9.1B / backend 9.2.
 * Shared by web and mobile; no UI coupling.
 */

export type SearchDomain =
  | 'post'
  | 'person'
  | 'company'
  | 'page'
  | 'community'
  | 'group'
  | 'job'
  | 'freelancer'
  | 'service'
  | 'product'
  | 'marketplace_listing'
  | 'event'
  | 'course'
  | 'project'
  | 'discussion';

export type SearchSurface =
  | 'search_results'
  | 'search_suggest'
  | 'search_hero'
  | 'search_member_home'
  | 'search_public'
  | 'global';

export type SearchSort = 'relevance' | 'recent' | 'price_asc' | 'price_desc' | 'popular';

export type SearchRetrievalMode = 'keyword' | 'hybrid' | 'semantic';

export type RankingAuthority = 'discovery' | 'lexical_fallback' | 'none';

export type SearchReasonCode = string;

export type SearchExplanation = {
  codes: SearchReasonCode[];
  headline: string;
  detail?: string | null;
  i18nKey?: string;
  i18nParams?: Record<string, string | number>;
  from: 'discovery' | 'search_fallback' | 'editorial' | 'scrolitha_rephrase';
};

export type SearchResult = {
  id: string;
  entityType: SearchDomain;
  entityId: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  url: string;
  media?: {
    avatarUrl?: string | null;
    imageUrl?: string | null;
    thumbUrl?: string | null;
    alt?: string | null;
  };
  score?: number | null;
  rank?: number | null;
  reason?: string | null;
  reasonCodes?: SearchReasonCode[];
  explanation?: SearchExplanation;
  trackingToken: string;
  source?: string;
  visibility?: {
    level: 'public' | 'authenticated' | 'private' | 'unknown';
    label?: string;
  };
  permissions?: {
    canView: boolean;
    canFollow?: boolean;
    canApply?: boolean;
    canSave?: boolean;
    canShare?: boolean;
    canPurchase?: boolean;
  };
  ranking?: {
    authority: RankingAuthority | 'editorial_overlay';
    modelVersion?: string;
  };
  attributes?: Record<string, unknown>;
  ai?: {
    summary?: string | null;
    answerSnippet?: string | null;
    provider?: string | null;
    generatedAt?: string | null;
  };
  extensions?: Record<string, unknown>;
};

export type SearchFilters = {
  location?: {
    placeId?: string;
    label?: string;
    lat?: number;
    lng?: number;
    radiusKm?: number;
  };
  date?: {
    from?: string;
    to?: string;
    preset?: '24h' | '7d' | '30d' | 'any';
  };
  companyId?: string;
  communityId?: string;
  groupId?: string;
  skills?: string[];
  categoryIds?: string[];
  salary?: {
    min?: number;
    max?: number;
    currency?: string;
    period?: 'hour' | 'day' | 'month' | 'year' | 'project';
  };
  price?: {
    min?: number;
    max?: number;
    currency?: string;
  };
  verified?: boolean;
  availability?: 'available' | 'open_to_work' | 'any';
  language?: string[];
  relationship?: 'anyone' | 'following' | 'connections' | 'in_community';
  jobStatus?: 'open' | 'any';
  listingStatus?: 'active' | 'any';
};

export type SearchQueryRequest = {
  q: string;
  domains?: SearchDomain[];
  limit?: number;
  cursor?: string | null;
  filters?: SearchFilters;
  sort?: SearchSort;
  retrieval?: SearchRetrievalMode;
  includeExplanations?: boolean;
  sessionId?: string | null;
  requestId?: string | null;
  surface?: SearchSurface;
  strictDomains?: boolean;
};

export type SearchQueryResponse = {
  query: string;
  normalizedQuery: string;
  items: SearchResult[];
  groups?: Partial<Record<SearchDomain, SearchResult[]>>;
  totals: {
    returned: number;
    estimatedByDomain?: Partial<Record<SearchDomain, number | null>>;
    totalEstimated?: number | null;
  };
  nextCursor: string | null;
  requestId: string;
  searchModelVersion: string;
  rankingModelVersion: string;
  generatedAt: string;
  fallbackUsed: boolean;
  rankingAuthority: RankingAuthority;
  surface: SearchSurface;
  unsupportedDomains?: SearchDomain[];
  warnings?: Array<{ code: string; message: string }>;
  disabled?: boolean;
  searchTraceId?: string;
  rankingAuthorityValidated?: boolean;
};

export type SearchSuggestion = {
  kind: 'query' | 'entity' | 'prompt' | 'history';
  text: string;
  domain?: SearchDomain;
  entityId?: string;
  url?: string;
  subtitle?: string;
  score?: number;
  trackingToken?: string;
  reasonCodes?: SearchReasonCode[];
};

export type SearchSuggestResponse = {
  query: string;
  suggestions: SearchSuggestion[];
  requestId: string;
  generatedAt: string;
  fallbackUsed: boolean;
  disabled?: boolean;
};

export type SearchFeedbackAction =
  | 'impression'
  | 'click'
  | 'open'
  | 'save'
  | 'hide'
  | 'not_interested'
  | 'dismiss'
  | 'follow'
  | 'apply'
  | 'purchase'
  | 'share'
  | 'report';

export type SearchFeedbackRequest = {
  action: SearchFeedbackAction;
  entityType: SearchDomain | string;
  entityId: string;
  trackingToken?: string | null;
  surface?: SearchSurface;
  position?: number;
  query?: string;
  requestId?: string;
  metadata?: Record<string, unknown>;
};

export type EnterpriseSearchHealth = {
  success: boolean;
  service: string;
  version: string;
  rankingAuthority: string;
  flags: {
    master: boolean;
    discoveryRank?: boolean;
    diagnostics?: boolean;
  };
};

/** v1 compatibility shapes (existing platform search) */
export type V1SearchEntry = {
  id: string;
  type: string;
  title?: string;
  name?: string;
  username?: string;
  subtitle?: string;
  description?: string;
  url?: string;
  avatarUrl?: string | null;
  image?: string | null;
  meta?: Record<string, unknown>;
};

export type V1UnifiedPayload = {
  query: string;
  groups: Record<string, V1SearchEntry[]>;
  results: V1SearchEntry[];
  totals: Record<string, number>;
};
