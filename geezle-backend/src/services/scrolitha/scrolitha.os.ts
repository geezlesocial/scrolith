/**
 * Scrolitha Intelligence OS — unified proactive surface orchestrator.
 * Extends Phase 7.3 intelligence/workflows without replacing them.
 */
import { fuseContext, type PageContextHint, type FusedContextPackage } from './scrolitha.contextFusion';
import { buildActionCards, resolveActionCardPrompt, type ScrolithaActionCard } from './scrolitha.actionCards';
import { buildConversationRecommendations, type RecommendationItem } from './scrolitha.recommendationEngine';
import { collectCollaborationHints } from './scrolitha.collaboration';
import { runIntelligenceAsk, type IntelligenceAskResult } from './scrolitha.intelligence';
import {
  appendSessionTurn,
  buildSessionKey,
  ensureSessionMemory,
  getSessionMemory
} from './scrolitha.sessionMemory';
import {
  batchPrefetchContext,
  cancelRequest,
  createRequestHandle,
  speculativePrepareContext,
  withTimeout
} from './scrolitha.performance';
import { trackAnalytics } from './scrolitha.analytics';
import { logIntelligenceLifecycle } from './scrolitha.observability';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';

export type AdaptiveSurfaceMode =
  | 'floating'
  | 'side_panel'
  | 'inline'
  | 'comment_reply'
  | 'context_card'
  | 'bottom_sheet';

export type OsBootstrapResult = {
  requestId: string;
  sessionKey: string;
  surfaceMode: AdaptiveSurfaceMode;
  proactiveSuggestions: string[];
  actionCards: ScrolithaActionCard[];
  recommendations: RecommendationItem[];
  fusion: {
    sources: string[];
    fusionReason: string;
    tokenEstimate: number;
    rankedCount: number;
  };
  collaboration: { modules: string[]; hints: string[] };
  explainabilityDefaults: {
    showConfidence: true;
    showSkills: true;
    showContext: true;
    showEvidence: true;
  };
  prefetchReady: boolean;
  /** Phase 7.7 user AI visibility preference */
  aiVisibility?: 'full' | 'subtle' | 'hidden';
};

export type OsAskResult = Omit<IntelligenceAskResult, 'recommendations'> & {
  actionCards: ScrolithaActionCard[];
  /** Structured recommendations (OS) — supersedes string[] prompt list for this surface */
  recommendations: RecommendationItem[];
  suggestionPrompts?: string[];
  fusionReason?: string;
  surfaceMode: AdaptiveSurfaceMode;
  streamingSupported: boolean;
  chunks?: string[];
};

const text = (v: unknown) => String(v || '').trim();

export const resolveAdaptiveSurfaceMode = (input: {
  viewport?: string;
  surface?: string;
  activity?: string;
  hasSelection?: boolean;
}): AdaptiveSurfaceMode => {
  const vp = text(input.viewport).toLowerCase();
  const surface = text(input.surface).toLowerCase();
  const activity = text(input.activity).toLowerCase();

  if (vp === 'mobile' || vp === 'xs' || vp === 'sm') {
    if (surface === 'post' || surface === 'comment') return 'bottom_sheet';
    return 'floating';
  }
  if (input.hasSelection || activity === 'selecting') return 'inline';
  if (surface === 'post' || surface === 'feed') return 'context_card';
  if (surface === 'messaging') return 'side_panel';
  if (surface === 'dashboard' || surface === 'search') return 'side_panel';
  if (surface === 'comment') return 'comment_reply';
  return 'floating';
};

const cardsFromFusion = (fused: FusedContextPackage, role?: string) => {
  const types = new Set(fused.ranked.items.map((i) => i.type));
  for (const h of fused.searchHits) types.add(h.type);
  return buildActionCards({
    surface: fused.surface,
    hasPost: types.has('post') || Boolean(fused.pageHint.postId),
    hasCompany: types.has('company'),
    hasJob: types.has('job'),
    hasService: types.has('gig'),
    hasCommunity: types.has('community'),
    hasProfile: types.has('user'),
    hasThread: types.has('comment'),
    claimy: /\b(true|claim|founder|ceo|official|legitimate)\b/i.test(
      `${fused.pageHint.title || ''} ${fused.sessionPrompt || ''}`
    ),
    longText: fused.ranked.items.some((i) => (i.text || '').length > 200),
    role
  });
};

