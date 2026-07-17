import type { SearchCandidate, SearchDomain, SearchFilters } from '../contracts/types';
import type { NormalizedQuery } from '../retrieval/normalize';
import type { SearchViewerContext } from '../retrieval/permissions';

export type AdapterContext = {
  query: string;
  normalized: NormalizedQuery;
  limit: number;
  filters?: SearchFilters;
  viewerId?: string | null;
  viewer: SearchViewerContext;
  /** Optional abort — adapters should not long-poll */
  signal?: AbortSignal;
};

export type SearchDomainAdapter = {
  domain: SearchDomain;
  retrieve: (ctx: AdapterContext) => Promise<SearchCandidate[]>;
};
