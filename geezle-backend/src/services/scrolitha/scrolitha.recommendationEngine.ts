/**
 * Conversation-aware enterprise recommendation engine.
 */
import type { FusedContextPackage } from './scrolitha.contextFusion';
import type { DeepSearchHit } from './scrolitha.deepSearch';
import { deepPlatformSearch } from './scrolitha.deepSearch';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';
import { isSuggestionDismissedInSession } from './scrolitha.sessionMemory';

export type RecommendationItem = {
  id: string;
  kind: 'job' | 'service' | 'freelancer' | 'company' | 'community' | 'discussion' | 'learning' | 'action';
  title: string;
  reason: string;
  hrefHint?: string;
  score: number;
  sourceLabel: string;
};

export type RecommendationBundle = {
  items: RecommendationItem[];
  proactiveSuggestions: string[];
  cacheHit: boolean;
};

const text = (v: unknown) => String(v || '').trim();

const hitToRec = (hit: DeepSearchHit): RecommendationItem | null => {
  const kindMap: Record<string, RecommendationItem['kind']> = {
    job: 'job',
    gig: 'service',
    user: 'freelancer',
    company: 'company',
    community: 'community',
    post: 'discussion'
  };
  const kind = kindMap[hit.type];
  if (!kind) return null;
  return {
    id: `${hit.type}:${hit.id}`,
    kind,
    title: hit.label,
    reason: hit.summary || `Related ${kind} from public platform search`,
    hrefHint: hit.hrefHint,
    score: hit.score,
    sourceLabel: hit.sourceLabel
  };
};

export const buildConversationRecommendations = async (input: {
  viewerUserId: string;
  question?: string;
  fused: FusedContextPackage;
  sessionKey?: string;
  role?: string;
}): Promise<RecommendationBundle> => {
  const q = text(input.question);
  const cacheKey = hashCacheKey([
    'reco',
    input.viewerUserId,
    input.fused.entityId,
    q.slice(0, 80),
    input.role || ''
  ]);
  const cached = enterpriseCache.get<RecommendationBundle>('recommendation', cacheKey);
  if (cached) return { ...cached, cacheHit: true };

  const items: RecommendationItem[] = [];
  const proactive: Array<{ key: string; text: string; score: number }> = [];

  // From fused search hits
  for (const hit of input.fused.searchHits) {
    const rec = hitToRec(hit);
    if (rec) items.push(rec);
  }

  // From graph nodes
  for (const node of input.fused.ranked.items) {
    if (['job', 'gig', 'company', 'community', 'user', 'post'].includes(node.type)) {
      const kind =
        node.type === 'gig'
          ? 'service'
          : node.type === 'user'
            ? 'freelancer'
            : node.type === 'post'
              ? 'discussion'
              : (node.type as RecommendationItem['kind']);
      items.push({
        id: node.id,
        kind,
        title: node.label,
        reason: `Present in ranked context (${node.sourceLabel})`,
        score: node.score,
        sourceLabel: node.sourceLabel
      });
    }
  }

  // Targeted searches based on conversation cues
  const seeds: string[] = [];
  if (/\bjob|hiring|career\b/i.test(q)) seeds.push(q);
  if (/\bservice|gig|hire\b/i.test(q)) seeds.push(q);
  if (!seeds.length && q) seeds.push(q);
  if (!seeds.length && input.fused.pageHint.title) seeds.push(String(input.fused.pageHint.title));

  for (const seed of seeds.slice(0, 2)) {
    const search = await deepPlatformSearch({
      query: seed,
      viewerUserId: input.viewerUserId,
      limit: 6
    });
    for (const hit of search.hits) {
      const rec = hitToRec(hit);
      if (rec) items.push(rec);
    }
  }

  // Learning resource placeholder (platform knowledge)
  if (/\blearn|how to|guide|explain\b/i.test(q)) {
    items.push({
      id: 'learning:platform-guides',
      kind: 'learning',
      title: 'Platform guides & knowledge',
      reason: 'You asked for explanation or learning-oriented help.',
      hrefHint: '/guides',
      score: 0.55,
      sourceLabel: 'Official Scrolith platform knowledge'
    });
  }

  // Proactive suggestions (high relevance only)
  const hasCompany = items.some((i) => i.kind === 'company');
  const hasJobs = items.some((i) => i.kind === 'job');
  const hasLong = input.fused.ranked.items.some((i) => (i.text || '').length > 180);
  const claimy = /\b(true|claim|founder|ceo|official|fact|legitimate)\b/i.test(q);

  if (claimy) proactive.push({ key: 'verify', text: 'I can verify this claim against platform records.', score: 0.92 });
  if (hasLong) proactive.push({ key: 'summary', text: 'Would you like me to summarize this discussion?', score: 0.88 });
  if (hasCompany) proactive.push({ key: 'company-jobs', text: 'This company context may include related public jobs.', score: 0.8 });
  if (hasJobs) proactive.push({ key: 'jobs', text: 'I can explain related public jobs.', score: 0.82 });
  if (items.some((i) => i.kind === 'service')) {
    proactive.push({ key: 'service', text: 'I can explain a related public service.', score: 0.78 });
  }
  proactive.push({ key: 'reply', text: 'I can help write a respectful reply.', score: 0.7 });
  proactive.push({ key: 'translate', text: 'I can translate or simplify this.', score: 0.55 });
  if (/\b(but|however|conflict|contradict)\b/i.test(q)) {
    proactive.push({
      key: 'conflict',
      text: 'I found possible contradictory information in context.',
      score: 0.84
    });
  }
  proactive.push({ key: 'similar', text: 'I can look for similar public discussions.', score: 0.62 });

  // Deduplicate recommendations
  const seen = new Set<string>();
  const deduped: RecommendationItem[] = [];
  for (const item of items.sort((a, b) => b.score - a.score)) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    deduped.push(item);
    if (deduped.length >= 10) break;
  }

  let suggestions = proactive
    .sort((a, b) => b.score - a.score)
    .filter((s) => s.score >= 0.62)
    .filter((s) => !(input.sessionKey && isSuggestionDismissedInSession(input.sessionKey, s.key)))
    .slice(0, 5)
    .map((s) => s.text);

  let finalItems = deduped;

  // Phase 7.7 — personalization + privacy filters (soft; never breaks recommendations path)
  try {
    const { buildPersonalizationContext, personalizeRecommendations, personalizeProactiveSuggestions } =
      await import('./scrolitha.personalization');
    const pctx = await buildPersonalizationContext({
      userId: input.viewerUserId,
      sessionKey: input.sessionKey
    });
    const personalized = personalizeRecommendations(finalItems, pctx);
    finalItems = personalized.items;
    suggestions = personalizeProactiveSuggestions(suggestions, pctx);
  } catch {
    // personalization optional
  }

  const bundle: RecommendationBundle = {
    items: finalItems,
    proactiveSuggestions: suggestions,
    cacheHit: false
  };
  enterpriseCache.set('recommendation', cacheKey, bundle, 90_000);
  return bundle;
};
