/**
 * v1 compatibility mapping layer.
 * When Enterprise Search is disabled, callers must NOT use this for live traffic mutation —
 * existing /api/search routes keep their original implementations.
 * These mappers enable future internal migration without response shape changes.
 */
import type { SearchQueryResponse, SearchResult } from '../contracts/types';
import { mapSearchResultToV1Entry, mapToV1Unified, v1TypeToDomains, domainToV1Bucket } from '../dto/mappers';
import { aliasToDomain } from '../dto/validate';

export const compatibility = {
  aliasToDomain,
  v1TypeToDomains,
  domainToV1Bucket,
  mapSearchResultToV1Entry,
  mapToV1Unified,
  /** Project v2 query response into classic unified envelope */
  toUnifiedEnvelope(response: SearchQueryResponse) {
    return mapToV1Unified(response.normalizedQuery || response.query, response.items, response.totals.returned || 20);
  },
  /** Project items to typed v1 array */
  toTypedArray(items: SearchResult[], type: string) {
    const domain = aliasToDomain(type);
    const bucket = domainToV1Bucket(domain as any);
    return items
      .filter((i) => domainToV1Bucket(i.entityType) === bucket || i.entityType === domain)
      .map(mapSearchResultToV1Entry);
  }
};

export type V1UnifiedEnvelope = ReturnType<typeof mapToV1Unified>;
