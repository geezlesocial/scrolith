/**
 * Context Fusion Engine — best-fit context from page, selection, graph, search, memory.
 * Never overloads the model: ranks and truncates aggressively.
 */
import { buildMultiSourceContext, type IntelligenceSurface } from './scrolitha.multiSourceContext';
import { rankContextItems, type RankedContextBundle } from './scrolitha.contextRanking';
import { deepPlatformSearch, deepSearchHitsToGraphNodes, type DeepSearchHit } from './scrolitha.deepSearch';
import { formatSessionMemoryForPrompt, getSessionMemory } from './scrolitha.sessionMemory';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';
import { estimateTokenCount } from './scrolitha.observability';

export type PageContextHint = {
  route?: string;
  surface?: IntelligenceSurface | string;
  pageType?: string;
  entityType?: string;
  entityId?: string;
  postId?: string;
  selectedText?: string;
  conversationId?: string;
  title?: string;
  module?: string;
};

export type FusedContextPackage = {
  surface: string;
  entityType: string;
  entityId: string;
  sources: string[];
  ranked: RankedContextBundle;
  searchHits: DeepSearchHit[];
  sessionPrompt: string;
  pageHint: PageContextHint;
  tokenEstimate: number;
  fusionReason: string;
  cacheHit: boolean;
  preparedAt: string;
};

const text = (v: unknown) => String(v || '').trim();

export const fuseContext = async (input: {
  viewerUserId: string;
  question?: string;
  page?: PageContextHint;
  sessionKey?: string;
  includeSearch?: boolean;
  maxRankedItems?: number;
}): Promise<FusedContextPackage> => {
  const viewerUserId = text(input.viewerUserId);
  const question = text(input.question);
  const page = input.page || {};
  const postId = text(page.postId || (page.entityType === 'post' ? page.entityId : ''));
  const entityType = text(page.entityType) || (postId ? 'post' : text(page.pageType) || 'global');
  const entityId = text(page.entityId) || postId || 'global';
  const surface = text(page.surface || page.module || (postId ? 'post' : 'global'));
  const sessionKey = text(input.sessionKey);

  const cacheKey = hashCacheKey([
    'fusion',
    viewerUserId,
    surface,
    entityType,
    entityId,
    question.slice(0, 80),
    page.route || '',
    input.includeSearch === false ? '0' : '1'
  ]);
  const cached = enterpriseCache.get<FusedContextPackage>('prompt', cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const multi = await buildMultiSourceContext({
    viewerUserId,
    surface: (surface as any) || 'global',
    entityType,
    entityId,
    postId,
    question,
    sessionKey
  });

  // Optional deep search for discovery questions / empty local graph
  let searchHits: DeepSearchHit[] = [];
  const shouldSearch =
    input.includeSearch !== false &&
    (question.length >= 3 || !multi.graph?.nodes?.length) &&
    /\b(find|search|similar|related|recommend|who|where|job|gig|company|community)\b/i.test(
      question || page.title || ''
    );

  if (shouldSearch && question) {
    const search = await deepPlatformSearch({
      query: question,
      viewerUserId,
      limit: 8
    });
    searchHits = search.hits;
    if (searchHits.length && multi.graph) {
      multi.graph = {
        ...multi.graph,
        nodes: [...multi.graph.nodes, ...deepSearchHitsToGraphNodes(searchHits)].slice(0, 28)
      };
      multi.sources = Array.from(new Set([...multi.sources, 'Deep platform search']));
    }
  }

  // Inject page selection / title as synthetic high-priority context via knowledge-like string
  const pageBits = [
    page.route ? `Route: ${page.route}` : '',
    page.title ? `Page title: ${page.title}` : '',
    page.selectedText ? `User selection: ${String(page.selectedText).slice(0, 400)}` : '',
    page.module ? `Module: ${page.module}` : ''
  ]
    .filter(Boolean)
    .join('\n');

  const sessionPrompt =
    multi.sessionPrompt || (sessionKey ? formatSessionMemoryForPrompt(sessionKey, 8) : '');

  // Expand session memory extras if present
  const bag = sessionKey ? getSessionMemory(sessionKey) : null;
  const memoryExtras = bag?.turns
    ?.filter((t) => t.entityType && t.entityId)
    .slice(-4)
    .map((t) => `${t.entityType}:${t.entityId}`)
    .join(', ');

  const ranked = rankContextItems({
    question: question || page.title || page.route || 'context',
    graph: multi.graph,
    sessionPrompt: [sessionPrompt, memoryExtras ? `Referenced entities: ${memoryExtras}` : '']
      .filter(Boolean)
      .join('\n'),
    platformKnowledge: [multi.platformKnowledge, pageBits].filter(Boolean).join('\n'),
    maxItems: input.maxRankedItems || 8,
    maxPromptChars: 2600
  });

  const sources = Array.from(
    new Set([
      ...multi.sources,
      ...ranked.items.map((i) => i.sourceLabel),
      ...(searchHits.length ? ['Deep platform search'] : []),
      ...(pageBits ? ['Current page context'] : [])
    ])
  );

  let fusionReason = 'Combined page, graph, and session context with ranking.';
  if (searchHits.length) fusionReason = 'Fused local graph with deep platform search hits.';
  if (!multi.graph?.nodes?.length && searchHits.length) {
    fusionReason = 'Local graph empty; relied on deep search and page hints.';
  }

  const pkg: FusedContextPackage = {
    surface,
    entityType,
    entityId,
    sources,
    ranked,
    searchHits,
    sessionPrompt,
    pageHint: page,
    tokenEstimate: estimateTokenCount(ranked.promptBlock + sessionPrompt),
    fusionReason,
    cacheHit: false,
    preparedAt: new Date().toISOString()
  };

  enterpriseCache.set('prompt', cacheKey, pkg, 25_000);
  return pkg;
};
