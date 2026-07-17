import { rankContextItems } from '../scrolitha.contextRanking';
import { assessConfidence, applyConfidenceWording, blendConfidences } from '../scrolitha.confidence';
import { listSkills, matchSkillsForIntent } from '../scrolitha.skills';
import { planWorkflow, executeWorkflow } from '../scrolitha.workflow';
import { enterpriseCache, hashCacheKey } from '../scrolitha.enterpriseCache';
import { emitPlatformIntelligenceEvent, onIntelligenceEvent } from '../scrolitha.eventIntelligence';
import { trackAnalytics, getAnalyticsSnapshot } from '../scrolitha.analytics';
import { buildExplanation } from '../scrolitha.explainability';
import { getSessionStoreAdapter } from '../scrolitha.sessionStore';

describe('scrolitha autonomous intelligence network', () => {
  test('registers modular skills', () => {
    const skills = listSkills();
    expect(skills.length).toBeGreaterThanOrEqual(10);
    expect(skills.some((s) => s.id === 'fact_verification')).toBe(true);
    expect(skills.some((s) => s.id === 'moderator_assistant')).toBe(true);
  });

  test('matches skills for intents', () => {
    const verify = matchSkillsForIntent('verify_claim', 'is this claim true?');
    expect(verify.some((s) => s.id === 'fact_verification')).toBe(true);
  });

  test('plans multi-skill legitimacy workflow', () => {
    const plan = planWorkflow('general_assist', 'Is this company legitimate?');
    expect(plan.skillIds.length).toBeGreaterThanOrEqual(3);
    expect(plan.skillIds).toContain('company_intelligence');
    expect(plan.skillIds).toContain('fact_verification');
  });

  test('ranks context by relevance and authority', () => {
    const ranked = rankContextItems({
      question: 'Is the company founder claim true?',
      graph: {
        anchor: { type: 'post', id: 'p1' },
        nodes: [
          {
            type: 'post',
            id: 'p1',
            label: 'Post',
            summary: 'Someone is the founder of the company'
          },
          {
            type: 'company',
            id: 'c1',
            label: 'Acme Corp',
            summary: 'Public company page for Acme'
          },
          {
            type: 'comment',
            id: 'cm1',
            label: 'User',
            summary: 'nice post'
          }
        ],
        edges: [],
        sourceLabels: [],
        cacheHit: false,
        builtAt: new Date().toISOString()
      },
      maxItems: 3
    });
    expect(ranked.items.length).toBeLessThanOrEqual(3);
    expect(ranked.totalCandidates).toBe(3);
    // company or post should outrank off-topic comment for this question typically
    expect(ranked.items.some((i) => i.type === 'company' || i.type === 'post')).toBe(true);
  });

  test('confidence engine hedges low confidence wording', () => {
    const low = assessConfidence(0.3);
    expect(low.band).toBe('low');
    expect(low.shouldHedge).toBe(true);
    const wording = applyConfidenceWording('The claim is unsupported.', low);
    expect(wording.toLowerCase()).toContain('limited');
    const unknown = assessConfidence(0.1);
    expect(unknown.band).toBe('unknown');
    expect(blendConfidences([{ confidence: 0.8, authority: 1 }, { confidence: 0.2, authority: 1 }])).toBeCloseTo(
      0.5,
      1
    );
  });

  test('enterprise cache namespaces isolate keys', () => {
    const key = hashCacheKey(['test', Date.now()]);
    enterpriseCache.set('graph', key, { a: 1 }, 5000);
    enterpriseCache.set('llm', key, { b: 2 }, 5000);
    expect(enterpriseCache.get<any>('graph', key)?.a).toBe(1);
    expect(enterpriseCache.get<any>('llm', key)?.b).toBe(2);
  });

  test('session store adapter is named and swappable interface', () => {
    expect(getSessionStoreAdapter().adapterName).toBe('in_process');
  });

  test('event intelligence dedupes and accepts events', async () => {
    let count = 0;
    const off = onIntelligenceEvent('post.created', () => {
      count += 1;
    });
    const first = emitPlatformIntelligenceEvent({
      type: 'post.created',
      postId: 'p-event-1',
      entityType: 'post',
      entityId: 'p-event-1',
      actorId: 'u1'
    });
    const second = emitPlatformIntelligenceEvent({
      type: 'post.created',
      postId: 'p-event-1',
      entityType: 'post',
      entityId: 'p-event-1',
      actorId: 'u1'
    });
    expect(first.accepted).toBe(true);
    expect(second.accepted).toBe(false);
    await new Promise((r) => setTimeout(r, 30));
    expect(count).toBeGreaterThanOrEqual(1);
    off();
  });

  test('analytics counters avoid storing prompts', () => {
    trackAnalytics('question_asked', { intent: 'verify_claim' });
    trackAnalytics('verification_request', { intent: 'verify_claim' });
    const snap = getAnalyticsSnapshot();
    expect(snap.privacy.toLowerCase()).toContain('no private');
    expect(snap.totals.questionsAsked).toBeGreaterThanOrEqual(1);
  });

  test('explainability lists safe basis only', () => {
    const explanation = buildExplanation({
      rankedItems: [
        {
          id: 'company:c1',
          type: 'company',
          label: 'Acme',
          text: 'public page',
          score: 0.9,
          factors: { relevance: 0.9, recency: 0.5, authority: 0.9, permissionSafe: 1, confidence: 0.8 },
          sourceLabel: 'Public company page'
        }
      ],
      skillResults: [],
      confidence: assessConfidence(0.8)
    });
    expect(explanation.summary.toLowerCase()).toContain('based');
    expect(explanation.basis[0].label).toBe('Public company page');
  });

  test('executeWorkflow returns pipeline and confidence', async () => {
    const result = await executeWorkflow({
      intent: 'summarize',
      question: 'Summarize this post',
      userId: 'user-1',
      multiSource: {
        surface: 'post',
        entityType: 'post',
        entityId: 'p1',
        viewerUserId: 'user-1',
        sources: ['Public post'],
        graph: {
          anchor: { type: 'post', id: 'p1' },
          nodes: [{ type: 'post', id: 'p1', label: 'Hello', summary: 'Hello world discussion about careers' }],
          edges: [],
          sourceLabels: ['Public post'],
          cacheHit: false,
          builtAt: new Date().toISOString()
        },
        graphPrompt: '- post Hello',
        sessionPrompt: '',
        platformKnowledge: 'Scrolith is a professional platform.',
        relatedEntities: [],
        tokenEstimate: 20,
        cacheHit: false,
        builtAt: new Date().toISOString()
      }
    });
    expect(result.pipeline.length).toBeGreaterThan(0);
    expect(result.answer.length).toBeGreaterThan(10);
    expect(result.confidence.band).toBeTruthy();
    expect(result.explanation.summary).toBeTruthy();
  });
});
