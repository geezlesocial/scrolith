/**
 * Scrolitha Intelligence Platform orchestrator.
 * Cross-feature assist with multi-source context, session memory, trust rules.
 */
import { ScrolithaService, createSystemScrolithaActor } from '../../modules/scrolitha/inference/scrolitha.service';
import {
  buildMultiSourceContext,
  detectIntelligenceIntent,
  type IntelligenceSurface,
  type MultiSourceContextPackage
} from './scrolitha.multiSourceContext';
import {
  appendSessionTurn,
  buildSessionKey,
  dismissSessionSuggestion,
  ensureSessionMemory,
  formatSessionMemoryForPrompt,
  getSessionMemory,
  isSuggestionDismissedInSession
} from './scrolitha.sessionMemory';
import { analyzeModerationAssist } from './scrolitha.moderationAssist';
import {
  estimateTokenCount,
  logIntelligenceLifecycle,
  newIntelligenceRequestId,
  toClientSafeDiagnostics
} from './scrolitha.observability';
import {
  buildProactiveSuggestions,
  sanitizeContextualQuestion,
  validateContextualAnswer,
  type ClaimClassification
} from './scrolitha.contextualPost';
import { scrolithaCache } from './scrolitha.cache';
import { ensureScrolithaConfig } from './scrolitha.policy';
import { executeWorkflow } from './scrolitha.workflow';
import { trackAnalytics, trackIntentAnalytics } from './scrolitha.analytics';
import { enterpriseCache } from './scrolitha.enterpriseCache';
import { applyConfidenceWording, assessConfidence } from './scrolitha.confidence';

export type IntelligenceAskInput = {
  userId: string;
  question: string;
  surface?: IntelligenceSurface;
  entityType?: string;
  entityId?: string;
  postId?: string;
  sessionId?: string;
  role?: string;
  includeModeration?: boolean;
};

export type IntelligenceAskResult = {
  requestId: string;
  answer: string;
  intent: string;
  mode: string;
  classification: ClaimClassification | 'informational';
  confidence: number;
  confidenceBand?: string;
  confidenceLabel?: string;
  sources: string[];
  suggestedFollowUps: string[];
  recommendations: string[];
  moderation?: ReturnType<typeof analyzeModerationAssist> | null;
  sessionKey: string;
  diagnostics: ReturnType<typeof toClientSafeDiagnostics>;
  disclosure: string;
  explanation?: {
    summary: string;
    basis: Array<{ label: string; detail?: string }>;
    skillsUsed: string[];
    confidence: { band: string; label: string; score: number };
    caveats: string[];
  };
  explanationText?: string;
  workflow?: {
    workflowId: string;
    pipeline: string[];
    skills: string[];
  };
  /** Phase 7.7 trust package (verification answers) */
  trust?: {
    verdict: string;
    label: string;
    confidence: { score: number; band: string; label: string };
    citations: Array<{ label: string; reference?: string }>;
    conflicts: Array<{ a: string; b: string; reason: string }>;
    hedgeRequired: boolean;
    summary: string;
  };
};

const text = (v: unknown) => String(v || '').trim();

const RESULT_CACHE_TTL_MS = 90_000;

const buildAnswerCacheKey = (input: {
  userId: string;
  question: string;
  entityType: string;
  entityId: string;
}) =>
  `scrolitha:intel:answer:${input.userId}:${input.entityType}:${input.entityId}:${text(input.question)
    .toLowerCase()
    .slice(0, 120)}`;

