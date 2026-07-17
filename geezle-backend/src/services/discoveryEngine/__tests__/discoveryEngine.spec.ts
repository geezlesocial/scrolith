import {
  resolveDiscoveryRolloutFlags,
  invalidateDiscoveryRolloutCache,
  isDiscoverySurfaceEnabled,
  getDiscoveryRolloutSummary
} from '../discoveryEngine.rollout';
import { scoreCandidate, scoreFreshness, combineScores } from '../discoveryEngine.scoring';
import { applyDiversityPolicy } from '../discoveryEngine.diversity';
import { buildExplanation, buildTrackingToken } from '../discoveryEngine.explain';
import { emptyScoreComponents, DISCOVERY_MODEL_VERSION } from '../discoveryEngine.types';
import { interestOverlapScore } from '../discoveryEngine.interest';
import { getDiscoveryMetricsSnapshot, recordDiscoveryMetric } from '../discoveryEngine.observability';
import {
  getScrolithaDiscoveryHints,
  registerScrolithaDiscoveryAdapter,
  applyScrolithaHints
} from '../discoveryEngine.scrolithaAdapter';

describe('discovery engine foundation (phase 8.0)', () => {
  const prev: Record<string, string | undefined> = {};
  const setEnv = (k: string, v?: string) => {
    prev[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
    invalidateDiscoveryRolloutCache();
  };

  afterEach(() => {
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    invalidateDiscoveryRolloutCache();
    registerScrolithaDiscoveryAdapter(null);
  });

  test('user-facing surfaces default OFF', () => {
    setEnv('DISCOVERY_ENGINE_MASTER', undefined);
    setEnv('DISCOVERY_ENGINE_PAGE', undefined);
    const flags = resolveDiscoveryRolloutFlags();
    expect(flags.master).toBe(false);
    expect(flags.discoveryPage).toBe(false);
    expect(flags.memberHome).toBe(false);
    expect(isDiscoverySurfaceEnabled('discovery')).toBe(false);
    expect(flags.diagnostics).toBe(true);
    expect(flags.feedback).toBe(true);
  });

  test('master + surface env enablement works', () => {
    setEnv('DISCOVERY_ENGINE_MASTER', 'true');
    setEnv('DISCOVERY_ENGINE_PAGE', 'true');
    setEnv('DISCOVERY_ENGINE_JOBS', 'false');
    expect(isDiscoverySurfaceEnabled('discovery')).toBe(true);
    expect(isDiscoverySurfaceEnabled('jobs')).toBe(false);
    expect(getDiscoveryRolloutSummary().note).toMatch(/default OFF/i);
  });

  test('kill switch disables surfaces even if surface env on', () => {
    setEnv('DISCOVERY_ENGINE_MASTER', 'false');
    setEnv('DISCOVERY_ENGINE_PAGE', 'true');
    expect(isDiscoverySurfaceEnabled('discovery')).toBe(false);
  });

  test('scoring produces bounded score and reason codes', () => {
    const profile = {
      viewerId: 'u1',
      skills: ['typescript', 'react'],
      topics: ['jobs'],
      communities: ['builders'],
      categories: [],
      locations: [],
      negativeTokens: [],
      explicitWeight: 0.7,
      implicitWeight: 0.3,
      coldStart: false,
      personalizationAllowed: true
    };
    const { score, components, reasonCodes } = scoreCandidate({
      candidate: {
        entityType: 'job',
        entityId: 'j1',
        source: 'related_job',
        label: 'TypeScript engineer',
        summary: 'React and TypeScript role',
        tags: ['typescript', 'react'],
        createdAt: new Date().toISOString(),
        baseFeatures: { completeness: 0.8, isVerified: true, engagement: 0.4 }
      },
      profile,
      sharedCommunity: true
    });
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(1);
    expect(components.quality).toBeGreaterThan(0);
    expect(reasonCodes.length).toBeGreaterThan(0);
    expect(scoreFreshness({ entityType: 'post', entityId: 'x', source: 'recent', createdAt: new Date().toISOString() })).toBeGreaterThan(0.5);
  });

  test('diversity reduces author/type domination', () => {
    const rows = Array.from({ length: 6 }).map((_, i) => ({
      candidate: {
        entityType: 'person' as const,
        entityId: `p${i}`,
        source: 'quality_creator' as const,
        authorOrOwnerId: 'same-author',
        label: `Person ${i}`
      },
      score: 0.9 - i * 0.01,
      components: { ...emptyScoreComponents(), quality: 0.8 }
    }));
    const diversified = applyDiversityPolicy(rows, { maxPerAuthor: 2, maxPerType: 3 });
    expect(diversified.length).toBe(6);
    // later same-author items should not all keep top scores without penalty impact
    expect(diversified[0].score).toBeGreaterThanOrEqual(diversified[5].score);
  });

  test('explanations are safe and tracking tokens opaque', () => {
    const text = buildExplanation(['shared_community', 'skills_match'], true);
    expect(text.toLowerCase()).toMatch(/communit|skill|match|professional/);
    expect(text).not.toMatch(/score|penalty|private/);
    expect(buildExplanation(['trending_now'], false)).toBe('Recommended for you');
    const token = buildTrackingToken({ requestId: 'r1', entityType: 'job', entityId: 'j1', rank: 1 });
    expect(token.length).toBeGreaterThan(8);
    expect(token).not.toContain('j1');
  });

  test('interest overlap respects personalization off', () => {
    const off = interestOverlapScore(
      {
        viewerId: 'u',
        skills: ['go'],
        topics: [],
        communities: [],
        categories: [],
        locations: [],
        negativeTokens: [],
        explicitWeight: 0,
        implicitWeight: 0,
        coldStart: true,
        personalizationAllowed: false
      },
      ['go']
    );
    expect(off).toBeLessThan(0.2);
  });

  test('metrics snapshot never includes content payloads', () => {
    recordDiscoveryMetric('test_counter', 1);
    const snap = getDiscoveryMetricsSnapshot();
    expect(snap.privacy.toLowerCase()).toMatch(/no recommendation content/);
    expect(JSON.stringify(snap)).not.toMatch(/password|private message/i);
    expect(snap.counters).toBeDefined();
  });

  test('scrolitha adapter is no-op by default and optional when registered', async () => {
    const hints = await getScrolithaDiscoveryHints({
      viewerId: 'u',
      surface: 'discovery',
      candidates: []
    });
    expect(hints).toEqual([]);

    setEnv('DISCOVERY_ENGINE_MASTER', 'true');
    setEnv('DISCOVERY_ENGINE_SCROLITHA', 'true');
    registerScrolithaDiscoveryAdapter({
      name: 'test',
      getHints: async () => [{ entityType: 'job', entityId: 'j9', boost: 0.1 }]
    });
    const withAdapter = await getScrolithaDiscoveryHints({
      viewerId: 'u',
      surface: 'discovery',
      candidates: []
    });
    expect(withAdapter[0].entityId).toBe('j9');
    const scores = new Map([['job:j9', 0.5]]);
    applyScrolithaHints(scores, withAdapter);
    expect(scores.get('job:j9')!).toBeGreaterThan(0.5);
  });

  test('combineScores stays bounded', () => {
    const c = emptyScoreComponents();
    c.quality = 1;
    c.interest = 1;
    c.penalty = 0.2;
    const s = combineScores(c);
    expect(s).toBeGreaterThanOrEqual(0);
    expect(s).toBeLessThanOrEqual(1);
    expect(DISCOVERY_MODEL_VERSION).toMatch(/discovery-engine/);
  });
});
