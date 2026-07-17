/**
 * Semantic retrieval abstraction.
 * Default provider: lexical (current deep search).
 * Future vector/semantic providers plug in without changing callers.
 */
import { deepPlatformSearch, type DeepSearchResult, type SearchIntent } from './scrolitha.deepSearch';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';

export type SearchProviderName = 'lexical' | 'semantic' | 'hybrid';

export type SearchProviderCapabilities = {
  lexical: boolean;
  semantic: boolean;
  hybrid: boolean;
  requiresVectorIndex: boolean;
  ready: boolean;
};

export type SearchQuery = {
  query: string;
  viewerUserId: string;
  limit?: number;
  intent?: SearchIntent;
  mode?: SearchProviderName;
};

export interface SearchProvider {
  readonly name: SearchProviderName | string;
  readonly capabilities: SearchProviderCapabilities;
  search(input: SearchQuery): Promise<DeepSearchResult>;
}

class LexicalSearchProvider implements SearchProvider {
  readonly name = 'lexical' as const;
  readonly capabilities: SearchProviderCapabilities = {
    lexical: true,
    semantic: false,
    hybrid: false,
    requiresVectorIndex: false,
    ready: true
  };

  async search(input: SearchQuery): Promise<DeepSearchResult> {
    return deepPlatformSearch({
      query: input.query,
      viewerUserId: input.viewerUserId,
      limit: input.limit,
      intent: input.intent
    });
  }
}

/**
 * Semantic provider stub — ready for embeddings/vector DB when approved.
 * Falls back to lexical so application logic never breaks.
 */
class SemanticSearchProviderStub implements SearchProvider {
  readonly name = 'semantic' as const;
  readonly capabilities: SearchProviderCapabilities = {
    lexical: false,
    semantic: true,
    hybrid: false,
    requiresVectorIndex: true,
    ready: false // not ready until vector infra exists
  };

  constructor(private readonly fallback: SearchProvider) {}

  async search(input: SearchQuery): Promise<DeepSearchResult> {
    // No vector infra in this phase — document readiness and fall back.
    const lexical = await this.fallback.search(input);
    return {
      ...lexical,
      // Annotate that semantic was requested but not available
      query: input.query
    };
  }
}

class HybridSearchProvider implements SearchProvider {
  readonly name = 'hybrid' as const;
  readonly capabilities: SearchProviderCapabilities = {
    lexical: true,
    semantic: true,
    hybrid: true,
    requiresVectorIndex: true,
    ready: false
  };

  constructor(private readonly lexical: SearchProvider, private readonly semantic: SearchProvider) {}

  async search(input: SearchQuery): Promise<DeepSearchResult> {
    // Hybrid until semantic ready: lexical only
    return this.lexical.search(input);
  }
}

const lexical = new LexicalSearchProvider();
const semantic = new SemanticSearchProviderStub(lexical);
const hybrid = new HybridSearchProvider(lexical, semantic);

const providers = new Map<string, SearchProvider>([
  ['lexical', lexical],
  ['semantic', semantic],
  ['hybrid', hybrid]
]);

let activeProviderName: SearchProviderName = 'lexical';

export const registerSearchProvider = (provider: SearchProvider) => {
  providers.set(provider.name, provider);
};

export const setActiveSearchProvider = (name: SearchProviderName | string) => {
  if (!providers.has(name)) {
    activeProviderName = 'lexical';
    return getSearchProviderStatus();
  }
  activeProviderName = name as SearchProviderName;
  return getSearchProviderStatus();
};

export const getSearchProvider = (name?: string): SearchProvider => {
  const key = name || activeProviderName || process.env.SCROLITHA_SEARCH_PROVIDER || 'lexical';
  return providers.get(String(key)) || lexical;
};

export const getSearchProviderStatus = () => {
  const active = getSearchProvider();
  return {
    active: active.name,
    capabilities: active.capabilities,
    semanticReady: providers.get('semantic')?.capabilities.ready === true,
    providers: Array.from(providers.values()).map((p) => ({
      name: p.name,
      capabilities: p.capabilities
    })),
    note: active.capabilities.ready
      ? 'Search provider ready.'
      : 'Semantic/vector provider not ready; lexical fallback active. No vector DB required in this phase.'
  };
};

export const platformSearch = async (input: SearchQuery): Promise<DeepSearchResult & { provider: string }> => {
  const mode = input.mode || (process.env.SCROLITHA_SEARCH_PROVIDER as SearchProviderName) || activeProviderName;
  const provider = getSearchProvider(mode);
  const cacheKey = hashCacheKey(['searchprov', provider.name, input.viewerUserId, input.query, input.limit || 10]);
  const cached = enterpriseCache.get<DeepSearchResult & { provider: string }>('search', cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const result = await provider.search({ ...input, mode: mode as SearchProviderName });
  const packed = { ...result, provider: provider.name, cacheHit: false };
  enterpriseCache.set('search', cacheKey, packed, 45_000);
  return packed;
};

// Default from env
try {
  const envProvider = String(process.env.SCROLITHA_SEARCH_PROVIDER || 'lexical').toLowerCase();
  if (providers.has(envProvider)) activeProviderName = envProvider as SearchProviderName;
} catch {
  activeProviderName = 'lexical';
}