const deterministicCrossFeatureAnswer = (input: {
  intent: string;
  question: string;
  ctx: MultiSourceContextPackage;
}): { answer: string; classification: ClaimClassification | 'informational'; confidence: number } => {
  const nodes = input.ctx.graph?.nodes || [];
  const company = nodes.find((n) => n.type === 'company');
  const job = nodes.find((n) => n.type === 'job');
  const gig = nodes.find((n) => n.type === 'gig');
  const author = nodes.find((n) => n.type === 'user' && n.relation === 'author');
  const community = nodes.find((n) => n.type === 'community');
  const post = nodes.find((n) => n.type === 'post');

  if (input.intent === 'summarize_company' && company) {
    return {
      answer: `Public company page “${company.label}”${company.summary ? `: ${company.summary}` : ''}. ${
        company.publicFields?.industry ? `Industry: ${company.publicFields.industry}.` : ''
      } This summary uses only public page fields visible to you.`,
      classification: 'informational',
      confidence: 0.7
    };
  }

  if (input.intent === 'explain_job' && job) {
    return {
      answer: `Public job “${job.label}”: ${job.summary || 'No description available.'}${
        job.publicFields?.budget ? ` Budget: ${job.publicFields.budget}.` : ''
      } Verify requirements on the full job page before applying.`,
      classification: 'informational',
      confidence: 0.68
    };
  }

  if (input.intent === 'recommend') {
    const recs: string[] = [];
    if (gig) recs.push(`Related public service: ${gig.label}`);
    if (job) recs.push(`Related public job: ${job.label}`);
    if (community) recs.push(`Related community: ${community.label}`);
    if (author?.publicFields?.skills) recs.push(`Author skills: ${author.publicFields.skills}`);
    return {
      answer: recs.length
        ? `Based on public platform relationships around this content:\n${recs.map((r) => `• ${r}`).join('\n')}\n\nThese are discovery suggestions, not endorsements.`
        : 'I could not find enough related public listings to recommend yet. Try a more specific question about jobs, services, or communities.',
      classification: 'informational',
      confidence: 0.55
    };
  }

  if (input.intent === 'community_rules' && community) {
    return {
      answer: `Community “${community.label}”${
        community.summary ? `: ${community.summary}` : ''
      }. Always follow the community’s published rules and platform policies. I do not replace moderator decisions.`,
      classification: 'informational',
      confidence: 0.6
    };
  }

  if (input.intent === 'writing_help') {
    return {
      answer:
        'Draft suggestion you can edit before posting:\n\n“Thanks for sharing this. Could you add the source or official record for the key claim so others can verify it?”\n\nThis is a draft only — review tone for your audience.',
      classification: 'informational',
      confidence: 0.65
    };
  }

  if (input.intent === 'summarize' || input.intent === 'key_points') {
    return {
      answer: post?.summary
        ? `Key points from the visible post${author ? ` by ${author.label}` : ''}:\n\n${post.summary}\n\nSummary is based only on content you can access.`
        : 'I do not have enough visible post content to summarize.',
      classification: 'informational',
      confidence: 0.62
    };
  }

  if (input.intent === 'verify_claim') {
    return {
      answer:
        'I can only confirm claims that match authoritative platform records (for example verified profile titles). User-generated posts are not proof by themselves. Treat unsupported statements as unconfirmed. External web search is not available.',
      classification: 'unverified',
      confidence: 0.4
    };
  }

  // General assist with graph context
  const related = input.ctx.relatedEntities
    .slice(0, 4)
    .map((e) => `• ${e.type}: ${e.label}`)
    .join('\n');
  return {
    answer: [
      post?.summary ? `Visible post context: ${post.summary}` : 'I reviewed available public platform relationships.',
      related ? `Related public entities:\n${related}` : '',
      'Ask me to verify a claim, summarize, recommend jobs/services, or draft a respectful reply. I will not invent facts.'
    ]
      .filter(Boolean)
      .join('\n\n'),
    classification: 'informational',
    confidence: 0.5
  };
};

