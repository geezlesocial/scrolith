/**
 * Enterprise Search public module surface (Phase 9.2 foundation).
 */
export { EnterpriseSearchService, enterpriseSearchService } from './service';
export { SEARCH_MODEL_VERSION } from './contracts/constants';
export * from './contracts/types';
export {
  resolveEnterpriseSearchRolloutFlags,
  getEnterpriseSearchRolloutSummary,
  invalidateEnterpriseSearchRolloutCache,
  DEFAULT_ENTERPRISE_SEARCH_FLAGS
} from './rollout/rollout';
export { encodeSearchCursor, decodeSearchCursor, hashViewerKey } from './cursor/cursor';
export { compatibility } from './compatibility/v1';
export { getSearchMetricsSnapshot, resetSearchMetricsForTests } from './observability/observability';
export { mapToV1Unified, mapSearchResultToV1Entry, mapDiscoveryItemToSearchResult } from './dto/mappers';
export { parseSearchQueryRequest, aliasToDomain, validateFilters } from './dto/validate';
export { listRegisteredAdapters, getAdapter } from './adapters';
export { retrieveCandidates } from './retrieval/retrieve';
export { normalizeSearchQuery, lexicalMatchScore, clearNormalizeCacheForTests } from './retrieval/normalize';
export { dedupeCandidates, candidateKey } from './retrieval/dedupe';
export { applyPermissionFilters, emptyViewerContext } from './retrieval/permissions';
export { runSearchRetrievalPipeline } from './retrieval/pipeline';
export {
  buildSearchCacheKey,
  getSearchCache,
  setSearchCache,
  clearSearchCacheForTests,
  invalidateSearchCache,
  invalidateSearchCacheForViewer,
  bumpSearchCacheGeneration,
  getSearchCacheStats,
  coalesceSearchRequest
} from './cache/cache';
export { submitSearchFeedback, validateSearchFeedback, resetSearchFeedbackStateForTests } from './feedback/feedback';
export { emitSearchInvalidation, bindSearchRealtimeApp, resetSearchRealtimeForTests } from './realtime/realtime';
export { rankViaDiscoveryOrFallback } from './ranking/discoveryHandoff';
export { resetSearchCursorStateForTests } from './cursor/cursor';
