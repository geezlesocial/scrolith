import {
  configureSessionStore,
  createDistributedSessionStorePlaceholder,
  getSessionStoreStatus,
  sessionStore,
  setSessionStoreAdapter,
  createInProcessSessionStore
} from '../scrolitha.sessionStore';
import { enterpriseCache, setCacheAdapter, getCacheAdapterStatus } from '../scrolitha.enterpriseCache';
import {
  getSearchProviderStatus,
  platformSearch,
  setActiveSearchProvider
} from '../scrolitha.searchProvider';
import {
  assemblePrompt,
  buildPromptStage,
  buildStandardIntelligencePrompt
} from '../scrolitha.promptOrchestration';
import { createFallbackStreamProvider, getStreamProviderStatus, streamOrFallback } from '../scrolitha.streaming';
import { routeProvider, executeWithProviderOrchestration } from '../scrolitha.providerOrchestration';
import { buildEventContract, processContractedEvent, getEventContractStatus } from '../scrolitha.eventContracts';
import { recordGovernance, getGovernanceSummary } from '../scrolitha.governance';

describe('scrolitha distributed platform abstractions', () => {
  afterAll(() => {
    configureSessionStore({ mode: 'in_process' });
  });

  test('session store defaults to in-process and supports distributed placeholder', () => {
    configureSessionStore({ mode: 'in_process' });
    expect(getSessionStoreStatus().adapterName).toBe('in_process');
    expect(getSessionStoreStatus().capabilities.supportsCrossInstance).toBe(false);

    const distributed = createDistributedSessionStorePlaceholder();
    setSessionStoreAdapter(distributed);
    expect(sessionStore.adapterName()).toBe('distributed_placeholder');
    expect(sessionStore.capabilities()?.supportsCrossInstance).toBe(true);

    setSessionStoreAdapter(createInProcessSessionStore());
    expect(sessionStore.adapterName()).toBe('in_process');
  });

  test('enterprise cache invalidation contracts', () => {
    enterpriseCache.set('graph', 'post-abc-1', { ok: true }, 5000);
    enterpriseCache.set('llm', 'post-abc-response', { a: 1 }, 5000);
    const result = enterpriseCache.invalidate({ type: 'post', postId: 'abc' });
    expect(result.invalidated).toBeGreaterThanOrEqual(1);
    expect(enterpriseCache.isInvalidated('graph', 'invalidate:abc')).toBe(true);
    expect(getCacheAdapterStatus().distributed).toBe(false);
    expect(enterpriseCache.namespaces()).toEqual(
      expect.arrayContaining(['graph', 'search', 'action_cards', 'governance', 'streaming'])
    );
  });

  test('search provider abstraction falls back to lexical', async () => {
    setActiveSearchProvider('lexical');
    expect(getSearchProviderStatus().active).toBe('lexical');
    expect(getSearchProviderStatus().semanticReady).toBe(false);
    setActiveSearchProvider('semantic');
    expect(getSearchProviderStatus().active).toBe('semantic');
    // provider remains registered even if not vector-ready
    expect(getSearchProviderStatus().providers.some((p) => p.name === 'semantic')).toBe(true);
    setActiveSearchProvider('lexical');
  });

  test('prompt orchestration stages are independently assembleable', () => {
    const assembled = buildStandardIntelligencePrompt({
      systemRules: 'You are Scrolitha.',
      userQuestion: 'Is this true?',
      platformKnowledge: 'Platform overview',
      graphContext: 'Graph nodes...',
      memory: 'User: hi',
      rankedEvidence: 'Evidence A'
    });
    expect(assembled.includedStageIds).toEqual(
      expect.arrayContaining(['system', 'user', 'permission', 'task'])
    );
    expect(assembled.systemPrompt).toContain('System context');
    expect(assembled.userPrompt).toContain('Is this true?');
    expect(assembled.tokenEstimate).toBeGreaterThan(0);

    const tiny = assemblePrompt(
      [
        buildPromptStage('system', 'sys'),
        buildPromptStage('user', 'q'),
        buildPromptStage('graph', 'g'.repeat(5000), { required: false })
      ],
      { maxTotalChars: 500 }
    );
    // optional huge graph may be omitted when over budget
    expect(tiny.includedStageIds).toContain('system');
  });

  test('streaming falls back to chunks when token streaming unavailable', async () => {
    const provider = createFallbackStreamProvider(async () => ({
      text: 'Hello world.\n\nSecond paragraph.',
      provider: 'test'
    }));
    const events: string[] = [];
    const result = await provider.stream!(
      { requestId: 'r1', userPrompt: 'hi' },
      async (e) => {
        events.push(e.type);
      }
    );
    expect(result.streamingMode).toBe('chunk_fallback');
    expect(events).toContain('start');
    expect(events).toContain('chunk');
    expect(events).toContain('done');
    expect(getStreamProviderStatus().supportsTokenStreaming).toBe(false);

    const viaHelper = await streamOrFallback(
      { requestId: 'r2', userPrompt: 'x' },
      async () => undefined,
      async () => ({ text: 'ok', provider: 'x' })
    );
    expect(viaHelper.fullText).toBe('ok');
  });

  test('provider orchestration retries then succeeds', async () => {
    let calls = 0;
    const { result, attempts, decision } = await executeWithProviderOrchestration({
      preferLowCost: true,
      attemptFn: async (provider, attempt) => {
        calls += 1;
        if (calls < 2) throw new Error('transient');
        return { provider, attempt };
      }
    });
    expect(result).toBeTruthy();
    expect(attempts.some((a) => !a.ok)).toBe(true);
    expect(attempts.some((a) => a.ok)).toBe(true);
    expect(decision.primary).toBeTruthy();
  });

  test('event contracts dedupe by idempotency key', () => {
    const event = {
      type: 'post.created' as const,
      postId: 'p-dist-1',
      entityType: 'post',
      entityId: 'p-dist-1',
      actorId: 'u1'
    };
    const first = processContractedEvent(event, { producer: 'test' });
    const second = processContractedEvent(event, { producer: 'test' });
    expect(first.accepted || first.duplicate).toBe(true);
    expect(second.duplicate).toBe(true);
    expect(buildEventContract(event).idempotencyKey).toHaveLength(40);
    expect(getEventContractStatus().guarantees.length).toBeGreaterThan(0);
  });

  test('governance records exclude prompt bodies', async () => {
    await recordGovernance({
      requestId: 'gov-1',
      actorId: 'user-1',
      provider: 'core',
      confidence: 0.7,
      confidenceBand: 'medium',
      workflowId: 'wf-1',
      skills: ['Fact Verification'],
      evidenceCategories: ['Public post'],
      latencyMs: 120,
      retryCount: 0
    });
    const summary = getGovernanceSummary();
    expect(summary.privacy.toLowerCase()).toContain('never raw prompts');
    expect(summary.sampleSize).toBeGreaterThanOrEqual(1);
  });
});