export const buildAdaptiveRecommendations = (input: {
  ctx: MultiSourceContextPackage;
  question: string;
  role?: string;
  sessionKey?: string;
}): string[] => {
  const q = text(input.question).toLowerCase();
  const role = text(input.role).toLowerCase();
  const raw: Array<{ key: string; text: string }> = [];

  const hasJob = input.ctx.graph?.nodes.some((n) => n.type === 'job');
  const hasGig = input.ctx.graph?.nodes.some((n) => n.type === 'gig');
  const hasCompany = input.ctx.graph?.nodes.some((n) => n.type === 'company');
  const hasCommunity = input.ctx.graph?.nodes.some((n) => n.type === 'community');
  const claimy = /\b(true|claim|founder|ceo|official|fact)\b/.test(q) || /\b(is|are)\b/.test(q);

  if (claimy) {
    raw.push({ key: 'verify', text: 'Verify the main claim against platform records' });
    raw.push({ key: 'sources', text: 'Show which sources support this' });
  }
  if ((input.ctx.graph?.nodes.find((n) => n.type === 'post')?.summary || '').length > 200) {
    raw.push({ key: 'summary', text: 'Summarize this discussion' });
    raw.push({ key: 'takeaways', text: 'List key takeaways' });
  }
  if (hasJob || role.includes('freelancer')) {
    raw.push({ key: 'jobs', text: 'Recommend related public jobs' });
  }
  if (hasGig || role.includes('client') || role.includes('employer')) {
    raw.push({ key: 'services', text: 'Recommend related public services' });
  }
  if (hasCompany) raw.push({ key: 'company', text: 'Summarize the company page' });
  if (hasCommunity) raw.push({ key: 'community', text: 'Explain community context' });
  raw.push({ key: 'reply', text: 'Help draft a respectful reply' });
  raw.push({ key: 'followup', text: 'Suggest a useful follow-up question' });

  // Use proactive builder for post content flavor
  const postNode = input.ctx.graph?.nodes.find((n) => n.type === 'post');
  if (postNode?.summary) {
    for (const s of buildProactiveSuggestions({ postContent: postNode.summary, hasClaimLanguage: claimy })) {
      raw.push({ key: s.slice(0, 24).toLowerCase(), text: s });
    }
  }

  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const key = item.key.toLowerCase();
    if (seen.has(key)) continue;
    if (input.sessionKey && isSuggestionDismissedInSession(input.sessionKey, key)) continue;
    seen.add(key);
    out.push(item.text);
    if (out.length >= 5) break;
  }
  return out;
};

