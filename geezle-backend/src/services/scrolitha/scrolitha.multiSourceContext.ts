/**
 * Multi-source context engine — permission-aware, bounded, cacheable.
 */
import {
  buildPostPlatformGraph,
  searchPublicEntitiesByQuery,
  serializeGraphForPrompt,
  type PlatformGraphSnapshot
} from './scrolitha.platformGraph';
import { formatSessionMemoryForPrompt, getSessionMemory } from './scrolitha.sessionMemory';
import { getScrolithaKnowledgeBundle } from './scrolitha.knowledge';
import { scrolithaCache } from './scrolitha.cache';
import { estimateTokenCount } from './scrolitha.observability';

export type IntelligenceSurface =
  | 'post'
  | 'comment'
  | 'job'
  | 'company'
  | 'community'
  | 'profile'
  | 'service'
  | 'moderation'
  | 'composer'
  | 'global';

export type MultiSourceContextPackage = {
  surface: IntelligenceSurface;
  entityType: string;
  entityId: string;
  viewerUserId: string;
  sources: string[];
  graph: PlatformGraphSnapshot | null;
  graphPrompt: string;
  sessionPrompt: string;
  platformKnowledge: string;
  relatedEntities: Array<{ type: string; id: string; label: string; summary?: string | null }>;
  tokenEstimate: number;
  cacheHit: boolean;
  builtAt: string;
};

const text = (v: unknown) => String(v || '').trim();

export const buildMultiSourceContext = async (input: {
  viewerUserId: string;
  surface?: IntelligenceSurface;
  entityType?: string;
  entityId?: string;
  postId?: string;
  question?: string;
  sessionKey?: string;
}): Promise<MultiSourceContextPackage> => {
  const viewerUserId = text(input.viewerUserId);
  const postId = text(input.postId || (input.entityType === 'post' ? input.entityId : ''));
  const surface = (input.surface || (postId ? 'post' : 'global')) as IntelligenceSurface;
  const entityType = text(input.entityType) || (postId ? 'post' : 'global');
  const entityId = text(input.entityId) || postId || 'none';
  const question = text(input.question);
  const sessionKey = text(input.sessionKey);

  const cacheKey = `scrolitha:msctx:${viewerUserId}:${entityType}:${entityId}:${question.slice(0, 40)}`;
  const cached = scrolithaCache.get<MultiSourceContextPackage>(cacheKey);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const sources: string[] = [];
  let graph: PlatformGraphSnapshot | null = null;

  if (postId) {
    graph = await buildPostPlatformGraph({ postId, viewerUserId });
    if (graph) {
      sources.push(...graph.sourceLabels);
    }
  }

  const graphPrompt = serializeGraphForPrompt(graph);
  if (graphPrompt) sources.push('Platform relationship graph');

  const sessionPrompt = sessionKey ? formatSessionMemoryForPrompt(sessionKey, 6) : '';
  if (sessionPrompt) sources.push('Session conversation memory');

  const knowledge = getScrolithaKnowledgeBundle();
  const platformKnowledge = [
    knowledge.overview,
    ...(knowledge.platformGuidelines || []).slice(0, 4)
  ]
    .filter(Boolean)
    .join('\n');
  if (platformKnowledge) sources.push('Official Scrolith platform knowledge');

  let relatedEntities: MultiSourceContextPackage['relatedEntities'] = [];
  if (question.length >= 3) {
    const found = await searchPublicEntitiesByQuery({
      query: question,
      viewerUserId,
      limit: 4
    });
    relatedEntities = found.map((n) => ({
      type: n.type,
      id: n.id,
      label: n.label,
      summary: n.summary || null
    }));
    if (relatedEntities.length) sources.push('Related public entities');
  }

  // Session memory may hold last entity hints
  if (sessionKey) {
    const bag = getSessionMemory(sessionKey);
    if (bag?.lastSurface) sources.push(`Session surface: ${bag.lastSurface}`);
  }

  const uniqueSources = Array.from(new Set(sources));
  const packedText = [graphPrompt, sessionPrompt, platformKnowledge, JSON.stringify(relatedEntities)].join(
    '\n'
  );

  const pkg: MultiSourceContextPackage = {
    surface,
    entityType,
    entityId,
    viewerUserId,
    sources: uniqueSources,
    graph,
    graphPrompt,
    sessionPrompt,
    platformKnowledge: platformKnowledge.slice(0, 1200),
    relatedEntities,
    tokenEstimate: estimateTokenCount(packedText),
    cacheHit: false,
    builtAt: new Date().toISOString()
  };

  scrolithaCache.set(cacheKey, pkg, 30_000);
  return pkg;
};

export const detectIntelligenceIntent = (
  question: string
): {
  intent: string;
  mode: string;
} => {
  const q = text(question).toLowerCase();
  if (/\b(moderat|flag|misinfo|off[- ]topic|duplicate discussion|spam)\b/.test(q)) {
    return { intent: 'moderation_assist', mode: 'moderation' };
  }
  if (/\b(job|hiring|role|salary|budget)\b/.test(q) && /\b(explain|summar|detail|require)\b/.test(q)) {
    return { intent: 'explain_job', mode: 'explain' };
  }
  if (/\b(company|page|organization|org)\b/.test(q)) {
    return { intent: 'summarize_company', mode: 'summarize' };
  }
  if (/\b(compare|vs\.?|versus)\b/.test(q) && /\b(freelancer|talent|profile)\b/.test(q)) {
    return { intent: 'compare_freelancers', mode: 'compare' };
  }
  if (/\b(community|group|club).*(rule|guideline)\b/.test(q) || /\brules?\b/.test(q)) {
    return { intent: 'community_rules', mode: 'explain' };
  }
  if (/\b(recommend|suggest)\b/.test(q) && /\b(jobs?|gigs?|services?|communities|portfolio|listings?)\b/.test(q)) {
    return { intent: 'recommend', mode: 'recommend' };
  }
  if (/\b(help me write|draft|compose)\b/.test(q)) {
    return { intent: 'writing_help', mode: 'suggest_reply' };
  }
  if (/\b(true|verify|claim|evidence|accurate)\b/.test(q)) {
    return { intent: 'verify_claim', mode: 'verify_claim' };
  }
  if (/\bsummar(y|ize|ise)\b/.test(q)) {
    return { intent: 'summarize', mode: 'summarize' };
  }
  if (/\b(key points?|takeaways?)\b/.test(q)) {
    return { intent: 'key_points', mode: 'key_points' };
  }
  return { intent: 'general_assist', mode: 'general' };
};
