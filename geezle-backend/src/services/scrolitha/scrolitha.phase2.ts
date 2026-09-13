/**
 * Scrolitha Phase 2 primitives.
 *
 * This module deliberately stays provider-neutral: semantic expansion and
 * reranking use bounded, deterministic signals over already permission-safe
 * public search results. A vector provider can be registered later without
 * changing callers or exposing private data.
 */
import { z } from 'zod';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';
import type { DeepSearchHit, DeepSearchResult, SearchIntent } from './scrolitha.deepSearch';

export const SCROLITHA_PHASE2_VERSION = 'phase2-v1';

const STOP_WORDS = new Set([
  'about', 'after', 'also', 'and', 'are', 'can', 'find', 'for', 'from', 'how',
  'into', 'me', 'more', 'near', 'of', 'on', 'please', 'search', 'show', 'that',
  'the', 'this', 'with', 'you'
]);

const tokens = (value: unknown): string[] =>
  String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token));

export const normalizeSemanticQuery = (query: string) =>
  Array.from(new Set(tokens(query))).sort().join(' ');

const queryExpansion = (query: string) => {
  const q = String(query || '');
  const expansions: Record<string, string> = {
    freelancer: 'independent contractor consultant professional',
    freelance: 'independent contractor consultant professional',
    hiring: 'recruiting vacancy role opportunity',
    job: 'career role position opportunity',
    jobs: 'career roles positions opportunities',
    gig: 'service package freelance offering',
    gigs: 'services packages freelance offerings',
    company: 'business organization employer brand',
    community: 'group club network forum'
  };
  const additions = tokens(q).flatMap((token) => expansions[token]?.split(' ') || []);
  return Array.from(new Set([...tokens(q), ...additions])).join(' ');
};

const overlap = (query: string, body: string) => {
  const q = new Set(tokens(query));
  const bodyTokens = tokens(body);
  if (!q.size || !bodyTokens.length) return 0;
  const uniqueBody = new Set(bodyTokens);
  let matches = 0;
  for (const token of q) if (uniqueBody.has(token)) matches += 1;
  return matches / q.size;
};

const hitBody = (hit: DeepSearchHit) => `${hit.label} ${hit.summary || ''}`;

export type Phase2SearchMetadata = {
  version: typeof SCROLITHA_PHASE2_VERSION;
  mode: 'hybrid' | 'lexical';
  semanticCacheHit: boolean;
  lexicalCandidates: number;
  semanticCandidates: number;
  rerankedCandidates: number;
};

export type Phase2SearchResult = DeepSearchResult & {
  provider: string;
  phase2: Phase2SearchMetadata;
};

export const semanticCacheKey = (input: {
  viewerUserId: string;
  intent: SearchIntent;
  query: string;
  limit: number;
}) =>
  hashCacheKey([
    'semantic-cache',
    SCROLITHA_PHASE2_VERSION,
    input.viewerUserId,
    input.intent,
    normalizeSemanticQuery(input.query),
    input.limit
  ]);

export const rerankHybridHits = (input: {
  query: string;
  lexical: DeepSearchHit[];
  semantic: DeepSearchHit[];
  limit: number;
}): DeepSearchHit[] => {
  const merged = new Map<string, { hit: DeepSearchHit; lexical: number; semantic: number }>();
  for (const hit of input.lexical) {
    merged.set(`${hit.type}:${hit.id}`, { hit, lexical: hit.score, semantic: 0 });
  }
  for (const hit of input.semantic) {
    const key = `${hit.type}:${hit.id}`;
    const existing = merged.get(key);
    if (existing) existing.semantic = Math.max(existing.semantic, hit.score);
    else merged.set(key, { hit, lexical: 0, semantic: hit.score });
  }

  return Array.from(merged.values())
    .map(({ hit, lexical, semantic }) => {
      const semanticMatch = overlap(input.query, hitBody(hit));
      const score = Math.min(1.5, lexical * 0.45 + semantic * 0.3 + semanticMatch * 0.25);
      return { ...hit, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, input.limit);
};

const structuredSearchSchema = z.object({
  intent: z.string(),
  query: z.string(),
  hits: z.array(
    z.object({
      type: z.string(),
      id: z.string(),
      label: z.string(),
      summary: z.string().nullable().optional(),
      score: z.number(),
      hrefHint: z.string().optional(),
      sourceLabel: z.string()
    })
  ),
  provider: z.string(),
  phase2: z.object({
    version: z.literal(SCROLITHA_PHASE2_VERSION),
    mode: z.enum(['hybrid', 'lexical']),
    semanticCacheHit: z.boolean(),
    lexicalCandidates: z.number().int().nonnegative(),
    semanticCandidates: z.number().int().nonnegative(),
    rerankedCandidates: z.number().int().nonnegative()
  })
});

export type StructuredSearchResponse = z.infer<typeof structuredSearchSchema>;

export const toStructuredSearchResponse = (value: Phase2SearchResult): StructuredSearchResponse =>
  structuredSearchSchema.parse({
    intent: value.intent,
    query: value.query,
    hits: value.hits,
    provider: value.provider,
    phase2: value.phase2
  });

const structuredChatSchema = z.object({
  version: z.literal(SCROLITHA_PHASE2_VERSION),
  intent: z.string(),
  reply: z.string(),
  responseMode: z.enum(['llm', 'fallback', 'blocked']),
  confidence: z.number().min(0).max(1).nullable(),
  suggestedActions: z.array(
    z.object({
      actionId: z.string(),
      toolKey: z.string(),
      summary: z.string(),
      requiresConfirmation: z.boolean()
    })
  )
});

export type StructuredChatResponse = z.infer<typeof structuredChatSchema>;

/**
 * Stable machine-readable envelope for clients. The user-facing reply remains
 * unchanged, so existing web/mobile clients are backward compatible.
 */
export const toStructuredChatResponse = (input: {
  intent: string;
  reply: string;
  responseMode: 'llm' | 'fallback' | 'blocked';
  confidence?: number | null;
  suggestedActions?: Array<{
    actionId?: string;
    toolKey?: string;
    summary?: string;
    requiresConfirmation?: boolean;
  }>;
}): StructuredChatResponse =>
  structuredChatSchema.parse({
    version: SCROLITHA_PHASE2_VERSION,
    intent: String(input.intent || 'general_assist'),
    reply: String(input.reply || ''),
    responseMode: input.responseMode,
    confidence: input.confidence == null ? null : Number(input.confidence),
    suggestedActions: (input.suggestedActions || []).map((action) => ({
      actionId: String(action.actionId || ''),
      toolKey: String(action.toolKey || ''),
      summary: String(action.summary || ''),
      requiresConfirmation: Boolean(action.requiresConfirmation)
    }))
  });

export const getSemanticCachedSearch = (key: string) =>
  enterpriseCache.get<Phase2SearchResult>('search', key);

export const setSemanticCachedSearch = (key: string, value: Phase2SearchResult, ttlMs = 45_000) =>
  enterpriseCache.set('search', key, value, ttlMs);

export { queryExpansion };