export const bootstrapIntelligenceOs = async (input: {
  userId: string;
  page?: PageContextHint;
  sessionId?: string;
  role?: string;
  viewport?: string;
  activity?: string;
  questionHint?: string;
}): Promise<OsBootstrapResult> => {
  const userId = text(input.userId);
  if (!userId) throw new Error('Authentication required');

  const page = input.page || {};
  const entityId = text(page.entityId || page.postId) || 'global';
  const surface = text(page.surface || page.module || 'global');
  const sessionKey = buildSessionKey({
    userId,
    sessionId: input.sessionId,
    surface,
    entityId
  });
  ensureSessionMemory({ userId, sessionKey, surface, entityId });

  const handle = createRequestHandle([userId, 'bootstrap', entityId, surface]);
  trackAnalytics('question_asked', { surface, intent: 'bootstrap' });

  // Speculative prep for likely follow-up
  speculativePrepareContext({ viewerUserId: userId, page, sessionKey });

  const fused = await withTimeout(
    batchPrefetchContext({
      viewerUserId: userId,
      page,
      sessionKey,
      question: input.questionHint
    }),
    12_000,
    'context_fusion'
  );

  if (handle.isStale()) {
    throw new Error('Bootstrap cancelled');
  }

  const reco = await buildConversationRecommendations({
    viewerUserId: userId,
    question: input.questionHint,
    fused,
    sessionKey,
    role: input.role
  });

  const actionCards = cardsFromFusion(fused, input.role);
  const collaboration = collectCollaborationHints({
    question: input.questionHint || page.title || '',
    surface,
    role: input.role
  });

  const surfaceMode = resolveAdaptiveSurfaceMode({
    viewport: input.viewport,
    surface,
    activity: input.activity,
    hasSelection: Boolean(page.selectedText)
  });

  // Phase 7.7 privacy visibility + learning suggestions (soft)
  let privacyVisibility: 'full' | 'subtle' | 'hidden' = 'full';
  let learningSuggestions: string[] = [];
  try {
    const { buildPersonalizationContext, buildLearningSuggestions } = await import(
      './scrolitha.personalization'
    );
    const pctx = await buildPersonalizationContext({ userId, sessionKey });
    privacyVisibility = pctx.privacy.aiVisibility;
    if (pctx.privacy.proactiveSuggestionsEnabled) {
      learningSuggestions = buildLearningSuggestions(pctx);
    }
    if (!pctx.privacy.proactiveSuggestionsEnabled) {
      reco.proactiveSuggestions = [];
    }
    if (privacyVisibility === 'hidden') {
      reco.proactiveSuggestions = [];
      reco.items = [];
    }
  } catch {
    // optional
  }

  await logIntelligenceLifecycle({
    actorId: userId,
    event: {
      requestId: handle.requestId,
      phase: 'completed',
      surface,
      entityType: fused.entityType,
      entityId: fused.entityId,
      contextSources: fused.sources,
      cacheHit: fused.cacheHit,
      tokenEstimate: fused.tokenEstimate
    }
  });

  return {
    requestId: handle.requestId,
    sessionKey,
    surfaceMode,
    proactiveSuggestions:
      privacyVisibility === 'hidden'
        ? []
        : [...reco.proactiveSuggestions, ...learningSuggestions].slice(0, 8),
    actionCards: privacyVisibility === 'hidden' ? [] : actionCards,
    recommendations: reco.items,
    fusion: {
      sources: fused.sources,
      fusionReason: fused.fusionReason,
      tokenEstimate: fused.tokenEstimate,
      rankedCount: fused.ranked.items.length
    },
    collaboration: {
      modules: collaboration.modules,
      hints: collaboration.hints
    },
    explainabilityDefaults: {
      showConfidence: true,
      showSkills: true,
      showContext: true,
      showEvidence: true
    },
    prefetchReady: true,
    aiVisibility: privacyVisibility
  };
};