export const runIntelligenceAsk = async (input: IntelligenceAskInput): Promise<IntelligenceAskResult> => {
  const started = Date.now();
  const userId = text(input.userId);
  const question = sanitizeContextualQuestion(input.question, 1200);
  if (!userId) throw new Error('Authentication required');
  if (!question) throw new Error('Question is required');

  // Feature flag via existing Scrolitha config
  try {
    const config = await ensureScrolithaConfig('user');
    if (config && config.enabled === false) {
      throw new Error('Scrolitha is currently disabled');
    }
  } catch (e: any) {
    if (String(e?.message || '').includes('disabled')) throw e;
  }

  const postId = text(input.postId || (input.entityType === 'post' ? input.entityId : ''));
  const entityType = text(input.entityType) || (postId ? 'post' : 'global');
  const entityId = text(input.entityId) || postId || 'global';
  const surface = (input.surface || (postId ? 'post' : 'global')) as IntelligenceSurface;

  const sessionKey = buildSessionKey({
    userId,
    sessionId: input.sessionId,
    surface,
    entityId
  });
  ensureSessionMemory({ userId, sessionKey, surface, entityId });

  const requestId = newIntelligenceRequestId([userId, entityType, entityId, question.slice(0, 80)]);

  await logIntelligenceLifecycle({
    actorId: userId,
    event: {
      requestId,
      phase: 'accepted',
      surface,
      entityType,
      entityId
    }
  });

  // Safe answer cache (same user+entity+question) — enterprise LLM namespace
  const answerCacheKey = buildAnswerCacheKey({ userId, question, entityType, entityId });
  const cached =
    enterpriseCache.get<IntelligenceAskResult>('llm', answerCacheKey) ||
    scrolithaCache.get<IntelligenceAskResult>(answerCacheKey);
  if (cached) {
    trackAnalytics('cache_hit');
    await logIntelligenceLifecycle({
      actorId: userId,
      event: {
        requestId,
        phase: 'cache_hit',
        surface,
        entityType,
        entityId,
        cacheHit: true,
        latencyMs: Date.now() - started,
        contextSources: cached.sources
      }
    });
    return {
      ...cached,
      requestId,
      diagnostics: {
        ...cached.diagnostics,
        requestId,
        cacheHit: true,
        latencyMs: Date.now() - started
      }
    };
  }

  const ctx = await buildMultiSourceContext({
    viewerUserId: userId,
    surface,
    entityType,
    entityId,
    postId,
    question,
    sessionKey
  });

  await logIntelligenceLifecycle({
    actorId: userId,
    event: {
      requestId,
      phase: 'context_built',
      surface,
      entityType,
      entityId,
      contextSources: ctx.sources,
      cacheHit: ctx.cacheHit,
      tokenEstimate: ctx.tokenEstimate
    }
  });

  const { intent, mode } = detectIntelligenceIntent(question);
  trackIntentAnalytics(intent);
  trackAnalytics('workflow_run', { intent, surface });
  appendSessionTurn({
    userId,
    sessionKey,
    turn: {
      role: 'user',
      text: question,
      surface,
      entityType,
      entityId
    }
  });

  // Skill workflow orchestration (multi-step autonomous pipeline)
  const workflow = await executeWorkflow({
    intent,
    question,
    userId,
    multiSource: ctx,
    role: input.role
  });
  for (const skill of workflow.skillResults) {
    trackAnalytics('skill_run', { skillId: skill.skillId, intent });
  }

  let moderation: ReturnType<typeof analyzeModerationAssist> | null = null;
  if (input.includeModeration || intent === 'moderation_assist') {
    const postNode = ctx.graph?.nodes.find((n) => n.type === 'post');
    const comments = (ctx.graph?.nodes || [])
      .filter((n) => n.type === 'comment')
      .map((n) => n.summary || '');
    moderation = analyzeModerationAssist({
      postContent: postNode?.summary || '',
      commentContent: question,
      threadSnippets: comments,
      communityRules: ctx.graph?.nodes.find((n) => n.type === 'community')?.summary || null
    });
    trackAnalytics('moderator_assist', { intent });
  }

  let answer = workflow.answer;
  let classification: ClaimClassification | 'informational' =
    intent === 'verify_claim' ? 'unverified' : 'informational';
  let confidence = workflow.confidence.score;
  let provider: string | null = workflow.cacheHit ? 'workflow_cache' : 'workflow_skills';
  let confidenceAssessment = workflow.confidence;

  // Fallback merge with legacy deterministic path if workflow thin
  if (!text(answer) || answer.length < 40) {
    const base = deterministicCrossFeatureAnswer({ intent, question, ctx });
    answer = base.answer;
    classification = base.classification;
    confidence = base.confidence;
    confidenceAssessment = assessConfidence(confidence);
    answer = applyConfidenceWording(answer, confidenceAssessment);
  }

  // Optional LLM refine for richer language — still validated; uses ranked context only.
  try {
    await logIntelligenceLifecycle({
      actorId: userId,
      event: { requestId, phase: 'llm_start', surface, entityType, entityId, provider: 'scrolitha' }
    });
    const memory = formatSessionMemoryForPrompt(sessionKey, 4);
    const system = [
      'You are Scrolitha, Scrolith’s autonomous platform intelligence network.',
      'Use only provided ranked platform context and skill findings. Never invent facts, jobs, companies, or citations.',
      'Never claim external web search. Distinguish platform records vs user claims.',
      'For moderation topics, only suggest human actions — never remove content.',
      'Respect the confidence band in your wording (hedge when low/unknown).',
      'Keep answers concise and enterprise-clear. Return only the user-facing answer.'
    ].join('\n');
    const prompt = [
      `Intent: ${intent}`,
      `Mode: ${mode}`,
      `Confidence band: ${confidenceAssessment.label}`,
      `Workflow pipeline: ${workflow.pipeline.join(' → ')}`,
      `Question: ${question}`,
      `Ranked context:\n${workflow.rankedContext.promptBlock}`,
      memory ? `Session memory:\n${memory}` : '',
      `Skill findings draft (refine, do not strengthen beyond evidence):\n${answer}`,
      `Explainability summary: ${workflow.explanation.summary}`
    ]
      .filter(Boolean)
      .join('\n\n');

    const generated = await ScrolithaService.generate({
      scope: 'user',
      actor: createSystemScrolithaActor('user', 'intelligence_platform', 'system_user'),
      system,
      prompt,
      maxTokens: 700,
      temperature: 0.25,
      routeKey: 'intelligence_platform'
    });
    provider = 'scrolitha';
    const refined = text(generated.text);
    if (refined.length > 40) {
      const validated = validateContextualAnswer(
        refined,
        classification === 'informational' ? 'insufficient_evidence' : classification
      );
      if (validated.ok) answer = applyConfidenceWording(validated.text, confidenceAssessment);
    }
    await logIntelligenceLifecycle({
      actorId: userId,
      event: {
        requestId,
        phase: 'llm_end',
        surface,
        entityType,
        entityId,
        provider,
        tokenEstimate: estimateTokenCount(prompt),
        latencyMs: Date.now() - started
      }
    });
  } catch {
    trackAnalytics('provider_failure', { intent });
    provider = provider || 'workflow_skills';
  }

  if (moderation) {
    answer = `${answer}\n\nModerator assist (no auto-action):\n${moderation.summary}`;
  }

  // Phase 7.7 — trust assessment + internal explainability (additive; no rewrite of workflow)
  let trustPackage: ReturnType<typeof import('./scrolitha.trust').buildVerificationPackage> | null =
    null;
  let explanation = workflow.explanation;
  let explanationText = workflow.explanationText;
  try {
    const { isCapabilityEnabled } = await import('./scrolitha.rollout');
    if (await isCapabilityEnabled('trustVerification')) {
      const { assessTrust, buildVerificationPackage, mapLegacyClassificationToVerdict } = await import(
        './scrolitha.trust'
      );
      const { buildInternalExplanation, formatExplanationForUser } = await import(
        './scrolitha.explainability'
      );
      const evidence = (workflow.sources || []).map((src, idx) => ({
        id: `src-${idx}`,
        label: src,
        supports:
          intent === 'verify_claim'
            ? (('claim' as const))
            : (('context' as const)),
        authority: /verified|official|platform/i.test(src) ? 0.88 : 0.55
      }));
      const trust = assessTrust({
        claim: intent === 'verify_claim' ? question : undefined,
        evidence,
        priorConfidence: confidence
      });
      if (intent === 'verify_claim' && classification === 'unverified') {
        // Align soft classification wording with trust verdict without changing legacy enum set
        const v = mapLegacyClassificationToVerdict(String(classification));
        if (trust.verdict === 'verified' || trust.verdict === 'likely') {
          // keep existing classification if legacy path already set; only attach package
        }
        void v;
      }
      trustPackage = buildVerificationPackage(trust);
      const internal = buildInternalExplanation({
        rankedItems: workflow.rankedContext?.items,
        skillResults: workflow.skillResults,
        confidence: confidenceAssessment,
        workflow: workflow.workflowId,
        trust,
        intent,
        assumptions: ['Only permission-safe platform context is used']
      });
      explanation = internal.userSafe;
      explanationText = formatExplanationForUser(explanation);
    }
  } catch {
    // trust optional
  }

  // Personalization prompt memory (non-blocking)
  try {
    const { isCapabilityEnabled } = await import('./scrolitha.rollout');
    if (await isCapabilityEnabled('personalization')) {
      const { buildPersonalizationContext } = await import('./scrolitha.personalization');
      await buildPersonalizationContext({ userId, sessionKey });
    }
  } catch {
    // optional
  }

  // Append explainability footer (safe sources only)
  answer = `${answer}\n\n${explanationText}`;

  const recommendations = buildAdaptiveRecommendations({
    ctx,
    question,
    role: input.role,
    sessionKey
  });
  enterpriseCache.set(
    'recommendation',
    answerCacheKey,
    recommendations,
    120_000
  );

  const suggestedFollowUps = recommendations.slice(0, 3).map((r) =>
    r.startsWith('@') ? r : `@Scrolitha ${r}`
  );

  appendSessionTurn({
    userId,
    sessionKey,
    turn: {
      role: 'assistant',
      text: answer,
      surface,
      entityType,
      entityId,
      classification: String(classification),
      sources: workflow.sources,
      confidenceBand: confidenceAssessment.band
    }
  });

  const latencyMs = Date.now() - started;
  trackAnalytics('answer_success', { intent, surface });
  const resultSources = workflow.sources.length ? workflow.sources : ctx.sources;
  const result: IntelligenceAskResult = {
    requestId,
    answer,
    intent,
    mode,
    classification,
    confidence,
    confidenceBand: confidenceAssessment.band,
    confidenceLabel: confidenceAssessment.label,
    sources: resultSources,
    suggestedFollowUps,
    recommendations,
    moderation,
    sessionKey,
    explanation,
    explanationText,
    workflow: {
      workflowId: workflow.workflowId,
      pipeline: workflow.pipeline,
      skills: workflow.skillResults.map((s) => s.title)
    },
    diagnostics: toClientSafeDiagnostics({
      requestId,
      classification: String(classification),
      latencyMs,
      cacheHit: Boolean(workflow.cacheHit),
      retryCount: 0,
      provider,
      contextSources: resultSources
    }),
    disclosure:
      'Scrolitha uses permission-aware platform context and modular skills. Responses are AI-assisted and may be incomplete. Verify important claims independently.',
    ...(trustPackage ? { trust: trustPackage } : {})
  };

  enterpriseCache.set('llm', answerCacheKey, result, RESULT_CACHE_TTL_MS);
  scrolithaCache.set(answerCacheKey, result, RESULT_CACHE_TTL_MS);

  await logIntelligenceLifecycle({
    actorId: userId,
    event: {
      requestId,
      phase: 'completed',
      surface,
      entityType,
      entityId,
      contextSources: resultSources,
      classification: String(classification),
      latencyMs,
      provider,
      tokenEstimate: ctx.tokenEstimate
    }
  });

  // Governance metadata (no prompt content)
  try {
    const { recordGovernance } = await import('./scrolitha.governance');
    await recordGovernance({
      requestId,
      actorId: userId,
      provider: provider || 'unknown',
      confidence,
      confidenceBand: confidenceAssessment.band,
      workflowId: workflow.workflowId,
      skills: workflow.skillResults.map((s) => s.title),
      evidenceCategories: resultSources,
      latencyMs,
      retryCount: 0,
      surface,
      entityType,
      entityId,
      cacheHit: Boolean(workflow.cacheHit)
    });
  } catch {
    // ignore governance failures
  }

  return result;
};

export const dismissIntelligenceSuggestion = (input: {
  userId: string;
  sessionKey: string;
  suggestionKey: string;
}) => dismissSessionSuggestion(input);

export const getIntelligenceSession = (input: { userId: string; sessionKey: string }) => {
  const bag = getSessionMemory(input.sessionKey);
  if (!bag || bag.userId !== text(input.userId)) return null;
  return {
    sessionKey: bag.sessionKey,
    turnCount: bag.turns.length,
    lastSurface: bag.lastSurface || null,
    dismissedSuggestionKeys: bag.dismissedSuggestionKeys,
    updatedAt: bag.updatedAt
  };
};
