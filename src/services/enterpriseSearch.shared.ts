/**
 * Shared web/mobile interfaces for Enterprise Search (Phase 9.2).
 * Mobile may import types/helpers without UI changes.
 */
export type {
  SearchDomain,
  SearchQueryRequest,
  SearchQueryResponse,
  SearchResult,
  SearchSuggestResponse,
  SearchFeedbackRequest,
  V1UnifiedPayload,
  V1SearchEntry
} from './enterpriseSearch.types';

export {
  isEnterpriseSearchClientEnabled,
  buildSearchQueryParams,
  parseSearchQueryResponse,
  mapSearchResultToV1Entry,
  mapQueryResponseToV1Unified,
  SUPPORTED_SEARCH_DOMAINS,
  RESERVED_SEARCH_DOMAINS,
  EnterpriseSearchService,
  publishSearchRefresh,
  subscribeSearchRefresh,
  formatSearchExplanation
} from './enterpriseSearch';