export const runOsAsk = async (input: {
  userId: string;
  question: string;
  page?: PageContextHint;
  sessionId?: string;
  role?: string;
  viewport?: string;
  activity?: string;
  actionCardId?: string;
  includeModeration?: boolean;
  requestId?: string;
}): Promise<OsAskResult> => {
  const userId = text(input.userId);
  const questionRaw = text(input.question);
  if (!userId) throw new Error('Authentication required');
  if (!questionRaw && !input.actionCardId) throw new Error('Question is required');

  const page = input.page || {};
  const entityId = text(page.entityId || page.postId) || 'global';
  const surface = text(page.surface || page.module || 'global');
  const sessionKey = buildSessionKey({
    userId,
    sessionId: input.sessionId,
    surface,
    entityId
  });
  ensureSessionMemory({ userId, sessionKey, surface, entityId });

  // Resolve action card prompt if provided
  let question = questionRaw;
  let cards = buildActionCards({ surface, hasPost: Boolean(page.postId), role: input.role });
  if (input.actionCardId) {
    const card = cards.find((c) => c.id === input.actionCardId || c.kind === input.actionCardId);
    if (card) {
      question = resolveActionCardPrompt(card, questionRaw);
    }
  }
  if (!question) throw new Error('Question is required');

  const handle = createRequestHandle([userId, 'os_ask', entityId, question.slice(0, 60)]);

  // Prefetch fused context (also warms caches for intelligence ask)
  const fused = await batchPrefetchContext({
    viewerUserId: userId,
    page,
    sessionKey,
    question
  });
  if (handle.isStale()) throw new Error('Request cancelled');

  cards = cardsFromFusion(fused, input.role);

  const intel = await runIntelligenceAsk({
    userId,
    question,
    surface: (surface as any) || 'global',
    entityType: fused.entityType,
    entityId: fused.entityId,
    postId: page.postId || (fused.entityType === 'post' ? fused.entityId : undefined),
    sessionId: input.sessionId,
    role: input.role,
    includeModeration: input.includeModeration
  });

  if (handle.isStale()) throw new Error('Request cancelled');

  // Expand session memory with referenced entities from search/recs
  const bag = getSessionMemory(sessionKey);
  if (bag) {
    for (const hit of fused.searchHits.slice(0, 5)) {
      appendSessionTurn({
        userId,
        sessionKey,
        turn: {
          role: 'system',
          text: `Referenced ${hit.type}: ${hit.label}`,
          entityType: hit.type,
          entityId: hit.id,
          surface
        }
      });
    }
  }

  const reco = await buildConversationRecommendations({
    viewerUserId: userId,
    question,
    fused,
    sessionKey,
    role: input.role
  });

  // Lightweight "streaming" chunks for incremental UI rendering (not token stream from provider)
  const chunks = chunkAnswerForIncrementalRender(intel.answer);

  const surfaceMode = resolveAdaptiveSurfaceMode({
    viewport: input.viewport,
    surface,
    activity: input.activity,
    hasSelection: Boolean(page.selectedText)
  });

  // Cache OS response briefly for multi-surface reuse
  enterpriseCache.set(
    'llm',
    hashCacheKey(['os', userId, entityId, question.slice(0, 100)]),
    { intel, cards, reco },
    60_000
  );

  return {
    ...intel,
    actionCards: cards,
    recommendations: reco.items,
    suggestionPrompts: intel.recommendations,
    fusionReason: fused.fusionReason,
    surfaceMode,
    streamingSupported: true,
    chunks
  };
};

export const chunkAnswerForIncrementalRender = (answer: string, maxChunk = 280): string[] => {
  const textAnswer = String(answer || '').trim();
  if (!textAnswer) return [];
  const parts: string[] = [];
  const paragraphs = textAnswer.split(/\n{2,}/);
  for (const p of paragraphs) {
    if (p.length <= maxChunk) {
      parts.push(p);
      continue;
    }
    let rest = p;
    while (rest.length > maxChunk) {
      let idx = rest.lastIndexOf(' ', maxChunk);
      if (idx < 40) idx = maxChunk;
      parts.push(rest.slice(0, idx).trim());
      rest = rest.slice(idx).trim();
    }
    if (rest) parts.push(rest);
  }
  return parts.slice(0, 12);
};

export const cancelOsRequest = (requestId: string) => cancelRequest(requestId);
