/**
 * AI Workflow Orchestration — chains modular skills automatically.
 */
import { matchSkillsForIntent, runSkills, type SkillContext, type SkillId, type SkillResult } from './scrolitha.skills';
import { rankContextItems, type RankedContextBundle } from './scrolitha.contextRanking';
import { assessConfidence, applyConfidenceWording, blendConfidences } from './scrolitha.confidence';
import { buildExplanation, formatExplanationForUser, type ExplanationBlock } from './scrolitha.explainability';
import { enterpriseCache, hashCacheKey } from './scrolitha.enterpriseCache';
import type { MultiSourceContextPackage } from './scrolitha.multiSourceContext';
import { recordIntelligenceMetric } from './scrolitha.observability';

export type WorkflowPlan = {
  workflowId: string;
  intent: string;
  skillIds: SkillId[];
  steps: Array<{ index: number; skillId: SkillId; purpose: string }>;
};

export type WorkflowResult = {
  workflowId: string;
  intent: string;
  skillResults: SkillResult[];
  rankedContext: RankedContextBundle;
  answer: string;
  confidence: ReturnType<typeof assessConfidence>;
  explanation: ExplanationBlock;
  explanationText: string;
  sources: string[];
  cacheHit: boolean;
  pipeline: string[];
};

const text = (v: unknown) => String(v || '').trim();

/** Intent → preferred skill chain (can expand with more skills dynamically). */
const INTENT_PIPELINES: Record<string, SkillId[]> = {
  verify_claim: ['fact_verification', 'company_intelligence', 'profile_intelligence', 'community_intelligence'],
  company_legitimacy: [
    'company_intelligence',
    'community_intelligence',
    'thread_summarization',
    'moderator_assistant',
    'fact_verification'
  ],
  summarize_company: ['company_intelligence', 'profile_intelligence'],
  explain_job: ['job_intelligence', 'company_intelligence', 'career_assistant'],
  summarize: ['thread_summarization', 'community_intelligence'],
  key_points: ['thread_summarization'],
  recommend: ['service_intelligence', 'job_intelligence', 'portfolio_intelligence', 'community_intelligence'],
  moderation_assist: ['moderator_assistant', 'thread_summarization', 'fact_verification'],
  writing_help: ['content_assistant', 'tone_improvement'],
  recruiter: ['recruiter_assistant', 'profile_intelligence', 'job_intelligence'],
  career: ['career_assistant', 'service_intelligence', 'job_intelligence'],
  general_assist: ['thread_summarization', 'profile_intelligence', 'content_assistant']
};

export const planWorkflow = (intent: string, question: string): WorkflowPlan => {
  const normalized = text(intent).toLowerCase();
  let skillIds = INTENT_PIPELINES[normalized];

  // Special multi-skill pipeline for legitimacy questions
  if (/\blegitimate|legit|scam|trustworthy|real company\b/i.test(question)) {
    skillIds = INTENT_PIPELINES.company_legitimacy;
  }

  if (!skillIds?.length) {
    const matched = matchSkillsForIntent(normalized, question).map((s) => s.id);
    skillIds = matched.length ? matched.slice(0, 5) : ['thread_summarization', 'content_assistant'];
  }

  // Deduplicate preserve order
  const seen = new Set<SkillId>();
  const ordered: SkillId[] = [];
  for (const id of skillIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    ordered.push(id);
  }

  const workflowId = hashCacheKey(['wf', normalized, ordered.join(',')]);
  return {
    workflowId,
    intent: normalized,
    skillIds: ordered,
    steps: ordered.map((skillId, index) => ({
      index: index + 1,
      skillId,
      purpose: `Run ${skillId.replace(/_/g, ' ')}`
    }))
  };
};

export const executeWorkflow = async (input: {
  intent: string;
  question: string;
  userId: string;
  multiSource: MultiSourceContextPackage;
  role?: string;
}): Promise<WorkflowResult> => {
  recordIntelligenceMetric('workflows');
  const plan = planWorkflow(input.intent, input.question);
  const cacheKey = hashCacheKey([
    plan.workflowId,
    input.userId,
    input.multiSource.entityId,
    input.question.slice(0, 160)
  ]);

  const cached = enterpriseCache.get<WorkflowResult>('workflow', cacheKey);
  if (cached) {
    return { ...cached, cacheHit: true };
  }

  const rankedContext = rankContextItems({
    question: input.question,
    graph: input.multiSource.graph,
    sessionPrompt: input.multiSource.sessionPrompt,
    platformKnowledge: input.multiSource.platformKnowledge,
    maxItems: 8,
    maxPromptChars: 2600
  });
  enterpriseCache.set('prompt', hashCacheKey(['ranked', cacheKey]), rankedContext.promptBlock, 60_000);

  const skillCtx: SkillContext = {
    question: input.question,
    userId: input.userId,
    postId: input.multiSource.entityType === 'post' ? input.multiSource.entityId : null,
    entityType: input.multiSource.entityType,
    entityId: input.multiSource.entityId,
    role: input.role,
    rankedContext: rankedContext.promptBlock,
    graphNodes: (input.multiSource.graph?.nodes || []).map((n) => ({
      type: n.type,
      label: n.label,
      summary: n.summary
    })),
    sessionPrompt: input.multiSource.sessionPrompt
  };

  const skillResults = await runSkills(plan.skillIds, skillCtx);
  const blended = blendConfidences(
    skillResults.map((s) => ({ confidence: s.confidence, authority: s.authority }))
  );
  const confidence = assessConfidence(blended);

  const fragments = skillResults
    .filter((s) => text(s.answerFragment))
    .map((s) => `### ${s.title}\n${s.answerFragment}`);

  let answer = fragments.join('\n\n') || 'I reviewed available platform context but could not produce a detailed answer.';
  answer = applyConfidenceWording(answer, confidence);

  const explanation = buildExplanation({
    rankedItems: rankedContext.items,
    skillResults,
    confidence,
    extraCaveats: [
      rankedContext.droppedCount > 0
        ? `Omitted ${rankedContext.droppedCount} lower-value context items to reduce noise.`
        : ''
    ]
  });

  const sources = Array.from(
    new Set([
      ...rankedContext.items.map((i) => i.sourceLabel),
      ...skillResults.flatMap((s) => s.sources),
      ...input.multiSource.sources
    ])
  ).filter(Boolean);

  const pipeline = plan.steps.map((s) => `${s.index}. ${s.skillId}`);

  const result: WorkflowResult = {
    workflowId: plan.workflowId,
    intent: plan.intent,
    skillResults,
    rankedContext,
    answer,
    confidence,
    explanation,
    explanationText: formatExplanationForUser(explanation),
    sources,
    cacheHit: false,
    pipeline
  };

  enterpriseCache.set('workflow', cacheKey, result, 60_000);
  enterpriseCache.set('llm', cacheKey, { answer: result.answer, confidence: result.confidence }, 90_000);

  return result;
};
